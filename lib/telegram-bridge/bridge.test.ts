import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAddress } from "./core/address";
import { isAllowlisted } from "./core/allowlist";
import { loadConfig } from "./core/config";
import { buildDeps } from "./core/deps";
import { handleRequest } from "./core/handler";
import { cleanText, joinUrl } from "./core/text";
import type { TelegramMessage, WakeEvent } from "./core/types";
import { TELEGRAM_SECRET_HEADER } from "./core/types";
import { bridgeWebhookUrl } from "./cli";
import { TELEGRAM_BRIDGE_PREFIX, bridgeEnv } from "./paths";
import { resetVercelShared, vercelFetch } from "./vercel";

const SECRET = "webhook-secret-value";
const BASE = "https://sviy-hub-git-staging-ivan-k-s-projects.vercel.app";

function env(overrides: Record<string, string> = {}): Record<string, string | undefined> {
  return bridgeEnv({
    TELEGRAM_BOT_TOKEN: "123456:ABCDEFghij",
    TELEGRAM_WEBHOOK_SECRET: SECRET,
    TELEGRAM_BOT_USERNAME: "sviyhubot",
    TELEGRAM_BOT_ID: "9100890087",
    GROK_WEBHOOK_URL: "https://grok.example/hook",
    GROK_WEBHOOK_SENDER_KEY: "sender-key-value",
    REPLY_TOKEN_SECRET: "reply-token-secret-for-tests-only-0123456789",
    PUBLIC_BASE_URL: BASE,
    ALLOWLIST_USER_IDS: "228817280",
    ALLOWLIST_CHAT_IDS: "-1003956264311",
    ...overrides,
  });
}

function message(partial: Partial<TelegramMessage> & Pick<TelegramMessage, "chat">): TelegramMessage {
  return { message_id: 1, text: "", ...partial };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("untrusted text", () => {
  it("strips controls and unicode tags", () => {
    const tag = String.fromCodePoint(0xE0001);
    assert.equal(cleanText(`a${tag}b\u200Bc\u0000d`), "abcd");
  });
});

describe("bridge paths", () => {
  it("forces the Next.js prefix even when PATH_PREFIX is set to something else", () => {
    const configured = loadConfig(env({ PATH_PREFIX: "/bridge" }));
    assert.equal(configured.pathPrefix, TELEGRAM_BRIDGE_PREFIX);
    assert.equal(
      bridgeWebhookUrl(env()),
      `${BASE}/api/telegram/webhook`,
    );
    assert.equal(joinUrl(BASE, TELEGRAM_BRIDGE_PREFIX, "/send"), `${BASE}/api/telegram/send`);
  });
});

describe("allowlist and group addressing", () => {
  const config = loadConfig(env());

  it("admits Ivan in any chat and everyone in the Sviy Hub supergroup", () => {
    assert.equal(isAllowlisted("228817280", "228817280", config), true);
    assert.equal(isAllowlisted("228817280", "-1003956264311", config), true);
    assert.equal(isAllowlisted("100", "-1003956264311", config), true);
    assert.equal(isAllowlisted("100", "-999", config), false);
    assert.equal(isAllowlisted("42", "42", loadConfig(bridgeEnv({}))), false);
  });

  it("wakes a private DM and ignores ordinary group chatter", () => {
    assert.equal(classifyAddress(message({
      chat: { id: 228817280, type: "private" },
      text: "hello",
    }), config).addressed, true);
    assert.equal(classifyAddress(message({
      chat: { id: -1003956264311, type: "supergroup" },
      text: "anyone there?",
    }), config).addressed, false);
  });

  it("wakes the supergroup on a mention, a wake command, or a reply to the bot", () => {
    assert.equal(classifyAddress(message({
      chat: { id: -1003956264311, type: "supergroup" },
      text: "hey @sviyhubot",
      entities: [{ type: "mention", offset: 4, length: 10 }],
    }), config).how, "mention");
    assert.equal(classifyAddress(message({
      chat: { id: -1003956264311, type: "supergroup" },
      text: "/ask@sviyhubot what is due",
    }), config).how, "command");
    assert.equal(classifyAddress(message({
      chat: { id: -1003956264311, type: "supergroup" },
      text: "and the topic",
      message_thread_id: 44,
      is_topic_message: true,
      reply_to_message: {
        message_id: 8,
        text: "earlier",
        chat: { id: -1003956264311, type: "supergroup" },
        from: { id: 9100890087, is_bot: true, username: "sviyhubot" },
      },
    }), config).how, "reply");
  });
});

describe("HTTP routes", () => {
  it("reports ready only when the required settings are present", async () => {
    const missing = await handleRequest(
      new Request(`${BASE}/api/telegram/healthz`),
      buildDeps({ env: bridgeEnv({}), log: () => undefined }),
    );
    const missingBody = await readJson(missing);
    assert.equal(missing.status, 200);
    assert.equal(missingBody.ok, true);
    assert.equal(missingBody.service, "grokbot-telegram");
    assert.equal(missingBody.ready, false);

    const ready = await handleRequest(
      new Request(`${BASE}/api/telegram/healthz`),
      buildDeps({ env: env(), log: () => undefined }),
    );
    const readyBody = await readJson(ready);
    assert.equal(readyBody.ready, true);
    assert.deepEqual(readyBody.problems, []);
    const configured = readyBody.configured as Record<string, boolean>;
    assert.equal(configured.telegram_bot_token, true);
    assert.equal(configured.allowlist, true);
    assert.equal(JSON.stringify(readyBody).includes("ABCDEFghij"), false);
    assert.equal(JSON.stringify(readyBody).includes(SECRET), false);
  });

  it("rejects a webhook without the secret and a send without a reply token", async () => {
    resetVercelShared();
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return Response.json({ ok: true, result: true });
    };
    const denied = await vercelFetch(
      new Request(`${BASE}/api/telegram/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ update_id: 1 }),
      }),
      env(),
      undefined,
      fetchImpl,
    );
    assert.equal(denied.status, 401);
    assert.equal((await readJson(denied)).error, "unauthorized");

    const send = await vercelFetch(
      new Request(`${BASE}/api/telegram/send`, { method: "POST", body: "{}" }),
      env(),
      undefined,
      fetchImpl,
    );
    assert.equal(send.status, 401);
    const stop = await vercelFetch(
      new Request(`${BASE}/api/telegram/typing/stop`, { method: "POST", body: "{}" }),
      env(),
    );
    const beat = await vercelFetch(
      new Request(`${BASE}/api/telegram/typing/heartbeat`, { method: "POST", body: "{}" }),
      env(),
    );
    assert.equal(stop.status, 401);
    assert.equal(beat.status, 401);
    assert.equal(calls.length, 0);
    resetVercelShared();
  });

  it("forwards an allowlisted DM and a topic reply, and drops group chatter", async () => {
    const tasks: Promise<unknown>[] = [];
    const calls: { url: string; body: string; authorization: string | null }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        body: typeof init?.body === "string" ? init.body : "",
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (url.includes("api.telegram.org")) return Response.json({ ok: true, result: true });
      return new Response("accepted", { status: 202 });
    };
    const deps = buildDeps({
      env: env(),
      fetchImpl,
      typingMode: "once",
      log: () => undefined,
      waitUntil(promise) {
        tasks.push(promise);
      },
    });

    const chatter = await handleRequest(webhook({
      update_id: 10,
      message: {
        message_id: 10,
        date: 1,
        chat: { id: -1003956264311, type: "supergroup", title: "Sviy Hub" },
        from: { id: 228817280, is_bot: false, first_name: "Ivan" },
        text: "just chatting",
      },
    }), deps);
    assert.equal(chatter.status, 200);
    await Promise.all(tasks.splice(0));
    assert.equal(calls.some((call) => call.url.startsWith("https://grok.example/hook")), false);

    const dm = await handleRequest(webhook({
      update_id: 11,
      message: {
        message_id: 11,
        date: 1,
        chat: { id: 228817280, type: "private" },
        from: { id: 228817280, is_bot: false, first_name: "Ivan" },
        text: "hello from telegram",
      },
    }), deps);
    assert.equal(dm.status, 200);
    await Promise.all(tasks.splice(0));
    const forwarded = calls.filter((call) => call.url === "https://grok.example/hook");
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0]?.authorization, "Bearer sender-key-value");
    const wake = JSON.parse(forwarded[0]?.body ?? "{}") as WakeEvent;
    assert.equal(wake.reply.send_url, `${BASE}/api/telegram/send`);
    assert.equal(wake.reply.typing_stop_url, `${BASE}/api/telegram/typing/stop`);
    assert.equal(wake.reply.heartbeat_url, `${BASE}/api/telegram/typing/heartbeat`);
    assert.equal(wake.reply.chat_id, "228817280");

    calls.length = 0;
    const topic = await handleRequest(webhook({
      update_id: 12,
      message: {
        message_id: 12,
        date: 1,
        chat: { id: -1003956264311, type: "supergroup", title: "Sviy Hub" },
        from: { id: 50, is_bot: false, first_name: "Guest" },
        text: "@sviyhubot in this topic",
        message_thread_id: 77,
        is_topic_message: true,
        entities: [{ type: "mention", offset: 0, length: 10 }],
      },
    }), deps);
    assert.equal(topic.status, 200);
    await Promise.all(tasks.splice(0));
    const topicWake = JSON.parse(calls.find((call) => call.url === "https://grok.example/hook")?.body ?? "{}") as WakeEvent;
    assert.equal(topicWake.message.message_thread_id, 77);
    assert.equal(topicWake.reply.message_thread_id, 77);
    assert.equal(topicWake.reply.chat_id, "-1003956264311");
  });

  it("answers the public method matrix", async () => {
    resetVercelShared();
    const health = await vercelFetch(new Request(`${BASE}/api/telegram/healthz`), env());
    assert.equal(health.status, 200);
    const head = await vercelFetch(new Request(`${BASE}/api/telegram/healthz`, { method: "HEAD" }), env());
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    const wrong = await vercelFetch(new Request(`${BASE}/api/telegram/healthz`, { method: "POST" }), env());
    assert.equal(wrong.status, 405);
    const missing = await vercelFetch(new Request(`${BASE}/api/telegram/nope`), env());
    assert.equal(missing.status, 404);
    resetVercelShared();
  });
});

function webhook(update: unknown): Request {
  return new Request(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [TELEGRAM_SECRET_HEADER]: SECRET,
    },
    body: JSON.stringify(update),
  });
}
