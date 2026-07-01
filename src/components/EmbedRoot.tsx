// /embed — the page that lives INSIDE the iframe created by public/embed.js.
// No demo-page chrome, just the widget itself on a transparent background so
// the iframe blends into whatever site is hosting it.
//
// Contract with embed.js (the parent page):
//   - URL params: ?mode=inline|floating (default floating)
//                 ?parent=<host page origin> — where to send postMessages
//   - Floating mode posts { source: "vita-embed", open: boolean } to the
//     parent on every launcher toggle, so embed.js can resize the iframe
//     (small bubble when closed, full panel when open).
//   - Inline mode never posts; the iframe is a fixed block in the page flow.
import { useEffect } from "react";
import ChatWidget from "./ChatWidget";
import FloatingWidget from "./FloatingWidget";

export default function EmbedRoot({
  floating,
  parentOrigin,
}: {
  floating: boolean;
  parentOrigin: string | null;
}) {
  // The app's normal body background would paint the whole iframe as an
  // opaque rectangle over the host page — clear it for embeds.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  function notifyParent(open: boolean) {
    // Only message the origin embed.js told us about — never broadcast ("*").
    if (parentOrigin && window.parent !== window) {
      try {
        window.parent.postMessage({ source: "vita-embed", open }, parentOrigin);
      } catch {
        // Host pages without a real origin (e.g. opened from file://) make
        // postMessage throw on the origin check. The iframe can't resize for
        // them anyway — degrade silently instead of breaking the launcher.
      }
    }
  }

  return floating ? (
    <FloatingWidget onOpenChange={notifyParent} />
  ) : (
    <div className="h-dvh">
      <ChatWidget fill />
    </div>
  );
}
