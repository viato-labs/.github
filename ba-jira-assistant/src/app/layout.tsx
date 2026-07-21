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
  title: "Ticket Flow · BA Jira Assistant",
  description:
    "Step-by-step BA assistant that drafts authentic Jira tickets with research, playbooks, and safe status moves.",
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
