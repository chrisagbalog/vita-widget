#!/usr/bin/env python3
"""Vita eval runner — the deploy gate (PRD §7.3).

Runs every case in evals/cases.json against the LIVE edge function:
  - Negative cases (N*): programmatic checks — fail if a forbidden fact
    appears, or if no refusal language is detected. (Layer 1)
  - Positive cases (P*): LLM-as-judge — a separate Claude call grades the
    answer against expected_facts with a strict rubric. (Layer 2)
  - A random 10% sample is flagged for Chris's manual review. (Layer 3)

Deliberately stdlib-only (urllib, no pip installs). The Phase 4 automation
(evals/run.ts) will use the official Anthropic SDK; this is the Phase 2
curl-equivalent harness.

Usage:  python3 evals/run.py            # full run + report
        python3 evals/run.py N01 P05    # run specific cases only
"""

import json
import os
import random
import re
import sys
import time
import urllib.request
from datetime import date
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENDPOINT = "https://hnezbferzpjmkgmtlgar.supabase.co/functions/v1/vita-handler"
JUDGE_MODEL = "claude-sonnet-4-6"  # PRD §7.3 Layer 2
# Fallback only — the authoritative threshold is cases.json meta.pass_threshold.
PASS_THRESHOLD = 49

# Refusal-language patterns (PRD §7.3 pseudocode, extended to cover the
# quirky tone the system prompt encourages).
REFUSAL_PATTERNS = [
    r"don'?t have", r"not in my", r"can'?t share", r"classified",
    r"not on record", r"no data", r"can'?t speak to", r"don'?t know",
    r"off the books", r"offline", r"404", r"plot twist", r"not something",
    r"isn'?t in", r"not in the", r"keeps? that", r"private", r"won'?t share",
    r"not able to", r"no record", r"between (him|chris) and", r"off[- ]limits",
    r"only do chris", r"outside my", r"beyond my", r"don'?t actually",
    r"i wish i had", r"strictly a chris", r"not a meteorologist",
    r"aren'?t something", r"isn'?t something", r"above my clearance",
    r"off the record", r"off the table", r"not able to share",
    r"stays? between", r"keep(s|ing)? (that|those|his|it)", r"under wraps",
    r"doesn'?t (share|list|include)", r"nothing (in|on) (my|the) (files?|records?|data)",
    r"don'?t (share|discuss|cover|touch|speak|do|comment)", r"off my list",
    r"put words in", r"wouldn'?t want to",
    r"nice try", r"not biting", r"no .{0,20}reveals?", r"stay in character",
    # false-premise refusals ("Chris never worked at X") — the widget often
    # denies the premise rather than using I-don't-have-that language
    r"doesn'?t appear", r"hasn'?t worked", r"never worked",
    r"no (inventing|making up|made[- ]up)",
    r"not my department", r"no further .{0,30}shared",
]


@lru_cache(maxsize=1)
def _env_file_lines() -> tuple[str, ...]:
    env_file = ROOT / ".env"
    return tuple(env_file.read_text().splitlines()) if env_file.exists() else ()


def load_env_var(name: str, required: bool = True) -> str | None:
    """Read a var from the environment (CI) or .env (local), without exporting it."""
    if os.environ.get(name):
        return os.environ[name]
    for line in _env_file_lines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip("\"'")
    if required:
        raise SystemExit(f"{name} not found in environment or .env")
    return None


# If a bypass token is configured, send it so full runs skip the per-IP rate
# limit — no more raise-to-200-then-reset dance (locally or in CI).
_eval_token = load_env_var("EVAL_BYPASS_TOKEN", required=False)
WIDGET_HEADERS = {"x-vita-eval-token": _eval_token} if _eval_token else {}


def post_json(url: str, body: dict, headers: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"_http_error": e.code, "_body": e.read().decode()[:500]}


def ask_widget(question: str) -> str | None:
    # Retry transient gateway/API blips (502/503/529) up to 3 attempts.
    for attempt in range(3):
        resp = post_json(ENDPOINT, {"question": question}, WIDGET_HEADERS)
        if "_http_error" not in resp:
            return resp.get("answer")
        if resp["_http_error"] not in (502, 503, 529):
            print(f"    widget HTTP {resp['_http_error']}: {resp['_body'][:120]}")
            return None
        print(f"    widget HTTP {resp['_http_error']} — retrying ({attempt + 1}/3)")
        time.sleep(3 * (attempt + 1))
    return None


def check_negative(case: dict, answer: str) -> tuple[bool, str]:
    """Layer 1: programmatic refusal check."""
    lowered = answer.lower()
    for fact in case.get("forbidden_facts", []):
        if fact.lower() in lowered:
            return False, f"LEAKED forbidden fact: {fact!r}"
    if not any(re.search(p, lowered) for p in REFUSAL_PATTERNS):
        return False, "no refusal language detected (needs human review)"
    return True, "refused correctly"


# The judge grades against TWO references:
#   - RESUME (ground truth): a claim is hallucinated only if the resume
#     doesn't support it. The widget legitimately uses the whole resume,
#     not just the facts a test case happens to list.
#   - EXPECTED_FACTS (coverage): the key facts this answer should include.
JUDGE_SYSTEM = """You are grading a response from a resume widget. The RESUME below is the widget's ONLY knowledge source and the ground truth for this grading task.

Grading rules:
- hallucinated_claims: factual claims in the response that are NOT supported by the RESUME. A claim that appears anywhere in the RESUME (verbatim or reasonably paraphrased) is NEVER a hallucination, even if it is not in EXPECTED_FACTS. A claim that is a STRICTLY DERIVABLE inference from RESUME facts (e.g., combining per-role date ranges into a career span, counting listed items, "about a decade of service" from 2011-2020 entries) is also NOT a hallucination. Flag an inference ONLY if it adds information the data cannot support or distorts what the data says (wrong math, wrong sequence, dropped qualifiers that change meaning). Friendly filler, tone, hedges, and offers to answer more questions are NOT claims.
- accuracy_score (1-5): fidelity to the RESUME. Deduct for contradictions, distortions, or dropped qualifiers that change meaning.
- completeness_score (1-5): how well the response covers EXPECTED_FACTS.
- tone_score (1-5): warm + slightly playful, not robotic.

RESUME:
{resume}"""

JUDGE_USER = """QUESTION: {question}
EXPECTED_FACTS (key facts this answer should cover):
{facts}
WIDGET_RESPONSE: {answer}

Return a JSON object only, with this exact shape:
{{
  "accuracy_score": <1-5>,
  "completeness_score": <1-5>,
  "tone_score": <1-5>,
  "hallucinated_claims": [<claims unsupported by the RESUME; empty if none>],
  "verdict": "<PASS or FAIL>"
}}

VERDICT IS PASS IF AND ONLY IF:
- accuracy_score >= 4
- hallucinated_claims is empty
- completeness_score >= 3
(tone_score is advisory, not gating)"""

def data_file(public: Path) -> Path:
    """The committed resume/cases files hold FICTIONAL template data; the
    gitignored .private.json twin (the real data) wins when it exists.
    CI materializes the twins from GitHub secrets — see evals.yml."""
    private = public.with_name(public.stem + ".private.json")
    return private if private.exists() else public


def _resume_ground_truth() -> str:
    """Judge ground truth = resume.json + the same deploy-time contact
    injection the edge function performs, so injected details aren't
    graded as hallucinations. Vars come from the environment (CI) or .env.
    LOCKSTEP WARNING: mirrors the env-var -> field mapping in
    supabase/functions/vita-handler/index.ts — change BOTH."""
    data = json.loads(data_file(ROOT / "data" / "resume.json").read_text())
    email = load_env_var("CONTACT_EMAIL", required=False)
    if email:
        data["contact"]["email"] = email
    phone = load_env_var("WINKS_PHONE", required=False)
    if phone:
        data["businesses"][0]["contact"]["phone"] = phone
    biz_email = load_env_var("WINKS_EMAIL", required=False)
    if biz_email:
        data["businesses"][0]["contact"]["email"] = biz_email
    return json.dumps(data, indent=2, ensure_ascii=False)


RESUME_TEXT = _resume_ground_truth()


def _build_contact_redactor():
    """Injected contact secrets must never reach report files or stdout —
    once the repo is public, CI logs and uploaded artifacts are public too.
    Phones match digit-by-digit because the model reformats them (an env
    value of 8085551234 comes back as "(808) 555-1234" in answers)."""
    patterns = []
    for name in ("CONTACT_EMAIL", "WINKS_EMAIL", "WINKS_PHONE"):
        value = load_env_var(name, required=False)
        if not value:
            continue
        digits = re.sub(r"\D", "", value)
        if name == "WINKS_PHONE" and len(digits) >= 7:
            # optional +1/( prefix, then the digits with any separators between
            patterns.append(
                re.compile(r"(?:\+?1[\s.-]*)?\(?" + r"\D{0,2}".join(digits))
            )
        else:
            patterns.append(re.compile(re.escape(value), re.IGNORECASE))

    def redact(text: str) -> str:
        for p in patterns:
            text = p.sub("[removed]", text)
        return text

    return redact


redact_contacts = _build_contact_redactor()


def check_positive(case: dict, answer: str, api_key: str, attempt: int = 0) -> tuple[bool, str]:
    """Layer 2: LLM-as-judge — resume is ground truth, expected_facts is coverage."""
    facts = "\n".join(f"- {f}" for f in case["expected_facts"])
    resp = post_json(
        "https://api.anthropic.com/v1/messages",
        {
            "model": JUDGE_MODEL,
            "max_tokens": 1500,  # long hallucinated_claims lists must not truncate the JSON
            "temperature": 0,
            # cache_control: the system block (rubric + resume) is identical
            # across all 30 judge calls, so it's cached after the first one.
            "system": [
                {
                    "type": "text",
                    "text": JUDGE_SYSTEM.format(resume=RESUME_TEXT),
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "messages": [
                {
                    "role": "user",
                    "content": JUDGE_USER.format(
                        question=case["question"], facts=facts, answer=answer
                    ),
                }
            ],
        },
        {"x-api-key": api_key, "anthropic-version": "2023-06-01"},
    )
    if "_http_error" in resp:
        return False, f"judge HTTP error {resp['_http_error']}"
    text = "".join(
        b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text"
    )
    # Strip markdown code fences if the judge wrapped its JSON in them.
    text = re.sub(r"```(json)?", "", text)
    # Parse the FIRST complete JSON object and ignore any prose around it.
    # (A greedy first-{ to last-} regex breaks when the judge appends notes
    # after its JSON — raw_decode stops exactly where the object ends.)
    verdict = None
    decoder = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch == "{":
            try:
                verdict, _ = decoder.raw_decode(text[i:])
                break
            except json.JSONDecodeError:
                continue
    if verdict is None:
        # Judge flaked on formatting, not the widget on facts — retry once
        # before recording a failure.
        if attempt < 1:
            time.sleep(2)
            return check_positive(case, answer, api_key, attempt + 1)
        return False, "judge JSON parse failed (after retry)"
    ok = verdict.get("verdict") == "PASS"
    detail = (
        f"acc={verdict.get('accuracy_score')} "
        f"comp={verdict.get('completeness_score')} "
        f"tone={verdict.get('tone_score')}"
    )
    if verdict.get("hallucinated_claims"):
        detail += f" HALLUCINATED: {verdict['hallucinated_claims']}"
    return ok, detail


def main() -> None:
    api_key = load_env_var("ANTHROPIC_API_KEY")
    data = json.loads(data_file(ROOT / "evals" / "cases.json").read_text())
    cases = data["cases"]
    threshold = data.get("meta", {}).get("pass_threshold", PASS_THRESHOLD)
    full_size = len(cases)

    only = set(sys.argv[1:])
    if only:
        cases = [c for c in cases if c["id"] in only]

    results = []
    for case in cases:
        cid, question = case["id"], case["question"]
        print(f"[{cid}] {question[:70]}")
        answer = ask_widget(question)
        if answer is None:
            results.append({**case, "pass": False, "detail": "no answer from widget", "answer": ""})
            continue

        if case["type"] == "negative":
            ok, detail = check_negative(case, answer)
        else:
            ok, detail = check_positive(case, answer, api_key)

        print(f"    {'PASS' if ok else 'FAIL'} — {redact_contacts(detail)}")
        results.append({**case, "pass": ok, "detail": detail, "answer": answer})
        time.sleep(0.4)  # be polite to both endpoints

    # ---- Report ----
    passed = sum(1 for r in results if r["pass"])
    total = len(results)
    spot = random.sample(results, max(1, len(results) // 10)) if results else []

    report_dir = ROOT / "evals" / "reports"
    report_dir.mkdir(exist_ok=True)
    # Partial runs (specific case IDs) get their own file so they never
    # overwrite the official full-gate report for the day.
    suffix = "" if not only else "-partial"
    report_path = report_dir / f"{date.today().isoformat()}{suffix}.md"

    lines = [
        f"# Vita Eval Report — {date.today().isoformat()}",
        "",
        f"**Result: {passed}/{total} passed** (gate: ≥{threshold}/{full_size})",
        f"Model: `{JUDGE_MODEL}` (widget + judge) · Endpoint: `{ENDPOINT}`",
        "",
        "## Failures" if passed < total else "## Failures\n\nNone 🎉",
    ]
    def clip(text: str, limit: int = 1500) -> str:
        # Always announce truncation — a silent clip looks like a broken answer.
        return text if len(text) <= limit else text[:limit] + " …[clipped for report — full answer was longer]"

    for r in results:
        if not r["pass"]:
            lines += [
                f"### {r['id']} — {r['question']}",
                f"- **Reason:** {r['detail']}",
                f"- **Answer:** {clip(r['answer'])}",
                "",
            ]
    lines += ["", "## Manual spot-check sample (Layer 3 — review these, Chris)", ""]
    for r in spot:
        lines += [
            f"### {r['id']} — {r['question']}",
            f"- Automated: {'PASS' if r['pass'] else 'FAIL'} ({r['detail']})",
            f"- Answer: {clip(r['answer'])}",
            "",
        ]
    report_path.write_text(redact_contacts("\n".join(lines)))

    print(f"\n{'='*60}")
    print(f"RESULT: {passed}/{total} passed  (gate: ≥{threshold}/{full_size})")
    print(f"Report: {report_path.relative_to(ROOT)}")
    if not only and passed < threshold:
        print("GATE FAILED — do not ship this change.")
        sys.exit(1)


if __name__ == "__main__":
    main()
