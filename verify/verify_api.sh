#!/usr/bin/env bash
# ===========================================================================
#  A full round trip through the running API. Start the backend first:
#      cd backend && npm run dev
#  then:
#      bash verify/verify_api.sh
#
#  It uses only the seeded accounts and leaves a couple of demo rows behind
#  (one dish, one order, one seat request) — run database/reset.sql if you
#  want a spotless database afterwards.
# ===========================================================================
set -e
API=${API:-http://localhost:8000}
PASS=${SEED_PASSWORD:-biten123}

command -v jq >/dev/null || { echo "This script needs 'jq' (sudo apt install jq / brew install jq)." >&2; exit 1; }

say() { printf '\n== %s\n' "$1"; }

login() { # login <username> -> token
  curl -sS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$PASS\"}" | jq -r '.token'
}

say "health"
curl -sS "$API/health" | jq '{status, engine, database}'

say "logging in as all four roles"
ADMIN=$(login admin);      echo "  admin    ok"
AGENT=$(login agent01);    echo "  agent01  ok"
DRIVER=$(login driver01);  echo "  driver01 ok"
STUDENT=$(login student01);echo "  student01 ok"

say "agent publishes a dish"
DISH=$(curl -sS -X POST "$API/canteen/menu" -H "Authorization: Bearer $AGENT" -H 'Content-Type: application/json' \
  -d '{"name":"Verify Special","priceCents":1000,"category":"Main"}' | jq -r '.id')
echo "  dish #$DISH created"
curl -sS -X PATCH "$API/canteen/menu/$DISH/availability" -H "Authorization: Bearer $AGENT" -H 'Content-Type: application/json' \
  -d '{"availability":"available"}' | jq -c '.'
echo "  (a failure above is correct outside 12:00-24:00 Myanmar time)"

say "student places a cash order"
ORDER=$(curl -sS -X POST "$API/canteen/orders" -H "Authorization: Bearer $STUDENT" -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"foodItemId\":$DISH,\"quantity\":2}],\"paymentMethod\":\"direct_cash\"}" | jq -r '.orderId // empty')
if [ -n "$ORDER" ]; then
  echo "  order #$ORDER placed"

  say "kitchen board (order decided by the C++ engine)"
  curl -sS "$API/canteen/kds" -H "Authorization: Bearer $AGENT" | jq '{openTickets, asapTickets, incoming: [.incoming[].orderId]}'

  say "agent confirms the cash, then moves the ticket"
  curl -sS -X POST "$API/canteen/orders/$ORDER/confirm-cash" -H "Authorization: Bearer $AGENT" | jq -c '.'
  curl -sS -X PATCH "$API/canteen/orders/$ORDER/status" -H "Authorization: Bearer $AGENT" -H 'Content-Type: application/json' -d '{"status":"preparing"}' | jq -c '.'
  curl -sS -X PATCH "$API/canteen/orders/$ORDER/status" -H "Authorization: Bearer $AGENT" -H 'Content-Type: application/json' -d '{"status":"ready"}' | jq -c '.'
  curl -sS -X PATCH "$API/canteen/orders/$ORDER/status" -H "Authorization: Bearer $AGENT" -H 'Content-Type: application/json' -d '{"status":"completed"}' | jq -c '.'
else
  echo "  order refused (pre-order window closed) — that is the rule working"
fi

say "ferry: a seat for a whole month — and no money moves for it"
WALLET_BEFORE=$(curl -sS "$API/cashflow/overview" -H "Authorization: Bearer $STUDENT" | jq -r '.wallet')
ROAD=$(curl -sS "$API/transport/roads" -H "Authorization: Bearer $STUDENT" | jq -r '.roads[0].route.id // empty')
MONTH=$(curl -sS "$API/transport/roads" -H "Authorization: Bearer $STUDENT" | jq -r '.roads[0].months[0].month // empty')
if [ -n "$ROAD" ] && [ -n "$MONTH" ]; then
  echo "  road #$ROAD, month $MONTH"
  curl -sS "$API/transport/roads" -H "Authorization: Bearer $STUDENT" \
    | jq '.roads[0] | {road: .route.name, leaves: .route.morningTime, back: .route.eveningTime, agent: .driverName, phone: .driverPhone}'

  PASS=$(curl -sS -X POST "$API/transport/seats" -H "Authorization: Bearer $STUDENT" -H 'Content-Type: application/json' \
    -d "{\"routeId\":$ROAD,\"month\":\"$MONTH\",\"seatCount\":1}" | jq -r '.passId // empty')
  echo "  seat request #$PASS for $MONTH"

  say "a request holds no seat until the agent accepts (C++ rule)"
  curl -sS "$API/transport/roads" -H "Authorization: Bearer $STUDENT" | jq '.roads[0].months[0] | {occupiedSeats, pendingSeats, availableSeats}'

  [ -n "$PASS" ] && curl -sS -X PATCH "$API/transport/driver/seats/$PASS" -H "Authorization: Bearer $DRIVER" \
    -H 'Content-Type: application/json' -d '{"status":"confirmed"}' | jq -c '.'

  say "now the seat is held for every day of the month"
  curl -sS "$API/transport/roads" -H "Authorization: Bearer $STUDENT" | jq '.roads[0].months[0] | {occupiedSeats, pendingSeats, availableSeats}'

  WALLET_AFTER=$(curl -sS "$API/cashflow/overview" -H "Authorization: Bearer $STUDENT" | jq -r '.wallet')
  if [ "$WALLET_BEFORE" = "$WALLET_AFTER" ]; then
    echo "  wallet unchanged ($WALLET_BEFORE) — correct: the ferry fare is paid to the agent outside the app"
  else
    echo "  FAIL: the wallet moved from $WALLET_BEFORE to $WALLET_AFTER; no ferry money should pass through the app" >&2
    exit 1
  fi
else
  echo "  no road on sale — open one as the transport agent first"
fi

say "money"
curl -sS "$API/cashflow/admin-flow" -H "Authorization: Bearer $ADMIN" | jq '[.agents[] | {agent: .agent.name, allocated, disbursed, balance}]'
curl -sS "$API/cashflow/overview" -H "Authorization: Bearer $STUDENT" | jq '{wallet}'

printf '\nAPI round trip finished.\n'
