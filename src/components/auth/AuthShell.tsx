import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__main">
        <header className="auth__top">
          <Link className="brand" href="/" aria-label="TradingWave home">
            <BrandMark animated={false} />
            <span className="brand__word">TradingWave</span>
          </Link>
          <ThemeToggle />
        </header>
        <main className="auth__body">{children}</main>
        <p className="fine auth__legal">
          Trading involves risk, including loss of capital. TradingWave does not give investment advice.
        </p>
      </div>
      <aside className="auth__side" aria-hidden="true">
        <div className="auth__side-in">
          <p className="eyebrow">How it works</p>
          <ol className="auth__steps">
            <li><span className="mono">01</span><div><strong>Say it.</strong> Describe a strategy in plain words.</div></li>
            <li><span className="mono">02</span><div><strong>Read it.</strong> Approve clear rules, every number visible.</div></li>
            <li><span className="mono">03</span><div><strong>Test it.</strong> Paper trade with real Indian costs.</div></li>
            <li><span className="mono">04</span><div><strong>Trade it.</strong> Go live on your own broker, with hard limits.</div></li>
          </ol>
          <svg className="auth__wave" viewBox="0 0 600 120" preserveAspectRatio="none">
            <path d="M0 90 C80 90 100 30 160 40 S250 100 320 80 S420 20 480 30 S570 70 600 10" />
          </svg>
        </div>
      </aside>
    </div>
  );
}
