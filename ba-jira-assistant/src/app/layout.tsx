import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Ticket Flow",
  description:
    "A calm, step-by-step BA assistant for drafting authentic Jira tickets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const bodyStyle = {
    "--font-display": "var(--font-instrument), Georgia, serif",
    "--font-body": "var(--font-dm-sans), system-ui, sans-serif",
  } as CSSProperties;

  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${instrumentSerif.variable} ${plexMono.variable}`}
        style={bodyStyle}
      >
        {children}
      </body>
    </html>
  );
}
