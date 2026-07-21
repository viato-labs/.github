import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { Fraunces, Source_Sans_3, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "BA Jira Assistant",
  description:
    "Chat-driven BA intake that drafts Christie's-style Jira tickets with Gherkin QA and Definition of Ready.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const bodyStyle = {
    "--font-display": "var(--font-fraunces), serif",
    "--font-body": "var(--font-source-sans), sans-serif",
  } as CSSProperties;

  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${sourceSans.variable} ${plexMono.variable}`}
        style={bodyStyle}
      >
        {children}
      </body>
    </html>
  );
}
