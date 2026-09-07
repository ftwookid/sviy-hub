import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        page: "#FAF8F4",
        surface: "#FFFFFF",
        subtle: "#F5F1EA",
        border: {
          DEFAULT: "#E8E6E1",
          emphasis: "#D4D1CB"
        },
        text: {
          primary: "#1A1916",
          secondary: "#6B6860",
          tertiary: "#9E9B96"
        },
        accent: {
          DEFAULT: "#C9A96E",
          soft: "#F0E8D8"
        },
        success: {
          DEFAULT: "#4A8C6F",
          soft: "#EAF4EE"
        },
        warning: {
          DEFAULT: "#B07D2A",
          soft: "#FBF3E3"
        },
        danger: {
          DEFAULT: "#9B3A3A",
          soft: "#FAEAEA"
        }
      },
      boxShadow: {
        card: "0 10px 30px rgba(70, 55, 32, 0.06), 0 1px 2px rgba(70, 55, 32, 0.05)"
      },
      fontFamily: {
        sans: ["var(--font-instrument-sans)", "ui-sans-serif", "system-ui"],
        serif: ["var(--font-instrument-serif)", "ui-serif", "Georgia"]
      },
      /**
       * The type scale. Twelve steps, named for what they are for.
       *
       * Colours have been tokens here since the beginning, which is exactly why
       * nobody has ever had to wonder what grey to use. Sizes never were, so
       * every one of them was written inline as an arbitrary value and the app
       * accumulated **26 distinct sizes over 578 usages** — including 54 written
       * at a half pixel. That is not a scale, it is a habit, and it produced the
       * failure that started this: `Money out` at 13px containing block headings
       * at 13.5px containing lines at 13px. Three levels of structure inside half
       * a pixel, because there was nothing to reach for that said "the level
       * below a card heading".
       *
       * The rule is now: **never write `text-[…px]` again.** If a size is
       * missing from this scale, the question is which of these twelve the thing
       * actually is; if the answer is genuinely none, the step gets added here,
       * once, with a name — so the next screen inherits the decision instead of
       * inventing a thirteenth 14.5px.
       *
       * Roles, smallest first:
       *
       * - `micro`   10 — the smallest label that stays legible. Uppercase only.
       * - `caption` 11 — uppercase captions, badges, the `TOTAL` label.
       * - `meta`    12 — secondary notes hung off a row.
       * - `list`    13 — dense list rows. The most-used size in the app.
       * - `body`    14 — default running text and buttons.
       * - `label`   15 — form controls, and a block heading inside a card.
       * - `subhead` 17 — a card's own title, and the figure that totals it.
       * - `figure`  19 — a standalone number in a tile.
       * - `figure-lg` 22 — the number a card exists to show.
       * - `display-sm` 26 — panel titles, the weigh-in field.
       * - `display` 30 — the page title.
       * - `display-lg` 34 — the page title from `sm`.
       *
       * **Size only, deliberately — no paired line-height.** Tailwind lets a
       * fontSize token set both, and pairing them is what a finished system
       * does. It is not done here because line-height currently comes from
       * `body { line-height: 1.6 }` and from a scattering of `leading-*`
       * classes, so pairing it would silently change the height of nearly every
       * row in the app in the same commit that renames the sizes — two changes
       * at once, one of them unverifiable screen by screen. The scale lands
       * first; line-height is the next pass.
       */
      fontSize: {
        micro: "10px",
        caption: "11px",
        meta: "12px",
        list: "13px",
        body: "14px",
        label: "15px",
        subhead: "17px",
        figure: "19px",
        "figure-lg": "22px",
        "display-sm": "26px",
        display: "30px",
        "display-lg": "34px"
      }
    }
  },
  plugins: []
};

export default config;
