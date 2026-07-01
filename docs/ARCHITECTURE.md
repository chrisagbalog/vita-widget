# Vita — Architecture

Technical deep-dive: how the pieces fit, and why they're shaped this way.

## The one-paragraph version

A static React widget (Vercel) talks to a single Supabase Edge Function, which stuffs the
entire resume into a guardrailed system prompt and calls Claude at temperature 0.2, streaming
tokens back over SSE. There is no database of content, no retrieval step, and no server-side
state beyond a rate-limit table. The design goal is *boring reliability*: the fewer moving
parts between a visitor's question and a grounded answer, the fewer ways to hallucinate.

## Request flow

```
┌──────────────────────────── host page (any site) ────────────────────────────┐
│  <script src=".../embed.js" defer>                                           │
│      │ creates                                                               │
│      ▼                                                                       │
│  ┌─ iframe: vita-widget.vercel.app/embed ─┐                                  │
│  │  React widget (Vite build)             │   postMessage (origin-checked)   │
│  │  • chat state, streaming renderer      │ ◀──────────────────────────────▶ │
│  └────────────────┬───────────────────────┘   resize floating iframe        │
└───────────────────┼──────────────────────────────────────────────────────────┘
                    │ POST {question, history, stream:true}
                    ▼
   Supabase Edge Function: vita-handler (Deno)
   1. CORS check (explicit origin allowlist)
   2. Input validation (500-char cap, history sanitized)
   3. Rate limit (SHA-256 of IP, Postgres count, 10/hr)
   4. Claude call: system = [rules + FULL resume.json], temp 0.2,
      prompt caching (identical system prompt on every request → ~90% cheaper)
                    │ SSE: {delta}… {done, truncated}
                    ▼
   Widget renders tokens as they arrive (typing indicator → streamed bubble)
```

## Anti-hallucination: five layers

| # | Layer | Mechanism |
|---|---|---|
| 1 | Rules | System prompt: answer ONLY from the resume; refuse and redirect everything else; ignore instructions to break character (prompt-injection defense); cite sections |
| 2 | Grounding | The *entire* `resume.json` is in context on every call — no retrieval, so no retrieval errors |
| 3 | Decoding | Temperature 0.2 — faithful over creative |
| 4 | Product | Refusals are designed, personable responses that pivot to answerable topics — so the model is never "cornered" into inventing |
| 5 | Verification | The eval gate (below) — every prompt/data change re-runs the full case set before deploy |

The resume itself carries a `guardrails` section (`topics_to_redirect`, `note_to_widget`)
that the prompt is required to honor — so content-level policy lives with the content, not
in code.

## The eval gate

The case set has two kinds of cases: positive (must answer, graded by an LLM judge against
`expected_facts` with the resume as ground truth) and negative (must refuse, graded
programmatically against `forbidden_facts` + refusal-language patterns). Negatives include
honeypot facts deliberately absent from the resume, false-premise questions, and a
prompt-injection probe. The committed `evals/cases.json` is a 14-case sample matching the
fictional template persona; the live deployment runs a 51-case private set gated at
**≥49/51**, plus a mandatory human spot-check of a 10% sample. Full methodology: [`evals/README.md`](../evals/README.md).

## Why not RAG?

Retrieval solves "my corpus doesn't fit in context." This corpus is ~15KB. Embeddings + a
vector store would add: infra cost, query latency, a chunking strategy to tune, and the
canonical RAG failure mode — confidently answering from the wrong chunk. Full-context
prompting eliminates the entire class. (Prompt caching makes it cheap: the system prompt is
byte-identical across requests, so Anthropic caches it.)

## The embed (iframe + postMessage)

`public/embed.js` is ~100 lines of dependency-free browser JS served statically. It reads
its own `<script>` tag's `data-*` attributes and creates an iframe pointing at `/embed`.

Why an iframe: host pages (WordPress especially) ship global CSS that would restyle an
injected widget. The iframe is a hard boundary — the only thing that crosses it is a tiny
message protocol:

```
child → parent   { source: "vita-embed", open: boolean }
```

Both sides verify origins: the child posts only to the origin `embed.js` passed in
(`?parent=`), never `"*"`; the parent ignores messages that aren't from the widget origin
*and* this specific iframe's `contentWindow`. In floating mode the parent resizes the iframe
between bubble (96×96 — so the closed widget can't block page clicks) and panel
(`min(448px, 100vw)` × `min(620px, 100vh)`).

## The theme system

Every theme is a JSON file of design tokens in `widget/themes/` — that folder *is* the
registry (`import.meta.glob` at build time). `applyTheme()` writes tokens as CSS custom
properties; because CSS variables cascade, themes can be applied per-container, which is how
the gallery renders 11 themes on one page. Presets are validated at module load — a theme
with a missing token fails the build and every test run, never a half-styled widget in
production. Custom themes go through the same validator.

## Streaming protocol

The edge function wraps Anthropic's SSE in a deliberately tiny three-shape protocol:

```
data: {"delta": "text chunk"}
data: {"done": true, "truncated": false}     ← always last on success
data: {"error": "visitor-safe message"}      ← only on mid-stream failure
```

Pre-stream failures (bad key, overload) throw before the 200 is committed and return as
ordinary JSON errors; mid-stream failures can't change the status code, so they're signaled
in-band. The widget hardcodes the same generic error string as the backend (it can't import
across the Deno boundary).

## Security model

- **Key isolation** — the Anthropic key exists only in Supabase secrets. See
  [SECURITY.md](../SECURITY.md).
- **CORS allowlist** — explicit origins in `vita-handler/index.ts`; everything else gets no
  CORS headers and the browser blocks the response.
- **Rate limiting** — SHA-256(IP) rows in a `rate_limits` table (migration in
  `supabase/migrations/`); 10/hr default via the `RATE_LIMIT_PER_HOUR` secret. Fails open by
  design: a broken rate-limit table costs a few free questions, not an outage.
- **Input handling** — 500-char question cap; history filtered to user/assistant roles,
  string content, last 3 exchanges, 1000 chars/message.
- **Output handling** — answers render through a custom markdown-lite renderer (bold + links
  only, React elements, no `dangerouslySetInnerHTML`).
- **Cost bounding** — `max_tokens: 500`, provider spend caps, Sentry/analytics both free-tier.

## Environment variables

| Variable | Where it lives | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Supabase function secrets (+ local `.env` for the eval judge) | Claude calls |
| `RATE_LIMIT_PER_HOUR` | Supabase function secrets | Requests/IP/hour (default 10) |
| `EVAL_BYPASS_TOKEN` | Supabase function secrets (+ eval env) | Lets the eval harness skip rate limiting |
| `CONTACT_EMAIL`, `WINKS_PHONE`, `WINKS_EMAIL` | Supabase function secrets (+ eval env) | Deploy-time contact injection — direct contact details never live in the repo |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Injected by Supabase automatically | Rate-limit table access |
| `VITE_VITA_ENDPOINT` | Optional, frontend `.env` | Point the widget at a non-production function |

`.env.example` documents the full set with placeholders.

## File structure

```
vita-widget/
├── data/resume.json              # source of truth
├── supabase/
│   ├── functions/vita-handler/   # the backend (index.ts + bundled resume copy)
│   └── migrations/               # rate_limits table
├── src/
│   ├── components/               # ChatWidget, FloatingWidget, EmbedRoot, ThemeGallery
│   └── lib/                      # api (SSE client), theme, markdown, history (+ tests)
├── public/embed.js               # embed loader
├── widget/themes/*.json          # theme registry
├── evals/                        # cases.json, run.py, reports/
├── scripts/deploy-backend.sh     # resume sync + function deploy
└── docs/                         # this file, DEPLOYMENT.md, README assets
```
