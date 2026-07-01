// API client for the vita-handler edge function.
//
// The endpoint URL is public by design — it runs in every visitor's browser,
// and the endpoint protects itself with a CORS allowlist + per-IP rate
// limiting (the Anthropic key never leaves Supabase). VITE_VITA_ENDPOINT
// lets a fork (or local supabase dev) point elsewhere without code changes.
import { toApiHistory, type ChatMessage } from "./history";

const DEFAULT_ENDPOINT =
  "https://hnezbferzpjmkgmtlgar.supabase.co/functions/v1/vita-handler";

export const VITA_ENDPOINT: string =
  (import.meta.env?.VITE_VITA_ENDPOINT as string | undefined) ?? DEFAULT_ENDPOINT;

export interface VitaAnswer {
  answer: string;
  truncated: boolean;
}

/**
 * Thrown for any failed ask. `message` is always safe to show the visitor —
 * it's either the backend's friendly error text or a generic fallback,
 * never a stack trace or status code.
 */
export class VitaError extends Error {}

// Exported so the UI's last-resort catch block shows the same message —
// one string, no drift.
export const GENERIC_ERROR = "Hmm, something hiccupped. Try again?";
const NETWORK_ERROR =
  "Can't reach Vita right now — check your connection and try again.";

/**
 * Ask Vita a question, streaming the reply: `onUpdate` receives the
 * accumulated answer-so-far each time a new chunk lands, so the UI can render
 * the reply as it's being written; resolves with the complete answer.
 *
 * If the backend responds with plain JSON instead (an error, or a server
 * that doesn't stream), this degrades to ordinary request/response handling.
 */
export async function askVitaStream(
  question: string,
  history: ChatMessage[],
  onUpdate: (answerSoFar: string) => void,
  endpoint: string = VITA_ENDPOINT,
): Promise<VitaAnswer> {
  const res = await postQuestion(question, history, endpoint);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream") || !res.body) {
    return parseJsonAnswer(res);
  }

  // Read the SSE body chunk by chunk. Network chunks don't align with event
  // boundaries, so we keep the trailing partial line in a buffer between reads.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let truncated = false;
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const drained = drainSseBuffer(buffer);
      buffer = drained.rest;

      for (const event of drained.events) {
        if (typeof event.error === "string") throw new VitaError(event.error);
        if (typeof event.delta === "string") {
          answer += event.delta;
          onUpdate(answer);
        }
        if (event.done === true) {
          finished = true;
          truncated = event.truncated === true;
        }
      }
    }
  } catch (err) {
    if (err instanceof VitaError) throw err;
    // The connection died mid-stream (flaky network, edge timeout).
    throw new VitaError(NETWORK_ERROR);
  }

  // No terminal `done` event = the stream was cut off; don't present a
  // half-answer as complete.
  if (!finished || !answer.trim()) throw new VitaError(GENERIC_ERROR);

  return { answer, truncated };
}

/** One SSE event from vita-handler (see sseResponse in the edge function). */
interface VitaSseEvent {
  delta?: string;
  done?: boolean;
  truncated?: boolean;
  error?: string;
}

/**
 * Pulls every complete `data: {...}` line out of an SSE buffer. Returns the
 * parsed events plus the trailing partial line, which the caller prepends to
 * the next network chunk. Exported for tests.
 */
export function drainSseBuffer(buffer: string): {
  events: VitaSseEvent[];
  rest: string;
} {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? ""; // last piece may be a partial line
  const events: VitaSseEvent[] = [];
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue; // skip blank separator lines
    try {
      events.push(JSON.parse(line.slice("data: ".length)));
    } catch {
      // A malformed event is dropped rather than killing the whole answer.
    }
  }
  return { events, rest };
}

async function postQuestion(
  question: string,
  history: ChatMessage[],
  endpoint: string,
): Promise<Response> {
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // stream is an opt-in flag server-side; older backends just ignore it
      // and reply with JSON (handled by the fallback above).
      body: JSON.stringify({ question, history: toApiHistory(history), stream: true }),
    });
  } catch {
    // fetch() only rejects on network-level failures (offline, DNS, CORS).
    throw new VitaError(NETWORK_ERROR);
  }
}

// The backend puts a visitor-friendly message in `error` for every failure
// (rate limit, validation, upstream trouble) — surface it verbatim.
async function parseJsonAnswer(res: Response): Promise<VitaAnswer> {
  let body: { answer?: string; truncated?: boolean; error?: string };
  try {
    body = await res.json();
  } catch {
    throw new VitaError(GENERIC_ERROR);
  }

  if (!res.ok || !body.answer) {
    throw new VitaError(body.error || GENERIC_ERROR);
  }

  return { answer: body.answer, truncated: body.truncated === true };
}
