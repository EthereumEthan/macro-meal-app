import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MacroChef — recipes that fit your macros",
  description:
    "AI-adapted recipes that fit your daily macros, with local store suggestions",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
};

// Applies the saved theme before first paint so a light/dark preference
// never flashes the other mode on load.
const themeScript = `(function(){try{var t=localStorage.getItem("macrochef-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
