# Telegram bridge

Sviy Hub serves the [grokbot-telegram](https://github.com/jexmarc/grokbot-telegram) HTTP bridge (MIT) on the same Vercel project as the app. There is no Cloudflare Worker and no second repository.

Telegram delivers a message to this app. The bridge checks the webhook secret and the allowlist, then POSTs a wake to the **Grok Bot webhook routine**. Grok Bot owns that routine. Replies come back to this app's `/send` route, which holds the bot token and posts to Telegram.

The core lives in `lib/telegram-bridge/` (vendored, plus a thin Vercel adapter). One Next.js route serves every path, so a warm instance shares its in-memory store between the webhook and the later send or typing call.

## Public paths

Prefix: `/api/telegram`. `PATH_PREFIX` in the environment is ignored; the app always mounts here so wake URLs match the routes.

| Method | Path | Who calls it |
| --- | --- | --- |
| `GET`, `HEAD` | `/api/telegram/healthz` | Anyone. JSON config readiness. No secret values. |
| `POST` | `/api/telegram/webhook` | Telegram. Requires `X-Telegram-Bot-Api-Secret-Token`. |
| `POST` | `/api/telegram/send` | Grok Bot, with the per-wake reply token. |
| `POST` | `/api/telegram/typing/stop` | Grok Bot, to end typing for that wake. |
| `POST` | `/api/telegram/typing/heartbeat` | Grok Bot, to keep the wake lease alive. |

`setWebhook` URL:

```text
PUBLIC_BASE_URL + /api/telegram/webhook
```

No trailing slash on `PUBLIC_BASE_URL`. Examples:

- Staging preview: `https://sviy-hub-git-staging-ivan-k-s-projects.vercel.app/api/telegram/webhook`
- Production: `https://sviy-hub.vercel.app/api/telegram/webhook`

`GET /api/telegram/healthz` returns `{ ok, service: "grokbot-telegram", ready, configured, problems }`. `ready` is true only when every required setting is present and none were rejected. `problems` lists setting **names**, never values.

## Vercel environment variables

Set these on the `sviy-hub` project. Use **Preview** for the `staging` branch and **Production** only when this is promoted. Do not commit real values. `.env.example` has placeholders.

Required before `ready` is true:

| Variable | What to put |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token from BotFather for `@sviyhubot`. Secret. |
| `TELEGRAM_WEBHOOK_SECRET` | Random 16–256 chars of `A-Z a-z 0-9 _ -`. `openssl rand -hex 32`. The same value is sent to `setWebhook`. Secret. |
| `TELEGRAM_BOT_USERNAME` | `sviyhubot` (no `@`). |
| `TELEGRAM_BOT_ID` | `9100890087` |
| `GROK_WEBHOOK_URL` | Webhook URL of the Grok Bot routine. Grok Bot owns that routine. |
| `GROK_WEBHOOK_SENDER_KEY` | Sender key from that routine. Secret. |
| `REPLY_TOKEN_SECRET` | HMAC secret for per-wake reply tokens. At least 32 characters. `openssl rand -hex 32`. Secret. Unique per deployment is fine. |
| `PUBLIC_BASE_URL` | `https` origin only, no path, query, or trailing slash. Staging and production differ. |
| `ALLOWLIST_USER_IDS` | `228817280` (Ivan). His DMs, and his messages in any chat. |
| `ALLOWLIST_CHAT_IDS` | `-1003956264311` (supergroup "Sviy Hub", Topics on). Everyone in that chat may wake the bot, still subject to group addressing below. |

With both allowlists empty, the bridge denies everyone.

Optional, same meaning as upstream grokbot-telegram:

| Variable | Default |
| --- | --- |
| `WAKE_COMMANDS` | `/ask,/help` |
| `OUTBOUND_API_KEY` | unset. Long-lived key (32+ chars) for sends that are not part of a wake. |
| `BRIDGE_ACK` | `false` |
| `FAST_GREETING` | `false` |
| `ALLOW_INSECURE_WEBHOOK` | `false` |
| `TELEGRAM_DRAFT_PLACEHOLDER` | `false` |
| `PROGRESS_REACTION` | `👀`, or `off` |
| `FORWARD_FAILURE_TEXT` | a short apology, or `off` |
| `REPLY_TOKEN_TTL_SECONDS` | `1800` |
| `TYPING_REFRESH_MS` | `3000` (unused for the pulse itself on Vercel; see below) |
| `TYPING_LEASE_MS` | `600000` |
| `TYPING_MAX_MS` | `1800000` |
| `CONTEXT_LIMIT` | `10` |
| `RATE_LIMIT_MAX` | `20` |
| `RATE_LIMIT_WINDOW_MS` | `60000` |
| `MAX_BODY_BYTES` | `1000000` |
| `DEDUPE_TTL_MS` | `86400000` |

Do not set `PATH_PREFIX`. The mount is fixed at `/api/telegram`.

## Group chats and Topics

In a group the bridge does not wake on ordinary chatter. It wakes when the message:

- mentions `@sviyhubot`, or
- is a configured command (`/ask`, `/help`, including `/ask@sviyhubot`), or
- replies to the bot.

A forum topic is carried as `message_thread_id` on the wake, and replies are posted back into that topic. The supergroup is a forum (`is_forum`). Privacy mode in BotFather can stay on: mentions, commands, and replies are still delivered.

## Register the webhook

After the deployment with these variables is live:

```bash
node --env-file=.env.local --import tsx scripts/telegram-set-webhook.ts --print-url
node --env-file=.env.local --import tsx scripts/telegram-set-webhook.ts
node --env-file=.env.local --import tsx scripts/telegram-set-commands.ts
node --env-file=.env.local --import tsx scripts/telegram-webhook-info.ts
```

`--print-url` prints `PUBLIC_BASE_URL/api/telegram/webhook` and does not call Telegram. The scripts read the same variables as the server and never print the bot token. `setWebhook` subscribes to `message` and `edited_message`.

Point `PUBLIC_BASE_URL` at the origin you are registering. A staging registration and a production registration are two different webhooks; Telegram keeps only one. Re-run `telegram-set-webhook` after a promote if production should receive updates.

## Grok Bot routine

Create a webhook routine in Grok Bot. Copy its URL into `GROK_WEBHOOK_URL` and its sender key into `GROK_WEBHOOK_SENDER_KEY`, then redeploy so Vercel picks up the new variables (or redeploy the current commit). The bridge POSTs the wake (schema version 2, `schema/wake-event.v2.json` upstream) to that URL with `Authorization: Bearer <sender key>`.

The routine replies by POSTing to `reply.send_url` from the wake (`https://<PUBLIC_BASE_URL>/api/telegram/send`) with the wake's reply token. It must not send the bot token anywhere. Pin the origin to `PUBLIC_BASE_URL` in the routine prompt so a forged wake cannot steer the token to another host. Send the final answer once, with `final: true`.

## Typing on Vercel

Cloudflare's bridge refreshes "typing…" every few seconds for as long as the wake runs. This deployment does not. Vercel does not keep a timer alive after the response, so the adapter uses typing mode `once`: one `sendChatAction` when the wake starts, and one after each progress line or heartbeat. Telegram shows each pulse for about five seconds. The 👀 reaction stays on the message until the final answer, until `/typing/stop`, or until the lease expires.

Dedupe of Telegram retries lives in that instance's memory. A retry that hits a new instance can wake the bot again. That is the same Vercel tradeoff as upstream grokbot-telegram, and it is acceptable here.

## What this does not change

Supabase, the CRM, and the existing pages are untouched. The bridge is additive routes under `/api/telegram`.
