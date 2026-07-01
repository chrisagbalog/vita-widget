# Contributing to Vita

Thanks for your interest! Vita is a small, focused project — the bar for contributions is
"keeps the widget simple, fast, and honest."

## Run it locally

```bash
git clone https://github.com/chrisagbalog/vita-widget.git
cd vita-widget
npm install
npm run dev        # widget at http://localhost:5173, talking to the live backend
```

Useful URLs while developing:

- `http://localhost:5173/` — demo page (inline widget)
- `http://localhost:5173/?mode=floating` — floating launcher
- `http://localhost:5173/themes` — theme gallery
- `http://localhost:5173/?theme=terminal` — any preset by name

To develop against your own backend instead of the production one, set
`VITE_VITA_ENDPOINT` in `.env` (see `.env.example`) — e.g. a local
`supabase functions serve` URL.

## Tests

```bash
npm test           # unit tests (vitest) — must pass
npm run build      # includes a full TypeScript check — must pass
```

If your change affects the **prompt, the resume data, or the backend**, the eval gate must
also pass:

```bash
python3 evals/run.py    # eval cases against the deployed function; threshold from cases.json meta
```

Note: the eval judge needs an `ANTHROPIC_API_KEY` in `.env`, and the endpoint URL at the top
of `evals/run.py` points at the production function — change it if you're testing a fork.
See [`evals/README.md`](evals/README.md) for how grading works and how to author new cases.

## Pull requests

1. Fork, branch from `main`, keep the diff focused (one change per PR)
2. Match the existing style: readable over clever, comments explain *why*
3. State in the PR description which checks you ran (`npm test`, build, evals if applicable)
4. No new runtime dependencies without a strong reason — the widget currently ships with two,
   and that's a feature

## Good first contributions

- A new theme (`widget/themes/yourtheme.json` — the registry picks it up automatically;
  keep WCAG-AA contrast, especially `on_accent` against `accent`)
- Eval cases that expose a hallucination the current gate misses
- Cross-browser or accessibility fixes with a clear repro
