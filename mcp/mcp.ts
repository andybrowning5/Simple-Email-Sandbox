import { FastMCP } from "fastmcp";
import { z } from "zod";

type HttpMethod = "GET" | "POST";
type QueryParams = Record<string, string | number | undefined>;

function normalizeBaseUrl(raw: string): string {
  return raw.endsWith("/") ? raw : `${raw}/`;
}

const API_BASE_URL = normalizeBaseUrl(
  process.env.API_BASE_URL ?? "http://localhost:3000"
);

// HTTP MCP server config (for the MCP transport itself)
const MCP_PORT = Number(process.env.MCP_PORT ?? "8080");
const MCP_HOST = process.env.MCP_HOST ?? "0.0.0.0"; // or "127.0.0.1" if you only want local

const groupIdSchema = z
  .string()
  .min(1, "Provide a group ID (e.g. @team).");
const senderSchema = z
  .string()
  .min(
    1,
    "Provide the sending agent address. IMPORTANT: Must be a valid agent in the group. Use list_agents to see valid agents."
  );
const bodySchema = z.string().min(1, "Body cannot be empty.");
const limitSchema = z
  .number()
  .int()
  .positive()
  .describe("Defaults to 10 if omitted.");
const recipientsSchema = z
  .union([
    z.string().min(1, "Recipient cannot be empty."),
    z.array(z.string().min(1)).nonempty("Provide at least one recipient.")
  ])
  .describe(
    "Recipient agent address(es). IMPORTANT: Must be valid agents in the group. Use list_agents to see valid agents."
  );

async function callApi<T>(
  path: string,
  method: HttpMethod,
  options: { body?: unknown; query?: QueryParams } = {}
): Promise<T> {
  const url = new URL(path, API_BASE_URL);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.message ?? response.statusText;
    throw new Error(`Request failed (${response.status}): ${message}`);
  }

  if (payload?.success === false) {
    throw new Error(payload.message ?? "Request reported failure");
  }

  return (payload?.data ?? payload) as T;
}

const server = new FastMCP({
  name: "Simple Email Sandbox MCP",
  version: "0.1.0",
  instructions: `Interact with the Simple Email Sandbox REST API at ${API_BASE_URL}`
});

server.addTool({
  name: "list_groups",
  description:
    "List all groups and agents configured in the Simple Email Sandbox.",
  annotations: { readOnlyHint: true, idempotentHint: true },
  execute: async () => {
    return await callApi("groups", "GET");
  }
});

server.addTool({
  name: "list_agents",
  description: "List all agents in a specific group.",
  annotations: { readOnlyHint: true, idempotentHint: true },
  parameters: z.object({
    groupId: groupIdSchema
      .optional()
      .describe(
        "Group to list agents from. Required when multiple groups exist."
      )
  }),
  execute: async args => {
    const result = await callApi<{ groupId: string; agents: string[] }>(
      "agents",
      "GET",
      {
        query: { groupId: args.groupId }
      }
    );
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
});

server.addTool({
  name: "send_email",
  description:
    "Send a new email and create a thread. IMPORTANT: Use list_agents first to get valid agent addresses for 'from' and 'to' fields. Only valid agents in the group can send/receive emails.",
  annotations: { destructiveHint: false, idempotentHint: false },
  parameters: z.object({
    groupId: groupIdSchema,
    from: senderSchema,
    to: recipientsSchema,
    subject: z
      .string()
      .optional()
      .describe("Defaults to 'No subject' on the API if omitted."),
    body: bodySchema
  }),
  execute: async args => {
    const result = await callApi("emails/write", "POST", {
      body: {
        groupId: args.groupId,
        from: args.from,
        to: args.to,
        subject: args.subject,
        body: args.body
      }
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
});

server.addTool({
  name: "reply_email",
  description:
    "Reply to a specific message sender within a thread. IMPORTANT: The 'from' field must be a valid agent in the group.",
  annotations: { destructiveHint: false },
  parameters: z.object({
    groupId: groupIdSchema
      .optional()
      .describe("Optional group ID to assert thread membership."),
    threadId: z.string().min(1, "Provide a thread ID."),
    replyToMessageId: z
      .string()
      .optional()
      .describe(
        "Message ID to reply to. Defaults to the latest message if omitted."
      ),
    from: senderSchema,
    body: bodySchema
  }),
  execute: async args => {
    const result = await callApi("emails/reply", "POST", {
      body: {
        groupId: args.groupId,
        threadId: args.threadId,
        replyToMessageId: args.replyToMessageId,
        from: args.from,
        body: args.body
      }
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
});

server.addTool({
  name: "reply_all_email",
  description:
    "Reply-all to a message, sending to the sender and all recipients in the thread message. IMPORTANT: The 'from' field must be a valid agent in the group.",
  annotations: { destructiveHint: false },
  parameters: z.object({
    groupId: groupIdSchema
      .optional()
      .describe("Optional group ID to assert thread membership."),
    threadId: z.string().min(1, "Provide a thread ID."),
    replyToMessageId: z
      .string()
      .optional()
      .describe(
        "Message ID to reply to. Defaults to the latest message if omitted."
      ),
    from: senderSchema,
    body: bodySchema
  }),
  execute: async args => {
    const result = await callApi("emails/reply-all", "POST", {
      body: {
        groupId: args.groupId,
        threadId: args.threadId,
        replyToMessageId: args.replyToMessageId,
        from: args.from,
        body: args.body
      }
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
});

server.addTool({
  name: "get_inbox_short",
  description:
    "Retrieve the most recent messages for a specific agent with 500 character previews. Use list_agents to get valid agent addresses.",
  annotations: { readOnlyHint: true, idempotentHint: true },
  parameters: z.object({
    agentAddress: z
      .string()
      .min(
        1,
        "Agent address is required. Use list_agents to see valid agents."
      ),
    groupId: groupIdSchema
      .optional()
      .describe(
        "Group to pull messages from. Required when multiple groups exist."
      ),
    limit: limitSchema.optional()
  }),
  execute: async args => {
    const path = `messages/by-name/${encodeURIComponent(args.agentAddress)}`;
    const result = await callApi(path, "GET", {
      query: { groupId: args.groupId, limit: args.limit }
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
});

server.addTool({
  name: "get_inbox",
  description:
    "Retrieve the most recent messages for a specific agent with full bodies. Use list_agents to get valid agent addresses.",
  annotations: { readOnlyHint: true, idempotentHint: true },
  parameters: z.object({
    agentAddress: z
      .string()
      .min(
        1,
        "Agent address is required. Use list_agents to see valid agents."
      ),
    groupId: groupIdSchema
      .optional()
      .describe(
        "Group to pull messages from. Required when multiple groups exist."
      ),
    limit: limitSchema.optional()
  }),
  execute: async args => {
    const path = `messages/by-name/${encodeURIComponent(args.agentAddress)}`;
    const result = await callApi(path, "GET", {
      query: { groupId: args.groupId, limit: args.limit }
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
});

server.addTool({
  name: "get_message",
  description: "Fetch a specific message by ID.",
  annotations: { readOnlyHint: true, idempotentHint: true },
  parameters: z.object({
    messageId: z.string().min(1, "Message ID is required."),
    threadId: z
      .string()
      .optional()
      .describe("Thread ID to disambiguate when duplicates exist."),
    groupId: groupIdSchema
      .optional()
      .describe("Optional group to narrow the search.")
  }),
  execute: async args => {
    const path = `messages/${encodeURIComponent(args.messageId)}`;
    const result = await callApi(path, "GET", {
      query: { threadId: args.threadId, groupId: args.groupId }
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
});

server.addTool({
  name: "get_thread",
  description: "Fetch a full thread and its messages.",
  annotations: { readOnlyHint: true, idempotentHint: true },
  parameters: z.object({
    threadId: z.string().min(1, "Thread ID is required.")
  }),
  execute: async args => {
    const path = `threads/${encodeURIComponent(args.threadId)}`;
    const result = await callApi(path, "GET");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
});

server.addTool({
  name: "messages_for_agent",
  description: "List messages where the agent is a recipient.",
  annotations: { readOnlyHint: true, idempotentHint: true },
  parameters: z.object({
    agentAddress: z.string().min(1, "Agent address is required."),
    groupId: groupIdSchema
      .optional()
      .describe(
        "Optional group filter. Required when multiple groups exist."
      ),
    limit: limitSchema.optional()
  }),
  execute: async args => {
    const path = `messages/by-name/${encodeURIComponent(args.agentAddress)}`;
    const result = await callApi(path, "GET", {
      query: { groupId: args.groupId, limit: args.limit }
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
});

// 🚀 Start MCP server over HTTP streaming
await server.start({
  transportType: "httpStream",
  httpStream: {
    port: MCP_PORT,
    host: MCP_HOST
    // endpoint: "/mcp",      // default
    // stateless: true,       // optional: enable stateless mode
    // jsonResponse: true,    // if you want JSON-only responses (no SSE)
  }
});
