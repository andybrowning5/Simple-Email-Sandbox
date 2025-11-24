import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export function initDatabase(dbPath?: string): Database.Database {
  const finalPath = dbPath || path.join(process.cwd(), "data", "email.db");

  // Ensure the directory exists
  const dbDir = path.dirname(finalPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(finalPath);

  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  // Create groups table
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      agents TEXT NOT NULL DEFAULT '[]'
    )
  `);

  // Create threads table
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      thread_id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      last_index TEXT NOT NULL DEFAULT '0',
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )
  `);

  // Create index on threads.group_id for faster lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_threads_group_id ON threads(group_id)
  `);

  // Create messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      from_agent TEXT NOT NULL,
      to_agents TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(thread_id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      UNIQUE(thread_id, message_id)
    )
  `);

  // Create indices for faster lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id)
  `);

  console.log(`SQLite database initialized at: ${finalPath}`);

  return db;
}
