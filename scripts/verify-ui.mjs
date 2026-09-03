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
 * Add `--states` to walk each selector through rest, hover, press and focus and
 * print, for each, the **hit area** against the box that is actually **painted**
 * inside it. That distinction is the one a resting screenshot cannot make, and
 * it is what shipped a 42px tinted square around a 14px ⓘ: the target was right,
 * the paint filled all of it. Anything with a hover, press or focus treatment
 * gets run through this before it is handed over.
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
/** Walk each selector through rest / hover / press / focus and measure what is painted. */
const states = args.includes("--states");

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

    if (states) {
      for (const selector of selectors) {
        if (!(await page.locator(selector).count())) continue;
        console.log(`   states of ${selector}`);
        for (const state of ["rest", "hover", "press", "focus"]) {
          if (state === "hover") await page.hover(selector).catch(() => {});
          if (state === "press") {
            const box = await page.locator(selector).boundingBox();
            if (box) {
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await page.mouse.down();
            }
          }
          if (state === "focus") {
            await page.mouse.up().catch(() => {});
            await page.mouse.move(2, 2);
            await page.evaluate((s) => document.querySelector(s)?.focus(), selector);
          }
          await page.waitForTimeout(140);
          const measured = await page.evaluate((s) => {
            const el = document.querySelector(s);
            if (!el) return null;
            const hit = el.getBoundingClientRect();
            // The first descendant (or the control itself) carrying a real
            // background is what the eye sees; everything else is hit area.
            const painted = [el, ...el.querySelectorAll("*")].find((node) => {
              const bg = getComputedStyle(node).backgroundColor;
              return bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
            });
            const box = painted?.getBoundingClientRect();
            return {
              hit: `${hit.width.toFixed(0)}x${hit.height.toFixed(0)}`,
              painted: box ? `${box.width.toFixed(0)}x${box.height.toFixed(0)}` : "none",
              ring: getComputedStyle(el).boxShadow !== "none" ? "on hit area" : "not on hit area"
            };
          }, selector);
          if (measured) {
            console.log(
              `      ${state.padEnd(6)} hit ${measured.hit.padEnd(8)} painted ${measured.painted.padEnd(8)} ring ${measured.ring}`
            );
          }
        }
        await page.mouse.up().catch(() => {});
        await page.evaluate(() => document.activeElement?.blur());
      }
    }

    const name = encodeURIComponent(url.replace(/^https?:\/\//, "")).slice(0, 80);
    await page.screenshot({ path: `${shots}/${width}-${name}.png` });
  }

  await context.close();
}

await browser.close();
