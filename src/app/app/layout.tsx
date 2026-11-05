import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SideNav } from "@/components/shell/SideNav";
import { UserMenu } from "@/components/shell/UserMenu";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "TradingWave", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Signature was valid (proxy let us in) but the session is gone: clear it and sign in again.
  if (!user) redirect("/api/auth/expired");

  return (
    <div className="shell">
      <aside className="side">
        <Link className="brand side__brand" href="/app" aria-label="TradingWave dashboard">
          <BrandMark animated={false} />
          <span className="brand__word">TradingWave</span>
        </Link>
        <SideNav isAdmin={user.role === "ADMIN"} />
        <div className="side__foot">
          <span className="tw-tag tw-tag--paper">Step 3 · Strategy builder</span>
        </div>
      </aside>
      <div className="shell__main">
        <header className="topbar">
          <Link className="brand topbar__brand" href="/app" aria-label="TradingWave dashboard">
            <BrandMark animated={false} />
          </Link>
          <div className="topbar__right">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </header>
        <main className="content" id="main">{children}</main>
      </div>
    </div>
  );
}
