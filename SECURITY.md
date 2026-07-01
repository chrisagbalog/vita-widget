# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via
**[GitHub's private vulnerability reporting](../../security/advisories/new)**
(Security tab → "Report a vulnerability") rather than opening a public issue.
You'll get a response within a few days. Please include steps to reproduce.

## How Vita handles secrets and data

**API keys never touch the browser.**
The Anthropic API key lives exclusively in Supabase Edge Function secrets, server-side.
It is never in this repository, never in the client bundle, and never sent to any visitor.
The only key visible in client code is the Sentry loader key, which is a public, write-only
identifier by design (it can submit error reports, not read anything).

**The public endpoint is defended in layers.**
The edge function is callable without authentication (the widget runs in visitors' browsers),
compensated by:

- a strict CORS origin allowlist — browsers on other domains can't read responses
- IP-based rate limiting (10 requests/hour), with IPs stored only as SHA-256 hashes
- input validation: question length capped at 500 chars, conversation history sanitized
  (role whitelist, string-only, capped turns and lengths)
- spend caps and alerts on the Anthropic account, so worst-case abuse is bounded in dollars

**Visitors' conversations are ephemeral.**
Nothing a visitor types is stored server-side. There are no accounts, no cookies, and no
conversation logs. Analytics are cookieless page-view counts (Vercel Web Analytics); error
monitoring (Sentry) captures stack traces, not chat content, and session replay is disabled.

**Errors reveal nothing.**
Visitors only ever see generic error messages. Full detail goes to server-side logs.

## Scope notes for forks

If you fork this project: rotate nothing (there are no secrets here to rotate), but do
change the hardcoded CORS `ALLOWED_ORIGINS` in
`supabase/functions/vita-handler/index.ts`, use your own Sentry key, and set a spend cap
on your own Anthropic account before going live.
