// Floating embed mode (PRD §9.4): a launcher bubble pinned bottom-right that
// opens the chat in a panel. The alternative — inline mode — just renders
// <ChatWidget /> directly in the page flow; this wrapper is everything
// floating adds on top.
import { useEffect, useRef, useState } from "react";
import ChatWidget from "./ChatWidget";

// `onOpenChange` lets a host observe open/close — the /embed route uses it
// to tell the parent page (via postMessage) to resize the iframe. (The
// iframe's open/closed sizes live in public/embed.js and are derived from
// this component's launcher/panel classes — keep them in sync.)
export default function FloatingWidget({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Effect (not a setter wrapper) so EVERY path that changes `open` notifies
  // the host. The mount-time false is harmless: embed.js starts closed anyway.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Escape closes the panel and puts focus back on the launcher, so keyboard
  // users aren't dumped at the top of the page.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        launcherRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* The panel stays mounted while open; conversation state lives inside
          ChatWidget, so closing wipes it — acceptable for v1 (matches the
          refresh-= -fresh-conversation design). */}
      {open && (
        <div className="vita-msg-in w-[min(92vw,400px)]">
          <ChatWidget />
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close Vita chat" : "Open Vita chat — ask about Chris"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--vita-accent-deep)] font-[family-name:var(--vita-font-mono)] text-lg font-bold text-[var(--vita-on-accent)] shadow-[var(--vita-shadow)] transition-colors hover:bg-[var(--vita-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vita-accent)]/50 focus-visible:ring-offset-2"
      >
        {/* Mono slashes: the site's `//` convention doubles as a chat glyph. */}
        {open ? "×" : "//"}
      </button>
    </div>
  );
}
