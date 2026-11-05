#!/bin/bash
# Usage: start the app on a FRESH database (npm run setup && npm run dev), then: bash scripts/smoke-test.sh
# End-to-end checks against a running server (default http://localhost:3000).
B=${BASE:-http://localhost:3000}; O="Origin: $B"; J="Content-Type: application/json"
CJ=$(mktemp); CJ2=$(mktemp); pass=0; fail=0
check(){ if [ "$2" = "$3" ]; then echo "PASS  $1 ($3)"; pass=$((pass+1)); else echo "FAIL  $1 expected $2 got $3"; fail=$((fail+1)); fi; }
code(){ curl -s -o /tmp/body -w "%{http_code}" "$@"; }
E="founder$RANDOM@tradingwave.test"; W="lead$RANDOM@example.com"

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
echo "== $pass passed, $fail failed"
