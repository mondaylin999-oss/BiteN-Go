#include "MonthlyPassPlanner.hpp"

#include <algorithm>

namespace ferrypass {

namespace {

bool isActive(const std::string& status) { return status == "pending" || status == "confirmed"; }

int seatsWithStatus(Id routeId, const std::string& month, const std::vector<PassRow>& passes, const std::string& status) {
  int seats = 0;
  for (const auto& pass : passes)
    if (pass.routeId == routeId && pass.month == month && pass.status == status) seats += pass.seatCount;
  return seats;
}

}  // namespace

bool MonthlyPassPlanner::isSellable(const RoadMonth& road, const std::string& currentMonth) {
  if (road.routeStatus != "active") return false;
  if (road.vehicleStatus != "operational") return false;
  // "YYYY-MM" sorts lexicographically, so a plain string compare is a date
  // compare. A month that has already finished cannot be sold.
  if (!currentMonth.empty() && road.month < currentMonth) return false;
  return true;
}

std::vector<RoadSeats> MonthlyPassPlanner::plan(const std::vector<RoadMonth>& roads, const std::vector<PassRow>& passes) {
  std::vector<RoadSeats> result;
  result.reserve(roads.size());
  for (const auto& road : roads) {
    RoadSeats seats;
    seats.routeId = road.routeId;
    seats.month = road.month;
    seats.totalSeats = road.totalSeats;
    seats.occupiedSeats = seatsWithStatus(road.routeId, road.month, passes, "confirmed");
    seats.pendingSeats = seatsWithStatus(road.routeId, road.month, passes, "pending");
    seats.availableSeats = std::max(0, road.totalSeats - seats.occupiedSeats);
    seats.loadPercent =
        road.totalSeats > 0 ? (static_cast<double>(seats.occupiedSeats) * 100.0) / static_cast<double>(road.totalSeats) : 0.0;
    // `plan` is a report, not a sale, so it does not know today's month; the
    // month check belongs to canRequest. Here "sellable" means the road and
    // the bus are in a state that allows selling and a seat is free.
    seats.sellable = road.routeStatus == "active" && road.vehicleStatus == "operational" && seats.availableSeats > 0;
    result.push_back(seats);
  }
  return result;
}

PassDecision MonthlyPassPlanner::canRequest(const RoadMonth& road, const std::vector<PassRow>& passes, Id userId, int seatCount,
                                            const std::string& currentMonth) {
  PassDecision decision;
  decision.fareCents = road.monthlyFareCents * std::max(0, seatCount);

  const int occupied = seatsWithStatus(road.routeId, road.month, passes, "confirmed");
  decision.availableSeats = std::max(0, road.totalSeats - occupied);

  if (seatCount < 1 || seatCount > kMaxSeatsPerPass) {
    decision.reason = "Ask for between 1 and 8 seats.";
    return decision;
  }
  if (road.month.size() != 7) {
    decision.reason = "Choose a month.";
    return decision;
  }
  if (!currentMonth.empty() && road.month < currentMonth) {
    decision.reason = "That month has already finished.";
    return decision;
  }
  if (road.routeStatus != "active") {
    decision.reason = "This road is not running at the moment.";
    return decision;
  }
  if (road.vehicleStatus != "operational") {
    decision.reason = "The ferry bus on this road is not in service.";
    return decision;
  }

  const bool alreadyHeld = std::any_of(passes.begin(), passes.end(), [&](const PassRow& pass) {
    return pass.routeId == road.routeId && pass.userId == userId && pass.month == road.month && isActive(pass.status);
  });
  if (alreadyHeld) {
    decision.reason = "You already have a seat on this road for that month.";
    return decision;
  }

  if (decision.availableSeats <= 0) {
    decision.reason = "Every seat on this road is taken for that month.";
    return decision;
  }
  if (seatCount > decision.availableSeats) {
    decision.reason = "That is more seats than are left for that month.";
    return decision;
  }

  decision.allowed = true;
  decision.reason = "ok";
  return decision;
}

PassDecision MonthlyPassPlanner::canAccept(const RoadMonth& road, const std::vector<PassRow>& passes, Id passId) {
  PassDecision decision;

  const auto found = std::find_if(passes.begin(), passes.end(), [&](const PassRow& pass) { return pass.id == passId; });
  if (found == passes.end()) {
    decision.reason = "That request no longer exists.";
    return decision;
  }
  if (found->status != "pending") {
    decision.reason = "Only a waiting request can be accepted.";
    return decision;
  }

  const int occupied = seatsWithStatus(road.routeId, found->month, passes, "confirmed");
  decision.availableSeats = std::max(0, road.totalSeats - occupied);
  decision.fareCents = road.monthlyFareCents * found->seatCount;

  if (found->seatCount > decision.availableSeats) {
    decision.reason = "Accepting this would put more students on the bus than it has seats.";
    return decision;
  }

  decision.allowed = true;
  decision.reason = "ok";
  return decision;
}

int MonthlyPassPlanner::committedSeatsForRoute(Id routeId, const std::vector<PassRow>& passes) {
  // The bus must still fit the busiest month it is already committed to.
  int worst = 0;
  for (const auto& pass : passes) {
    if (pass.routeId != routeId || pass.status != "confirmed") continue;
    const int forThatMonth = seatsWithStatus(routeId, pass.month, passes, "confirmed");
    worst = std::max(worst, forThatMonth);
  }
  return worst;
}

}  // namespace ferrypass
