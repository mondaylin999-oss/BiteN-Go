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

say "ferry: student requests a seat, driver confirms it"
TRIP=$(curl -sS "$API/transport/trips" -H "Authorization: Bearer $STUDENT" | jq -r '.trips[0].trip.id // empty')
if [ -n "$TRIP" ]; then
  BOOKING=$(curl -sS -X POST "$API/transport/bookings" -H "Authorization: Bearer $STUDENT" -H 'Content-Type: application/json' \
    -d "{\"tripId\":$TRIP,\"seatCount\":1}" | jq -r '.bookingId // empty')
  echo "  booking #$BOOKING requested on trip #$TRIP"
  curl -sS "$API/transport/trips" -H "Authorization: Bearer $STUDENT" | jq '.trips[0] | {occupiedSeats, pendingSeats, availableSeats}'
  [ -n "$BOOKING" ] && curl -sS -X PATCH "$API/transport/driver/bookings/$BOOKING" -H "Authorization: Bearer $DRIVER" -H 'Content-Type: application/json' -d '{"status":"confirmed"}' | jq -c '.'
  curl -sS "$API/transport/trips" -H "Authorization: Bearer $STUDENT" | jq '.trips[0] | {occupiedSeats, availableSeats}'
else
  echo "  no trips scheduled — schedule one in Transport Ops first"
fi

say "money"
curl -sS "$API/cashflow/admin-flow" -H "Authorization: Bearer $ADMIN" | jq '[.agents[] | {agent: .agent.name, allocated, disbursed, balance}]'
curl -sS "$API/cashflow/overview" -H "Authorization: Bearer $STUDENT" | jq '{wallet}'

printf '\nAPI round trip finished.\n'
