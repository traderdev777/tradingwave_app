# TradingWave

**Say it. Test it. Trade it.** Plain-language algo trading for India's markets.

You describe a strategy in words. TradingWave turns it into readable rules you approve, tests them on paper with real Indian costs, then runs them on your own broker account with hard risk limits.

This repository is **Step 3: the strategy builder** ("Say it → Read it"), on top of the Step 2 foundation:

- **Strategy builder** at `/app/strategies/new`: describe a strategy in plain words, get a **Strategy Passport** (typed, versioned rules), edit every field with proper controls, see India-specific checks, then save or approve. AI only drafts rules. It never places orders.
- **Strategies list** and **passport page** with version history, field-by-field diffs, audit trail, duplicate and archive
- The public landing page, with a real waitlist that saves to a database
- Accounts: sign up, sign in, sign out (email + password)
- The signed-in app shell at `/app`: Dashboard, Strategies, Paper trading, Brokers, Settings
- Settings: change your name and your password
- Admin: see the waitlist, search it, export it as CSV
- Light and dark themes, matched to the brand kit

There are no mock numbers anywhere. Paper trading and brokers show honest "coming next" screens until those steps are built.

---

## What you need

- **Node.js 20.9 or newer** (Node 22 LTS recommended). Check with `node -v`. Download from https://nodejs.org
- Nothing else. The local database is a single SQLite file created for you.

---

## Run it on your computer

### Windows (PowerShell or Command Prompt)

```powershell
# 1. Get the code: unzip tradingwave-app-step3.zip, or
git clone <your-repo-url> tradingwave
cd tradingwave

# 2. Install dependencies (first time only)
npm install

# 3. Create .env, the database and the Prisma client
npm run setup

# 4. Start the app
npm run dev
```

Open **http://localhost:3000**.

### macOS (Terminal)

```bash
# 1. Get the code: unzip tradingwave-app-step3.zip, or
git clone <your-repo-url> tradingwave
cd tradingwave

# 2. Install dependencies (first time only)
npm install

# 3. Create .env, the database and the Prisma client
npm run setup

# 4. Start the app
npm run dev
```

Open **http://localhost:3000**.

`npm run setup` is safe to run again. It never overwrites an existing `.env` secret or deletes data.

### Production mode on your machine

```bash
npm run build
npm start
```

---

## Step 3: Strategy builder

### How it works

1. **Say it.** On `/app/strategies/new` you describe the strategy, e.g. *"Buy NIFTY ATM call when 5 min close above VWAP and RSI 14 above 60 after 9:30, SL 20% target 40%, square off 3:10, stop if I lose 2000 in a day"*.
2. **Compile.** The text becomes a **Strategy DSL** object (`schemaVersion: 1`, `src/lib/strategy/dsl.ts`): instrument (NSE/BSE/NFO/BFO/CDS/MCX/CRYPTO, cash/futures/options, CE/PE, ATM / ITM n / OTM n / premium-near, weekly/monthly current/next expiry), timeframe, legs (straddles/strangles), entry conditions (AND/OR groups comparing price, VWAP, SMA/EMA, RSI, MACD, Bollinger, ATR, Supertrend, previous-day high/low/close, opening range, numbers and time of day), exits (stop loss %/points/ATR, target, trailing stop, square-off time, opposite signal), trading window, trades per day, position size, daily loss cap, max open positions, kill switch and mode (PAPER only).
3. **Read it.** The passport shows a plain-English summary that is **generated from the DSL by code** (`summary.ts`), never by the AI, so what you read is exactly what will run. Every field is editable with selects, number and time inputs. "Advanced: view JSON" shows the raw object, read-only.
4. **Check it.** A deterministic validator (`validate.ts`, pure and unit-tested) returns **errors** (block approval) and **warnings**: market hours per exchange (NSE/BSE equity and F&O 09:15–15:30, CDS 09:00–17:00, MCX 09:00–23:30, crypto 24x7), square-off before the close, expiry and strike required for options, whole lots / lot-size multiples for F&O, weekly expiries only for NIFTY and SENSEX, a stop loss on every entry, a daily loss cap, only exchange-traded currency pairs on CDS (USDINR, EURINR, GBPINR, JPYINR, EURUSD, GBPUSD, USDJPY, no offshore forex), crypto only via an FIU-IND registered exchange, LIVE mode blocked until Step 5.
5. **Approve it.** Approve stays disabled while there are errors and needs the confirmation *"I understand TradingWave will only paper trade this until I connect a broker"*.

Every change creates a **new version**. Approved versions are never modified; editing an approved strategy creates a new draft version. The passport page shows version history with a diff of changed fields and an audit trail (created, saved, approved, archived, restored, duplicated).

### Two engines, always labelled

The passport always says which engine drafted it.

**Gemini (optional).** Calls Google's `generateContent` REST API (`https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent`, header `x-goog-api-key`) with JSON output (`responseMimeType: application/json`) and the DSL's JSON Schema in the system prompt. The reply is parsed, checked with zod, and if it doesn't fit the schema Gemini gets **one** repair attempt with the exact errors. Then the deterministic validator runs. Input can be English, Hindi or Hinglish, Kannada, Tamil or Telugu. Gemini is told never to invent a stop loss or a daily loss cap, and to list what it assumed and what it couldn't represent. If Gemini fails (bad key, quota, network), the builder falls back to the rules engine and says so.

**Built-in rules engine (no key needed).** A deterministic English parser (`fallback.ts`) for common patterns: instruments and indices, ATM/ITM/OTM calls and puts, straddles/strangles, futures, candle timeframes, VWAP/EMA/SMA/RSI/MACD/Bollinger/Supertrend/ATR, previous-day and opening-range breakouts, crossovers, entry times and windows, SL/target/trailing in % or points or ATR, square-off times, "stop if I lose ₹2000 in a day", lots/qty/capital %. Anything it fills in by convention (e.g. expiry, 5-minute candles, 1 lot) is listed under **"Filled in by convention. Check these"**. Anything it can't read is listed under **"We couldn't read these parts"**, and it never guesses those. If the instrument, side or entry rule is missing it refuses and says what's missing. A stop loss or loss cap is never invented.

### Add your Gemini key

1. Create a key at https://aistudio.google.com/apikey (Google account needed).
2. Open `.env` in the project folder and set:
   ```
   GEMINI_API_KEY="your-key-here"
   GEMINI_MODEL="gemini-2.5-flash"
   ```
   (`npm run setup` adds empty lines for these if your `.env` is from Step 2.)
3. Restart the app (`Ctrl+C`, then `npm run dev`, or `npm start` in production).
4. Open **Strategies → New strategy**. The builder now shows **Engine: Gemini**, and each draft says **Drafted by: Gemini · gemini-2.5-flash**. Try a Hinglish description, e.g. *"NIFTY ATM call kharido jab 5 min close VWAP ke upar ho, SL 20%, din mein 2000 ka loss ho to band karo"*.

If the key is wrong or has no quota, the draft says *"Gemini couldn't draft this (…) so the built-in rules engine was used instead."* Nothing is ever executed by Gemini.

### Verify after upgrading from Step 2

```bash
npm install
npm run setup          # adds the new Strategy tables (prisma db push) and optional Gemini lines in .env
npm test               # unit tests
npm run typecheck
npm run dev
# in another terminal, against a running server (needs curl + jq):
ONLY=strategies PORT=3000 bash scripts/smoke-test.sh
```

### Code map (Step 3)

```
src/lib/strategy/dsl.ts        DSL types + zod schema (schemaVersion 1)
src/lib/strategy/market.ts     Market hours, lot sizes (verify with exchange; LOT_SIZE_OVERRIDES), currency rules
src/lib/strategy/validate.ts   Deterministic validator: errors + warnings
src/lib/strategy/summary.ts    Plain-English summary generated from the DSL
src/lib/strategy/fallback.ts   Rules engine (English)
src/lib/strategy/gemini.ts     Gemini REST client (structured JSON, one repair round)
src/lib/strategy/compile.ts    Chooses the engine, validates, summarises
src/lib/strategy/diff.ts       Field-level diff between versions
src/lib/strategy/store.ts      Request schemas + versioning (approved versions immutable)
src/app/api/strategies/...     compile, create, [id] (GET), versions, approve, duplicate, archive
src/app/app/strategies/...     list, new (builder), [id] (passport + history + audit)
src/components/strategy/...    Builder, PassportEditor, ConditionEditor, form fields
```

API routes use the same session + same-origin + JSON checks as the rest of the app, only ever return the signed-in user's strategies, and the compile endpoint is rate limited per user.

**Lot sizes** (last updated 6 Nov 2026, NSE circular FAOP/70616 and BSE notice 20241021-13): NIFTY 65, BANKNIFTY 30, FINNIFTY 60, MIDCPNIFTY 120, NIFTYNXT50 25, SENSEX 20, BANKEX 30, SENSEX50 75, currency futures 1,000 units (JPYINR 1,00,000). Exchanges revise these. Verify before trading, and override with `LOT_SIZE_OVERRIDES`.

---

## Make yourself admin

Any one of these works:

1. **Be the first account.** On a fresh database, the first person to sign up becomes ADMIN.
2. **Set `ADMIN_EMAIL` in `.env`** before you sign up or sign in, for example `ADMIN_EMAIL="dev@tradingwave.in"`. That email becomes ADMIN when it signs up, or the next time it signs in. Restart `npm run dev` after editing `.env`.
3. **Promote an existing account:**
   ```bash
   npm run make-admin -- you@example.com
   ```

Admins get a **Waitlist** item in the left menu (`/app/admin/waitlist`) with search and **Export CSV**.

---

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Creates `.env` (with a fresh `SESSION_SECRET`), generates the Prisma client, creates/updates the database |
| `npm run dev` | Development server with hot reload at http://localhost:3000 |
| `npm run build` | Production build |
| `npm start` | Runs the production build |
| `npm test` | Runs the unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run db:studio` | Opens Prisma Studio to browse the database |
| `npm run make-admin -- email` | Promotes an account to ADMIN |
| `bash scripts/smoke-test.sh` | End-to-end checks against a running server (`PORT=3100`, `ONLY=strategies`) |

---

## Configuration (`.env`)

`npm run setup` creates this from `.env.example`. **Never commit `.env`.** It is in `.gitignore`.

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | `file:./dev.db` for local SQLite (stored at `prisma/dev.db`) |
| `SESSION_SECRET` | Long random string that signs session cookies. Generated by setup |
| `ADMIN_EMAIL` | Optional. This email becomes ADMIN |
| `APP_URL` | Public URL of the app. Use `https://…` in production so cookies are marked Secure |
| `GEMINI_API_KEY` | Optional. Google Gemini key for the strategy builder. Empty = built-in rules engine |
| `GEMINI_MODEL` | Optional. Gemini model, default `gemini-2.5-flash` |
| `LOT_SIZE_OVERRIDES` | Optional. Override F&O lot sizes, e.g. `NIFTY=65,BANKNIFTY=30` |
| `COMPILE_RATE_LIMIT` | Optional. Drafts per user per 10 minutes (default 20) |
| `NEXT_DIST_DIR` | Optional. Build into another folder (e.g. `.next-alt`) so a running `npm start` isn't disturbed |

### Moving to Postgres

In `prisma/schema.prisma` change `provider = "sqlite"` to `provider = "postgresql"`, set `DATABASE_URL="postgresql://user:pass@host:5432/tradingwave"`, then run `npm run setup`. No code changes needed.

---

## How it is built

- **Next.js 16** (App Router, TypeScript strict), **React 19**
- **Prisma 6** ORM with SQLite locally (Postgres-ready)
- **Zod** validation on every API input
- **bcrypt** password hashing (cost 12), **jose** signed session cookies backed by a `Session` table
- Plain CSS using the brand tokens; Manrope and JetBrains Mono self-hosted in `public/fonts` (works offline)

```
prisma/schema.prisma        User, Session, WaitlistEntry, Strategy, StrategyVersion, StrategyEvent
src/proxy.ts                Route protection for /app (Next 16 "proxy", formerly middleware)
src/app/page.tsx            Landing page
src/app/login, signup       Auth pages
src/app/app/...             Signed-in app (dashboard, strategies, settings, admin/waitlist, …)
src/app/api/...             waitlist, auth/{signup,login,logout}, account/{profile,password}, admin/waitlist.csv, strategies/…
src/lib/                    validation, password, token, session, rate-limit, origin check, csv
src/lib/strategy/           Step 3: DSL, validator, summary, rules engine, Gemini client
tests/                      Vitest unit tests
scripts/setup.mjs           npm run setup
```

### Security basics in place

- Passwords: 10+ characters with a letter and a number, common passwords refused, hashed with bcrypt
- Sessions: httpOnly, SameSite=Lax cookie holding a signed token; the session must also exist in the database, so signing out or changing your password really ends it. Changing your password signs out every other device
- CSRF: every state-changing request must come from the app's own origin (Origin/Referer check) and send JSON
- Waitlist: server-side validation, unique email with a friendly duplicate message, hidden honeypot field, per-IP rate limit. IPs are stored only as salted hashes
- Login and sign-up are rate limited per IP; failed logins never reveal whether an email exists
- Security headers (no framing, nosniff, strict referrer)
- Admin pages and the CSV export check the ADMIN role on the server

---

## Optional: Docker

```bash
npm install && npm run setup     # once, to generate SESSION_SECRET in .env
docker compose up --build
```

The database lives in the `tradingwave-data` volume.

---

## Roadmap

| Step | What | Status |
| --- | --- | --- |
| 1 | Brand and landing site | Done |
| 2 | App foundation: waitlist, accounts, app shell, admin | Done |
| 3 | Strategy builder: plain words → Strategy Passport (readable, versioned rules you approve); Gemini + rules engine | **This release** |
| 4 | Paper engine: runs approved Passports on real Indian market data with costs (STT, GST, brokerage), daily loss caps and the kill switch | Next |
| 5 | Broker connect: your own broker's official API, kill switch, daily loss caps | Planned |
| 6 | Mobile app | Planned |

Step 3 follow-ups we know about: custom exit conditions beyond "exit on opposite signal"; a broader rules-engine vocabulary (it is English-only by design; other languages go through Gemini); live lot-size refresh from the exchange contract files; voice input.

**Regulatory note:** offering live algo trading to the public in India runs under SEBI's retail algo framework. Strategies must run through a SEBI-registered broker's API with an exchange-approved algo ID, and the provider must be empanelled with the exchanges via those brokers. TradingWave never holds client money and AI never places orders. Until that empanelment is in place, live trading should be limited to your own account.

---

Trading in securities, derivatives and crypto assets involves risk, including loss of capital. TradingWave does not provide investment advice or promise returns.
