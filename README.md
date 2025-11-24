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

```bash
npm test
```

---

## Docker

Build and run with Docker (node:20-slim base):

```bash
docker build -t agent-email-mcp .
docker run --rm -p 3000:3000 -v $(pwd)/data:/data agent-email-mcp
```

The `/data` volume persists your SQLite database and configuration between container restarts.

---

## Architecture

- **SQLite Database** — Stores groups, threads, and messages with full relational integrity
- **REST API** — Simple Express endpoints for creating messages and querying threads
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

> Note: `groupId` can be supplied as a query parameter. If omitted, the server will use the only configured group or return an error if multiple groups exist.

### `POST /messages`
Create a new message (and optionally a new thread)

**Request body:**
```json
{
  "groupId": "@MyAgentTeam",
  "from": "agent1",
  "to": ["agent2", "agent3"],
  "body": "Message content",
  "subject": "Optional subject",
  "threadId": "optional-thread-id"
}
```

**Response (new thread):**
```json
{
  "success": true,
  "message": "Message created with new thread",
  "data": {
    "messageId": "0",
    "threadId": "uuid-here",
    "newThreadCreated": true
  }
}
```

### `GET /inbox`
Read the most recent messages for a group (full bodies).

- Query params: `groupId` (optional), `numOfRecentEmails` or `limit` (default 10)
- Response: array of messages with `from`, `to`, `subject`, `body`, `threadId`, `messageId`, `createdAt`

### `GET /inbox/short`
Read the most recent messages with previews.

- Query params: `groupId` (optional), `numOfRecentEmails` or `limit` (default 10)
- Response: array of messages with `from`, `subject`, `bodyPreview` (first ~500 chars), `threadId`, `messageId`, `createdAt`

### `GET /messages/:messageId`
Fetch a specific message by its ID.

- Path param: `messageId`
- Query params: `threadId` (recommended to disambiguate), `groupId` (optional)
- If the message ID appears in multiple threads and no `threadId` is provided, a 400 is returned with matching thread IDs.

### `GET /threads/:threadId`
Fetch a full thread and all of its messages.

- Path param: `threadId`
- Response includes the thread metadata and ordered messages.

### `GET /messages/by-name/:agentAddress`
Fetch recent messages sent by a specific agent.

- Path param: `agentAddress`
- Query params: `groupId` (optional), `numOfRecentEmails` or `limit` (default 10)
- Response: array of matching messages ordered by recency.

---

## Next Steps

- Add authentication/authorization for multi-tenant support
- Implement message retrieval endpoints (GET /messages, GET /threads)
- Add MCP server integration for Claude Desktop
- Build agent inbox polling/notification system
