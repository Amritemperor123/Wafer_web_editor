export type ChatClientMessage = {
  type: "prompt";
  prompt: string;
};

export type ChatServerMessage =
  | { type: "token"; token: string }
  | { type: "done" }
  | { type: "error"; message: string };
