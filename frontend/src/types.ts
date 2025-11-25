export type GroupId = string;
export type AgentAddress = string;
export type ThreadId = string;
export type MessageId = string;

export interface Group {
  id: GroupId;
  createdAt: string;
  agents: AgentAddress[];
  threads: ThreadId[];
}

export interface Message {
  messageId: MessageId;
  threadId: ThreadId;
  groupId: GroupId;
  from: AgentAddress;
  to: AgentAddress[];
  subject: string;
  body: string;
  createdAt: string;
}

export interface Thread {
  threadId: ThreadId;
  groupId: GroupId;
  subject: string;
  createdAt: string;
  createdBy: AgentAddress;
  messages: MessageId[];
  lastIndex: MessageId;
}

export interface ThreadWithMessages {
  thread: Thread;
  messages: Message[];
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}
