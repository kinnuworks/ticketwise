import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ticketwise",
  description: "A support agent for Sui apps that learns what your error codes mean from your team's corrections.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand">Ticketwise</Link>
          <nav>
            <Link href="/">Inbox</Link>
            <Link href="/scorecard">Scorecard</Link>
            <Link href="/proof">Proof</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
