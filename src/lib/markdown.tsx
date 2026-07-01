// Minimal markdown-lite renderer for Vita's answers.
//
// The backend's answers use exactly two bits of markdown: **bold** and
// [text](url). A full markdown library is overkill (and a bigger attack
// surface); this renders just those two, as real React elements — never
// dangerouslySetInnerHTML — so answer text can't inject HTML.
import type { ReactNode } from "react";

// Alternation: **bold**  OR  [label](http/https url). Only http(s) links
// are linkified; anything else stays plain text.
const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

/**
 * While an answer is still streaming, a bold span may be open but not yet
 * closed (`…at **Tidepool`), which renderAnswer would show as literal
 * asterisks for a moment. Closing the span makes the word render bold the
 * instant it appears. Balanced text passes through untouched.
 */
export function closeStreamingBold(text: string): string {
  const markers = text.split("**").length - 1;
  return markers % 2 === 1 ? text + "**" : text;
}

export function renderAnswer(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(TOKEN)) {
    const [full, bold, label, url] = match;
    const start = match.index ?? 0;

    if (start > last) nodes.push(text.slice(last, start));

    if (bold !== undefined) {
      nodes.push(<strong key={key++}>{bold}</strong>);
    } else {
      nodes.push(
        // New tab + noopener/noreferrer: standard practice for links that
        // leave an embedded widget.
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[var(--vita-accent)] underline-offset-2 hover:text-[var(--vita-accent-deep)]"
        >
          {label}
        </a>,
      );
    }
    last = start + full.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
