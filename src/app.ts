import express from "express";
import * as schema from "./schema.js";
import { DatabaseService } from "./db/service.js";

const DEFAULT_LIMIT = 10;
const BODY_PREVIEW_LENGTH = 500;

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

export function createApp(dbService: DatabaseService): express.Express {
  const app = express();

  app.use(express.json());

  app.get("/", (_req: express.Request, res: express.Response) => {
    res.json({ message: "API is live" });
  });

  app.post("/messages", (req: express.Request, res: express.Response) => {
    const { groupId, from, to, body, threadId, subject } = req.body;

    // Validate required fields
    if (!groupId || !from || !to || !body) {
      res.status(400).json({
        success: false,
        message: "Missing required fields: groupId, from, to, body"
      });
      return;
    }

    try {
      // Ensure group exists
      let group = dbService.getGroup(groupId);
      if (!group) {
        group = new schema.Group(groupId, []);
        dbService.createGroup(group);
      }

      // If threadId provided, validate it exists and get the next message ID
      if (threadId) {
        const existingThread = dbService.getThread(threadId);
        if (!existingThread) {
          res.status(404).json({
            success: false,
            message: `Thread ${threadId} not found`
          });
          return;
        }

        // Calculate next message ID
        const nextMessageId = (parseInt(existingThread.lastIndex) + 1).toString();

        // Create message with proper message ID
        const message = new schema.Message(groupId, from, to, body, threadId, subject);
        message.messageid = nextMessageId;

        // Save to database
        dbService.createMessage(message);

        res.status(201).json({
          success: true,
          message: "Message added to existing thread",
          data: {
            messageId: message.messageid,
            threadId: message.threadId,
            newThreadCreated: false
          }
        });
      } else {
        // Create new thread
        const message = new schema.Message(groupId, from, to, body, threadId, subject);

        // Save thread and message to database
        if (message.spawnedThread) {
          dbService.createThread(message.spawnedThread);
          dbService.createMessage(message);

          res.status(201).json({
            success: true,
            message: "Message created with new thread",
            data: {
              messageId: message.messageid,
              threadId: message.threadId,
              newThreadCreated: true
            }
          });
        } else {
          res.status(500).json({
            success: false,
            message: "Failed to create thread"
          });
        }
      }
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/inbox/short", (req: express.Request, res: express.Response) => {
    const limit = parseLimit(req.query.numOfRecentEmails ?? req.query.limit, DEFAULT_LIMIT);
    const groupId = resolveGroupId(req, res, dbService);
    if (!groupId) return;

    try {
      const messages = dbService.listMessagesByGroup(groupId, limit).map(serializeShortMessage);
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
    const groupId = resolveGroupId(req, res, dbService);
    if (!groupId) return;

    try {
      const messages = dbService.listMessagesByGroup(groupId, limit).map(serializeMessage);
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

  app.get("/messages/by-name/:agentAddress", (req: express.Request, res: express.Response) => {
    const { agentAddress } = req.params;
    const groupId = typeof req.query.groupId === "string" ? req.query.groupId : undefined;
    const limit = parseLimit(req.query.numOfRecentEmails ?? req.query.limit, DEFAULT_LIMIT);

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

      const messages = dbService.listMessagesByAgent(agentAddress, groupId, limit).map(serializeMessage);
      res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      console.error("Error reading inbox by agent:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return app;
}
