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
      }
    }
  },
  plugins: []
};

export default config;
