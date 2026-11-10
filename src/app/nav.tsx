"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Floating nav: glass on the cobalt hero, light once the page scrolls past it. Also runs the reveal-on-scroll.
export default function Nav() {
  const path = usePathname();
  const [onColor, setOnColor] = useState(true);

  useEffect(() => {
    // Light text only while the nav sits over cobalt: up to the hero's window (if any), else to the hero's end.
    const hero = document.querySelector(".hero--color") as HTMLElement | null;
    const visual = hero?.querySelector(".hero__visual") as HTMLElement | null;
    const edge = () => (visual ? visual.getBoundingClientRect().top + window.scrollY : hero ? hero.offsetHeight : 0);
    const update = () => setOnColor(!!hero && window.scrollY + 70 < edge());
    update();
    window.addEventListener("scroll", update, { passive: true });

    let io: IntersectionObserver | null = null;
    const els = document.querySelectorAll(".reveal:not(.in)");
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io?.unobserve(e.target))),
        { rootMargin: "0px 0px -8% 0px" },
      );
      els.forEach((el) => io!.observe(el));
    } else els.forEach((el) => el.classList.add("in"));

    return () => {
      window.removeEventListener("scroll", update);
      io?.disconnect();
    };
  }, [path]);

  const link = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}>
      {label}
    </Link>
  );

  return (
    <header className={`nav${onColor ? " nav--on-color" : ""}`}>
      <div className="nav__bar">
        <Link href="/" className="nav__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app-icon.png" alt="" width={28} height={28} />
          Ticketwise
        </Link>
        <nav className="nav__links" aria-label="Main">
          {link("/", "Inbox")}
          {link("/#how", "How it learns")}
          {link("/scorecard", "Scorecard")}
          {link("/proof", "Proof")}
        </nav>
        <Link href="/#inbox" className="btn btn-sm btn-ink">
          Try a real failure
        </Link>
      </div>
    </header>
  );
}
