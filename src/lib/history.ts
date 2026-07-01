// Conversation-history helper.
//
// The backend (vita-handler) sanitizes history hard: user/assistant roles
// only, last 6 messages, each capped at 1000 chars. We mirror those limits
// client-side so we never ship payload bytes the server would throw away.

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const MAX_HISTORY_MESSAGES = 6; // last 3 exchanges
export const MAX_MESSAGE_CHARS = 1000;
export const MAX_QUESTION_CHARS = 500; // server rejects longer questions

/** Trim a full chat transcript down to what the API accepts as `history`. */
export function toApiHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}
