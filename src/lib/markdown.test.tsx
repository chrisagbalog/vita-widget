// Tests for the markdown-lite renderer — the security-relevant cases matter
// most: no HTML injection, no non-http(s) link schemes.
import { describe, expect, it } from "vitest";
import { isValidElement } from "react";
import type { ReactElement } from "react";
import { closeStreamingBold, renderAnswer } from "./markdown";

describe("renderAnswer", () => {
  it("passes plain text through untouched", () => {
    expect(renderAnswer("Chris is an Operations Manager.")).toEqual([
      "Chris is an Operations Manager.",
    ]);
  });

  it("renders **bold** as a <strong> element", () => {
    const nodes = renderAnswer("I'm **Vita** — nice to meet you.");
    expect(nodes[0]).toBe("I'm ");
    const strong = nodes[1] as ReactElement<{ children: string }>;
    expect(isValidElement(strong)).toBe(true);
    expect(strong.type).toBe("strong");
    expect(strong.props.children).toBe("Vita");
    expect(nodes[2]).toBe(" — nice to meet you.");
  });

  it("renders [label](https://…) as a safe external link", () => {
    const nodes = renderAnswer("Code at [GitHub](https://github.com/x/y).");
    const link = nodes[1] as ReactElement<{
      href: string;
      rel: string;
      target: string;
      children: string;
    }>;
    expect(link.type).toBe("a");
    expect(link.props.href).toBe("https://github.com/x/y");
    expect(link.props.rel).toContain("noopener");
    expect(link.props.target).toBe("_blank");
    expect(link.props.children).toBe("GitHub");
  });

  it("does NOT linkify javascript: URLs (stays plain text)", () => {
    const nodes = renderAnswer("Click [here](javascript:alert(1)) now");
    expect(nodes).toEqual(["Click [here](javascript:alert(1)) now"]);
  });

  it("never emits raw HTML — angle brackets stay as text", () => {
    const nodes = renderAnswer("<script>alert(1)</script> and **<b>x</b>**");
    expect(nodes[0]).toBe("<script>alert(1)</script> and ");
    const strong = nodes[1] as ReactElement<{ children: string }>;
    expect(strong.type).toBe("strong");
    // The inner "<b>x</b>" is a plain string child, not parsed HTML.
    expect(strong.props.children).toBe("<b>x</b>");
  });

  it("handles multiple tokens in one answer", () => {
    const nodes = renderAnswer("**A** then [B](https://b.example) then **C**");
    expect(nodes.filter((n) => isValidElement(n))).toHaveLength(3);
  });
});

describe("closeStreamingBold", () => {
  it("closes a bold span the stream hasn't finished yet", () => {
    expect(closeStreamingBold("works at **Tidepool")).toBe("works at **Tidepool**");
  });

  it("leaves balanced text untouched", () => {
    expect(closeStreamingBold("an **Operations Manager** at")).toBe(
      "an **Operations Manager** at",
    );
    expect(closeStreamingBold("no markdown at all")).toBe("no markdown at all");
  });
});
