import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LandingEffects } from "@/components/landing/LandingEffects";
import { WaitlistForm } from "@/components/landing/WaitlistForm";

export default function Home() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>

      <header className="nav">
        <div className="wrap nav__in">
          <a className="brand" href="#top" aria-label="TradingWave home">
            <BrandMark />
            <span className="brand__word">TradingWave</span>
          </a>
          <nav className="nav__links" aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#safety">Safety</a>
            <a href="#markets">Markets</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav__actions">
            <ThemeToggle />
            <Link className="nav__signin" href="/login">Sign in</Link>
            <a className="btn btn--accent btn--sm" href="#join"><span className="hide-sm">Get early access</span><span className="show-sm">Join</span></a>
          </div>
        </div>
      </header>

      <main id="main">

        <section className="hero" id="top">
          <div className="wrap hero__grid">
            <div className="hero__copy">
              <p className="eyebrow">Early access · India</p>
              <h1>Say it.<br />Test it.<br /><span className="accent">Trade it.</span></h1>
              <p className="lede">Describe your strategy in plain words. TradingWave turns it into clear rules you approve, tests it on paper with real Indian costs, then runs it on your own broker account with hard risk limits.</p>
              <div className="hero__cta">
                <a className="btn btn--accent" href="#join">Join the waitlist</a>
                <a className="btn btn--ghost" href="#how">See how it works</a>
              </div>
              <p className="fine">Built for SEBI's retail algo framework. Your money stays with your broker.</p>
            </div>

            <div className="passport" aria-label="Example: a plain-language strategy turned into rules">
              <div className="passport__head">
                <span className="passport__title">Strategy Passport</span>
                <span className="tag tag--paper">Paper</span>
              </div>
              <div className="passport__say">
                <span className="label">You say</span>
                <p className="typed" id="typed" aria-live="polite"></p>
              </div>
              <div className="passport__rules">
                <span className="label">We write, you approve</span>
                <ol className="rules" id="rules">
                  <li><span className="k">INSTRUMENT</span> <span>NIFTY weekly ATM call</span></li>
                  <li><span className="k">ENTRY</span> <span>5m close &gt; VWAP AND RSI(14) &gt; 60</span></li>
                  <li><span className="k">WINDOW</span> <span>09:30 – 14:45 IST</span></li>
                  <li><span className="k">EXIT</span> <span>SL 20% · Target 40% · 15:10 square-off</span></li>
                  <li><span className="k">RISK</span> <span>1 lot · stop day at <span className="nw">−₹2,000</span></span></li>
                </ol>
              </div>
              <div className="passport__foot">
                <div><span className="label">Backtest · 3 yrs</span><span className="num">62 trades/mo</span></div>
                <div><span className="label">Max drawdown</span><span className="num loss">−14.2%</span></div>
                <div><span className="label">Costs included</span><span className="num">STT · GST · brokerage</span></div>
              </div>
            </div>
          </div>
          <svg className="hero__wave" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 90 C180 90 220 30 360 40 S560 100 720 80 S960 20 1100 30 S1320 70 1440 10"/></svg>
        </section>


        <section className="strip">
          <div className="wrap strip__in">
            <div><span className="big">23.77 cr</span><span>demat accounts in India (Aug 2026)</span></div>
            <div><span className="big">66%</span><span>of NSE derivatives turnover is already algo (Sept 2026)</span></div>
            <div><span className="big">~15%</span><span>of individual F&amp;O traders have ever used an algo</span></div>
          </div>
        </section>


        <section className="section" id="how">
          <div className="wrap">
            <p className="eyebrow">How it works</p>
            <h2>From an idea in your head to a rule the market can follow.</h2>
            <div className="steps">
              <article className="step">
                <span className="step__n">01</span>
                <h3>Say it</h3>
                <p>Type or speak your idea in English, Hindi, Kannada, Tamil or Telugu. “Buy Bank Nifty when it breaks yesterday's high, exit at 1%.”</p>
              </article>
              <article className="step">
                <span className="step__n">02</span>
                <h3>Read it</h3>
                <p>We turn it into a Strategy Passport: plain rules, every number visible, nothing hidden. You edit, then approve. Each change gets a new version.</p>
              </article>
              <article className="step">
                <span className="step__n">03</span>
                <h3>Test it</h3>
                <p>Backtest and paper trade with slippage, STT, GST and brokerage counted. See the bad days before your money does.</p>
              </article>
              <article className="step">
                <span className="step__n">04</span>
                <h3>Trade it</h3>
                <p>Connect your broker and go live when you're ready. Orders go through your broker, under your account, with your limits.</p>
              </article>
            </div>
          </div>
        </section>


        <section className="section section--ink" id="safety">
          <div className="wrap safety">
            <div>
              <p className="eyebrow">Risk Guardian</p>
              <h2>Discipline, built in. Not bolted on.</h2>
              <p className="lede">Most traders don't lose on strategy. They lose on the day they break their own rules. TradingWave holds the line for you.</p>
            </div>
            <ul className="checks">
              <li><strong>Daily loss cap.</strong> Hit your limit and every strategy stops for the day.</li>
              <li><strong>One-tap kill switch.</strong> Exit all positions and pause everything.</li>
              <li><strong>Margin and lot checks</strong> before any order leaves.</li>
              <li><strong>AI never places orders.</strong> It only drafts rules. You approve every one.</li>
              <li><strong>White-box only.</strong> You can always read exactly what your strategy does.</li>
            </ul>
          </div>
        </section>


        <section className="section" id="markets">
          <div className="wrap">
            <p className="eyebrow">Markets</p>
            <h2>The markets Indian traders actually trade. Legally.</h2>
            <div className="markets">
              <article className="mkt">
                <h3>Equities &amp; F&amp;O</h3>
                <p>NSE and BSE stocks, index and stock options and futures, through your SEBI-registered broker.</p>
                <span className="mono">NIFTY · BANKNIFTY · FINNIFTY · SENSEX</span>
              </article>
              <article className="mkt">
                <h3>Currency</h3>
                <p>Exchange-traded currency derivatives only, the legal route for Indian residents. No offshore forex, ever.</p>
                <span className="mono">USDINR · EURINR · GBPINR · JPYINR</span>
              </article>
              <article className="mkt">
                <h3>Crypto</h3>
                <p>Via FIU-IND registered Indian exchanges, with the 30% tax and 1% TDS shown up front.</p>
                <span className="mono">BTC · ETH · perpetuals</span>
              </article>
            </div>
            <p className="fine center">Commodities on MCX are on the roadmap. Broker and exchange support is rolling out in stages.</p>
          </div>
        </section>


        <section className="section section--mist" id="faq">
          <div className="wrap faq">
            <div>
              <p className="eyebrow">FAQ</p>
              <h2>Straight answers.</h2>
            </div>
            <div className="faq__list">
              <details><summary>Does TradingWave hold my money?</summary><p>No. Your funds and holdings stay in your own broker account. We send orders through your broker's official API, only for strategies you approved.</p></details>
              <details><summary>Is algo trading legal for retail traders in India?</summary><p>Yes. SEBI's retail algo framework applies to all brokers from 1 April 2026. Algos run through your broker, carry an exchange-approved ID, and providers are empanelled with the exchanges.</p></details>
              <details><summary>Will it make me money?</summary><p>We don't promise returns, and you should be wary of anyone who does. We help you test ideas honestly and stick to your rules. Trading involves risk, including loss of capital.</p></details>
              <details><summary>Which brokers will you support?</summary><p>We're starting with the most popular API brokers in India and adding more in stages. Tell us yours when you join and we'll prioritise it.</p></details>
              <details><summary>What will it cost?</summary><p>Paper trading will be free. Paid plans for live trading are coming; early access members get founder pricing.</p></details>
            </div>
          </div>
        </section>


        <section className="section join" id="join">
          <div className="wrap join__in">
            <div>
              <p className="eyebrow">Early access</p>
              <h2>Be first in line.</h2>
              <p className="lede">We're letting traders in batch by batch. Join now for founder pricing and a say in what we build next.</p>
            </div>
            <WaitlistForm />
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot__in">
          <div className="foot__brand">
            <BrandMark animated={false} />
            <span>TradingWave · Bengaluru</span>
            <nav className="foot__links" aria-label="Account"><Link href="/login">Sign in</Link><Link href="/signup">Create account</Link></nav>
          </div>
          <p className="disclaimer">Trading in securities, derivatives and crypto assets involves risk, including loss of capital. TradingWave does not provide investment advice or promise returns. Past and backtested performance does not guarantee future results. Example figures on this page are illustrative.</p>
          <p className="fine">© <span id="yr">2026</span> TradingWave</p>
        </div>
      </footer>

      <LandingEffects />
    </>
  );
}
