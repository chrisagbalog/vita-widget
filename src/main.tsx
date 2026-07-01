// App entry point. Reads display options from the URL, applies the theme
// (CSS variables on <html>), then mounts.
//
//   ?theme=<name>    any preset from widget/themes/ (default: chrisagbalog)
//   ?mode=floating   launcher bubble bottom-right instead of inline
//   /themes          gallery page showing every preset side by side
//   /embed           bare widget for iframes — created by public/embed.js,
//                    which forwards its data-theme / data-mode attributes
//                    as these same URL params (?parent = host page origin)
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import EmbedRoot from "./components/EmbedRoot";
import ThemeGallery from "./components/ThemeGallery";
import { applyTheme, getTheme } from "./lib/theme";
import "./index.css";

const params = new URLSearchParams(window.location.search);
applyTheme(getTheme(params.get("theme")));

const path = window.location.pathname.replace(/\/$/, "");
const isGallery = path === "/themes";
const isEmbed = path === "/embed";
// Demo page defaults to inline; embeds default to floating (the launch mode).
const floating = isEmbed
  ? params.get("mode") !== "inline"
  : params.get("mode") === "floating";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isEmbed ? (
      <EmbedRoot floating={floating} parentOrigin={params.get("parent")} />
    ) : isGallery ? (
      <ThemeGallery />
    ) : (
      <App floating={floating} />
    )}
  </StrictMode>,
);
