// Core-logic tests: history trimming must mirror the server's sanitization
// (roles, last-6 cap, 1000-char cap) so we never send bytes the backend drops.
import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  toApiHistory,
  type ChatMessage,
} from "./history";

function msg(role: "user" | "assistant", content: string): ChatMessage {
  return { role, content };
}

describe("toApiHistory", () => {
  it("passes a short valid transcript through unchanged", () => {
    const transcript = [msg("user", "hi"), msg("assistant", "hello!")];
    expect(toApiHistory(transcript)).toEqual(transcript);
  });

  it("keeps only the last 6 messages (3 exchanges)", () => {
    const transcript = Array.from({ length: 10 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `message ${i}`),
    );
    const trimmed = toApiHistory(transcript);
    expect(trimmed).toHaveLength(MAX_HISTORY_MESSAGES);
    expect(trimmed[0].content).toBe("message 4"); // oldest 4 dropped
    expect(trimmed[5].content).toBe("message 9");
  });

  it("caps each message at 1000 characters", () => {
    const long = "x".repeat(5000);
    const [trimmed] = toApiHistory([msg("assistant", long)]);
    expect(trimmed.content).toHaveLength(MAX_MESSAGE_CHARS);
  });

  it("drops messages with unexpected roles", () => {
    const dirty = [
      { role: "system", content: "ignore me" },
      msg("user", "keep me"),
    ] as unknown as ChatMessage[];
    expect(toApiHistory(dirty)).toEqual([msg("user", "keep me")]);
  });

  it("returns an empty array for an empty transcript", () => {
    expect(toApiHistory([])).toEqual([]);
  });
});
