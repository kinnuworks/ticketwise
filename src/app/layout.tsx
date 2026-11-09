import type { Metadata } from "next";
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
          <a href="/" className="brand">Ticketwise</a>
          <nav>
            <a href="/">Inbox</a>
            <a href="/scorecard">Scorecard</a>
            <a href="/proof">Proof</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
