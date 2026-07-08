import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MacroChef",
  description:
    "AI-adapted recipes that fit your daily macros, with local store suggestions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
