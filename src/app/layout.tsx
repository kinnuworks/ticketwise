import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import Nav from "./nav";

export const metadata: Metadata = {
  title: "Ticketwise",
  description:
    "A support agent for Sui apps. It reads a failed transaction through Tatum, explains it in plain words, and learns what each error means from your team's corrections, stored in Walrus Memory.",
};


export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-mood="cobalt" data-accent="cobalt" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400..600&family=Public+Sans:wght@400..700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <Nav />
        <main>{children}</main>
        <footer className="footer">
          <div className="container">
            <span className="nav__brand" style={{ fontSize: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/app-icon.png" alt="" width={22} height={22} />
              Ticketwise
            </span>
            <span>Chain reads through Tatum&apos;s Sui gateway. Team memory in Walrus Memory on Sui mainnet.</span>
            <span style={{ display: "flex", gap: 16 }}>
              <Link href="/scorecard">Scorecard</Link>
              <Link href="/proof">Proof</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
