// ===========================================================================
//  engine_tests.cpp — executable: biten_tests   (run with: ctest)
//
//  Plain assert-based unit tests, no test framework to install. Each CHECK
//  prints the failing expression and line, then aborts with a non-zero exit
//  code so CTest and CI report the failure.
// ===========================================================================

#include "CanteenService.hpp"
#include "CashflowEngine.hpp"
#include "FerryBusManagementService.hpp"
#include "InMemoryFerryBusRepository.hpp"
#include "Json.hpp"
#include "KitchenBoard.hpp"
#include "SeatPlanner.hpp"

#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

namespace {

int gChecks = 0;

void check(bool condition, const char* expression, const char* file, int line) {
  ++gChecks;
  if (condition) return;
  std::cerr << "FAILED: " << expression << "\n  at " << file << ":" << line << "\n";
  std::exit(1);
}

#define CHECK(expression) check((expression), #expression, __FILE__, __LINE__)

bool nearly(double left, double right) { return std::fabs(left - right) < 0.0001; }

// ---------------------------------------------------------------------------

void testJson() {
  const auto parsed = bng::Json::parse(R"({"a":1,"b":[true,null,"x\ny"],"c":{"d":-2.5}})");
  CHECK(parsed["a"].asInt() == 1);
  CHECK(parsed["b"].items().size() == 3);
  CHECK(parsed["b"].items()[0].asBool());
  CHECK(parsed["b"].items()[1].isNull());
  CHECK(parsed["b"].items()[2].asString() == "x\ny");
  CHECK(nearly(parsed["c"]["d"].asNumber(), -2.5));
  CHECK(parsed["missing"].isNull());

  bng::Json out = bng::Json::object();
  out.set("name", bng::Json(std::string("Mohinga \"special\"")));
  out.set("price", bng::Json(1500));
  CHECK(out.dump() == R"({"name":"Mohinga \"special\"","price":1500})");
  CHECK(bng::Json::parse(out.dump())["name"].asString() == "Mohinga \"special\"");
}

// ---------------------------------------------------------------------------

void testCanteenWindow() {
  CHECK(!canteen::isPreorderWindowOpen(0));
  CHECK(!canteen::isPreorderWindowOpen(11));
  CHECK(canteen::isPreorderWindowOpen(12));
  CHECK(canteen::isPreorderWindowOpen(23));
}

void testCanteenQuote() {
  const std::vector<canteen::MenuItem> menu{
      {1, 7, "Mohinga", 1500, canteen::Availability::Available},
      {2, 7, "Salad", 1200, canteen::Availability::Available},
      {3, 8, "Shan noodles", 1800, canteen::Availability::Available},
      {4, 7, "Coconut rice", 2000, canteen::Availability::SoldOut}};

  const auto quote = canteen::CanteenService::quote(menu, {{1, 2}, {2, 1}}, 13);
  CHECK(quote.totalCents == 1500 * 2 + 1200);
  CHECK(quote.itemCount == 3);
  CHECK(quote.agentId == 7);
  CHECK(quote.lines.size() == 2);

  bool refusedClosedWindow = false;
  try { (void)canteen::CanteenService::quote(menu, {{1, 1}}, 8); } catch (const canteen::CanteenError&) { refusedClosedWindow = true; }
  CHECK(refusedClosedWindow);

  bool refusedTwoAgents = false;
  try { (void)canteen::CanteenService::quote(menu, {{1, 1}, {3, 1}}, 13); } catch (const canteen::CanteenError&) { refusedTwoAgents = true; }
  CHECK(refusedTwoAgents);

  bool refusedSoldOut = false;
  try { (void)canteen::CanteenService::quote(menu, {{4, 1}}, 13); } catch (const canteen::CanteenError&) { refusedSoldOut = true; }
  CHECK(refusedSoldOut);

  bool refusedQuantity = false;
  try { (void)canteen::CanteenService::quote(menu, {{1, 21}}, 13); } catch (const canteen::CanteenError&) { refusedQuantity = true; }
  CHECK(refusedQuantity);

  CHECK(canteen::CanteenService::walletCovers(4200, 4200));
  CHECK(!canteen::CanteenService::walletCovers(4199, 4200));
}

// ---------------------------------------------------------------------------

void testCashflow() {
  using cashflow::CashflowEngine;
  using cashflow::Direction;
  using cashflow::Movement;
  using cashflow::Role;

  const std::vector<Movement> adminRows{
      {1, 101, 0, Direction::In, Role::Admin, Role::Agent, 1000, "2026-03-01T00:00:00.000Z", ""},
      {2, 102, 0, Direction::In, Role::Admin, Role::Agent, 500, "2026-04-01T00:00:00.000Z", ""}};
  const std::vector<Movement> agentPayouts{
      {3, 101, 201, Direction::Out, Role::Agent, Role::User, 400, "2026-03-05T00:00:00.000Z", ""},
      {4, 101, 202, Direction::Out, Role::Agent, Role::User, 100, "2026-04-05T00:00:00.000Z", ""}};

  const auto adminSummary = CashflowEngine::summaryForRole(Role::Admin, adminRows, agentPayouts);
  CHECK(adminSummary.received == 1500);
  CHECK(adminSummary.downstreamPaidOut == 500);
  CHECK(adminSummary.balance == 1000);
  CHECK(nearly(adminSummary.profitPercentage, (1000.0 / 1500.0) * 100.0));

  std::vector<Movement> agentRows{adminRows[0], agentPayouts[0], agentPayouts[1]};
  const auto agentSummary = CashflowEngine::summaryForRole(Role::Agent, agentRows, {});
  CHECK(agentSummary.received == 1000);
  CHECK(agentSummary.paidOut == 500);
  CHECK(agentSummary.balance == 500);
  CHECK(agentSummary.fundingTransfers == 1);

  // A student's wallet: credited by the agent, spent in the canteen.
  const std::vector<Movement> studentRows{
      {5, 101, 201, Direction::Out, Role::Agent, Role::User, 5000, "2026-03-05T00:00:00.000Z", "top-up"},
      {6, 101, 201, Direction::Out, Role::User, Role::Agent, 1500, "2026-03-06T00:00:00.000Z", "order"}};
  CHECK(CashflowEngine::walletBalance(studentRows) == 3500);
  const auto studentSummary = CashflowEngine::summaryForRole(Role::User, studentRows, {});
  CHECK(studentSummary.balance == 3500);
  CHECK(studentSummary.received == 5000);
  CHECK(studentSummary.paidOut == 1500);

  // Running balances follow chronological order regardless of input order.
  std::vector<Movement> shuffled{agentPayouts[1], adminRows[0], agentPayouts[0]};
  const auto ledger = CashflowEngine::runningBalances(shuffled);
  CHECK(ledger.size() == 3);
  CHECK(ledger[0].id == 1 && ledger[0].balanceAfter == 1000);
  CHECK(ledger[1].id == 3 && ledger[1].balanceAfter == 600);
  CHECK(ledger[2].id == 4 && ledger[2].balanceAfter == 500);

  const auto months = CashflowEngine::monthly(Role::Admin, adminRows, agentPayouts);
  CHECK(months.size() == 2);
  CHECK(months[0].month == "2026-04");  // newest first
  CHECK(months[1].month == "2026-03");
  CHECK(months[1].invested == 1000);
  CHECK(months[1].downstreamPaidOut == 400);

  std::vector<Movement> everything = adminRows;
  everything.insert(everything.end(), agentPayouts.begin(), agentPayouts.end());
  const auto position = CashflowEngine::agentPosition(101, everything);
  CHECK(position.allocated == 1000);
  CHECK(position.disbursed == 500);
  CHECK(position.balance == 500);

  CHECK(CashflowEngine::hasSufficientBalance(500, 500));
  CHECK(!CashflowEngine::hasSufficientBalance(499, 500));
  CHECK(!CashflowEngine::hasSufficientBalance(500, 0));
}

// ---------------------------------------------------------------------------

void testSeatPlanner() {
  using seatplan::BookingRow;
  using seatplan::SeatPlanner;
  using seatplan::TripRow;

  const TripRow trip{500, 20, 10, 1, 4, 1500, "scheduled", "active", "operational"};
  const std::vector<BookingRow> bookings{{1, 500, 101, 3, "confirmed"}, {2, 500, 102, 2, "pending"}, {3, 500, 103, 1, "cancelled"}};

  const auto plan = SeatPlanner::plan({trip}, bookings).front();
  CHECK(plan.occupiedSeats == 3);   // only confirmed seats count
  CHECK(plan.pendingSeats == 2);
  CHECK(plan.availableSeats == 1);
  CHECK(plan.bookable);

  CHECK(SeatPlanner::canRequest(trip, bookings, 104, 1).allowed);
  CHECK(!SeatPlanner::canRequest(trip, bookings, 104, 2).allowed);   // only one seat free
  CHECK(!SeatPlanner::canRequest(trip, bookings, 102, 1).allowed);   // already has a pending request
  CHECK(SeatPlanner::canRequest(trip, bookings, 104, 1).fareCents == 1500);

  const TripRow completed{501, 20, 10, 1, 4, 1500, "completed", "active", "operational"};
  CHECK(!SeatPlanner::canRequest(completed, {}, 104, 1).allowed);

  CHECK(SeatPlanner::canConfirm(trip, bookings, 2).allowed == false);  // 3 + 2 > 4 seats
  const std::vector<BookingRow> smaller{{1, 500, 101, 3, "confirmed"}, {2, 500, 102, 1, "pending"}};
  CHECK(SeatPlanner::canConfirm(trip, smaller, 2).allowed);
  CHECK(!SeatPlanner::canConfirm(trip, smaller, 1).allowed);          // already confirmed

  CHECK(SeatPlanner::committedSeatsForVehicle(10, {trip}, bookings) == 3);
  CHECK(SeatPlanner::committedSeatsForVehicle(11, {trip}, bookings) == 0);
}

// ---------------------------------------------------------------------------

void testKitchenBoard() {
  const long long now = 1'700'000'000'000LL;
  const std::vector<kds::Ticket> tickets{
      {1, now - 15 * 60'000, "pending", "direct_cash", "awaiting_confirmation", "Aye", 1, 1000},
      {2, now - 1 * 60'000, "pending", "wallet", "paid", "Ko", 1, 1000},
      {3, now - 5 * 60'000, "preparing", "wallet", "paid", "Su", 4, 4000},
      {4, now - 60 * 60'000, "completed", "wallet", "paid", "Thura", 1, 1000},
      {5, now, "cancelled", "wallet", "paid", "Nandar", 1, 1000}};

  const auto board = kds::KitchenBoard::build(tickets, now);
  CHECK(board.openTickets == 3);            // completed + cancelled leave the board
  CHECK(board.incoming.size() == 2);
  CHECK(board.preparing.size() == 1);
  CHECK(board.ready.empty());
  CHECK(board.incoming[0].ticket.orderId == 1);  // 15 min old, unpaid cash -> ASAP, pinned first
  CHECK(board.incoming[0].asap);
  CHECK(!board.incoming[1].asap);
  CHECK(board.openValueCents == 6000);

  // 15 waiting minutes + 6 unpaid cash + 1 item x 2 = 23
  CHECK(kds::KitchenBoard::priorityScore(tickets[0], 15) == 23);
  // 5 waiting minutes + 4 items x 2 = 13
  CHECK(kds::KitchenBoard::priorityScore(tickets[2], 5) == 13);

  CHECK(kds::KitchenBoard::canAdvance("pending", "preparing"));
  CHECK(kds::KitchenBoard::canAdvance("preparing", "ready"));
  CHECK(kds::KitchenBoard::canAdvance("ready", "completed"));
  CHECK(!kds::KitchenBoard::canAdvance("pending", "completed"));
  CHECK(!kds::KitchenBoard::canAdvance("completed", "ready"));
}

// ---------------------------------------------------------------------------

void testFerryDomain() {
  ferry_bus::InMemoryFerryBusRepository repository;
  ferry_bus::FerryBusManagementService system(repository);
  system.registerDriver({1, "Driver", "09-100"});
  system.registerStudent({2, "Student", "Campus"});
  system.registerBus({3, 1, "FERRY-3", 2, 20'000});
  system.publishRoute({4, 1, 3, "Campus Loop", "Gate", "Campus", {"Library"}, "https://maps.google.com/?q=16.8,96.1", "16.8, 96.1"});

  const auto request = system.sendStudentRequest(2, 4, 1);
  CHECK(system.availabilityForRoute(4).availableSeats == 2);  // pending reserves nothing
  system.decideStudentRequest(1, request.id, true);
  CHECK(system.availabilityForRoute(4).availableSeats == 1);

  system.updateMonthlyFee(1, 4, 25'000);
  CHECK(system.availabilityForRoute(4).bus.monthlyFeeKyats == 25'000);

  bool refusedForeignDriver = false;
  try {
    system.registerDriver({9, "Other", "09-999"});
    system.updateMonthlyFee(9, 4, 30'000);
  } catch (const ferry_bus::FerryBusError&) {
    refusedForeignDriver = true;
  }
  CHECK(refusedForeignDriver);

  CHECK(system.searchAvailableFerries("campus").size() == 1);
  CHECK(system.searchAvailableFerries("nowhere").empty());

  bool refusedHttp = false;
  try {
    system.updateRouteMap(1, 4, "http://insecure.example", "16.8, 96.1");
  } catch (const ferry_bus::FerryBusError&) {
    refusedHttp = true;
  }
  CHECK(refusedHttp);
}

}  // namespace

int main() {
  testJson();
  testCanteenWindow();
  testCanteenQuote();
  testCashflow();
  testSeatPlanner();
  testKitchenBoard();
  testFerryDomain();
  std::cout << "All " << gChecks << " C++ engine checks passed.\n";
  return 0;
}
