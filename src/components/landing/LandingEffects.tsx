"use client";

import { useEffect } from "react";

const PHRASES = [
  "Buy a Nifty call when price is above VWAP and RSI crosses 60 after 9:30. Stop me if I lose ₹2,000 in a day.",
  "Sell Bank Nifty straddle at 9:20, exit if combined premium rises 25%.",
  "Buy USDINR futures when it breaks yesterday\u2019s high. Exit at 0.3%.",
];

/** Ports the landing's main.js: logo draw, nav border, typed demo, scroll reveals, footer year. */
export function LandingEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.classList.add("draw");
    const timers: number[] = [];

    const nav = document.querySelector(".nav");
    const onScroll = () => nav?.classList.toggle("scrolled", scrollY > 8);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const el = document.getElementById("typed");
    const rules = document.querySelectorAll("#rules li");
    const showRules = () =>
      rules.forEach((li, i) => timers.push(window.setTimeout(() => li.classList.add("on"), i * 140)));
    if (el) {
      if (reduce) {
        el.textContent = PHRASES[0]!;
        showRules();
      } else {
        let p = 0;
        let i = 0;
        let first = true;
        const tick = () => {
          const s = PHRASES[p]!;
          if (i <= s.length) {
            el.textContent = s.slice(0, i++);
            timers.push(window.setTimeout(tick, 22 + Math.random() * 30));
          } else {
            if (first) {
              showRules();
              first = false;
            }
            timers.push(
              window.setTimeout(() => {
                p = (p + 1) % PHRASES.length;
                i = 0;
                tick();
              }, 4200),
            );
          }
        };
        tick();
      }
    }

    const items = document.querySelectorAll(
      ".section h2, .step, .mkt, .checks li, .faq details, .form, .strip__in > div",
    );
    items.forEach((n) => n.classList.add("reveal"));
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && !reduce) {
      io = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io?.unobserve(e.target);
            }
          }),
        { rootMargin: "0px 0px -8% 0px" },
      );
      items.forEach((n) => io!.observe(n));
    } else items.forEach((n) => n.classList.add("in"));

    const yr = document.getElementById("yr");
    if (yr) yr.textContent = String(new Date().getFullYear());

    return () => {
      removeEventListener("scroll", onScroll);
      timers.forEach((t) => clearTimeout(t));
      io?.disconnect();
      root.classList.remove("draw");
    };
  }, []);
  return null;
}
