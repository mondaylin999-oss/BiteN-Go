// ===========================================================================
//  demo_main.cpp — executable: biten_demo
//
//  A console walk-through of the whole domain, with no database and no web
//  server involved. Useful as a viva/demo: it shows the ferry aggregate, the
//  canteen pricing rules, the kitchen board and the cash-flow maths all
//  producing the same numbers the web app shows.
//
//      cmake -S . -B build && cmake --build build && ./build/biten_demo
// ===========================================================================

#include "CanteenService.hpp"
#include "CashflowEngine.hpp"
#include "FerryBusManagementService.hpp"
#include "InMemoryFerryBusRepository.hpp"
#include "KitchenBoard.hpp"
#include "SeatPlanner.hpp"

#include <iomanip>
#include <iostream>

namespace {

void heading(const std::string& title) {
  std::cout << "\n== " << title << " " << std::string(title.size() < 60 ? 60 - title.size() : 0, '=') << "\n";
}

std::string kyats(long long cents) { return std::to_string(cents) + " Ks"; }

void ferryDemo() {
  heading("Ferry bus management (domain model)");
  ferry_bus::InMemoryFerryBusRepository repository;
  ferry_bus::FerryBusManagementService system(repository);

  system.registerDriver({1, "U Kyaw Ferry", "+95 9 555 0101"});
  system.registerStudent({101, "Aye Aye", "North Hall"});
  system.registerStudent({102, "Ko Min", "North Hall"});
  system.registerBus({10, 1, "YGN-FERRY-01", 2, 45'000});
  system.publishRoute({20, 1, 10, "North Hall Ferry", "Main Gate", "North Hall", {"Library", "Science Block"},
                       "https://maps.google.com/?q=16.8409,96.1735", "16.8409, 96.1735"});

  const auto first = system.sendStudentRequest(101, 20, 1);
  std::cout << "Aye Aye requested 1 seat -> free seats still "
            << system.availabilityForRoute(20).availableSeats << " (a pending request holds nothing)\n";

  system.decideStudentRequest(1, first.id, true);
  const auto availability = system.availabilityForRoute(20);
  std::cout << "Driver accepted -> free seats " << availability.availableSeats << "/" << availability.bus.totalCapacity << "\n"
            << "Route " << availability.route.name << " · monthly fee " << kyats(availability.bus.monthlyFeeKyats)
            << " · map " << availability.route.googleMapsUrl << "\n";

  try {
    const auto second = system.sendStudentRequest(102, 20, 4);
    system.decideStudentRequest(1, second.id, true);
  } catch (const ferry_bus::FerryBusError& error) {
    std::cout << "Over-booking refused: " << error.what() << "\n";
  }
}

void seatPlannerDemo() {
  heading("Seat planner (the shape the API uses)");
  const std::vector<seatplan::TripRow> trips{{500, 20, 10, 1, 18, 1'500, "scheduled", "active", "operational"}};
  const std::vector<seatplan::BookingRow> bookings{{9001, 500, 101, 3, "confirmed"}, {9002, 500, 102, 2, "pending"}};

  const auto plan = seatplan::SeatPlanner::plan(trips, bookings).front();
  std::cout << "Trip 500: " << plan.occupiedSeats << " taken, " << plan.pendingSeats << " pending, "
            << plan.availableSeats << " free (" << std::fixed << std::setprecision(1) << plan.loadPercent << "% full)\n";

  const auto decision = seatplan::SeatPlanner::canRequest(trips.front(), bookings, 103, 2);
  std::cout << "New student asks for 2 seats -> " << (decision.allowed ? "allowed" : decision.reason)
            << ", fare " << kyats(decision.fareCents) << "\n";
}

void canteenDemo() {
  heading("Smart canteen pricing");
  const std::vector<canteen::MenuItem> menu{
      {1, 7, "Mohinga", 1'500, canteen::Availability::Available},
      {2, 7, "Tea leaf salad", 1'200, canteen::Availability::Available},
      {3, 8, "Shan noodles", 1'800, canteen::Availability::Available},
      {4, 7, "Coconut rice", 2'000, canteen::Availability::SoldOut}};

  const auto quote = canteen::CanteenService::quote(menu, {{1, 2}, {2, 1}}, 14);
  std::cout << "Basket priced by agent " << quote.agentId << ": " << quote.itemCount << " items, total "
            << kyats(quote.totalCents) << "\n";

  try {
    canteen::CanteenService::quote(menu, {{1, 1}, {3, 1}}, 14);
  } catch (const canteen::CanteenError& error) {
    std::cout << "Mixed-vendor basket refused: " << error.what() << "\n";
  }
  try {
    canteen::CanteenService::quote(menu, {{1, 1}}, 9);
  } catch (const canteen::CanteenError& error) {
    std::cout << "09:00 order refused: " << error.what() << "\n";
  }
}

void kitchenDemo() {
  heading("Kitchen display board");
  const long long now = 1'700'000'000'000LL;
  const std::vector<kds::Ticket> tickets{
      {4092, now - 15 * 60'000, "pending", "direct_cash", "awaiting_confirmation", "Aye Aye", 3, 4'200},
      {4093, now - 2 * 60'000, "pending", "wallet", "paid", "Ko Min", 1, 1'500},
      {4094, now - 6 * 60'000, "preparing", "wallet", "paid", "Su Su", 5, 7'800},
      {4095, now - 30 * 60'000, "completed", "wallet", "paid", "Thura", 1, 1'200}};

  const auto board = kds::KitchenBoard::build(tickets, now);
  std::cout << board.openTickets << " open tickets, " << board.asapTickets << " flagged ASAP, value "
            << kyats(board.openValueCents) << ", average wait " << std::fixed << std::setprecision(1)
            << board.averageWaitMinutes << " min\n";
  for (const auto& ticket : board.incoming)
    std::cout << "  incoming #" << ticket.ticket.orderId << " score " << ticket.priorityScore
              << (ticket.asap ? "  [ASAP]" : "") << "\n";
}

void cashflowDemo() {
  heading("Cash flow");
  const std::vector<cashflow::Movement> adminRows{
      {1, 101, 0, cashflow::Direction::In, cashflow::Role::Admin, cashflow::Role::Agent, 1'280'000, "2026-03-02T09:00:00.000Z", "March allocation"},
      {2, 102, 0, cashflow::Direction::In, cashflow::Role::Admin, cashflow::Role::Agent, 740'000, "2026-03-04T09:00:00.000Z", "March allocation"}};
  const std::vector<cashflow::Movement> agentPayouts{
      {3, 101, 201, cashflow::Direction::Out, cashflow::Role::Agent, cashflow::Role::User, 412'500, "2026-03-06T09:00:00.000Z", "Payout"},
      {4, 101, 202, cashflow::Direction::Out, cashflow::Role::Agent, cashflow::Role::User, 184'000, "2026-03-07T09:00:00.000Z", "Payout"}};

  const auto summary = cashflow::CashflowEngine::summaryForRole(cashflow::Role::Admin, adminRows, agentPayouts);
  std::cout << "Admin funded " << kyats(summary.received) << ", agents disbursed " << kyats(summary.downstreamPaidOut)
            << ", network balance " << kyats(summary.balance) << " (" << std::fixed << std::setprecision(1)
            << summary.profitPercentage << "%)\n";

  const auto position = cashflow::CashflowEngine::agentPosition(101, [&] {
    auto all = adminRows;
    all.insert(all.end(), agentPayouts.begin(), agentPayouts.end());
    return all;
  }());
  std::cout << "Agent 101 holds " << kyats(position.balance) << " of " << kyats(position.allocated) << " allocated\n";
}

}  // namespace

int main() {
  std::cout << "BiteN Go — C++ domain engine demo\n";
  try {
    ferryDemo();
    seatPlannerDemo();
    canteenDemo();
    kitchenDemo();
    cashflowDemo();
  } catch (const std::exception& error) {
    std::cerr << "Demo failed: " << error.what() << "\n";
    return 1;
  }
  std::cout << "\nAll demo scenarios completed.\n";
  return 0;
}
