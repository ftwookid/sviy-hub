import { bridgeEnv } from "../lib/telegram-bridge/paths";
import { bridgeWebhookUrl, registerWebhook, webhookSetupError } from "../lib/telegram-bridge/cli";
import { loadConfig } from "../lib/telegram-bridge/core/config";

const env = bridgeEnv();

if (process.argv.includes("--print-url")) {
  const problem = webhookSetupError(loadConfig(env));
  if (problem) {
    console.error(JSON.stringify(problem));
    process.exit(1);
  }
  console.log(bridgeWebhookUrl(env));
  process.exit(0);
}

void registerWebhook(env).then((result) => {
  if (!result.ok) {
    console.error(JSON.stringify(result));
    process.exit(1);
  }
  console.log(JSON.stringify(result));
});
