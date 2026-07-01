// <ChatWidget /> — the Vita chat interface.
//
// Owns the whole conversation: message list, input box, send button,
// loading indicator, and error display. Talks to the backend through
// askVitaStream() and keeps the transcript in local component state (nothing
// is persisted — refresh = fresh conversation, by design for a resume widget).
import { memo, useEffect, useRef, useState } from "react";
import { askVitaStream, GENERIC_ERROR, VitaError } from "../lib/api";
import { MAX_QUESTION_CHARS, type ChatMessage } from "../lib/history";
import { closeStreamingBold, renderAnswer } from "../lib/markdown";

// Empty-state starter questions (PRD Phase 4). Clicking one sends it
// immediately — zero-typing path into a first conversation.
const STARTER_QUESTIONS = [
  "What does Chris do now?",
  "Tell me about his military service",
  "What has he built outside of work?",
];

// Memoized bubble: without memo, every keystroke in the input re-renders the
// whole widget and re-runs the markdown parser on every existing assistant
// message. memo() skips bubbles whose message hasn't changed.
const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div
      className={
        "vita-msg-in " +
        (message.role === "user" ? "flex justify-end" : "flex justify-start")
      }
    >
      <div
        className={
          "max-w-[85%] whitespace-pre-wrap rounded-[var(--vita-radius)] px-3.5 py-2.5 text-sm leading-relaxed " +
          (message.role === "user"
            ? "bg-[var(--vita-accent)] text-[var(--vita-on-accent)]"
            : "border border-[var(--vita-border-subtle)] bg-[var(--vita-surface-alt)] text-[var(--vita-text)]")
        }
      >
        {/* Assistant answers carry light markdown (bold, links);
            visitor messages render as literal text. */}
        {message.role === "assistant" ? renderAnswer(message.content) : message.content}
      </div>
    </div>
  );
});

// `fill` = size to the container instead of the viewport — used by the
// /embed route, where the surrounding iframe (sized by embed.js) is the
// real viewport and the widget should occupy all of it.
export default function ChatWidget({ fill = false }: { fill?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The in-flight answer lives OUTSIDE the transcript: `messages` only ever
  // holds committed turns (raw model output), and this holds the ephemeral
  // text still being streamed. Typing dots = loading with nothing streamed
  // yet — no inspecting the transcript's tail to infer what's happening.
  const [streamingAnswer, setStreamingAnswer] = useState<string | null>(null);
  // Coalescing: SSE chunks can arrive faster than the display refreshes, so
  // the newest answer-so-far parks here and one rAF per frame commits it.
  const pendingAnswerRef = useRef("");
  const rafRef = useRef(0);

  // Two-step clear: first click arms ("sure?"), second click wipes. Arming
  // expires after a few seconds so a stray click can't linger as a landmine.
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  function clearConversation() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setMessages([]);
    setError(null);
    setAnnouncement("");
    setConfirmClear(false);
    inputRef.current?.focus();
  }

  // Screen-reader announcement of the finished answer. The message list
  // itself is NOT aria-live: during streaming its text mutates dozens of
  // times and a live region would re-announce every fragment. Instead this
  // holds the complete answer, announced once, from a visually-hidden region.
  const [announcement, setAnnouncement] = useState("");

  // Auto-scroll: smooth when a new bubble mounts; instant while the streamed
  // answer grows (restarting a smooth scroll on every chunk means the easing
  // never completes — visible rubber-banding).
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);
  useEffect(() => {
    if (streamingAnswer !== null && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamingAnswer]);

  // Takes the question as an argument (not just from input state) so starter
  // chips can send directly without a synthetic typing step.
  async function send(raw: string) {
    const question = raw.trim();
    if (!question || loading) return;

    // Show the visitor's message immediately; don't wait for the network.
    const transcript = messages;
    setMessages([...transcript, { role: "user", content: question }]);
    setInput("");
    setError(null);
    setAnnouncement("");
    setLoading(true);
    // Starter chips unmount after sending — without this, keyboard focus
    // would silently fall back to <body>.
    inputRef.current?.focus();

    try {
      // History = the transcript *before* this question; the question itself
      // travels in its own field (that's the shape vita-handler expects).
      const { answer } = await askVitaStream(question, transcript, (answerSoFar) => {
        // At most one state commit per animation frame, no matter how fast
        // chunks arrive — renders that could never be shown aren't paid for.
        pendingAnswerRef.current = answerSoFar;
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            setStreamingAnswer(pendingAnswerRef.current);
          });
        }
      });
      // Commit the finished turn; the finally block removes the ephemeral
      // bubble in the same render, so the swap is seamless.
      setMessages((current) => [...current, { role: "assistant", content: answer }]);
      setAnnouncement(answer); // announce the complete answer exactly once
    } catch (err) {
      // Keep whatever partial answer already rendered — better than yanking
      // text mid-read — and surface the error beneath it.
      if (pendingAnswerRef.current) {
        const partial = pendingAnswerRef.current;
        setMessages((current) => [...current, { role: "assistant", content: partial }]);
      }
      // VitaError messages are visitor-safe by construction; anything else
      // gets a generic line so no internal detail ever reaches the UI.
      setError(err instanceof VitaError ? err.message : GENERIC_ERROR);
    } finally {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      pendingAnswerRef.current = "";
      setStreamingAnswer(null);
      setLoading(false);
    }
  }

  // The streamed answer renders as a virtual last message IN the same list
  // slot the committed message will occupy — same index key, so completing
  // the stream swaps content without remounting (no fade-in replay).
  const visibleMessages: ChatMessage[] =
    streamingAnswer === null
      ? messages
      : [...messages, { role: "assistant", content: closeStreamingBold(streamingAnswer) }];

  return (
    <section
      aria-label="Vita — ask about Chris Agbalog"
      className={`flex w-full flex-col overflow-hidden rounded-[var(--vita-radius)] border border-[var(--vita-border)] bg-[var(--vita-surface)] font-[family-name:var(--vita-font-sans)] shadow-[var(--vita-shadow)] ${
        fill ? "h-full" : "h-[70vh] max-h-[640px] min-h-[420px]"
      }`}
    >
      {/* Header — mono, uppercase, pulsing live dot: site conventions */}
      <header className="flex items-center gap-2.5 border-b border-[var(--vita-border-subtle)] bg-[var(--vita-surface-alt)] px-4 py-3">
        <span className="vita-dot" aria-hidden="true" />
        <h2 className="font-[family-name:var(--vita-font-mono)] text-sm font-bold uppercase tracking-[0.22em] text-[var(--vita-accent)]">
          // vita_
        </h2>
        {messages.length > 0 || error ? (
          <button
            type="button"
            onClick={clearConversation}
            // Disabled mid-request: clearing under an active stream would let
            // the completing answer land in an already-emptied transcript.
            disabled={loading}
            aria-label={confirmClear ? "Confirm: clear the conversation" : "Clear conversation"}
            className="ml-auto rounded-[var(--vita-radius)] px-2 py-1 font-[family-name:var(--vita-font-mono)] text-[11px] uppercase tracking-wider text-[var(--vita-text-muted-2)] transition-colors hover:text-[var(--vita-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vita-accent)]/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {confirmClear ? "sure?" : "clear"}
          </button>
        ) : (
          <span className="ml-auto font-[family-name:var(--vita-font-mono)] text-[11px] uppercase tracking-wider text-[var(--vita-text-muted-2)]">
            ask about chris
          </span>
        )}
      </header>

      {/* Hidden live region: announces each completed answer once (see the
          announcement state above for why the list itself isn't live). */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !loading && (
          // Empty state — never a blank screen. Starter chips give a
          // zero-typing way in.
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-[var(--vita-text-muted)]">
              I answer questions about Chris using only his resume — no
              making things up.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  className="rounded-[var(--vita-radius)] border border-[var(--vita-border)] bg-[var(--vita-surface)] px-3 py-1.5 font-[family-name:var(--vita-font-mono)] text-xs text-[var(--vita-text-muted)] transition-colors hover:border-[var(--vita-accent)] hover:text-[var(--vita-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vita-accent)]/50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Index keys are safe here: the transcript is append-only. */}
        {visibleMessages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {/* Typing dots only until the first streamed token: once the answer
            starts arriving, the growing bubble itself is the progress signal. */}
        {loading && streamingAnswer === null && (
          <div className="flex justify-start" role="status" aria-label="Vita is thinking">
            <div className="vita-typing rounded-[var(--vita-radius)] border border-[var(--vita-border-subtle)] bg-[var(--vita-surface-alt)] px-3.5 py-3">
              <span /><span /><span />
            </div>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-[var(--vita-radius)] border border-[var(--vita-border)] bg-[var(--vita-surface-alt)] px-3.5 py-2.5 text-sm text-[var(--vita-text-muted)]"
          >
            {error}
          </p>
        )}
      </div>

      {/* Input row */}
      <form
        className="flex gap-2 border-t border-[var(--vita-border-subtle)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="vita-question" className="sr-only">
          Ask a question about Chris
        </label>
        <input
          id="vita-question"
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={MAX_QUESTION_CHARS}
          placeholder="Ask about experience, projects, skills…"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-[var(--vita-radius)] border border-[var(--vita-border)] bg-[var(--vita-surface)] px-3 py-2.5 text-sm text-[var(--vita-text)] placeholder:text-[var(--vita-text-muted-2)] focus:border-[var(--vita-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--vita-accent)]/30"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-[var(--vita-radius)] bg-[var(--vita-accent-deep)] px-4 py-2.5 font-[family-name:var(--vita-font-mono)] text-xs font-bold uppercase tracking-wider text-[var(--vita-on-accent)] transition-colors hover:bg-[var(--vita-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vita-accent)]/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "…" : "Send"}
        </button>
      </form>
    </section>
  );
}
