import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

/**
 * Instrument Sans is a **variable** font with a 400–700 weight axis, and asking
 * `next/font` for `weight: ["400", "500"]` cut it down to two static instances.
 * Everything heavier than 500 in the app was therefore a weight that had never
 * been downloaded: measured in Chromium, `font-semibold` (600) and `font-bold`
 * (700) rendered at **exactly the same width as 500** — 225.52px for the same
 * string, identical to the pixel — because both snapped back to the 500 face.
 *
 * So the app had two usable weights that differ by almost nothing (400 vs 500
 * measured 223.48 vs 225.52 on that string), and every heading that asked to
 * outrank its lines silently did not. Omitting `weight` loads the axis itself,
 * which is one file rather than two instances and gives a real 600.
 */
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans"
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  weight: ["400"],
  style: ["italic"]
});

export const metadata: Metadata = {
  title: "Sviy Hub",
  description: "Clients, pets, and expenses, softly organized.",
  icons: {
    icon: [
      {
        url: "/favicon v2.png",
        sizes: "1254x1254",
        type: "image/png"
      }
    ],
    shortcut: [
      {
        url: "/favicon v2.png",
        sizes: "1254x1254",
        type: "image/png"
      }
    ],
    apple: [
      {
        url: "/favicon v2.png",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${instrumentSerif.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
