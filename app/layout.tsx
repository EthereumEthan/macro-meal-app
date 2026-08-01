import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MacroChef — recipes that fit your macros",
  description:
    "AI-adapted recipes that fit your daily macros, with local store suggestions",
};

// Dark is the default regardless of the OS setting, so the browser chrome
// matches it unconditionally.
export const viewport: Viewport = {
  themeColor: "#0a0a0b",
};

// Applies a saved light choice before first paint, so opting into light
// never flashes dark on load.
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
