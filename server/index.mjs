#!/usr/bin/env node
/**
 * Zero-dependency stdio MCP server for Instagram Graph API (Facebook Login).
 * JSON-RPC 2.0 over newline-delimited stdin/stdout. Never log tokens.
 */
import readline from "node:readline";

const SERVER_NAME = "instagram-platform";
const SERVER_VERSION = "0.1.0";
const GRAPH_BASE = "https://graph.facebook.com/v22.0";
const PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
]);

const USER_FIELDS =
  "id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url";
const MEDIA_FIELDS =
  "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count";
const COMMENT_FIELDS = "id,text,username,timestamp,like_count";

const TOOLS = [
  {
    name: "get_ig_user",
    description:
      "Get the connected Instagram professional (Business/Creator) profile as IgUser.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_ig_media",
    description:
      "List recent media on the connected Instagram professional account as IgMedia[]. Default limit 25.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 25,
          description: "Number of media objects to return (default 25, max 100).",
        },
        after: {
          type: "string",
          description: "Optional Graph API paging cursor from a previous list_ig_media call.",
        },
      },
    },
  },
  {
    name: "get_ig_media",
    description: "Get a single Instagram media object as IgMedia.",
    inputSchema: {
      type: "object",
      properties: {
        media_id: {
          type: "string",
          description: "IG Media ID.",
        },
      },
      required: ["media_id"],
    },
  },
  {
    name: "list_ig_comments",
    description:
      "List top-level comments on an Instagram media object as IgComment[].",
    inputSchema: {
      type: "object",
      properties: {
        media_id: {
          type: "string",
          description: "IG Media ID whose comments to list.",
        },
        after: {
          type: "string",
          description: "Optional Graph API paging cursor from a previous list_ig_comments call.",
        },
      },
      required: ["media_id"],
    },
  },
  {
    name: "reply_ig_comment",
    description:
      "Reply to an Instagram comment. Returns the created reply as IgComment.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: {
          type: "string",
          description: "IG Comment ID to reply to.",
        },
        message: {
          type: "string",
          description: "Reply text.",
        },
      },
      required: ["comment_id", "message"],
    },
  },
  {
    name: "get_ig_account_insights",
    description:
      "Get account-level insights for the connected Instagram professional account as IgInsight[].",
    inputSchema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          description:
            "Comma-separated insight metric names (for example reach, views, follower_count).",
        },
        period: {
          type: "string",
          description:
            "Aggregation period (for example day, week, days_28, month, lifetime, total_over_range).",
        },
        metric_type: {
          type: "string",
          description: "Optional Graph metric_type (for example time_series or total_value).",
        },
        breakdown: {
          type: "string",
          description: "Optional Graph breakdown (for example follow_type or media_product_type).",
        },
        timeframe: {
          type: "string",
          description: "Optional Graph timeframe for metrics that require it.",
        },
        since: {
          type: "string",
          description: "Optional unix timestamp or date for the start of the range.",
        },
        until: {
          type: "string",
          description: "Optional unix timestamp or date for the end of the range.",
        },
      },
      required: ["metric", "period"],
    },
  },
  {
    name: "get_ig_media_insights",
    description: "Get insights for a single Instagram media object as IgInsight[].",
    inputSchema: {
      type: "object",
      properties: {
        media_id: {
          type: "string",
          description: "IG Media ID.",
        },
        metric: {
          type: "string",
          description:
            "Comma-separated insight metric names (for example reach, views, likes, comments, saved).",
        },
        period: {
          type: "string",
          description: "Optional aggregation period when required by the metric.",
        },
        breakdown: {
          type: "string",
          description: "Optional Graph breakdown.",
        },
      },
      required: ["media_id", "metric"],
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function redactSecrets(value) {
  let text = String(value ?? "");
  const token = process.env.META_ACCESS_TOKEN;
  if (token) {
    text = text.split(token).join("[REDACTED]");
  }
  return text.replace(/access_token=[^&\s"'\\]+/gi, "access_token=[REDACTED]");
}

function missingEnv() {
  const missing = [];
  if (!String(process.env.META_ACCESS_TOKEN ?? "").trim()) {
    missing.push("META_ACCESS_TOKEN");
  }
  if (!String(process.env.IG_USER_ID ?? "").trim()) {
    missing.push("IG_USER_ID");
  }
  return missing;
}

function requireEnv() {
  const missing = missingEnv();
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. Set them in Cursor Plugins → Configure (or the host plugin variable dashboard). Do not put secrets in the repo.`,
    );
  }
}

function requireString(args, key) {
  const value = args?.[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required argument: ${key}`);
  }
  return value.trim();
}

function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    out[key] = source?.[key] ?? null;
  }
  return out;
}

function shapeUser(user) {
  return pick(user, [
    "id",
    "username",
    "name",
    "biography",
    "website",
    "followers_count",
    "follows_count",
    "media_count",
    "profile_picture_url",
  ]);
}

function shapeMedia(media) {
  return pick(media, [
    "id",
    "caption",
    "media_type",
    "media_url",
    "permalink",
    "timestamp",
    "like_count",
    "comments_count",
  ]);
}

function shapeComment(comment) {
  return pick(comment, ["id", "text", "username", "timestamp", "like_count"]);
}

function shapeInsight(insight) {
  let values = insight?.values;
  if (values == null && insight?.total_value != null) {
    values = [insight.total_value];
  }
  return {
    name: insight?.name ?? null,
    period: insight?.period ?? null,
    title: insight?.title ?? null,
    values: values ?? [],
  };
}

function pagingCursor(payload) {
  const after = payload?.paging?.cursors?.after;
  return after ? { after } : null;
}

function formatGraphError(payload, status) {
  const err = payload?.error;
  if (!err) {
    return `Instagram Graph API request failed (HTTP ${status}).`;
  }
  const parts = [`Instagram Graph API error (HTTP ${status})`];
  if (err.type) parts.push(String(err.type));
  if (err.code != null) parts.push(`code ${err.code}`);
  if (err.error_subcode != null) parts.push(`subcode ${err.error_subcode}`);
  if (err.message) parts.push(String(err.message));
  if (err.error_user_msg) parts.push(String(err.error_user_msg));
  return redactSecrets(parts.join(": "));
}

async function graphRequest(path, { method = "GET", query = {}, body } = {}) {
  requireEnv();
  const url = new URL(`${GRAPH_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("access_token", process.env.META_ACCESS_TOKEN);

  const headers = {};
  let encodedBody;
  if (body) {
    encodedBody = new URLSearchParams(body).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: encodedBody,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(
      `Instagram Graph API network error: ${redactSecrets(error?.message ?? error)}`,
    );
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Instagram Graph API returned non-JSON (HTTP ${response.status}).`,
    );
  }

  if (!response.ok || payload?.error) {
    throw new Error(formatGraphError(payload, response.status));
  }
  return payload;
}

async function handleTool(name, args = {}) {
  switch (name) {
    case "get_ig_user": {
      const user = await graphRequest(`/${process.env.IG_USER_ID}`, {
        query: { fields: USER_FIELDS },
      });
      return shapeUser(user);
    }
    case "list_ig_media": {
      const limitRaw = args.limit ?? 25;
      const limit = Number(limitRaw);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("limit must be an integer between 1 and 100");
      }
      const payload = await graphRequest(`/${process.env.IG_USER_ID}/media`, {
        query: {
          fields: MEDIA_FIELDS,
          limit: String(limit),
          after: args.after,
        },
      });
      return {
        data: Array.isArray(payload.data) ? payload.data.map(shapeMedia) : [],
        paging: pagingCursor(payload),
      };
    }
    case "get_ig_media": {
      const mediaId = requireString(args, "media_id");
      const media = await graphRequest(`/${mediaId}`, {
        query: { fields: MEDIA_FIELDS },
      });
      return shapeMedia(media);
    }
    case "list_ig_comments": {
      const mediaId = requireString(args, "media_id");
      const payload = await graphRequest(`/${mediaId}/comments`, {
        query: {
          fields: COMMENT_FIELDS,
          after: args.after,
        },
      });
      return {
        data: Array.isArray(payload.data)
          ? payload.data.map(shapeComment)
          : [],
        paging: pagingCursor(payload),
      };
    }
    case "reply_ig_comment": {
      const commentId = requireString(args, "comment_id");
      const message = requireString(args, "message");
      const created = await graphRequest(`/${commentId}/replies`, {
        method: "POST",
        body: { message },
      });
      try {
        const comment = await graphRequest(`/${created.id}`, {
          query: { fields: COMMENT_FIELDS },
        });
        return shapeComment(comment);
      } catch {
        return {
          id: created.id ?? null,
          text: message,
          username: null,
          timestamp: null,
          like_count: null,
        };
      }
    }
    case "get_ig_account_insights": {
      const metric = requireString(args, "metric");
      const period = requireString(args, "period");
      const payload = await graphRequest(`/${process.env.IG_USER_ID}/insights`, {
        query: {
          metric,
          period,
          metric_type: args.metric_type,
          breakdown: args.breakdown,
          timeframe: args.timeframe,
          since: args.since,
          until: args.until,
        },
      });
      return {
        data: Array.isArray(payload.data)
          ? payload.data.map(shapeInsight)
          : [],
      };
    }
    case "get_ig_media_insights": {
      const mediaId = requireString(args, "media_id");
      const metric = requireString(args, "metric");
      const payload = await graphRequest(`/${mediaId}/insights`, {
        query: {
          metric,
          period: args.period,
          breakdown: args.breakdown,
        },
      });
      return {
        data: Array.isArray(payload.data)
          ? payload.data.map(shapeInsight)
          : [],
      };
    }
    default:
      return null;
  }
}

function initializeResult(params) {
  const requested = params?.protocolVersion;
  const protocolVersion = PROTOCOL_VERSIONS.has(requested)
    ? requested
    : "2024-11-05";
  return {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    instructions:
      "Instagram Graph API tools for professional Business/Creator accounts. Requires META_ACCESS_TOKEN and IG_USER_ID. Never invent profile, media, comment, or insight values; call tools instead. Do not log or echo access tokens.",
  };
}

async function dispatch(message) {
  const { id, method, params } = message;
  if (id === undefined) {
    return;
  }
  if (typeof method !== "string") {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: "Invalid Request" },
    });
    return;
  }

  switch (method) {
    case "initialize":
      send({ jsonrpc: "2.0", id, result: initializeResult(params) });
      return;
    case "ping":
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    case "tools/list":
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      return;
    case "tools/call": {
      const name = params?.name;
      if (typeof name !== "string" || !name) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Missing tool name" },
        });
        return;
      }
      if (!TOOLS.some((tool) => tool.name === name)) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Unknown tool: ${name}` },
        });
        return;
      }
      try {
        const result = await handleTool(name, params.arguments ?? {});
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: redactSecrets(JSON.stringify(result, null, 2)),
              },
            ],
          },
        });
      } catch (error) {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: redactSecrets(error?.message ?? String(error)),
              },
            ],
            isError: true,
          },
        });
      }
      return;
    }
    default:
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }
}

const missingAtBoot = missingEnv();
if (missingAtBoot.length) {
  console.error(
    `${SERVER_NAME}: missing ${missingAtBoot.join(" and ")}. Tools will return a clear error until they are set.`,
  );
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  for (const message of messages) {
    Promise.resolve(dispatch(message)).catch((error) => {
      if (message?.id !== undefined) {
        send({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32603,
            message: redactSecrets(error?.message ?? "Internal error"),
          },
        });
      }
    });
  }
});
rl.on("close", () => {
  process.exit(0);
});
