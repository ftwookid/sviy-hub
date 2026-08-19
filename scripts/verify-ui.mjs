/**
 * Measure the real rendered page in Chromium, instead of guessing from the JSX.
 *
 * Every layout bug in this app has been geometric — a header sitting 7px lower
 * on one section, a tile scaling away from its own border — and none of them
 * showed up in a diff, a typecheck or a build. So a UI change is not finished
 * until it has been rendered and measured here.
 *
 *   node scripts/verify-ui.mjs <url> [more urls...] --selectors "h1,#first" --widths 390,1280
 *
 * Prints the bounding box of each selector, per URL, per viewport, and writes a
 * screenshot for each. Chromium ships with the container; playwright is not a
 * project dependency, so install it out of tree and point NODE_PATH at it:
 *
 *   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright --prefix /tmp/pw
 *   NODE_PATH=/tmp/pw/node_modules node scripts/verify-ui.mjs http://localhost:3000/
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
}

const urls = args.filter((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
const selectors = flag("selectors", "h1").split(",").map((value) => value.trim());
const widths = flag("widths", "390,1280").split(",").map(Number);
const shots = flag("shots", "./ui-shots");

if (!urls.length) {
  console.error("Give at least one URL.");
  process.exit(1);
}
mkdirSync(shots, { recursive: true });

const executablePath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath });

for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  console.log(`\n=== ${width}px`);

  for (const url of urls) {
    await page.goto(url, { waitUntil: "networkidle" });
    const boxes = await page.evaluate(
      (wanted) =>
        wanted.map((selector) => {
          const el = document.querySelector(selector);
          if (!el) return { selector, missing: true };
          const rect = el.getBoundingClientRect();
          return {
            selector,
            top: +rect.top.toFixed(1),
            left: +rect.left.toFixed(1),
            width: +rect.width.toFixed(1),
            height: +rect.height.toFixed(1)
          };
        }),
      selectors
    );

    console.log(url);
    boxes.forEach((box) =>
      console.log(
        "  ",
        box.selector.padEnd(24),
        box.missing ? "MISSING" : `top ${box.top}  left ${box.left}  ${box.width}x${box.height}`
      )
    );

    const name = encodeURIComponent(url.replace(/^https?:\/\//, "")).slice(0, 80);
    await page.screenshot({ path: `${shots}/${width}-${name}.png` });
  }

  await context.close();
}

await browser.close();
