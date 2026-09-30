import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liquid Signal — Audience intelligence from every comment",
  description:
    "Turn thousands of audience comments into ranked objections, purchase intent, and an evidence-backed creative brief.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
