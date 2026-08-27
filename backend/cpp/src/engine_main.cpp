// ===========================================================================
//  engine_main.cpp — the BiteN Go C++ engine (executable: biten_engine)
//
//  This is the program the Node API shells out to for every rule that decides
//  money, seats, or kitchen order. It is deliberately a plain, portable
//  command-line filter, so it can also be driven by hand:
//
//      echo '{"yangonHour":14}' | ./build/biten_engine canteen.window
//      echo '{"tickets":[],"nowMs":0}' | ./build/biten_engine kds.board
//      ./build/biten_engine info
//
//  Contract
//  --------
//    argv[1]  the command name
//    stdin    one JSON object (the request)
//    stdout   one JSON object:  {"ok":true,"result":…}
//                          or:  {"ok":false,"error":"…"}
//    exit 0   the command ran (even when ok:false — a rule said no)
//    exit 2   the command name is unknown / the request was not valid JSON
//
//  The Node side (backend/src/engine.ts) parses that object. If the binary is
//  missing it falls back to a TypeScript implementation of the same rules, so
//  the app still runs before anyone has compiled the C++ — exactly like the
//  optional C++ module in the GameBuddy project.
// ===========================================================================

#include "CanteenService.hpp"
#include "CashflowEngine.hpp"
#include "Json.hpp"
#include "KitchenBoard.hpp"
#include "SeatPlanner.hpp"
#include "MonthlyPassPlanner.hpp"

#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#include <io.h>
#else
#include <unistd.h>
#endif

using bng::Json;

namespace {

constexpr const char* kEngineVersion = "1.0.0";

// ---------------------------------------------------------------------------
// JSON -> domain structs
// ---------------------------------------------------------------------------

std::vector<canteen::MenuItem> readMenu(const Json& value) {
  std::vector<canteen::MenuItem> menu;
  for (const auto& entry : value.items()) {
    canteen::MenuItem item;
    item.id = entry["id"].asInt();
    item.agentId = entry["agentId"].asInt();
    item.name = entry["name"].asString("Item");
    item.priceCents = static_cast<int>(entry["priceCents"].asInt());
    item.availability = canteen::availabilityFromString(entry["availability"].asString("available"));
    menu.push_back(item);
  }
  return menu;
}

std::vector<canteen::BasketLine> readBasket(const Json& value) {
  std::vector<canteen::BasketLine> basket;
  for (const auto& entry : value.items())
    basket.push_back(canteen::BasketLine{entry["foodItemId"].asInt(), static_cast<int>(entry["quantity"].asInt(1))});
  return basket;
}

std::vector<cashflow::Movement> readMovements(const Json& value) {
  std::vector<cashflow::Movement> rows;
  for (const auto& entry : value.items()) {
    cashflow::Movement row;
    row.id = entry["id"].asInt();
    row.agentId = entry["agentId"].asInt();
    row.userId = entry["userId"].asInt();
    row.direction = cashflow::directionFromString(entry["direction"].asString("in"));
    row.sourceRole = cashflow::roleFromString(entry["sourceRole"].asString("admin"));
    row.targetRole = cashflow::roleFromString(entry["targetRole"].asString("agent"));
    row.amountCents = entry["amountCents"].asInt();
    row.occurredAt = entry["occurredAt"].asString("1970-01-01T00:00:00.000Z");
    row.note = entry["note"].asString("");
    rows.push_back(row);
  }
  return rows;
}

seatplan::TripRow readTrip(const Json& value) {
  seatplan::TripRow trip;
  trip.tripId = value["tripId"].asInt();
  trip.routeId = value["routeId"].asInt();
  trip.vehicleId = value["vehicleId"].asInt();
  trip.driverId = value["driverId"].asInt();
  trip.totalSeats = static_cast<int>(value["totalSeats"].asInt());
  trip.fareCents = static_cast<int>(value["fareCents"].asInt());
  trip.status = value["status"].asString("scheduled");
  trip.routeStatus = value["routeStatus"].asString("active");
  trip.vehicleStatus = value["vehicleStatus"].asString("operational");
  return trip;
}

std::vector<seatplan::TripRow> readTrips(const Json& value) {
  std::vector<seatplan::TripRow> trips;
  for (const auto& entry : value.items()) trips.push_back(readTrip(entry));
  return trips;
}

std::vector<seatplan::BookingRow> readBookings(const Json& value) {
  std::vector<seatplan::BookingRow> bookings;
  for (const auto& entry : value.items()) {
    seatplan::BookingRow booking;
    booking.id = entry["id"].asInt();
    booking.tripId = entry["tripId"].asInt();
    booking.userId = entry["userId"].asInt();
    booking.seatCount = static_cast<int>(entry["seatCount"].asInt(1));
    booking.status = entry["status"].asString("pending");
    bookings.push_back(booking);
  }
  return bookings;
}

ferrypass::RoadMonth readRoadMonth(const Json& value) {
  ferrypass::RoadMonth road;
  road.routeId = value["routeId"].asInt();
  road.vehicleId = value["vehicleId"].asInt();
  road.driverId = value["driverId"].asInt();
  road.totalSeats = static_cast<int>(value["totalSeats"].asInt());
  road.monthlyFareCents = static_cast<int>(value["monthlyFareCents"].asInt());
  road.month = value["month"].asString("");
  road.routeStatus = value["routeStatus"].asString("active");
  road.vehicleStatus = value["vehicleStatus"].asString("operational");
  return road;
}

std::vector<ferrypass::RoadMonth> readRoadMonths(const Json& value) {
  std::vector<ferrypass::RoadMonth> roads;
  for (const auto& entry : value.items()) roads.push_back(readRoadMonth(entry));
  return roads;
}

std::vector<ferrypass::PassRow> readPasses(const Json& value) {
  std::vector<ferrypass::PassRow> passes;
  for (const auto& entry : value.items()) {
    ferrypass::PassRow pass;
    pass.id = entry["id"].asInt();
    pass.routeId = entry["routeId"].asInt();
    pass.userId = entry["userId"].asInt();
    pass.seatCount = static_cast<int>(entry["seatCount"].asInt(1));
    pass.month = entry["month"].asString("");
    pass.status = entry["status"].asString("pending");
    passes.push_back(pass);
  }
  return passes;
}

Json writePassDecision(const ferrypass::PassDecision& decision) {
  Json out = Json::object();
  out.set("allowed", Json(decision.allowed));
  out.set("reason", Json(decision.reason));
  out.set("fareCents", Json(static_cast<long long>(decision.fareCents)));
  out.set("availableSeats", Json(static_cast<long long>(decision.availableSeats)));
  return out;
}

std::vector<kds::Ticket> readTickets(const Json& value) {
  std::vector<kds::Ticket> tickets;
  for (const auto& entry : value.items()) {
    kds::Ticket ticket;
    ticket.orderId = entry["orderId"].asInt();
    ticket.placedAtMs = entry["placedAtMs"].asInt();
    ticket.status = entry["status"].asString("pending");
    ticket.paymentMethod = entry["paymentMethod"].asString("wallet");
    ticket.paymentStatus = entry["paymentStatus"].asString("paid");
    ticket.studentName = entry["studentName"].asString("Student");
    ticket.itemCount = static_cast<int>(entry["itemCount"].asInt(1));
    ticket.totalCents = entry["totalCents"].asInt();
    tickets.push_back(ticket);
  }
  return tickets;
}

// ---------------------------------------------------------------------------
// domain structs -> JSON
// ---------------------------------------------------------------------------

Json writeSummary(const cashflow::FlowSummary& summary) {
  Json out = Json::object();
  out.set("received", Json(static_cast<long long>(summary.received)));
  out.set("paidOut", Json(static_cast<long long>(summary.paidOut)));
  out.set("balance", Json(static_cast<long long>(summary.balance)));
  out.set("profit", Json(static_cast<long long>(summary.profit)));
  out.set("profitPercentage", Json(summary.profitPercentage));
  out.set("downstreamPaidOut", Json(static_cast<long long>(summary.downstreamPaidOut)));
  out.set("fundingTransfers", Json(static_cast<long long>(summary.fundingTransfers)));
  return out;
}

Json writeTicket(const kds::ScoredTicket& scored) {
  Json out = Json::object();
  out.set("orderId", Json(scored.ticket.orderId));
  out.set("lane", Json(kds::laneToString(scored.lane)));
  out.set("status", Json(scored.ticket.status));
  out.set("studentName", Json(scored.ticket.studentName));
  out.set("itemCount", Json(static_cast<long long>(scored.ticket.itemCount)));
  out.set("totalCents", Json(scored.ticket.totalCents));
  out.set("paymentMethod", Json(scored.ticket.paymentMethod));
  out.set("paymentStatus", Json(scored.ticket.paymentStatus));
  out.set("placedAtMs", Json(scored.ticket.placedAtMs));
  out.set("waitingMinutes", Json(static_cast<long long>(scored.waitingMinutes)));
  out.set("priorityScore", Json(static_cast<long long>(scored.priorityScore)));
  out.set("asap", Json(scored.asap));
  return out;
}

Json writeDecision(const seatplan::Decision& decision) {
  Json out = Json::object();
  out.set("allowed", Json(decision.allowed));
  out.set("reason", Json(decision.reason));
  out.set("fareCents", Json(static_cast<long long>(decision.fareCents)));
  out.set("availableSeats", Json(static_cast<long long>(decision.availableSeats)));
  return out;
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

Json runCommand(const std::string& command, const Json& request) {
  if (command == "info") {
    Json out = Json::object();
    out.set("engine", Json("c++"));
    out.set("version", Json(kEngineVersion));
    out.set("standard", Json(static_cast<long long>(__cplusplus)));
    Json commands = Json::array();
    for (const char* name : {"info", "canteen.window", "canteen.quote", "canteen.publishGuard", "cashflow.summary",
                             "cashflow.history", "cashflow.monthly", "cashflow.agents", "ferry.plan", "ferry.canRequest",
                             "ferry.canConfirm", "ferry.capacityFloor", "ferry.planMonth", "ferry.canRequestMonth",
                             "ferry.canAcceptMonth", "ferry.monthCapacityFloor", "kds.board", "kds.canAdvance"})
      commands.push(Json(name));
    out.set("commands", commands);
    return out;
  }

  if (command == "canteen.window") {
    const bool open = canteen::isPreorderWindowOpen(static_cast<int>(request["yangonHour"].asInt()));
    Json out = Json::object();
    out.set("orderingOpen", Json(open));
    out.set("message", Json(canteen::preorderWindowMessage(open)));
    return out;
  }

  if (command == "canteen.publishGuard") {
    canteen::CanteenService::assertCanPublish(static_cast<int>(request["yangonHour"].asInt()));
    Json out = Json::object();
    out.set("allowed", Json(true));
    return out;
  }

  if (command == "canteen.quote") {
    const auto quote = canteen::CanteenService::quote(readMenu(request["menu"]), readBasket(request["basket"]),
                                                      static_cast<int>(request["yangonHour"].asInt()));
    const std::string paymentMethod = request["paymentMethod"].asString("wallet");
    if (paymentMethod == "wallet" && request.has("walletBalanceCents") &&
        !canteen::CanteenService::walletCovers(request["walletBalanceCents"].asInt(), quote.totalCents))
      throw canteen::CanteenError("Insufficient wallet balance for this order.");

    Json lines = Json::array();
    for (const auto& line : quote.lines) {
      Json entry = Json::object();
      entry.set("foodItemId", Json(line.foodItemId));
      entry.set("name", Json(line.name));
      entry.set("quantity", Json(static_cast<long long>(line.quantity)));
      entry.set("unitPriceCents", Json(static_cast<long long>(line.unitPriceCents)));
      entry.set("lineTotalCents", Json(static_cast<long long>(line.lineTotalCents)));
      lines.push(entry);
    }
    Json out = Json::object();
    out.set("agentId", Json(quote.agentId));
    out.set("totalCents", Json(static_cast<long long>(quote.totalCents)));
    out.set("itemCount", Json(static_cast<long long>(quote.itemCount)));
    out.set("paymentMethod", Json(paymentMethod));
    out.set("lines", lines);
    return out;
  }

  if (command == "cashflow.summary") {
    const auto role = cashflow::roleFromString(request["role"].asString("user"));
    return writeSummary(cashflow::CashflowEngine::summaryForRole(role, readMovements(request["rows"]), readMovements(request["downstream"])));
  }

  if (command == "cashflow.history") {
    const auto rows = readMovements(request["rows"]);
    Json out = Json::array();
    for (const auto& entry : cashflow::CashflowEngine::runningBalances(rows)) {
      Json item = Json::object();
      item.set("id", Json(entry.id));
      item.set("balanceAfter", Json(entry.balanceAfter));
      out.push(item);
    }
    Json wrapper = Json::object();
    wrapper.set("ledger", out);
    wrapper.set("walletBalance", Json(cashflow::CashflowEngine::walletBalance(rows)));
    return wrapper;
  }

  if (command == "cashflow.monthly") {
    const auto role = cashflow::roleFromString(request["role"].asString("user"));
    Json out = Json::array();
    for (const auto& bucket : cashflow::CashflowEngine::monthly(role, readMovements(request["rows"]), readMovements(request["downstream"]))) {
      Json item = Json::object();
      item.set("month", Json(bucket.month));
      item.set("invested", Json(bucket.invested));
      item.set("returned", Json(bucket.returned));
      item.set("downstreamPaidOut", Json(bucket.downstreamPaidOut));
      item.set("fundingTransfers", Json(bucket.fundingTransfers));
      item.set("payoutTransfers", Json(bucket.payoutTransfers));
      item.set("profit", Json(bucket.profit));
      out.push(item);
    }
    Json wrapper = Json::object();
    wrapper.set("months", out);
    return wrapper;
  }

  if (command == "cashflow.agents") {
    const auto rows = readMovements(request["rows"]);
    Json out = Json::array();
    for (const auto& entry : request["agentIds"].items()) {
      const auto position = cashflow::CashflowEngine::agentPosition(entry.asInt(), rows);
      Json item = Json::object();
      item.set("agentId", Json(position.agentId));
      item.set("allocated", Json(position.allocated));
      item.set("disbursed", Json(position.disbursed));
      item.set("balance", Json(position.balance));
      out.push(item);
    }
    Json wrapper = Json::object();
    wrapper.set("agents", out);
    return wrapper;
  }

  if (command == "ferry.plan") {
    const auto plans = seatplan::SeatPlanner::plan(readTrips(request["trips"]), readBookings(request["bookings"]));
    Json out = Json::array();
    for (const auto& seats : plans) {
      Json item = Json::object();
      item.set("tripId", Json(seats.tripId));
      item.set("totalSeats", Json(static_cast<long long>(seats.totalSeats)));
      item.set("occupiedSeats", Json(static_cast<long long>(seats.occupiedSeats)));
      item.set("pendingSeats", Json(static_cast<long long>(seats.pendingSeats)));
      item.set("availableSeats", Json(static_cast<long long>(seats.availableSeats)));
      item.set("loadPercent", Json(seats.loadPercent));
      item.set("bookable", Json(seats.bookable));
      out.push(item);
    }
    Json wrapper = Json::object();
    wrapper.set("trips", out);
    return wrapper;
  }

  if (command == "ferry.canRequest")
    return writeDecision(seatplan::SeatPlanner::canRequest(readTrip(request["trip"]), readBookings(request["bookings"]),
                                                           request["userId"].asInt(), static_cast<int>(request["seatCount"].asInt(1))));

  if (command == "ferry.canConfirm")
    return writeDecision(seatplan::SeatPlanner::canConfirm(readTrip(request["trip"]), readBookings(request["bookings"]), request["bookingId"].asInt()));

  if (command == "ferry.capacityFloor") {
    const int floor = seatplan::SeatPlanner::committedSeatsForVehicle(request["vehicleId"].asInt(), readTrips(request["trips"]), readBookings(request["bookings"]));
    Json out = Json::object();
    out.set("committedSeats", Json(static_cast<long long>(floor)));
    return out;
  }

  // --- the ferry sold by the month -----------------------------------------

  if (command == "ferry.planMonth") {
    const auto plans = ferrypass::MonthlyPassPlanner::plan(readRoadMonths(request["roads"]), readPasses(request["passes"]));
    Json out = Json::array();
    for (const auto& seats : plans) {
      Json item = Json::object();
      item.set("routeId", Json(seats.routeId));
      item.set("month", Json(seats.month));
      item.set("totalSeats", Json(static_cast<long long>(seats.totalSeats)));
      item.set("occupiedSeats", Json(static_cast<long long>(seats.occupiedSeats)));
      item.set("pendingSeats", Json(static_cast<long long>(seats.pendingSeats)));
      item.set("availableSeats", Json(static_cast<long long>(seats.availableSeats)));
      item.set("loadPercent", Json(seats.loadPercent));
      item.set("sellable", Json(seats.sellable));
      out.push(item);
    }
    Json wrapper = Json::object();
    wrapper.set("roads", out);
    return wrapper;
  }

  if (command == "ferry.canRequestMonth")
    return writePassDecision(ferrypass::MonthlyPassPlanner::canRequest(readRoadMonth(request["road"]), readPasses(request["passes"]),
                                                                       request["userId"].asInt(),
                                                                       static_cast<int>(request["seatCount"].asInt(1)),
                                                                       request["currentMonth"].asString("")));

  if (command == "ferry.canAcceptMonth")
    return writePassDecision(
        ferrypass::MonthlyPassPlanner::canAccept(readRoadMonth(request["road"]), readPasses(request["passes"]), request["passId"].asInt()));

  if (command == "ferry.monthCapacityFloor") {
    const int floor = ferrypass::MonthlyPassPlanner::committedSeatsForRoute(request["routeId"].asInt(), readPasses(request["passes"]));
    Json out = Json::object();
    out.set("committedSeats", Json(static_cast<long long>(floor)));
    return out;
  }

  if (command == "kds.board") {
    const auto board = kds::KitchenBoard::build(readTickets(request["tickets"]), request["nowMs"].asInt());
    const auto lane = [](const std::vector<kds::ScoredTicket>& tickets) {
      Json out = Json::array();
      for (const auto& ticket : tickets) out.push(writeTicket(ticket));
      return out;
    };
    Json out = Json::object();
    out.set("incoming", lane(board.incoming));
    out.set("preparing", lane(board.preparing));
    out.set("ready", lane(board.ready));
    out.set("openTickets", Json(static_cast<long long>(board.openTickets)));
    out.set("asapTickets", Json(static_cast<long long>(board.asapTickets)));
    out.set("openValueCents", Json(board.openValueCents));
    out.set("averageWaitMinutes", Json(board.averageWaitMinutes));
    return out;
  }

  if (command == "kds.canAdvance") {
    Json out = Json::object();
    out.set("allowed", Json(kds::KitchenBoard::canAdvance(request["from"].asString(""), request["to"].asString(""))));
    return out;
  }

  throw std::runtime_error("Unknown engine command: " + command);
}

/** True when stdin is an interactive terminal — then there is nothing to read. */
bool stdinIsTerminal() {
#ifdef _WIN32
  return _isatty(_fileno(stdin)) != 0;
#else
  return isatty(fileno(stdin)) != 0;
#endif
}

Json readRequest(int argc, char** argv) {
  // The payload normally arrives on stdin; a second argument is accepted so
  // the engine can be poked from a shell without a here-doc. When the engine
  // is run by hand with no payload at all (`biten_engine info`) stdin is a
  // terminal, and reading it would hang — so that case returns an empty
  // request instead.
  if (argc >= 3) return Json::parse(argv[2]);
  if (stdinIsTerminal()) return Json::object();
  std::ostringstream buffer;
  buffer << std::cin.rdbuf();
  const std::string text = buffer.str();
  if (text.find_first_not_of(" \t\r\n") == std::string::npos) return Json::object();
  return Json::parse(text);
}

}  // namespace

int main(int argc, char** argv) {
  std::ios::sync_with_stdio(false);

  if (argc < 2) {
    std::cout << R"JSON({"ok":false,"error":"Usage: biten_engine <command> [json] — the payload may also be piped on stdin"})JSON" << '\n';
    return 2;
  }

  const std::string command = argv[1];
  Json request;
  try {
    request = readRequest(argc, argv);
  } catch (const std::exception& error) {
    Json out = Json::object();
    out.set("ok", Json(false));
    out.set("error", Json(std::string("Invalid JSON request: ") + error.what()));
    std::cout << out.dump() << '\n';
    return 2;
  }

  try {
    Json out = Json::object();
    out.set("ok", Json(true));
    out.set("result", runCommand(command, request));
    std::cout << out.dump() << '\n';
    return 0;
  } catch (const std::exception& error) {
    const bool unknownCommand = std::string(error.what()).rfind("Unknown engine command", 0) == 0;
    Json out = Json::object();
    out.set("ok", Json(false));
    out.set("error", Json(std::string(error.what())));
    std::cout << out.dump() << '\n';
    return unknownCommand ? 2 : 0;
  }
}
