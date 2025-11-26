import Database from "better-sqlite3";
import { Group, Thread, Message, GroupId, ThreadId, AgentAddress, MessageId } from "../schema.js";

export class DatabaseService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ===== GROUP OPERATIONS =====

  createGroup(group: Group): void {
    const stmt = this.db.prepare(`
      INSERT INTO groups (id, created_at, agents)
      VALUES (?, ?, ?)
    `);
    stmt.run(group.id, group.createdAt, JSON.stringify(group.agents));
  }

  getGroup(groupId: GroupId): Group | null {
    const stmt = this.db.prepare(`
      SELECT id, created_at, agents FROM groups WHERE id = ?
    `);
    const row = stmt.get(groupId) as { id: string; created_at: string; agents: string } | undefined;

    if (!row) return null;

    const group = new Group(row.id, JSON.parse(row.agents));
    group.createdAt = row.created_at;

    // Load thread IDs for this group
    const threadsStmt = this.db.prepare(`
      SELECT thread_id FROM threads WHERE group_id = ?
    `);
    const threadRows = threadsStmt.all(groupId) as { thread_id: string }[];
    group.threads = threadRows.map(r => r.thread_id);

    return group;
  }

  updateGroup(group: Group): void {
    const stmt = this.db.prepare(`
      UPDATE groups SET agents = ? WHERE id = ?
    `);
    stmt.run(JSON.stringify(group.agents), group.id);
  }

  listGroups(): Group[] {
    const stmt = this.db.prepare(`SELECT id FROM groups`);
    const rows = stmt.all() as { id: string }[];
    return rows.map(row => this.getGroup(row.id)).filter(g => g !== null) as Group[];
  }

  // ===== THREAD OPERATIONS =====

  createThread(thread: Thread): void {
    const stmt = this.db.prepare(`
      INSERT INTO threads (thread_id, group_id, subject, created_at, created_by, last_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      thread.threadId,
      thread.groupId,
      thread.subject,
      thread.createdAt,
      thread.createdBy,
      thread.lastIndex
    );
  }

  getThread(threadId: ThreadId): Thread | null {
    const stmt = this.db.prepare(`
      SELECT thread_id, group_id, subject, created_at, created_by, last_index
      FROM threads
      WHERE thread_id = ?
    `);
    const row = stmt.get(threadId) as {
      thread_id: string;
      group_id: string;
      subject: string;
      created_at: string;
      created_by: string;
      last_index: string;
    } | undefined;

    if (!row) return null;

    const thread = new Thread(row.group_id, row.subject, row.created_by);
    thread.threadId = row.thread_id;
    thread.createdAt = row.created_at;
    thread.lastIndex = row.last_index;

    // Load message IDs for this thread
    const messagesStmt = this.db.prepare(`
      SELECT message_id FROM messages WHERE thread_id = ? ORDER BY id ASC
    `);
    const messageRows = messagesStmt.all(threadId) as { message_id: string }[];
    thread.messages = messageRows.map(m => m.message_id);

    return thread;
  }

  updateThreadLastIndex(threadId: ThreadId, lastIndex: MessageId): void {
    const stmt = this.db.prepare(`
      UPDATE threads SET last_index = ? WHERE thread_id = ?
    `);
    stmt.run(lastIndex, threadId);
  }

  listThreadsByGroup(groupId: GroupId): Thread[] {
    const stmt = this.db.prepare(`
      SELECT thread_id FROM threads WHERE group_id = ? ORDER BY created_at DESC
    `);
    const rows = stmt.all(groupId) as { thread_id: string }[];
    return rows.map(row => this.getThread(row.thread_id)).filter(t => t !== null) as Thread[];
  }

  // ===== MESSAGE OPERATIONS =====

  createMessage(message: Message): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (message_id, thread_id, group_id, from_agent, to_agents, subject, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      message.messageid,
      message.threadId,
      message.groupId,
      message.from,
      JSON.stringify(message.to),
      message.subject || "",
      message.body,
      message.createdAt
    );

    // Update thread's last_index
    if (message.threadId) {
      this.updateThreadLastIndex(message.threadId, message.messageid);
    }
  }

  getMessage(threadId: ThreadId, messageId: MessageId): Message | null {
    const stmt = this.db.prepare(`
      SELECT message_id, thread_id, group_id, from_agent, to_agents, subject, body, created_at
      FROM messages
      WHERE thread_id = ? AND message_id = ?
    `);
    const row = stmt.get(threadId, messageId) as {
      message_id: string;
      thread_id: string;
      group_id: string;
      from_agent: string;
      to_agents: string;
      subject: string;
      body: string;
      created_at: string;
    } | undefined;

    if (!row) return null;

    const message = new Message(
      row.group_id,
      row.from_agent,
      JSON.parse(row.to_agents),
      row.body,
      row.thread_id,
      row.subject || undefined
    );
    message.messageid = row.message_id;
    message.createdAt = row.created_at;

    return message;
  }

  listMessagesByThread(threadId: ThreadId): Message[] {
    const stmt = this.db.prepare(`
      SELECT message_id FROM messages WHERE thread_id = ? ORDER BY id ASC
    `);
    const rows = stmt.all(threadId) as { message_id: string }[];
    return rows.map(row => this.getMessage(threadId, row.message_id)).filter(m => m !== null) as Message[];
  }

  listMessagesByGroup(groupId: GroupId, limit?: number): Message[] {
    const baseQuery = `
      SELECT thread_id, message_id FROM messages WHERE group_id = ? ORDER BY id DESC
    `;
    const stmt = typeof limit === "number" && limit > 0
      ? this.db.prepare(`${baseQuery} LIMIT ?`)
      : this.db.prepare(baseQuery);
    const rows = (typeof limit === "number" && limit > 0
      ? stmt.all(groupId, limit)
      : stmt.all(groupId)) as { thread_id: string; message_id: string }[];
    return rows
      .map(row => this.getMessage(row.thread_id, row.message_id))
      .filter(m => m !== null) as Message[];
  }

  findMessagesById(messageId: MessageId, groupId?: GroupId): Message[] {
    const baseQuery = `
      SELECT thread_id, message_id FROM messages
      WHERE message_id = ?
    `;
    const stmt = groupId
      ? this.db.prepare(`${baseQuery} AND group_id = ? ORDER BY id DESC`)
      : this.db.prepare(`${baseQuery} ORDER BY id DESC`);
    const rows = (groupId
      ? stmt.all(messageId, groupId)
      : stmt.all(messageId)) as { thread_id: string; message_id: string }[];

    return rows
      .map(row => this.getMessage(row.thread_id, row.message_id))
      .filter(m => m !== null) as Message[];
  }

  listMessagesByAgent(agent: AgentAddress, groupId?: GroupId, limit?: number): Message[] {
    const baseQuery = `
      SELECT thread_id, message_id FROM messages
      WHERE from_agent = ?
    `;
    const withGroup = groupId ? `${baseQuery} AND group_id = ?` : baseQuery;
    const withLimit = typeof limit === "number" && limit > 0
      ? `${withGroup} ORDER BY id DESC LIMIT ?`
      : `${withGroup} ORDER BY id DESC`;

    const stmt = this.db.prepare(withLimit);
    const rows = (groupId
      ? (typeof limit === "number" && limit > 0
        ? stmt.all(agent, groupId, limit)
        : stmt.all(agent, groupId))
      : (typeof limit === "number" && limit > 0
        ? stmt.all(agent, limit)
        : stmt.all(agent))) as { thread_id: string; message_id: string }[];

    return rows
      .map(row => this.getMessage(row.thread_id, row.message_id))
      .filter(m => m !== null) as Message[];
  }

  listMessagesForAgent(agent: AgentAddress, groupId?: GroupId, limit?: number): Message[] {
    const hasLimit = typeof limit === "number" && limit > 0;

    // Use JSON_EACH to search within the to_agents JSON array
    const query = groupId
      ? `SELECT DISTINCT m.thread_id, m.message_id
         FROM messages m, json_each(m.to_agents)
         WHERE m.group_id = ? AND json_each.value = ?
         ORDER BY m.id DESC${hasLimit ? " LIMIT ?" : ""}`
      : `SELECT DISTINCT m.thread_id, m.message_id
         FROM messages m, json_each(m.to_agents)
         WHERE json_each.value = ?
         ORDER BY m.id DESC${hasLimit ? " LIMIT ?" : ""}`;

    const stmt = this.db.prepare(query);
    const rows = (groupId
      ? (hasLimit ? stmt.all(groupId, agent, limit) : stmt.all(groupId, agent))
      : (hasLimit ? stmt.all(agent, limit) : stmt.all(agent))) as { thread_id: string; message_id: string }[];

    return rows
      .map(row => this.getMessage(row.thread_id, row.message_id))
      .filter(m => m !== null) as Message[];
  }

  // ===== UTILITY OPERATIONS =====

  close(): void {
    this.db.close();
  }

  // ===== DELETE OPERATIONS =====

  deleteAllMessages(): void {
    const stmt = this.db.prepare(`DELETE FROM messages`);
    stmt.run();
  }

  deleteAllThreads(): void {
    const stmt = this.db.prepare(`DELETE FROM threads`);
    stmt.run();
  }

  deleteAllGroups(): void {
    const stmt = this.db.prepare(`DELETE FROM groups`);
    stmt.run();
  }
}
