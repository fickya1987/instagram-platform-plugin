---
name: instagram-platform
description: >
  Use Instagram Graph API tools for professional Business/Creator accounts
  (profile, media, comments, insights). Use when the user asks about Instagram
  professional-account data via Meta. Never invent metrics or media. Not for
  Messaging, Webhooks, Basic Display, or content publishing.
---

# Instagram Platform

Work with **Instagram professional accounts** (Business or Creator) through the
Instagram Graph API with Facebook Login. Tools talk to
`https://graph.facebook.com/v22.0` using plugin variables
`META_ACCESS_TOKEN` and `IG_USER_ID`.

## When to use

- Fetch the connected professional profile (`get_ig_user`)
- List or inspect posts/reels/stories media (`list_ig_media`, `get_ig_media`)
- Read or reply to comments (`list_ig_comments`, `reply_ig_comment`)
- Read account or media insights (`get_ig_account_insights`, `get_ig_media_insights`)

Do **not** use these tools for personal (non-professional) Instagram accounts,
Instagram Basic Display, Messenger/Instagram Messaging, webhooks, or creating /
publishing media. Those are out of scope for v0.1.

## Never invent data

- Call a tool whenever the user asks for live Instagram data.
- If a tool fails or env vars are missing, report the error. Do not guess
  follower counts, captions, comment text, permalinks, or insight values.
- Do not echo, log, or paste `META_ACCESS_TOKEN` or other secrets.
- Graph `paging.next` URLs contain tokens; tools already strip them. Never
  reconstruct or print full Graph URLs with `access_token`.

## Tools and result shapes

Normalize explanations to these objects (tools already return them):

```
IgUser = { id, username, name, biography, website, followers_count, follows_count, media_count, profile_picture_url }
IgMedia = { id, caption, media_type, media_url, permalink, timestamp, like_count, comments_count }
IgComment = { id, text, username, timestamp, like_count }
IgInsight = { name, period, title, values }
```

| Tool | Arguments | Result |
| --- | --- | --- |
| `get_ig_user` | (none; uses `IG_USER_ID`) | `IgUser` |
| `list_ig_media` | `limit` (default 25), optional `after` | `{ data: IgMedia[], paging }` |
| `get_ig_media` | `media_id` | `IgMedia` |
| `list_ig_comments` | `media_id`, optional `after` | `{ data: IgComment[], paging }` |
| `reply_ig_comment` | `comment_id`, `message` | `IgComment` |
| `get_ig_account_insights` | `metric`, `period` (optional `metric_type`, `breakdown`, `timeframe`, `since`, `until`) | `{ data: IgInsight[] }` |
| `get_ig_media_insights` | `media_id`, `metric` (optional `period`, `breakdown`) | `{ data: IgInsight[] }` |

Account insights often need a `period` such as `day`, `week`, `days_28`,
`month`, `lifetime`, or `total_over_range`. Some v22 metrics also need
`metric_type=total_value`. If Graph rejects a metric combination, surface the
API error instead of substituting another metric's numbers.

## Meta setup (no secrets)

Operators configure variables in the host dashboard (Cursor: **Plugins →
Configure**). Do not ask them to paste tokens into the repo or into skill files.

Official docs:

- [Instagram Platform](https://developers.facebook.com/documentation/instagram-platform)
- [Instagram APIs](https://developers.facebook.com/products/instagram/apis/)
- [Get started (Facebook Login)](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started/)

Typical permissions for this v0.1 surface: `instagram_basic`,
`pages_show_list`, `pages_read_engagement`, `instagram_manage_comments`,
`instagram_manage_insights`. The Instagram professional account must be linked
to a Facebook Page.
