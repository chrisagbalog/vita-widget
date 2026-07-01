// Theme system (PRD §9.4).
//
// Every theme is a JSON file in widget/themes/ — that directory IS the
// registry. Vite's import.meta.glob pulls them all in at build time, so
// adding an 11th theme is "drop a JSON file in the folder", no code changes.
//
// applyTheme() writes the theme as CSS custom properties onto an element
// (default: <html>). Because CSS variables cascade, applying a theme to any
// container themes everything inside it — which is how the /themes gallery
// shows all presets side by side on one page.

// Single source of truth for color tokens: token name -> CSS variable.
// The VitaThemeColors type, validateTheme's required-field check, and
// applyTheme's variable writes are all derived from this one map, so adding
// a token is a one-line change here (plus the fallback in index.css).
const COLOR_VARS = {
  background: "--vita-bg",
  surface: "--vita-surface",
  surface_alt: "--vita-surface-alt",
  text_primary: "--vita-text",
  text_muted: "--vita-text-muted",
  text_muted_2: "--vita-text-muted-2",
  accent: "--vita-accent",
  accent_deep: "--vita-accent-deep",
  // on_accent = text ON accent surfaces (user bubble, send button) — lets
  // themes with light accents (terminal green) keep WCAG-AA contrast.
  on_accent: "--vita-on-accent",
  border: "--vita-border",
  border_subtle: "--vita-border-subtle",
  status_live: "--vita-live",
} as const;

export type VitaThemeColors = Record<keyof typeof COLOR_VARS, string>;

export interface VitaTheme {
  name: string;
  label: string;
  colors: VitaThemeColors;
  fonts: { sans: string; mono: string };
  radius: string;
  shadows: keyof typeof SHADOWS;
}

// Named shadow styles a theme can pick from. Kept as a fixed menu (not raw
// CSS in the JSON) so every theme stays consistent and typo-proof.
export const SHADOWS = {
  none: "none",
  subtle: "0 1px 2px rgba(0,0,0,.06)",
  medium: "0 8px 24px rgba(0,0,0,.14)",
  hard: "6px 6px 0 rgba(0,0,0,.9)", // brutalist offset block
  glow: "0 0 20px rgba(255,46,154,.35)", // neon halo
} as const;

// Build the registry from widget/themes/*.json. `eager: true` = resolved at
// build time, no async loading; each module's default export is the JSON.
const themeModules = import.meta.glob<{ default: VitaTheme }>(
  "../../widget/themes/*.json",
  { eager: true },
);

// Presets are validated as they're registered: a preset JSON with a missing
// token fails at module load (and in every test run), not as a half-styled
// widget in production.
export const THEMES: Record<string, VitaTheme> = {};
for (const mod of Object.values(themeModules)) {
  const theme = validateTheme(mod.default);
  THEMES[theme.name] = theme;
}

export const DEFAULT_THEME = "chrisagbalog";

/** Look up a preset by name; unknown/missing names fall back to the default. */
export function getTheme(name?: string | null): VitaTheme {
  return (name && THEMES[name]) || THEMES[DEFAULT_THEME];
}

/**
 * Validate an untrusted theme object — bundled presets at registry build,
 * and the custom `theme.json` mode (a fork pointing the widget at their own
 * palette). Returns the typed theme, or throws with the first missing field
 * so misconfigurations fail loudly.
 */
export function validateTheme(raw: unknown): VitaTheme {
  const t = raw as VitaTheme;
  if (!t || typeof t !== "object") throw new Error("theme: not an object");
  for (const key of Object.keys(COLOR_VARS) as (keyof VitaThemeColors)[]) {
    if (typeof t.colors?.[key] !== "string") {
      throw new Error(`theme: missing colors.${key}`);
    }
  }
  if (typeof t.fonts?.sans !== "string" || typeof t.fonts?.mono !== "string") {
    throw new Error("theme: missing fonts.sans / fonts.mono");
  }
  if (typeof t.radius !== "string") throw new Error("theme: missing radius");
  if (!(t.shadows in SHADOWS)) throw new Error(`theme: unknown shadows "${t.shadows}"`);
  return t;
}

/** Apply a theme as CSS custom properties on `root` (default: <html>). */
export function applyTheme(
  theme: VitaTheme,
  root: HTMLElement = document.documentElement,
): void {
  for (const [token, cssVar] of Object.entries(COLOR_VARS)) {
    root.style.setProperty(cssVar, theme.colors[token as keyof VitaThemeColors]);
  }
  root.style.setProperty("--vita-font-sans", theme.fonts.sans);
  root.style.setProperty("--vita-font-mono", theme.fonts.mono);
  root.style.setProperty("--vita-radius", theme.radius);
  root.style.setProperty("--vita-shadow", SHADOWS[theme.shadows]);
}
