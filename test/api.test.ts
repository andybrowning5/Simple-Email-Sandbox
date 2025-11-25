import request from "supertest";
import { createServer } from "http";
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { createApp } from "../src/app.js";
import { initDatabase } from "../src/db/init.js";
import { DatabaseService } from "../src/db/service.js";

let app: ReturnType<typeof createApp>;
let dbService: DatabaseService;
const canListen = await new Promise<boolean>((resolve) => {
  const srv = createServer();
  srv.once("listening", () => {
    srv.close(() => resolve(true));
  });
  srv.once("error", () => resolve(false));
  srv.listen(0);
});
const describeIfCanListen = canListen ? describe : describe.skip;

beforeEach(() => {
  const db = initDatabase(":memory:");
  dbService = new DatabaseService(db);
  app = createApp(dbService);
});

afterEach(() => {
  if (dbService) {
    dbService.close();
  }
});

function writeEmail(body: Record<string, unknown>) {
  return request(app).post("/emails/write").send(body);
}

function replyEmail(body: Record<string, unknown>) {
  return request(app).post("/emails/reply").send(body);
}

function replyAll(body: Record<string, unknown>) {
  return request(app).post("/emails/reply-all").send(body);
}

describeIfCanListen("Inbox endpoints", () => {
  it("returns the most recent full inbox entries", async () => {
    const baseBody = {
      groupId: "@group",
      to: ["bob"]
    };

    await writeEmail({ ...baseBody, from: "alice", body: "Hi Bob", subject: "First" }).expect(201);
    await writeEmail({ ...baseBody, from: "carol", body: "Hi again", subject: "Second" }).expect(201);

    const res = await request(app)
      .get("/inbox")
      .query({ groupId: "@group", numOfRecentEmails: 2 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]?.subject).toBe("Second");
    expect(res.body.data[1]?.subject).toBe("First");
  });

  it("returns a short inbox with a 500 character preview", async () => {
    const longBody = "A".repeat(600);
    await writeEmail({
      groupId: "@group",
      from: "alice",
      to: ["bob"],
      body: longBody,
      subject: "Long mail"
    }).expect(201);

    const res = await request(app)
      .get("/inbox/short")
      .query({ groupId: "@group", numOfRecentEmails: 1 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]?.bodyPreview.length).toBe(500);
    expect(res.body.data[0]?.bodyPreview).toBe(longBody.slice(0, 500));
  });
});

describeIfCanListen("Thread and message retrieval", () => {
  it("fetches a full thread with its messages", async () => {
    const first = await writeEmail({
      groupId: "@group",
      from: "alice",
      to: ["bob"],
      body: "Kickoff",
      subject: "Thread subject"
    }).expect(201);

    const threadId = first.body.data.threadId as string;

    await replyEmail({
      groupId: "@group",
      from: "bob",
      body: "Reply",
      threadId
    }).expect(201);

    const res = await request(app).get(`/threads/${threadId}`).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.thread.threadId).toBe(threadId);
    expect(res.body.data.messages).toHaveLength(2);
    expect(res.body.data.messages[0]?.messageId).toBe("0");
    expect(res.body.data.messages[1]?.messageId).toBe("1");
  });

  it("fetches a message by id and thread", async () => {
    const first = await writeEmail({
      groupId: "@group",
      from: "alice",
      to: ["bob"],
      body: "Body text",
      subject: "Subj"
    }).expect(201);

    const { threadId, messageId } = first.body.data;

    const res = await request(app)
      .get(`/messages/${messageId}`)
      .query({ threadId })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.body).toBe("Body text");
  });

  it("returns an error when a message id is ambiguous across threads", async () => {
    await writeEmail({
      groupId: "@group",
      from: "alice",
      to: ["bob"],
      body: "First thread"
    }).expect(201);

    await writeEmail({
      groupId: "@group",
      from: "carol",
      to: ["bob"],
      body: "Second thread"
    }).expect(201);

    const res = await request(app).get("/messages/0").expect(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Multiple messages");
  });
});

describeIfCanListen("Reply logic", () => {
  it("sends a reply to the original sender with Re: subject", async () => {
    const first = await writeEmail({
      groupId: "@group",
      from: "alice",
      to: ["bob"],
      body: "Hello Bob",
      subject: "Status update"
    }).expect(201);

    const threadId = first.body.data.threadId as string;

    const replyRes = await replyEmail({
      groupId: "@group",
      from: "bob",
      threadId,
      body: "Thanks"
    }).expect(201);

    const messageRes = await request(app)
      .get(`/messages/${replyRes.body.data.messageId}`)
      .query({ threadId })
      .expect(200);

    expect(messageRes.body.data.subject).toBe("Re: Status update");
    expect(messageRes.body.data.to).toEqual(["alice"]);
  });

  it("sends reply-all to everyone except the replier", async () => {
    const first = await writeEmail({
      groupId: "@group",
      from: "alice",
      to: ["bob", "carol"],
      body: "Kickoff",
      subject: "Meeting"
    }).expect(201);
    const threadId = first.body.data.threadId as string;

    await replyAll({
      from: "bob",
      threadId,
      body: "Looping everyone back"
    }).expect(201);

    const res = await request(app).get(`/threads/${threadId}`).expect(200);
    const lastMsg = res.body.data.messages.at(-1);
    expect(lastMsg.to.sort()).toEqual(["alice", "carol"].sort());
  });

  it("replies to a specific older message when replyToMessageId is provided", async () => {
    const first = await writeEmail({
      groupId: "@group",
      from: "alice",
      to: ["bob"],
      body: "Msg1",
      subject: "Sequence"
    }).expect(201);
    const threadId = first.body.data.threadId as string;

    await replyEmail({
      from: "bob",
      threadId,
      body: "Msg2"
    }).expect(201);

    const third = await replyEmail({
      from: "carol",
      threadId,
      body: "Msg3"
    }).expect(201);

    const thirdId = third.body.data.messageId as string;

    const fourth = await replyEmail({
      from: "dave",
      threadId,
      body: "Replying to bob",
      replyToMessageId: "1"
    }).expect(201);

    const res = await request(app)
      .get(`/messages/${fourth.body.data.messageId}`)
      .query({ threadId })
      .expect(200);

    // Should target bob (message id "1") even though carol was last
    expect(res.body.data.to).toEqual(["bob"]);
    expect(res.body.data.messageId).toBe(String(Number(thirdId) + 1));
  });
});

describeIfCanListen("Filtering by sender", () => {
  it("fetches messages where the agent is a recipient", async () => {
    await writeEmail({
      groupId: "@group",
      from: "alice",
      to: ["bob"],
      body: "Hello from Alice"
    }).expect(201);

    await writeEmail({
      groupId: "@group",
      from: "carol",
      to: ["alice"],
      body: "Inbound to Alice"
    }).expect(201);

    const res = await request(app)
      .get("/messages/by-name/alice")
      .query({ groupId: "@group" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]?.body).toBe("Inbound to Alice");
  });
});
