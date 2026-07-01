// Demo/test page hosting the widget. Styled to feel like a section of
// chrisagbalog.com so we can judge the site-match theme in context.
// `floating` swaps the inline widget for the bottom-right launcher bubble
// (?mode=floating) — same page copy, so both embed modes are comparable.
import ChatWidget from "./components/ChatWidget";
import FloatingWidget from "./components/FloatingWidget";

export default function App({ floating = false }: { floating?: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="space-y-2">
        <p className="font-[family-name:var(--vita-font-mono)] text-xs uppercase tracking-[0.22em] text-[var(--vita-accent)]">
          // 01 — live demo
        </p>
        <h1 className="text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">
          Vita
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-[var(--vita-text-muted)]">
          A conversational resume. Ask anything about Chris Agbalog&rsquo;s
          work — Vita answers from his resume and nothing else. If it
          doesn&rsquo;t know, it says so.
        </p>
      </header>

      {floating ? <FloatingWidget /> : <ChatWidget />}

      <footer className="font-[family-name:var(--vita-font-mono)] text-[11px] text-[var(--vita-text-muted-2)]">
        Built with React, Supabase Edge Functions, and Claude. Answers are
        limited to resume content by design.
      </footer>
    </main>
  );
}
