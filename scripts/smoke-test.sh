#!/bin/bash
# Usage: start the app on a FRESH database (npm run setup && npm run dev), then: bash scripts/smoke-test.sh
# End-to-end checks against a running server (default http://localhost:3000).
#   PORT=3100 bash scripts/smoke-test.sh          # other port
#   ONLY=strategies PORT=3100 bash scripts/smoke-test.sh   # Step 3 checks only (any database)
# Needs curl and jq.
B=${BASE:-http://localhost:${PORT:-3000}}; O="Origin: $B"; J="Content-Type: application/json"
CJ=$(mktemp); CJ2=$(mktemp); pass=0; fail=0
check(){ if [ "$2" = "$3" ]; then echo "PASS  $1 ($3)"; pass=$((pass+1)); else echo "FAIL  $1 expected $2 got $3"; fail=$((fail+1)); fi; }
code(){ curl -s -o /tmp/body -w "%{http_code}" "$@"; }
E="founder$RANDOM@tradingwave.test"; W="lead$RANDOM@example.com"
if [ "$ONLY" != "strategies" ]; then

check "home renders" 200 $(code $B/)
grep -q "Say it." /tmp/body && check "home has hero copy" y y || check "home has hero copy" y n
check "waitlist valid" 201 $(code -X POST $B/api/waitlist -H "$O" -H "$J" -d "{\"name\":\"Asha Rao\",\"email\":\"$W\",\"phone\":\"+91 98765 43210\",\"broker\":\"Zerodha\",\"market\":\"Index options\"}")
check "waitlist duplicate (friendly 200)" 200 $(code -X POST $B/api/waitlist -H "$O" -H "$J" -d "{\"name\":\"Asha Rao\",\"email\":\"${W^^}\"}")
grep -q "already on the list" /tmp/body && check "duplicate message" y y || check "duplicate message" y n; cat /tmp/body; echo
check "waitlist invalid email" 422 $(code -X POST $B/api/waitlist -H "$O" -H "$J" -d '{"name":"X","email":"nope"}')
check "waitlist cross-origin blocked" 403 $(code -X POST $B/api/waitlist -H "Origin: https://evil.example" -H "$J" -d '{"name":"X","email":"x@y.co"}')
check "waitlist no-origin blocked" 403 $(code -X POST $B/api/waitlist -H "$J" -d '{"name":"X","email":"x@y.co"}')
check "waitlist form-encoded rejected" 415 $(code -X POST $B/api/waitlist -H "$O" -d 'name=X&email=x@y.co')
check "honeypot silently accepted" 200 $(code -X POST $B/api/waitlist -H "$O" -H "$J" -H "X-Forwarded-For: 10.9.9.9" -d '{"name":"Bot","email":"bot@spam.co","botcheck":"on"}')

check "/app without cookie redirects" 307 $(code $B/app)
curl -s -o /dev/null -D - $B/app | grep -i "^location" 
check "signup weak password" 422 $(code -X POST $B/api/auth/signup -H "$O" -H "$J" -d "{\"name\":\"Dev\",\"email\":\"$E\",\"password\":\"short\"}")
check "signup" 201 $(code -c $CJ -X POST $B/api/auth/signup -H "$O" -H "$J" -d "{\"name\":\"Dev Thakur\",\"email\":\"$E\",\"password\":\"nifty-wave-2026\"}"); cat /tmp/body; echo
grep -q "HttpOnly" <(curl -s -D - -o /dev/null -X POST $B/api/auth/login -H "$O" -H "$J" -d "{\"email\":\"$E\",\"password\":\"nifty-wave-2026\"}") && check "cookie is HttpOnly" y y || check "cookie is HttpOnly" y n
check "signup duplicate" 409 $(code -X POST $B/api/auth/signup -H "$O" -H "$J" -d "{\"name\":\"Dev\",\"email\":\"$E\",\"password\":\"nifty-wave-2026\"}")
check "login wrong password" 401 $(code -X POST $B/api/auth/login -H "$O" -H "$J" -d "{\"email\":\"$E\",\"password\":\"wrong-pass-123\"}")
check "login" 200 $(code -c $CJ2 -X POST $B/api/auth/login -H "$O" -H "$J" -d "{\"email\":\"${E^^}\",\"password\":\"nifty-wave-2026\"}")
check "/app with cookie" 200 $(code -b $CJ2 $B/app)
grep -q "Welcome, Dev" /tmp/body && check "dashboard greets user" y y || check "dashboard greets user" y n
check "/login while signed in redirects" 307 $(code -b $CJ2 $B/login)
check "settings name update" 200 $(code -b $CJ2 -X POST $B/api/account/profile -H "$O" -H "$J" -d '{"name":"Dev S. Thakur"}')
code -b $CJ2 $B/app/settings >/dev/null; grep -q "Dev S. Thakur" /tmp/body && check "new name persisted" y y || check "new name persisted" y n
check "settings name empty rejected" 422 $(code -b $CJ2 -X POST $B/api/account/profile -H "$O" -H "$J" -d '{"name":"  "}')
check "profile without cookie" 401 $(code -X POST $B/api/account/profile -H "$O" -H "$J" -d '{"name":"Hacker"}')
check "change password wrong current" 400 $(code -b $CJ2 -X POST $B/api/account/password -H "$O" -H "$J" -d '{"currentPassword":"nope-nope-1","newPassword":"sensex-tide-2027"}')
check "change password" 200 $(code -b $CJ2 -X POST $B/api/account/password -H "$O" -H "$J" -d '{"currentPassword":"nifty-wave-2026","newPassword":"sensex-tide-2027"}')
check "other device (signup cookie) signed out" 307 $(code -b $CJ $B/app)
curl -s -o /dev/null -D - -b $CJ $B/app | grep -i "^location"
check "expired-session route clears cookie" 303 $(code -b $CJ $B/api/auth/expired)
check "current device still signed in" 200 $(code -b $CJ2 $B/app)
check "login with new password" 200 $(code -c $CJ -X POST $B/api/auth/login -H "$O" -H "$J" -d "{\"email\":\"$E\",\"password\":\"sensex-tide-2027\"}")

# admin: whoever is ADMIN (first account in a fresh DB). Use ADMIN creds if given.
AE=${ADMIN_EMAIL_T:-$E}; AP=${ADMIN_PW_T:-sensex-tide-2027}; CA=$(mktemp)
code -c $CA -X POST $B/api/auth/login -H "$O" -H "$J" -d "{\"email\":\"$AE\",\"password\":\"$AP\"}" >/dev/null; grep -o '"role":"[A-Z]*"' /tmp/body
check "admin waitlist page" 200 $(code -b $CA $B/app/admin/waitlist)
grep -q "$W" /tmp/body && check "admin sees real entry" y y || check "admin sees real entry" y n
check "admin search" 200 $(code -b $CA "$B/app/admin/waitlist?q=asha")
check "admin CSV" 200 $(code -b $CA $B/api/admin/waitlist.csv)
head -c 400 /tmp/body; echo; grep -q "$W" /tmp/body && check "CSV contains entry" y y || check "CSV contains entry" y n
check "CSV without cookie" 401 $(code $B/api/admin/waitlist.csv)

# non-admin
NE="member$RANDOM@tradingwave.test"; CN=$(mktemp)
code -c $CN -X POST $B/api/auth/signup -H "$O" -H "$J" -d "{\"name\":\"Member\",\"email\":\"$NE\",\"password\":\"member-pass-2026\"}" >/dev/null; grep -o '"role":"[A-Z]*"' /tmp/body
check "non-admin CSV forbidden" 403 $(code -b $CN $B/api/admin/waitlist.csv)
check "non-admin admin page redirects" 307 $(code -b $CN $B/app/admin/waitlist)
check "forged cookie rejected" 307 $(code -H "Cookie: tw_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abc" $B/app)

check "logout cross-origin blocked" 403 $(code -b $CJ2 -X POST $B/api/auth/logout -H "Origin: https://evil.example")
check "logout" 303 $(code -b $CJ2 -c $CJ2 -X POST $B/api/auth/logout -H "$O" -H "Accept: text/html")
check "/app after logout" 307 $(code -b $CJ2 $B/app)

for i in $(seq 1 6); do c=$(code -X POST $B/api/waitlist -H "$O" -H "$J" -H "X-Forwarded-For: 10.7.7.7" -d '{"name":"R","email":"bad"}'); done
check "waitlist rate limit (6th from same IP)" 429 $c
fi

# ---------- Step 3: strategy builder ----------
command -v jq >/dev/null || { echo "jq is required for the strategy checks"; exit 1; }
S1="trader$RANDOM$RANDOM@tradingwave.test"; S2="other$RANDOM$RANDOM@tradingwave.test"; CS=$(mktemp); CO=$(mktemp)
code -c $CS -X POST $B/api/auth/signup -H "$O" -H "$J" -d "{\"name\":\"Strat Trader\",\"email\":\"$S1\",\"password\":\"nifty-wave-2026\"}" >/dev/null
code -c $CO -X POST $B/api/auth/signup -H "$O" -H "$J" -d "{\"name\":\"Other Trader\",\"email\":\"$S2\",\"password\":\"nifty-wave-2026\"}" >/dev/null
check "strategies page" 200 $(code -b $CS $B/app/strategies)
grep -q "Describe your first strategy" /tmp/body && check "empty state" y y || check "empty state" y n
check "builder page" 200 $(code -b $CS $B/app/strategies/new)
compile(){ jq -n --arg t "$1" '{text:$t}' | curl -s -o /tmp/body -w "%{http_code}" -b $CS -X POST $B/api/strategies/compile -H "$O" -H "$J" -d @-; }
check "compile without cookie" 401 $(code -X POST $B/api/strategies/compile -H "$O" -H "$J" -d '{"text":"Buy RELIANCE when 15m EMA 9 crosses above EMA 21"}')
check "compile cross-origin blocked" 403 $(code -b $CS -X POST $B/api/strategies/compile -H "Origin: https://evil.example" -H "$J" -d '{"text":"Buy RELIANCE when 15m EMA 9 crosses above EMA 21"}')
check "compile example 1 (NIFTY call)" 200 $(compile "Buy NIFTY ATM call when 5 min close above VWAP and RSI 14 above 60 after 9:30, SL 20% target 40%, square off 3:10, stop if I lose 2000 in a day")
echo "     engine=$(jq -r .engine /tmp/body) symbol=$(jq -r .strategy.instrument.symbol /tmp/body) errors=$(jq '.validation.errors|length' /tmp/body)"
check "example 1 has no errors" 0 $(jq '.validation.errors|length' /tmp/body)
DSL1=$(jq -c .strategy /tmp/body)
check "compile example 2 (straddle)" 200 $(compile "Sell BANKNIFTY straddle at 9:20, exit if combined premium rises 25%")
check "straddle has 2 legs" 2 $(jq '.strategy.legs|length' /tmp/body)
jq -e '.validation.errors|map(.code)|index("loss_cap_required")' /tmp/body >/dev/null && check "missing loss cap flagged" y y || check "missing loss cap flagged" y n
DSL2=$(jq -c .strategy /tmp/body)
check "compile example 3 (RELIANCE)" 200 $(compile "Buy RELIANCE when 15m EMA 9 crosses above EMA 21, SL 1%, target 2%")
check "compile example 4 (USDINR)" 200 $(compile "Buy USDINR futures when it breaks yesterday's high, exit at 0.3%")
check "USDINR on CDS" CDS $(jq -r .strategy.instrument.exchange /tmp/body)
check "compile nonsense refused" 422 $(compile "Buy something nice when the market feels bullish")
check "compile empty refused" 422 $(compile "")

save(){ curl -s -o /tmp/body -w "%{http_code}" -b ${3:-$CS} -X POST "$B$1" -H "$O" -H "$J" -d "$2"; }
check "save draft (straddle)" 201 $(save /api/strategies "$(jq -nc --argjson d "$DSL2" '{name:"BANKNIFTY straddle",sourceText:"Sell BANKNIFTY straddle at 9:20, exit if combined premium rises 25%",engine:"rules",dsl:$d}')")
SID=$(jq -r .id /tmp/body); echo "     strategy id $SID"
check "approve blocked while errors" 422 $(save /api/strategies/$SID/versions "$(jq -nc --argjson d "$DSL2" '{dsl:$d,approve:true,confirmPaper:true}')")
FIXED=$(echo "$DSL2" | jq -c '.risk.dailyLossCap=5000 | .exit.squareOffAt="15:10"')
check "edit field → new version" 201 $(save /api/strategies/$SID/versions "$(jq -nc --argjson d "$FIXED" '{dsl:$d}')")
check "version is 2" 2 $(jq .version /tmp/body)
check "same rules → no new version" 200 $(save /api/strategies/$SID/versions "$(jq -nc --argjson d "$FIXED" '{dsl:$d}')")
check "approve needs confirmation" 422 $(save /api/strategies/$SID/versions "$(jq -nc --argjson d "$FIXED" '{dsl:$d,approve:true,confirmPaper:false}')")
check "approve v2" 200 $(save /api/strategies/$SID/versions "$(jq -nc --argjson d "$FIXED" '{dsl:$d,approve:true,confirmPaper:true}')")
check "status approved" APPROVED $(jq -r .status /tmp/body)
LIVE=$(echo "$FIXED" | jq -c '.mode="LIVE"')
check "LIVE mode can't be approved" 422 $(save /api/strategies/$SID/versions "$(jq -nc --argjson d "$LIVE" '{dsl:$d,approve:true,confirmPaper:true}')")
EDIT3=$(echo "$FIXED" | jq -c '.exit.stopLoss.value=30')
check "edit after approval → v3 draft" 201 $(save /api/strategies/$SID/versions "$(jq -nc --argjson d "$EDIT3" '{dsl:$d}')")
check "v3 status draft" DRAFT $(jq -r .status /tmp/body)
check "read strategy" 200 $(code -b $CS $B/api/strategies/$SID)
check "3 versions" 3 $(jq '.versions|length' /tmp/body)
check "v2 still approved" true $(jq '[.versions[]|select(.version==2)][0].approvedAt!=null' /tmp/body)
check "v2 rules unchanged (immutable)" 25 $(jq '[.versions[]|select(.version==2)][0].dsl.exit.stopLoss.value' /tmp/body)
check "audit trail recorded" true $(jq '[.events[].type]|(index("approved")!=null and index("created")!=null)' /tmp/body)
check "detail page" 200 $(code -b $CS $B/app/strategies/$SID)
grep -q "Version history" /tmp/body && grep -q "Stop loss" /tmp/body && check "detail shows history diff" y y || check "detail shows history diff" y n
check "other user can't read" 404 $(code -b $CO $B/api/strategies/$SID)
check "other user can't edit" 404 $(save /api/strategies/$SID/versions "$(jq -nc --argjson d "$FIXED" '{dsl:$d}')" $CO)
check "other user detail page 404" 404 $(code -b $CO $B/app/strategies/$SID)
check "approve via approve endpoint (stale id)" 409 $(save /api/strategies/$SID/approve '{"versionId":"nope","confirmPaper":true}')
check "save + approve new strategy (NIFTY)" 201 $(save /api/strategies "$(jq -nc --argjson d "$DSL1" '{name:"NIFTY VWAP call",sourceText:"x",engine:"rules",dsl:$d,approve:true,confirmPaper:true}')")
check "duplicate" 201 $(save /api/strategies/$SID/duplicate '{}')
check "archive" 200 $(save /api/strategies/$SID/archive '{"archive":true}')
check "archived can't be edited" 409 $(save /api/strategies/$SID/versions "$(jq -nc --argjson d "$FIXED" '{dsl:$d}')")
check "restore" 200 $(save /api/strategies/$SID/archive '{"archive":false}')
check "list page" 200 $(code -b $CS $B/app/strategies)
grep -q "NIFTY VWAP call" /tmp/body && check "list shows strategy" y y || check "list shows strategy" y n
check "dashboard" 200 $(code -b $CS $B/app)
grep -q "approved" /tmp/body && check "dashboard shows real counts" y y || check "dashboard shows real counts" y n
check "invalid DSL rejected" 422 $(save /api/strategies '{"name":"Bad","sourceText":"","engine":"rules","dsl":{"schemaVersion":1}}')
for i in $(seq 1 25); do c=$(compile "Buy RELIANCE when 15m EMA 9 crosses above EMA 21, SL 1%, target 2%"); [ "$c" = "429" ] && break; done
check "compile rate limit per user" 429 $c
echo "== $pass passed, $fail failed"
