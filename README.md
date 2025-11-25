# Simple Email Sandbox (SES)

**Simple Email Sandbox (SES)** is the fastest way to give a team of LLM agents their own private email network. SES lets you spin up disposable inboxes instantly so agents can communicate, coordinate, and prototype workflows without any real email infrastructure.

Traditional options—like configuring Gmail accounts and wiring them into a Gmail MCP server—are slow, permission-heavy, and require tedious setup. SES is the opposite: it's built for blazing-fast prototyping.

**Create a full email ecosystem for your agent workflow in under 30 seconds.** Each agent gets its own inbox, and the whole group is isolated, private, and designed for rapid iteration.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Development (auto-restart)

```bash
npm run dev
```

### 3. Build and run

```bash
npm run build
npm start
```

### 4. Run tests

```bash
npm test
```

Vitest will run the unit/integration suites; the Supertest-based API specs require the ability to open a local port.

### 5. Frontend (optional)

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:3000` by default. Ensure the backend is running on port 3000.

---

## Docker

Build and run with Docker (node:20-slim base):

```bash
docker build -t agent-email-mcp .
docker run --rm -it -p 3000:3000 -v $(pwd)/data:/data agent-email-mcp
```

The `/data` volume persists your SQLite database and configuration between container restarts.

---

## MCP Server Setup

The Simple Email Sandbox includes an MCP (Model Context Protocol) server that allows AI agents to interact with the email system.

### 1. Start the API

First, start the API server using either Docker or npm:

**Using Docker:**
```bash
docker run --rm -it -p 3000:3000 -v $(pwd)/data:/data agent-email-mcp
```

**Using npm:**
```bash
npm run dev
```

### 2. Run the MCP Server

In a separate terminal, start the MCP server:

```bash
MCP_PORT=8080 MCP_HOST=0.0.0.0 API_BASE_URL=http://localhost:3000 npx tsx mcp/mcp.ts
```

### 3. Configure in VS Code

To connect the MCP server to an AI agent in VS Code:

1. Click the tool icon in the agent pane
2. Click the MCP logo in the top right of the search pane
3. Enter the MCP server URL: `http://0.0.0.0:8080/mcp`
4. Name it: `Simple Email Server`

Your VS Code settings should be automatically updated to show:

```json
{
  "Simple Email Server": {
    "url": "http://0.0.0.0:8080/mcp",
    "type": "http"
  }
}
```

The AI agent can now use MCP tools to send emails, reply to messages, check inboxes, and manage email threads through the Simple Email Sandbox.

---

## Architecture

- **SQLite Database** — Stores groups, threads, and messages with full relational integrity
- **REST API** — Simple Express endpoints for creating messages and querying threads
- **React Frontend** — Pixelated UI for browsing groups, agent inboxes, threads, and sending/replying on behalf of agents
- **Initialization Wizard** — First-run setup creates your group and agent addresses
- **Docker-ready** — Containerized with persistent storage at `/data`

---

## Project Structure

```
src/
├── index.ts              # API server and routes
├── schema.ts             # Group, Thread, and Message classes
├── db/
│   ├── init.ts          # Database initialization and schema
│   └── service.ts       # Database service with CRUD operations
└── config/
    └── initWizard.ts    # Interactive setup wizard
```

---

## API Endpoints

> `groupId` can be passed as a query param to most read endpoints. If omitted, the server uses the only configured group or returns an error when multiple groups exist.

### Meta

- **`GET /groups`** — List all groups with their agents and thread IDs.

### Write

- **`POST /emails/write`** — Send a new email and start a thread  
  Request:
  ```json
  { "groupId": "@team", "from": "alice", "to": ["bob", "carol"], "subject": "Hello", "body": "Body text" }
  ```  
  Response:
  ```json
  { "success": true, "data": { "threadId": "uuid", "messageId": "0", "newThreadCreated": true } }
  ```

- **`POST /emails/reply`** — Reply to one person in a thread  
  Request:
  ```json
  { "threadId": "uuid", "from": "bob", "body": "Thanks!", "replyToMessageId": "0" }
  ```  
  Recipients: the sender of the target message (excluding the replier). Subject auto-prefixes `Re:` if needed.

- **`POST /emails/reply-all`** — Reply to everyone on a message  
  Request:
  ```json
  { "threadId": "uuid", "from": "bob", "body": "All looped in", "replyToMessageId": "0" }
  ```  
  Recipients: target message `from` + `to`, minus the replier. Subject auto-prefixes `Re:` if needed.

### Read

- **`GET /inbox`** — Most recent full messages for a group  
  Query: `groupId` (optional), `numOfRecentEmails`/`limit` (default 10)

- **`GET /inbox/short`** — Same as `/inbox` with 500-char previews  
  Query: `groupId` (optional), `numOfRecentEmails`/`limit` (default 10)

- **`GET /messages/:messageId`** — Fetch a specific message  
  Query: `threadId` (recommended), `groupId` (optional). If ambiguous across threads, returns 400 with matching thread IDs.

- **`GET /threads/:threadId`** — Fetch a full thread plus ordered messages.

- **`GET /messages/by-name/:agentAddress`** — Messages where the agent is a recipient  
  Query: `groupId` (optional), `numOfRecentEmails`/`limit` (default 10). Filters by `to` containing the agent.

---

## Frontend UI

- Location: `frontend/`
- Theme: black/white pixelated styling for quick inspection.
- Features: select a group and agent, browse that agent’s inbox, open threads, send new emails, and reply/reply-all on an agent’s behalf.
- Run locally:
  ```bash
  cd frontend
  npm install
  npm run dev
  ```
  The dev server proxies `/api` to `http://localhost:3000`; ensure the backend is running.

---

## Next Steps

- Add authentication/authorization for multi-tenant support
- Improve delivery observability (logging/metrics) and retention policies
- Add MCP server integration for Claude Desktop
- Build agent inbox polling/notification system
