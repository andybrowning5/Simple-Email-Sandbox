import { runWizardIfNeeded } from "./config/initWizard.js";
import { initDatabase } from "./db/init.js";
import { DatabaseService } from "./db/service.js";
import path from "path";
import { createApp } from "./app.js";

// Set up SQLite db first
const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "email.db");
const db = initDatabase(dbPath);
const dbService = new DatabaseService(db);

const app = createApp(dbService);
const PORT = Number(process.env.PORT) || 3000;

if (process.env.NODE_ENV !== "test" && process.env.SKIP_WIZARD !== "true") {
  // Run the initialization wizard if needed (will use dbService to save group)
  await runWizardIfNeeded(dbService);
}

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

export default app;
export { dbService };
