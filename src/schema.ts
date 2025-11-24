import { randomUUID } from "crypto";
// Type aliases for core identifiers
export type GroupId = string;       // e.g. "@MacroHard", "@MyAgentWorkflow", "@HackathonProject"
export type AgentAddress = string;  // e.g. "pm", "dev1", "planner"
export type ThreadId = string;      // UUID (string)
export type MessageId = string;     // Iterator of the thread e.g. 0, 1, 2, 3, etc.

// A group represents a collection of agents working together
export class Group {
  id: GroupId;
  createdAt: string;                   // ISO 8601 timestamp
  agents: AgentAddress[];
  threads: ThreadId[];

  constructor(id: GroupId, agents: AgentAddress[] = []) {
    this.id = id;
    this.createdAt = new Date().toISOString();
    this.agents = agents;
    this.threads = [];
  }

  addAgent(agent: AgentAddress): void {
    if (!this.agents.includes(agent)) {
      this.agents.push(agent);
    }
  }

  addThread(threadId: ThreadId): void {
    if (!this.threads.includes(threadId)) {
      this.threads.push(threadId);
    }
  }
}

// A thread represents a conversation between agents within a group
export class Thread {
  threadId: ThreadId;
  groupId: GroupId;
  subject: string;
  createdAt: string;
  createdBy: AgentAddress;
  messages: MessageId[];        //list of message IDs in this thread
  lastIndex: MessageId;         //the largest messageID in the thread.

  constructor(groupId: GroupId, subject: string, createdBy: AgentAddress) {
    this.threadId = randomUUID();
    this.groupId = groupId;
    this.subject = subject;
    this.createdAt = new Date().toISOString();
    this.createdBy = createdBy;
    this.messages = [];
    this.lastIndex = "0";
  }

  addMessage(messageId: MessageId): void {
    this.messages.push(messageId);
    this.lastIndex = messageId;
  }
}

export class Message {
  groupId: GroupId;
  threadId?: ThreadId;
  messageid: MessageId;                       // Index within this thread: 0, 1, 2, ...
  from: AgentAddress;
  to: AgentAddress[];                  //list of agents to recieve email
  subject?: string;                    // Optional override; usually same as Thread.subject
  body: string;
  createdAt: string;                   // ISO 8601
  spawnedThread?: Thread;              // The thread created with this message (if any)

  constructor(groupId: GroupId, from: AgentAddress, to: AgentAddress[], body: string, threadId?: ThreadId, subject?: string) {
    this.groupId = groupId;

    if (!threadId) {
      // Creating a new thread for this message
      const newThread = new Thread(groupId, subject ?? "", from);
      this.threadId = newThread.threadId;
      this.messageid = newThread.lastIndex;
      newThread.addMessage(this.messageid);
      this.spawnedThread = newThread; // Store the thread so it can be persisted
    } else {
      // Adding to an existing thread - caller must handle adding to thread.messages
      this.threadId = threadId;
      this.messageid = "0"; // Placeholder - should be set by caller based on thread's lastIndex
    }

    this.from = from;
    this.to = to;
    this.subject = subject ?? "";
    this.body = body;
    this.createdAt = new Date().toISOString();
  }
}