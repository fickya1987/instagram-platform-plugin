# Instagram Platform plugin

Manage Instagram Business/Creator accounts via Meta Graph API (profile, media, comments, insights).

This is an installable **Cursor plugin** and portable **Agent Plugin**: one MCP server plus one skill. It targets the Instagram Graph API with Facebook Login.

- Plugin name: `instagram-platform`
- Version: `0.1.0`
- Author: tinkabot
- Graph base URL: `https://graph.facebook.com/v22.0` (`access_token` query param)

Do **not** publish this plugin to the Cursor Marketplace, a Grok marketplace, or any other catalog unless the repository owner explicitly asks.

## Requirements

- Node.js 18 or newer (`fetch` is used from the standard library; there is no MCP SDK and no npm dependencies)
- An Instagram **professional** account (Business or Creator) linked to a Facebook Page
- A Meta app that can call Instagram Graph API with Facebook Login
- Plugin variables `META_ACCESS_TOKEN` and `IG_USER_ID` (never commit these)

## Variables

Declare names only in `.cursor-plugin/plugin.json`. Values are set in the host dashboard, not in git.

| Variable | Required | Used as | Description |
| --- | --- | --- | --- |
| `META_ACCESS_TOKEN` | yes | `access_token` query param | Facebook User access token with Instagram Graph permissions |
| `IG_USER_ID` | yes | path id | Instagram professional account (IG User) ID |

Cursor: after install, open **Plugins → Configure** and set both values. The MCP process receives them as environment variables (`${META_ACCESS_TOKEN}` / `${IG_USER_ID}` in `mcp.json`).

If a variable is missing, tools return a clear error. The server never logs token values.

## How to get a token and IG User ID

1. Create or open a Meta app at [Meta for Developers](https://developers.facebook.com/).
2. Add **Facebook Login** / Instagram Graph API (Facebook Login) for a professional account linked to a Facebook Page. See [Instagram Platform](https://developers.facebook.com/documentation/instagram-platform) and [Instagram APIs](https://developers.facebook.com/products/instagram/apis/).
3. Grant (at least) `instagram_basic`, `pages_show_list`, `pages_read_engagement`, plus `instagram_manage_comments` and `instagram_manage_insights` if you will use those tools.
4. Obtain a **User access token** (Graph API Explorer is enough for local proof). Prefer exchanging it for a [long-lived token](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/).
5. Resolve the IG User ID:

```bash
curl -sS "https://graph.facebook.com/v22.0/me/accounts?fields=id,name,instagram_business_account&access_token=USER_TOKEN"
```

Use `instagram_business_account.id` as `IG_USER_ID`. Equivalent: `GET /{page-id}?fields=instagram_business_account`.

Walkthrough: [Get started (Instagram API with Facebook Login)](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started/).

Put the token and ID into the plugin variable dashboard. Do not commit them, and do not paste them into issues or the README.

## Prove it in Cursor

1. Install this plugin from the git repository (Cursor **Customize / Plugins**). This repo is a single-plugin package: manifests live at the repo root (`plugin.json`, `.cursor-plugin/plugin.json`, `mcp.json`).
2. Set `META_ACCESS_TOKEN` and `IG_USER_ID` under **Plugins → Configure**.
3. Confirm Node 18+ is on the PATH (`node` is the MCP command).
4. In Agent chat, ask: “Fetch my Instagram professional profile with the Instagram Platform plugin.”
5. The agent should call `get_ig_user` and return an `IgUser` object (`id`, `username`, `name`, `biography`, `website`, `followers_count`, `follows_count`, `media_count`, `profile_picture_url`) from the API — not invented numbers.
6. Optional: “List my latest 5 posts” (`list_ig_media` with `limit` 5) and “Show insights for reach this week” (`get_ig_account_insights`).

Local MCP smoke test (no token required; tools should error clearly):

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_ig_user","arguments":{}}}' \
  | node ./server/index.mjs
```

## Grok Bot

Grok Bot loads this plugin from the **dashboard or a marketplace source**, not from a local checkout path on disk. A clone of this repository in a workspace does not, by itself, attach the MCP server to Grok Bot.

Do not publish to a Grok marketplace unless the owner asks. If the owner later installs it through a dashboard/marketplace catalog, configure the same `META_ACCESS_TOKEN` and `IG_USER_ID` variables there.

## Tools

Results are normalized to:

```
IgUser = { id, username, name, biography, website, followers_count, follows_count, media_count, profile_picture_url }
IgMedia = { id, caption, media_type, media_url, permalink, timestamp, like_count, comments_count }
IgComment = { id, text, username, timestamp, like_count }
IgInsight = { name, period, title, values }
```

| Tool | Arguments | Returns |
| --- | --- | --- |
| `get_ig_user` | — | `IgUser` |
| `list_ig_media` | `limit` (default 25), optional `after` | `{ data: IgMedia[], paging }` |
| `get_ig_media` | `media_id` | `IgMedia` |
| `list_ig_comments` | `media_id`, optional `after` | `{ data: IgComment[], paging }` |
| `reply_ig_comment` | `comment_id`, `message` | `IgComment` |
| `get_ig_account_insights` | `metric`, `period` | `{ data: IgInsight[] }` |
| `get_ig_media_insights` | `media_id`, `metric` | `{ data: IgInsight[] }` |

List tools never return Graph `paging.next` URLs (those embed `access_token`). Only opaque `after` cursors are included.

## Out of scope (v0.1)

- Instagram Messaging / Messenger Platform
- Webhooks
- Instagram Basic Display API
- Content publishing (`create-media` / container publish)

## Layout

```
.
├── .cursor-plugin/plugin.json   # Cursor plugin + secret variable schema
├── plugin.json                  # Agent Plugins 1.0.0 root manifest
├── mcp.json                     # stdio MCP: node ./server/index.mjs
├── skills/instagram-platform/SKILL.md
├── server/index.mjs             # zero-dep Node stdio MCP
├── package.json
├── README.md
└── .gitignore
```

## License

Use is limited to the repository owner’s terms. Do not publish this plugin unless the owner asks.
