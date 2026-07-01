/**
 * Vita embed loader — the ONE script a host site includes:
 *
 *   <script src="https://vita-widget.vercel.app/embed.js" defer
 *           data-mode="floating"></script>
 *
 * Attributes:
 *   data-mode="floating"   Launcher bubble bottom-right (default).
 *   data-mode="inline"     Widget as a block in the page flow.
 *   data-theme="<name>"    Any preset from widget/themes/ (optional).
 *   data-target="#sel"     Inline only: CSS selector of the element to mount
 *                          into. Defaults to right where this script tag sits.
 *
 * Why an iframe (instead of injecting the widget into the host page):
 * WordPress themes ship global CSS that would restyle the widget — and the
 * widget's own styles could leak the other way. An iframe is a hard boundary:
 * nothing crosses it except the tiny postMessage protocol below. This is the
 * same pattern commercial chat widgets (Intercom, Crisp) use.
 *
 * Plain browser JavaScript on purpose — no build step, no dependencies, works
 * on any site. Served straight from public/ by Vercel.
 */
(function () {
  "use strict";

  // document.currentScript = the <script> tag executing right now. It's how
  // we read our own data-* attributes and learn which origin serves the app.
  var script = document.currentScript;
  if (!script || !script.src) return;

  var WIDGET_ORIGIN = new URL(script.src).origin;
  var mode = (script.getAttribute("data-mode") || "floating").toLowerCase();
  if (mode !== "inline") mode = "floating";
  var theme = script.getAttribute("data-theme") || "";

  // The /embed route needs to know the host page's origin so it can
  // postMessage back to us — and ONLY to us (no "*" broadcasts).
  var src =
    WIDGET_ORIGIN +
    "/embed?mode=" +
    mode +
    "&parent=" +
    encodeURIComponent(window.location.origin) +
    (theme ? "&theme=" + encodeURIComponent(theme) : "");

  var iframe = document.createElement("iframe");
  iframe.src = src;
  // Per-mode id (vita-widget-inline / vita-widget-floating) so a page using
  // both modes never ends up with duplicate ids.
  iframe.id = "vita-widget-" + mode;
  iframe.title = "Vita — ask about Chris Agbalog"; // a11y: iframes need names
  iframe.style.border = "0";

  if (mode === "inline") {
    // A block element the host page controls. Height matches the widget's
    // standalone max (640px); override via CSS on #vita-widget-inline if needed.
    iframe.style.display = "block";
    iframe.style.width = "100%";
    iframe.style.height = "640px";

    var target = script.getAttribute("data-target");
    var host = target ? document.querySelector(target) : null;
    if (host) {
      host.appendChild(iframe);
    } else {
      // No target given (or not found): mount exactly where the script sits.
      script.parentNode.insertBefore(iframe, script.nextSibling);
    }
    return;
  }

  // --- Floating mode ---------------------------------------------------------
  // The iframe hugs the bottom-right corner and RESIZES with the widget:
  // bubble-sized when closed (so it never blocks clicks on page content
  // underneath), panel-sized when open. The /embed page tells us which.
  // GEOMETRY WARNING: derived from FloatingWidget.tsx (56px h-14 bubble +
  // 20px bottom-5/right-5 margins) and ChatWidget.tsx's panel sizing. If
  // those Tailwind classes change, update these or the iframe clips them.
  var CLOSED = { width: "96px", height: "96px" }; // 56px bubble + margins
  var OPEN = { width: "min(448px, 100vw)", height: "min(620px, 100vh)" };

  iframe.style.position = "fixed";
  iframe.style.bottom = "0";
  iframe.style.right = "0";
  iframe.style.width = CLOSED.width;
  iframe.style.height = CLOSED.height;
  // Above typical page content; just under the 2147483647 max some cookie
  // banners claim, so consent UIs can still cover the launcher if they must.
  iframe.style.zIndex = "2147483000";

  window.addEventListener("message", function (event) {
    // Trust nothing: the message must come from OUR app's origin, from THIS
    // iframe's window, and carry our protocol marker.
    if (event.origin !== WIDGET_ORIGIN) return;
    if (event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (!data || data.source !== "vita-embed") return;

    var size = data.open ? OPEN : CLOSED;
    iframe.style.width = size.width;
    iframe.style.height = size.height;
  });

  // `defer` guarantees <body> exists by the time we run.
  document.body.appendChild(iframe);
})();
