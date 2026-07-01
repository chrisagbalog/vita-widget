// /themes — all presets side by side, each one a live widget (PRD Phase 4:
// "great GitHub README asset"). Works because applyTheme() writes CSS
// variables onto a container element and they cascade: every card is its own
// themed universe.
import { useEffect, useRef } from "react";
import { DEFAULT_THEME, THEMES, applyTheme, type VitaTheme } from "../lib/theme";
import ChatWidget from "./ChatWidget";

function ThemeCard({ theme }: { theme: VitaTheme }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) applyTheme(theme, ref.current);
  }, [theme]);

  return (
    <div
      ref={ref}
      // The card's padding area previews the theme's page background —
      // gradients included (background, not background-color, on purpose).
      style={{ background: theme.colors.background }}
      className="flex flex-col gap-3 rounded-lg p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          style={{ color: theme.colors.text_primary, fontFamily: theme.fonts.sans }}
          className="text-sm font-bold"
        >
          {theme.label}
        </h2>
        <code
          style={{ color: theme.colors.text_muted_2, fontFamily: theme.fonts.mono }}
          className="text-[11px]"
        >
          data-theme=&quot;{theme.name}&quot;
        </code>
      </div>
      <ChatWidget />
    </div>
  );
}

export default function ThemeGallery() {
  // Default (site-match) theme first — it ships on launch — then A→Z.
  const themes = Object.values(THEMES).sort((a, b) =>
    a.name === DEFAULT_THEME ? -1 : b.name === DEFAULT_THEME ? 1 : a.label.localeCompare(b.label),
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8 space-y-2">
        <p className="font-[family-name:var(--vita-font-mono)] text-xs uppercase tracking-[0.22em] text-[var(--vita-accent)]">
          // themes
        </p>
        <h1 className="text-3xl font-extrabold uppercase tracking-tight">
          One widget, {themes.length} looks
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-[var(--vita-text-muted)]">
          Every card below is the same live widget with a different JSON theme
          from <code className="font-[family-name:var(--vita-font-mono)]">widget/themes/</code>.
          Pick one with <code className="font-[family-name:var(--vita-font-mono)]">data-theme</code>,
          or drop in your own theme.json.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {themes.map((t) => (
          <ThemeCard key={t.name} theme={t} />
        ))}
      </div>
    </main>
  );
}
