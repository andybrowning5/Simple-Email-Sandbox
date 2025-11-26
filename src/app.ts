import express from "express";
import * as schema from "./schema.js";
import { DatabaseService } from "./db/service.js";
import fs from "fs";
import path from "path";

const DEFAULT_LIMIT = 10;
const BODY_PREVIEW_LENGTH = 500;
const DEFAULT_SUBJECT = "No subject";

function parseLimit(raw: unknown, fallback = DEFAULT_LIMIT): number {
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function resolveGroupId(
  req: express.Request,
  res: express.Response,
  dbService: DatabaseService
): schema.GroupId | null {
  const groupId = typeof req.query.groupId === "string" ? req.query.groupId : undefined;
  if (groupId) {
    const group = dbService.getGroup(groupId);
    if (!group) {
      res.status(404).json({
        success: false,
        message: `Group ${groupId} not found`
      });
      return null;
    }
    return groupId;
  }

  const groups = dbService.listGroups();
  if (groups.length === 0) {
    res.status(404).json({
      success: false,
      message: "No groups found. Create a group first."
    });
    return null;
  }

  if (groups.length === 1) {
    return groups[0]!.id;
  }

  res.status(400).json({
    success: false,
    message: "Multiple groups exist. Provide groupId as a query parameter."
  });
  return null;
}

function serializeMessage(message: schema.Message) {
  return {
    messageId: message.messageid,
    threadId: message.threadId,
    groupId: message.groupId,
    from: message.from,
    to: message.to,
    subject: message.subject,
    body: message.body,
    createdAt: message.createdAt
  };
}

function serializeShortMessage(message: schema.Message) {
  return {
    messageId: message.messageid,
    threadId: message.threadId,
    groupId: message.groupId,
    from: message.from,
    subject: message.subject,
    bodyPreview: message.body.slice(0, BODY_PREVIEW_LENGTH),
    createdAt: message.createdAt
  };
}

function normalizeRecipients(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((val): val is string => typeof val === "string" && val.trim() !== "")
      .map(v => v.trim());
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    return [raw.trim()];
  }
  return [];
}

function nextMessageId(thread: schema.Thread): string {
  const next = Number.parseInt(thread.lastIndex, 10) + 1;
  return Number.isNaN(next) ? "0" : String(next);
}

function replySubject(subject: string): string {
  if (!subject || subject.trim() === "") {
    return `Re: ${DEFAULT_SUBJECT}`;
  }
  const trimmed = subject.trim();
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

function ensureGroup(dbService: DatabaseService, groupId: string): schema.Group {
  let group = dbService.getGroup(groupId);
  if (!group) {
    group = new schema.Group(groupId, []);
    dbService.createGroup(group);
  }
  return group;
}

function validateAgents(agents: string[], group: schema.Group): { valid: boolean; invalidAgents: string[] } {
  const validAgents = new Set(group.agents);
  const invalidAgents = agents.filter(agent => !validAgents.has(agent));
  return {
    valid: invalidAgents.length === 0,
    invalidAgents
  };
}

export function createApp(dbService: DatabaseService): express.Express {
  const app = express();

  app.use(express.json());

  app.get("/", (_req: express.Request, res: express.Response) => {
    res.json({ message: "API is live" });
  });

  app.get("/groups", (_req: express.Request, res: express.Response) => {
    try {
      const groups = dbService.listGroups();
      res.json({
        success: true,
        data: groups
      });
    } catch (error) {
      console.error("Error listing groups:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/emails/write", (req: express.Request, res: express.Response) => {
    const { groupId, from, to, subject, body } = req.body;

    if (!groupId || !from || !to || !body) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: groupId, from, to, body"
      });
      return;
    }

    const recipients = normalizeRecipients(to);
    if (recipients.length === 0) {
      res.status(400).json({
        success: false,
        message: "Recipient list cannot be empty"
      });
      return;
    }

    try {
      const group = ensureGroup(dbService, groupId);

      // Validate 'from' is a valid agent
      if (!group.agents.includes(from)) {
        res.status(400).json({
          success: false,
          message: `Invalid sender: '${from}' is not a valid agent in group ${groupId}. Valid agents: ${group.agents.join(", ")}`
        });
        return;
      }

      // Validate all recipients are valid agents
      const recipientValidation = validateAgents(recipients, group);
      if (!recipientValidation.valid) {
        res.status(400).json({
          success: false,
          message: `Invalid recipient(s): ${recipientValidation.invalidAgents.join(", ")} are not valid agents in group ${groupId}. Valid agents: ${group.agents.join(", ")}`
        });
        return;
      }

      const message = new schema.Message(groupId, from, recipients, body, undefined, subject ?? DEFAULT_SUBJECT);

      if (!message.spawnedThread) {
        res.status(500).json({
          success: false,
          message: "Failed to create thread"
        });
        return;
      }

      dbService.createThread(message.spawnedThread);
      dbService.createMessage(message);

      res.status(201).json({
        success: true,
        message: "Email sent",
        data: {
          messageId: message.messageid,
          threadId: message.threadId,
          newThreadCreated: true
        }
      });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/emails/reply", (req: express.Request, res: express.Response) => {
    const { groupId, threadId, replyToMessageId, from, body } = req.body;

    if (!from || !threadId || !body) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: threadId, from, body"
      });
      return;
    }

    try {
      const thread = dbService.getThread(threadId);
      if (!thread) {
        res.status(404).json({
          success: false,
          message: `Thread ${threadId} not found`
        });
        return;
      }

      if (groupId && groupId !== thread.groupId) {
        res.status(400).json({
          success: false,
          message: `Thread ${threadId} does not belong to group ${groupId}`
        });
        return;
      }

      const group = ensureGroup(dbService, thread.groupId);

      // Validate 'from' is a valid agent
      if (!group.agents.includes(from)) {
        res.status(400).json({
          success: false,
          message: `Invalid sender: '${from}' is not a valid agent in group ${thread.groupId}. Valid agents: ${group.agents.join(", ")}`
        });
        return;
      }

      const targetMessage = replyToMessageId
        ? dbService.getMessage(threadId, replyToMessageId)
        : dbService.listMessagesByThread(threadId).at(-1) ?? null;

      if (!targetMessage) {
        res.status(404).json({
          success: false,
          message: "Message to reply to was not found"
        });
        return;
      }

      const recipients = [targetMessage.from].filter(addr => addr !== from);
      if (recipients.length === 0) {
        res.status(400).json({
          success: false,
          message: "No valid recipients found for reply"
        });
        return;
      }

      const subject = replySubject(thread.subject);
      const message = new schema.Message(thread.groupId, from, recipients, body, threadId, subject);
      message.messageid = nextMessageId(thread);
      dbService.createMessage(message);

      res.status(201).json({
        success: true,
        message: "Reply sent",
        data: {
          messageId: message.messageid,
          threadId: message.threadId,
          newThreadCreated: false
        }
      });
    } catch (error) {
      console.error("Error sending reply:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/emails/reply-all", (req: express.Request, res: express.Response) => {
    const { groupId, threadId, replyToMessageId, from, body } = req.body;

    if (!from || !threadId || !body) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: threadId, from, body"
      });
      return;
    }

    try {
      const thread = dbService.getThread(threadId);
      if (!thread) {
        res.status(404).json({
          success: false,
          message: `Thread ${threadId} not found`
        });
        return;
      }

      if (groupId && groupId !== thread.groupId) {
        res.status(400).json({
          success: false,
          message: `Thread ${threadId} does not belong to group ${groupId}`
        });
        return;
      }

      const group = ensureGroup(dbService, thread.groupId);

      // Validate 'from' is a valid agent
      if (!group.agents.includes(from)) {
        res.status(400).json({
          success: false,
          message: `Invalid sender: '${from}' is not a valid agent in group ${thread.groupId}. Valid agents: ${group.agents.join(", ")}`
        });
        return;
      }

      const targetMessage = replyToMessageId
        ? dbService.getMessage(threadId, replyToMessageId)
        : dbService.listMessagesByThread(threadId).at(-1) ?? null;

      if (!targetMessage) {
        res.status(404).json({
          success: false,
          message: "Message to reply to was not found"
        });
        return;
      }

      const recipientSet = new Set<string>();
      recipientSet.add(targetMessage.from);
      targetMessage.to.forEach(addr => recipientSet.add(addr));
      recipientSet.delete(from);
      const recipients = Array.from(recipientSet);

      if (recipients.length === 0) {
        res.status(400).json({
          success: false,
          message: "No valid recipients found for reply-all"
        });
        return;
      }

      const subject = replySubject(thread.subject);
      const message = new schema.Message(thread.groupId, from, recipients, body, threadId, subject);
      message.messageid = nextMessageId(thread);
      dbService.createMessage(message);

      res.status(201).json({
        success: true,
        message: "Reply-all sent",
        data: {
          messageId: message.messageid,
          threadId: message.threadId,
          newThreadCreated: false
        }
      });
    } catch (error) {
      console.error("Error sending reply-all:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/inbox/short", (req: express.Request, res: express.Response) => {
    const limit = parseLimit(req.query.numOfRecentEmails ?? req.query.limit, DEFAULT_LIMIT);
    const agentAddress = typeof req.query.agentAddress === "string" ? req.query.agentAddress : undefined;
    const groupId = resolveGroupId(req, res, dbService);
    if (!groupId) return;

    try {
      const messages = agentAddress
        ? dbService.listMessagesForAgent(agentAddress, groupId, limit).map(serializeShortMessage)
        : dbService.listMessagesByGroup(groupId, limit).map(serializeShortMessage);
      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      console.error("Error reading short inbox:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/inbox", (req: express.Request, res: express.Response) => {
    const limit = parseLimit(req.query.numOfRecentEmails ?? req.query.limit, DEFAULT_LIMIT);
    const agentAddress = typeof req.query.agentAddress === "string" ? req.query.agentAddress : undefined;
    const groupId = resolveGroupId(req, res, dbService);
    if (!groupId) return;

    //console.log("[/inbox] agentAddress:", agentAddress, "groupId:", groupId, "limit:", limit);

    try {
      const messages = agentAddress
        ? dbService.listMessagesForAgent(agentAddress, groupId, limit).map(serializeMessage)
        : dbService.listMessagesByGroup(groupId, limit).map(serializeMessage);
      console.log("[/inbox] Returning", messages.length, "messages");
      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      console.error("Error reading inbox:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/messages/:messageId", (req: express.Request, res: express.Response) => {
    const { messageId } = req.params;
    const threadId = typeof req.query.threadId === "string" ? req.query.threadId : undefined;
    const groupId = typeof req.query.groupId === "string" ? req.query.groupId : undefined;

    try {
      if (groupId) {
        const group = dbService.getGroup(groupId);
        if (!group) {
          res.status(404).json({
            success: false,
            message: `Group ${groupId} not found`
          });
          return;
        }
      }

      if (threadId) {
        const message = dbService.getMessage(threadId, messageId);
        if (!message) {
          res.status(404).json({
            success: false,
            message: `Message ${messageId} not found in thread ${threadId}`
          });
          return;
        }

        res.json({
          success: true,
          data: serializeMessage(message)
        });
        return;
      }

      const matches = dbService.findMessagesById(messageId, groupId);
      if (matches.length === 0) {
        res.status(404).json({
          success: false,
          message: `Message ${messageId} not found`
        });
        return;
      }

      if (matches.length > 1) {
        res.status(400).json({
          success: false,
          message: "Multiple messages found with that messageId. Provide threadId to disambiguate.",
          data: matches.map(m => ({ threadId: m.threadId, groupId: m.groupId }))
        });
        return;
      }

      res.json({
        success: true,
        data: serializeMessage(matches[0]!)
      });
    } catch (error) {
      console.error("Error reading email:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/threads/:threadId", (req: express.Request, res: express.Response) => {
    const { threadId } = req.params;
    try {
      const thread = dbService.getThread(threadId);
      if (!thread) {
        res.status(404).json({
          success: false,
          message: `Thread ${threadId} not found`
        });
        return;
      }

      const messages = dbService.listMessagesByThread(threadId).map(serializeMessage);

      res.json({
        success: true,
        data: {
          thread,
          messages
        }
      });
    } catch (error) {
      console.error("Error reading thread:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/admin/reset", (_req: express.Request, res: express.Response) => {
    try {
      // Delete all data from database tables
      dbService.deleteAllMessages();
      dbService.deleteAllThreads();
      dbService.deleteAllGroups();

      // Close database connection
      dbService.close();

      // Delete the physical database and config files
      const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "email.db");
      const configPath = process.env.GROUP_CONFIG_PATH || path.join(process.cwd(), "data", "config.json");

      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }

      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }

      // Also delete SQLite temp files if they exist
      const dbShmPath = `${dbPath}-shm`;
      const dbWalPath = `${dbPath}-wal`;
      if (fs.existsSync(dbShmPath)) {
        fs.unlinkSync(dbShmPath);
      }
      if (fs.existsSync(dbWalPath)) {
        fs.unlinkSync(dbWalPath);
      }

      res.json({
        success: true,
        message: "Database reset successfully",
        data: {
          message: "Database and config files deleted successfully. Please restart the server to run the wizard again."
        }
      });

      // Exit the process after a short delay to ensure response is sent
      setTimeout(() => {
        console.log("Database reset complete. Exiting to allow restart...");
        process.exit(0);
      }, 500);
    } catch (error) {
      console.error("Error resetting database:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return app;
}
