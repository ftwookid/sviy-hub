import { setMyCommandsBody, setWebhookBody } from "./core/commands";
import { isValidWebhookSecret, loadConfig, type Config } from "./core/config";
import { joinUrl } from "./core/text";
import { telegramMethodUrl } from "./core/telegram";
import { bridgeEnv } from "./paths";

export type CliFailure = {
  ok: false;
  error: string;
  method?: string;
  status?: number;
  description?: string;
  name?: string;
  hint?: string;
};

export type CliSuccess = {
  ok: true;
  method?: string;
  result?: unknown;
  webhook_url?: string;
};

export function bridgeWebhookUrl(env: Record<string, string | undefined> = bridgeEnv()): string {
  const config = loadConfig(env);
  return joinUrl(config.publicBaseUrl, config.pathPrefix, "/webhook");
}

export function webhookSetupError(config: Config): CliFailure | null {
  if (!config.publicBaseUrl) {
    return { ok: false, error: "public_base_url_invalid", hint: "https origin, no query or credentials" };
  }
  if (!isValidWebhookSecret(config.telegramWebhookSecret)) {
    return {
      ok: false,
      error: "webhook_secret_invalid",
      hint: "16-256 chars of A-Z a-z 0-9 _ -",
    };
  }
  return null;
}

/**
 * Calls the Bot API. The token sits in the request URL and is never printed.
 */
export async function telegramCall(
  method: string,
  body: unknown,
  env: Record<string, string | undefined> = bridgeEnv(),
): Promise<CliSuccess | CliFailure> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  if (!token) return { ok: false, error: "missing_env", name: "TELEGRAM_BOT_TOKEN" };
  const url = telegramMethodUrl(token, method);
  if (!url) return { ok: false, error: "bot_token_invalid" };
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { ok: false, method, error: err instanceof Error ? err.name : "error" };
  }
  const payload: unknown = await response.json().catch(() => null);
  const record = payload && typeof payload === "object"
    ? payload as { ok?: boolean; description?: string; result?: unknown }
    : {};
  if (!response.ok || record.ok !== true) {
    return {
      ok: false,
      method,
      error: "telegram_error",
      status: response.status,
      description: record.description ?? "telegram_error",
    };
  }
  return { ok: true, method, result: record.result ?? null };
}

export async function registerWebhook(
  env: Record<string, string | undefined> = bridgeEnv(),
): Promise<CliSuccess | CliFailure> {
  const config = loadConfig(env);
  const problem = webhookSetupError(config);
  if (problem) return problem;
  const webhookUrl = joinUrl(config.publicBaseUrl, config.pathPrefix, "/webhook");
  const result = await telegramCall("setWebhook", setWebhookBody(webhookUrl, config.telegramWebhookSecret), env);
  if (!result.ok) return result;
  return { ...result, webhook_url: webhookUrl };
}

export async function registerCommands(
  env: Record<string, string | undefined> = bridgeEnv(),
): Promise<CliSuccess | CliFailure> {
  return telegramCall("setMyCommands", setMyCommandsBody(), env);
}

export async function readWebhookInfo(
  env: Record<string, string | undefined> = bridgeEnv(),
): Promise<CliSuccess | CliFailure> {
  return telegramCall("getWebhookInfo", {}, env);
}
