#pragma once
// ===========================================================================
//  MonthlyPassPlanner.hpp
//  The ferry is sold BY THE MONTH, not by the trip.
//
//  A student takes one seat on one road for a whole calendar month: the
//  transport agent accepts it once, the monthly fare is charged once, and the
//  seat is theirs on every departure of that month. Daily departures still
//  exist — they are the timetable the bus runs to — but nobody books them one
//  by one any more.
//
//  Everything about who owes a seat, how many are left and whether the agent
//  may accept a request is decided here, in C++, exactly like the per-trip
//  SeatPlanner it replaces for the student-facing side.
//
//  THE INVARIANT
//    A *pending* request holds no seat. Only a pass the agent has accepted
//    reduces the free-seat count for that road in that month.
//
//  MONTHS
//    A month is the 7-character string "YYYY-MM" (Myanmar calendar month —
//    the API converts before it calls in). String comparison is enough to
//    order months, which is why the format is fixed.
// ===========================================================================

#include <string>
#include <vector>

namespace ferrypass {

using Id = long long;

/** One road, considered for one month. */
struct RoadMonth {
  Id routeId{};
  Id vehicleId{};
  Id driverId{};
  int totalSeats{};
  int monthlyFareCents{};
  std::string month;          // YYYY-MM
  std::string routeStatus;    // active | inactive
  std::string vehicleStatus;  // operational | unavailable | maintenance
};

/** One student's monthly seat on one road. */
struct PassRow {
  Id id{};
  Id routeId{};
  Id userId{};
  int seatCount{1};
  std::string month;   // YYYY-MM
  std::string status;  // pending | confirmed | cancelled
};

struct RoadSeats {
  Id routeId{};
  std::string month;
  int totalSeats{};
  int occupiedSeats{};
  int pendingSeats{};
  int availableSeats{};
  double loadPercent{};
  bool sellable{};
};

struct PassDecision {
  bool allowed{};
  std::string reason;
  int fareCents{};
  int availableSeats{};
};

class MonthlyPassPlanner final {
 public:
  /** The most seats one student may hold on one road in one month. */
  static constexpr int kMaxSeatsPerPass = 8;

  /** Seat counts for every road/month pair, in the order given. */
  [[nodiscard]] static std::vector<RoadSeats> plan(const std::vector<RoadMonth>& roads, const std::vector<PassRow>& passes);

  /** May this student ask for `seatCount` seats on this road for this month?
   *  `currentMonth` is "YYYY-MM" — a month already past cannot be sold. */
  [[nodiscard]] static PassDecision canRequest(const RoadMonth& road, const std::vector<PassRow>& passes, Id userId, int seatCount,
                                               const std::string& currentMonth);

  /** May the transport agent accept this pending request without overselling? */
  [[nodiscard]] static PassDecision canAccept(const RoadMonth& road, const std::vector<PassRow>& passes, Id passId);

  /** The largest number of accepted seats this road carries in any single
   *  month — the floor below which the agent may not shrink the bus. */
  [[nodiscard]] static int committedSeatsForRoute(Id routeId, const std::vector<PassRow>& passes);

  /** Is this road open for monthly sales at all (before counting seats)? */
  [[nodiscard]] static bool isSellable(const RoadMonth& road, const std::string& currentMonth);
};

}  // namespace ferrypass
