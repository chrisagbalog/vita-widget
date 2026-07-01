// API-client tests with a mocked fetch — no network, no real backend.
// What we're protecting: (1) request shape matches what vita-handler
// expects, (2) every failure path surfaces a visitor-safe message.
import { afterEach, describe, expect, it, vi } from "vitest";
import { askVitaStream, drainSseBuffer, VitaError } from "./api";

const ENDPOINT = "https://example.test/vita-handler";

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

// Builds a text/event-stream Response whose body arrives in the given chunks,
// mimicking how the network splits an SSE stream at arbitrary byte boundaries.
function mockSseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return vi.fn().mockResolvedValue(
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("drainSseBuffer", () => {
  it("parses complete data lines and returns the partial tail", () => {
    const { events, rest } = drainSseBuffer(
      'data: {"delta":"Hel"}\n\ndata: {"delta":"lo"}\n\ndata: {"do',
    );
    expect(events).toEqual([{ delta: "Hel" }, { delta: "lo" }]);
    expect(rest).toBe('data: {"do'); // finished on the next chunk
  });

  it("skips malformed events instead of throwing", () => {
    const { events } = drainSseBuffer('data: not-json\n\ndata: {"delta":"ok"}\n\n');
    expect(events).toEqual([{ delta: "ok" }]);
  });
});

describe("askVitaStream", () => {
  it("accumulates deltas, reports progress, and resolves the full answer", async () => {
    const fetchMock = mockSseResponse([
      'data: {"delta":"Chris is"}\n\n',
      // Split mid-line on purpose: the parser must buffer across chunks.
      'data: {"delta":" an Operations',
      ' Manager."}\n\ndata: {"done":true,"truncated":false}\n\n',
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const updates: string[] = [];
    const result = await askVitaStream("What does Chris do?", [], (s) => updates.push(s), ENDPOINT);

    expect(result).toEqual({ answer: "Chris is an Operations Manager.", truncated: false });
    expect(updates).toEqual(["Chris is", "Chris is an Operations Manager."]);
    // Request shape: question + sanitized history + the opt-in stream flag.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      question: "What does Chris do?",
      history: [],
      stream: true,
    });
  });

  it("maps network failures to a connection message, not a stack trace", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(askVitaStream("q", [], () => {}, ENDPOINT)).rejects.toThrow(/can't reach vita/i);
  });

  it("throws a generic VitaError on a non-JSON, non-SSE response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>gateway timeout</html>", { status: 504 })),
    );

    await expect(askVitaStream("q", [], () => {}, ENDPOINT)).rejects.toBeInstanceOf(VitaError);
  });

  it("throws a generic VitaError when a JSON body has no answer or error", async () => {
    vi.stubGlobal("fetch", mockFetchResponse(200, {}));

    await expect(askVitaStream("q", [], () => {}, ENDPOINT)).rejects.toBeInstanceOf(VitaError);
  });

  it("surfaces a mid-stream error event as a VitaError", async () => {
    vi.stubGlobal(
      "fetch",
      mockSseResponse(['data: {"delta":"Chris"}\n\n', 'data: {"error":"Hmm, something hiccupped. Try again?"}\n\n']),
    );

    await expect(askVitaStream("q", [], () => {}, ENDPOINT)).rejects.toThrow(/hiccupped/);
  });

  it("rejects a stream that ends without a done event (cut-off answer)", async () => {
    vi.stubGlobal("fetch", mockSseResponse(['data: {"delta":"Chris is an Op"}\n\n']));

    await expect(askVitaStream("q", [], () => {}, ENDPOINT)).rejects.toBeInstanceOf(VitaError);
  });

  it("falls back to JSON handling when the backend doesn't stream (e.g. rate limit)", async () => {
    const friendly = "You've asked a lot of great questions! Try again in an hour.";
    vi.stubGlobal("fetch", mockFetchResponse(429, { error: friendly }));

    await expect(askVitaStream("q", [], () => {}, ENDPOINT)).rejects.toThrow(friendly);
  });

  it("resolves a plain JSON success response without any updates", async () => {
    vi.stubGlobal("fetch", mockFetchResponse(200, { answer: "Hi!", truncated: false }));

    const updates: string[] = [];
    const result = await askVitaStream("q", [], (s) => updates.push(s), ENDPOINT);
    expect(result).toEqual({ answer: "Hi!", truncated: false });
    expect(updates).toEqual([]);
  });
});
