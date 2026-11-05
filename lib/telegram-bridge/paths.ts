/**
 * Public mount for the grokbot-telegram bridge inside this Next.js app.
 * Wake payloads build reply URLs from PUBLIC_BASE_URL plus this prefix, and
 * the App Router catch-all serves the same paths, so the two cannot drift.
 */
export const TELEGRAM_BRIDGE_PREFIX = "/api/telegram";

export function bridgeEnv(
  source: Record<string, string | undefined> = process.env,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) env[key] = value;
  env.PATH_PREFIX = TELEGRAM_BRIDGE_PREFIX;
  return env;
}
