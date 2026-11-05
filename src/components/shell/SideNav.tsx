"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" />,
  strategies: <path d="M5 5h14M5 10h14M5 15h9M5 20h6" />,
  paper: <path d="M3 17c3 0 4-8 7-8s3 6 6 6 3-9 5-11" />,
  brokers: <path d="M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M3 20h18M12 3l9 5H3z" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
  admin: <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7" />,
};

type Item = { href: string; label: string; icon: string; soon?: boolean };

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const items: Item[] = [
    { href: "/app", label: "Dashboard", icon: "dashboard" },
    { href: "/app/strategies", label: "Strategies", icon: "strategies" },
    { href: "/app/paper", label: "Paper trading", icon: "paper", soon: true },
    { href: "/app/brokers", label: "Brokers", icon: "brokers", soon: true },
    { href: "/app/settings", label: "Settings", icon: "settings" },
  ];
  if (isAdmin) items.push({ href: "/app/admin/waitlist", label: "Waitlist", icon: "admin" });

  return (
    <nav className="side__nav" aria-label="App">
      {items.map((it, idx) => {
        const active = it.href === "/app" ? path === "/app" : path.startsWith(it.href);
        return (
          <span key={it.href} className="side__item-wrap">
            {isAdmin && idx === items.length - 1 && <span className="side__group">Admin</span>}
            <Link href={it.href} className={`side__link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[it.icon]}</svg>
              <span>{it.label}</span>
              {it.soon && <span className="side__soon">Soon</span>}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
