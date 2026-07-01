// Theme-system tests. The big one: every JSON in widget/themes/ must pass
// schema validation — a theme with a missing token would ship a widget with
// unstyled pieces, and nothing else would catch it.
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME, THEMES, applyTheme, getTheme, validateTheme } from "./theme";

describe("theme registry", () => {
  it("contains the site-match theme plus the 10 PRD presets", () => {
    const expected = [
      "chrisagbalog", "minimalist", "terminal", "glassmorphism", "brutalist",
      "newspaper", "neon", "paper", "corporate", "pastel", "y2k",
    ];
    expect(Object.keys(THEMES).sort()).toEqual(expected.sort());
  });

  it("every registered theme passes schema validation", () => {
    for (const theme of Object.values(THEMES)) {
      expect(() => validateTheme(theme), `theme "${theme.name}"`).not.toThrow();
    }
  });

  it("getTheme falls back to the default for unknown or missing names", () => {
    expect(getTheme("does-not-exist").name).toBe(DEFAULT_THEME);
    expect(getTheme(null).name).toBe(DEFAULT_THEME);
    expect(getTheme("terminal").name).toBe("terminal");
  });
});

describe("validateTheme", () => {
  it("rejects a theme missing a color token, naming the field", () => {
    const broken = structuredClone(THEMES.minimalist) as unknown as {
      colors: Record<string, unknown>;
    };
    delete broken.colors.on_accent;
    expect(() => validateTheme(broken)).toThrow(/on_accent/);
  });

  it("rejects an unknown shadow style", () => {
    const broken = { ...structuredClone(THEMES.minimalist), shadows: "dramatic" };
    expect(() => validateTheme(broken)).toThrow(/shadows/);
  });
});

describe("applyTheme", () => {
  it("writes every CSS variable onto the given element", () => {
    const setProperty = vi.fn();
    const fakeEl = { style: { setProperty } } as unknown as HTMLElement;

    applyTheme(getTheme("terminal"), fakeEl);

    const names = setProperty.mock.calls.map(([n]) => n);
    expect(names).toContain("--vita-accent");
    expect(names).toContain("--vita-on-accent");
    expect(names).toContain("--vita-shadow");
    expect(setProperty).toHaveBeenCalledWith("--vita-accent", "#2EE66B");
    // terminal declares shadows:"none" -> resolved CSS value, not the keyword
    expect(setProperty).toHaveBeenCalledWith("--vita-shadow", "none");
  });
});
