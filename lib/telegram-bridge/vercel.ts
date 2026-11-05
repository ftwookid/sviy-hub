import { waitUntil } from "@vercel/functions";
import { bridgeEnv } from "./paths";
import { buildDeps, type AppDeps } from "./core/deps";
import { handleRequest } from "./core/handler";
import { createLogger } from "./core/log";
import { MemoryStore, type Store } from "./core/store";
import { createTelegramClient, type TelegramClient } from "./core/telegram";
import { createStoreTyping, telegramEffects, type TypingController } from "./core/typing";

interface Shared {
  store?: Store;
  typing?: TypingController;
}

const shared: Shared = {};

/** Test hook. Production instances keep the store for the life of the isolate. */
export function resetVercelShared(): void {
  shared.store = undefined;
  shared.typing = undefined;
}

function vercelWaitUntil(promise: Promise<unknown>): void {
  try {
    waitUntil(promise);
  } catch {
    promise.catch(() => undefined);
  }
}

export function createVercelDeps(
  env: Record<string, string | undefined>,
  state: Shared = shared,
  fetchImpl?: typeof fetch,
): AppDeps {
  if (!state.store) {
    state.store = new MemoryStore();
  }
  if (!state.typing) {
    const store = state.store;
    const telegram: TelegramClient = createTelegramClient({
      token: env.TELEGRAM_BOT_TOKEN ?? "",
      fetchImpl,
    });
    // No timer survives the response on Vercel: each wake, interim send, or
    // heartbeat pulses typing once. Telegram shows that for about 5 seconds.
    state.typing = createStoreTyping({
      store,
      mode: "once",
      now: () => Date.now(),
      effects: telegramEffects(telegram, createLogger([env.TELEGRAM_BOT_TOKEN ?? ""])),
    });
  }
  return buildDeps({
    env,
    store: state.store,
    typing: state.typing,
    typingMode: "once",
    fetchImpl,
    waitUntil: vercelWaitUntil,
  });
}

/**
 * One serverless function serves every bridge path, so a warm instance shares
 * its memory store between the webhook and the later /send or /typing calls.
 * `?path=` is accepted so a rewrite can pin the route; the Next.js catch-all
 * already receives the real pathname.
 */
export async function vercelFetch(
  request: Request,
  env: Record<string, string | undefined> = bridgeEnv(),
  state: Shared = shared,
  fetchImpl?: typeof fetch,
): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = url.searchParams.get("path") ?? url.pathname;
  return handleRequest(new Request(url, request), createVercelDeps(env, state, fetchImpl));
}
