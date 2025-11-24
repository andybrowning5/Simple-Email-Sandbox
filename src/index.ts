import express from "express";
import { runWizardIfNeeded } from "./config/initWizard.js";
import * as schema from "./schema.js";
import { initDatabase } from "./db/init.js";
import { DatabaseService } from "./db/service.js";
import path from "path";


const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get("/", (req: express.Request, res: express.Response) => {
  res.json({ message: "API is live" });
});

//
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



//Starting Server...

//Set up SQLite db first
const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "email.db");
const db = initDatabase(dbPath);
const dbService = new DatabaseService(db);

//Run the initialization wizard if needed (will use dbService to save group)
await runWizardIfNeeded(dbService);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

export default app;

