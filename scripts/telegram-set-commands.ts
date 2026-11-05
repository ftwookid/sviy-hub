import { registerCommands } from "../lib/telegram-bridge/cli";

void registerCommands().then((result) => {
  if (!result.ok) {
    console.error(JSON.stringify(result));
    process.exit(1);
  }
  console.log(JSON.stringify(result));
});
