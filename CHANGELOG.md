# Changelog

All notable changes to Vita are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-07-06

Launched. Vita is live on [chrisagbalog.com](https://chrisagbalog.com).

### Added
- `public/embed.js` — one-line embed loader. Sandboxed iframe, floating (default) and inline
  modes, theme selection via `data-theme`, origin-checked postMessage protocol that resizes
  the floating iframe between bubble (96×96) and panel (448×620).
- `/embed` route — bare widget on a transparent background, built for the iframe.
- Vercel Web Analytics (cookieless) and Sentry error monitoring (lazy loader, Error
  Monitoring only) — both zero-dependency script tags.

### Fixed
- Duplicate iframe `id` when a page embeds both modes (per-mode ids
  `vita-widget-floating` / `vita-widget-inline`).
- Floating-mode postMessage no longer throws on host pages without a real origin (`file://`).

## [0.3.0] — 2026-07-05

Production polish (Phase 4).

### Added
- Token streaming end-to-end: Anthropic SSE → edge function → widget, with a typing indicator
  and graceful mid-stream error handling.
- Theme system: 11 preset themes as JSON design tokens, custom-theme validation, and the
  [/themes](https://vita-widget.vercel.app/themes) gallery page.
- Floating launcher mode (Escape-to-close, focus return).
- Rotating starter questions; two-step "Clear" confirmation; message fade-in
  (disabled under `prefers-reduced-motion`).
- Accessibility pass: ARIA labels and live regions, full keyboard navigation, visible focus
  rings, WCAG-AA contrast across all themes.

### Changed
- Eval set grew to 51 cases (gate: ≥49). Full run 2026-07-05: **50/51**.
- System prompt tightened: precise active-duty vs. Reserve framing; role corrected to
  Operations Manager.

## [0.2.0] — 2026-07-05

Frontend MVP (Phase 3).

### Added
- React chat widget wired to the live backend: message history (last 3 exchanges), loading and
  error states, empty state.
- Safe markdown-lite renderer for bold/links in answers — no `dangerouslySetInnerHTML`.
- Unit test suite (vitest).

## [0.1.0] — 2026-07-03

Data foundation and backend (Phases 1–2). First deployable version.

### Added
- `data/resume.json` — curated, privacy-scrubbed source of truth with a `guardrails` section
  the prompt must honor.
- `vita-handler` Supabase Edge Function: guardrailed system prompt with the full resume in
  context, Claude Sonnet 4.6 at temperature 0.2, prompt caching, CORS allowlist, IP-hashed
  rate limiting (10/hr), input validation, generic user-facing errors.
- The eval gate: 50 cases (30 positive / 20 negative incl. honeypots and a prompt-injection
  probe), python runner with LLM-as-judge grading, dated reports. First full run: **49/50**.
