#!/usr/bin/env bash
# ===========================================================================
#  Proves the C++ engine is correct and reachable.
#    1. compiles it
#    2. runs the C++ unit tests through CTest
#    3. drives the CLI the way the Node API does, and checks the answers
# ===========================================================================
set -e
cd "$(dirname "$0")/.."
ENGINE=backend/cpp/build/biten_engine
[ -x "$ENGINE" ] || ENGINE=backend/cpp/build/biten_engine.exe

echo "== 1. build + unit tests ================================================"
bash backend/cpp/build.sh

echo
echo "== 2. CLI round trips ==================================================="

check() { # check <name> <command> <json> <expected-substring>
  local out
  out=$(printf '%s' "$3" | "$ENGINE" "$2")
  if [[ "$out" == *"$4"* ]]; then
    echo "  ok    $1"
  else
    echo "  FAIL  $1"
    echo "        expected to contain: $4"
    echo "        got:                 $out"
    exit 1
  fi
}

check "window closed at 09:00"  canteen.window '{"yangonHour":9}'  '"orderingOpen":false'
check "window open at 14:00"    canteen.window '{"yangonHour":14}' '"orderingOpen":true'

check "basket priced" canteen.quote \
  '{"yangonHour":14,"menu":[{"id":1,"agentId":7,"name":"Mohinga","priceCents":1500,"availability":"available"},{"id":2,"agentId":7,"name":"Salad","priceCents":1200,"availability":"available"}],"basket":[{"foodItemId":1,"quantity":2},{"foodItemId":2,"quantity":1}]}' \
  '"totalCents":4200'

check "two agents refused" canteen.quote \
  '{"yangonHour":14,"menu":[{"id":1,"agentId":7,"priceCents":1500,"availability":"available"},{"id":3,"agentId":8,"priceCents":1800,"availability":"available"}],"basket":[{"foodItemId":1,"quantity":1},{"foodItemId":3,"quantity":1}]}' \
  '"ok":false'

check "pending seats hold nothing" ferry.plan \
  '{"trips":[{"tripId":500,"totalSeats":4,"fareCents":1500,"status":"scheduled","routeStatus":"active","vehicleStatus":"operational","vehicleId":10}],"bookings":[{"id":1,"tripId":500,"userId":101,"seatCount":3,"status":"confirmed"},{"id":2,"tripId":500,"userId":102,"seatCount":2,"status":"pending"}]}' \
  '"availableSeats":1'

check "overbooking refused" ferry.canRequest \
  '{"trip":{"tripId":500,"totalSeats":4,"fareCents":1500,"status":"scheduled","routeStatus":"active","vehicleStatus":"operational"},"bookings":[{"id":1,"tripId":500,"userId":101,"seatCount":3,"status":"confirmed"}],"userId":104,"seatCount":2}' \
  '"allowed":false'

check "admin network balance" cashflow.summary \
  '{"role":"admin","rows":[{"id":1,"direction":"in","sourceRole":"admin","targetRole":"agent","amountCents":1500,"occurredAt":"2026-03-01T00:00:00Z"}],"downstream":[{"id":2,"direction":"out","sourceRole":"agent","targetRole":"user","amountCents":500,"occurredAt":"2026-03-02T00:00:00Z"}]}' \
  '"balance":1000'

check "old cash ticket is ASAP" kds.board \
  '{"nowMs":1700000000000,"tickets":[{"orderId":1,"placedAtMs":1699999100000,"status":"pending","paymentMethod":"direct_cash","paymentStatus":"awaiting_confirmation","itemCount":1,"totalCents":1000}]}' \
  '"asap":true'

echo
echo "All C++ engine checks passed."
