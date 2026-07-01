# Deploying your own Vita

A start-to-finish walkthrough for standing up your own fork — written for someone who has
never used Vercel or Supabase. Everything here fits in free tiers except Claude API usage,
which is pay-as-you-go (a few dollars a month at hobby traffic — and you'll set a cap).

**The shape of what you're building:** a static widget on Vercel + one Supabase Edge
Function that holds your API key and calls Claude. Two deploys, one secret.

## 0. Accounts you need

| Service | For | Cost |
|---|---|---|
| [GitHub](https://github.com) | Your fork | Free |
| [Vercel](https://vercel.com) (sign in with GitHub) | Hosting the widget | Free (Hobby) |
| [Supabase](https://supabase.com) | The backend function | Free tier |
| [Anthropic Console](https://console.anthropic.com) | Claude API key | Pay-as-you-go |

## 1. Fork and personalize

1. Fork this repo on GitHub, then clone your fork locally
2. Write your resume. The committed `data/resume.json` is a **fictional sample persona**
   — use it as the worked example. Two options:
   - **Private twin (recommended):** write your real resume as `data/resume.private.json`
     (gitignored). The deploy script and eval harness prefer it automatically, so your
     personal data never enters git even if your fork is public.
   - **Direct:** edit `data/resume.json` in place — fine if your repo is private or you
     want the data fully public.
   Rules that keep the anti-hallucination design working:
   - Only include facts you're comfortable being public — whichever file is active, its
     contents are exactly what the widget will tell any visitor who asks
   - Keep (and customize) the `guardrails` section: `topics_to_redirect` and
     `note_to_widget` are enforced by the prompt
   - Scrub anything sensitive (exact addresses, IDs, anything you'd redact from a public resume)
3. Update the identity references: the system prompt in
   `supabase/functions/vita-handler/index.ts` mentions Chris by name — make it yours

## 2. Set up Supabase (the backend)

1. Create a project at [supabase.com](https://supabase.com) (any region near your visitors;
   note the database password it makes you set)
2. Install the CLI: `npm install -g supabase`, then `supabase login`
3. Link your local repo to the project (project ref is in your project's URL):
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
4. Create the rate-limit table (the migration ships with the repo):
   ```bash
   supabase db push
   ```

## 3. The Anthropic key — handle with care

1. In [console.anthropic.com](https://console.anthropic.com): buy a small credit block
   ($5 is plenty to start), and **set a monthly spend limit** — this is your worst-case
   bill if something goes wrong
2. Create an API key. **Do not put it in any file in the repo.** It goes to exactly one
   place — Supabase secrets:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=<your-key>
   supabase secrets set RATE_LIMIT_PER_HOUR=10
   ```

## 4. Lock the function to your domains

In `supabase/functions/vita-handler/index.ts`, edit `ALLOWED_ORIGINS` to your own domains
(your future Vercel URL + the sites that will embed the widget + localhost for dev).

Then deploy:

```bash
./scripts/deploy-backend.sh
```

Smoke-test it (expect a grounded answer about *you*):

```bash
curl -s -X POST "https://<your-project-ref>.supabase.co/functions/v1/vita-handler" \
  -H "content-type: application/json" \
  -d '{"question": "What do you do for work?"}'
```

## 4b. Optional: direct contact details

`resume.json` deliberately ships **without** a direct email or phone number — a public
repo full of contact literals is a spam-scraper buffet. If you want your widget to hand
out yours, inject them at deploy time instead of committing them:

```bash
supabase secrets set CONTACT_EMAIL=you@example.com
supabase secrets set "WINKS_PHONE=(555) 555-5555"   # rename/repurpose for your business line
supabase secrets set WINKS_EMAIL=hello@example.com
```

The function merges these into the resume at startup. Skip this entirely and the widget
simply points people to your website — which is a perfectly good default.

## 5. Deploy the widget to Vercel

1. [vercel.com](https://vercel.com) → **Add New Project** → import your fork
2. Vercel reads `vercel.json` and auto-detects the Vite build — no settings needed
3. Add one environment variable (Project Settings → Environment Variables):
   - `VITE_VITA_ENDPOINT` = `https://<your-project-ref>.supabase.co/functions/v1/vita-handler`
4. Deploy. Your widget is now at `https://<your-project>.vercel.app`

Every push to `main` auto-deploys from here on.

## 6. Rewrite the eval gate for your facts

The committed eval set tests the fictional sample persona — it will (correctly) fail
against your data.

1. Write your cases as `evals/cases.private.json` (gitignored, preferred automatically;
   or edit `evals/cases.json` directly): positive cases assert facts from **your** resume
   (`expected_facts` must be copy-checkable against the file); negative cases are traps —
   things *not* in your resume that the widget must refuse. Authoring guidance:
   [`evals/README.md`](../evals/README.md)
2. Point the harness at your function: edit `ENDPOINT` at the top of `evals/run.py`
3. Put your `ANTHROPIC_API_KEY=...` in a local `.env` (already gitignored) — the LLM judge
   needs it
4. Let the harness skip your own rate limit: generate a token, store it in both places:
   ```bash
   openssl rand -hex 32                                # generate
   supabase secrets set EVAL_BYPASS_TOKEN=<that-token> # the function checks it
   echo "EVAL_BYPASS_TOKEN=<that-token>" >> .env       # the harness sends it
   python3 evals/run.py
   ```

Don't skip this. The gate is the difference between "an LLM that talks about me" and "an LLM
I've verified won't lie about me."

## 7. Embed it on your site

```html
<script src="https://<your-project>.vercel.app/embed.js" defer></script>
```

- WordPress: a header/footer snippet plugin (e.g. WPCode) → paste into the footer
- Anything else: before `</body>` in your template
- Inline placement and themes: see the README's embed options

## 8. Optional: monitoring

- **Vercel Web Analytics** — project → Analytics → Enable (the script tag is already in
  `index.html`)
- **Sentry** — create a browser-JS project, swap the loader `<script>` in `index.html` for
  your own, and restrict Allowed Domains to your Vercel domain so strangers can't spend
  your error quota

## Ongoing: updating your resume

```bash
# edit your resume file (resume.private.json, or resume.json if editing directly), then:
./scripts/deploy-backend.sh   # resync + redeploy the function
python3 evals/run.py          # facts changed → the gate must still pass
git commit -am "resume update" && git push   # redeploys the widget
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Widget shows an error for every question | `VITE_VITA_ENDPOINT` wrong, or function not deployed |
| Works in curl, fails in the browser | Your domain isn't in `ALLOWED_ORIGINS` (redeploy after editing) |
| "You've asked a lot of great questions!" | Rate limit — you, testing repeatedly from one IP |
| Answers cut off mid-sentence | `MAX_TOKENS` (500) reached — the widget shows a truncation notice |
| Eval run fails with 429s | `EVAL_BYPASS_TOKEN` missing or mismatched between `.env` and Supabase (step 6) |
