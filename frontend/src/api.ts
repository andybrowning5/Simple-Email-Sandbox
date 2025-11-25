import { ApiResponse, Group, Message, ThreadWithMessages } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || json.success === false) {
    const msg = json.message || `Request failed with status ${res.status}`;
    throw new Error(msg);
  }
  if (json.data === undefined) {
    throw new Error("Malformed response");
  }
  return json.data;
}

export const api = {
  listGroups: () => getJson<Group[]>("/groups"),
  inboxByAgent: (groupId: string, agent: string) =>
    getJson<Message[]>(`/messages/by-name/${encodeURIComponent(agent)}?groupId=${encodeURIComponent(groupId)}`),
  thread: (threadId: string) => getJson<ThreadWithMessages>(`/threads/${encodeURIComponent(threadId)}`),
  writeEmail: (payload: {
    groupId: string;
    from: string;
    to: string[];
    subject: string;
    body: string;
  }) =>
    getJson<{ messageId: string; threadId: string; newThreadCreated: boolean }>("/emails/write", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  replyEmail: (payload: { threadId: string; from: string; body: string; replyToMessageId?: string; groupId?: string }) =>
    getJson<{ messageId: string; threadId: string; newThreadCreated: boolean }>("/emails/reply", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  replyAll: (payload: { threadId: string; from: string; body: string; replyToMessageId?: string; groupId?: string }) =>
    getJson<{ messageId: string; threadId: string; newThreadCreated: boolean }>("/emails/reply-all", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  resetDatabase: () =>
    getJson<{ message: string }>("/admin/reset", {
      method: "POST"
    })
};
