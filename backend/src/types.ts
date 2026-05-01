export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatClientMessage = {
  type: "prompt";
  prompt: string;
  messages?: ChatMessage[];
};

export type ChatServerMessage =
  | { type: "status"; message: string }
  | { type: "token"; token: string }
  | { type: "done" }
  | { type: "error"; message: string };
