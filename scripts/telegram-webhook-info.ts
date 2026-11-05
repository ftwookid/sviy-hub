import { readWebhookInfo } from "../lib/telegram-bridge/cli";

void readWebhookInfo().then((result) => {
  if (!result.ok) {
    console.error(JSON.stringify(result));
    process.exit(1);
  }
  console.log(JSON.stringify(result));
});
