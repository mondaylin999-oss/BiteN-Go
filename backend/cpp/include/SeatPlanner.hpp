#pragma once
// ===========================================================================
//  SeatPlanner.hpp
//  Ferry-bus seat arithmetic for the live system.
//
//  FerryBusManagementService models the ferry domain in the classic
//  repository/aggregate style (and is exercised by the demo + unit tests).
//  SeatPlanner is the thin, table-shaped face of the same rules: it takes the
//  rows the API just read out of PostgreSQL and answers the three questions
//  the screens ask, with the capacity invariant enforced in one place:
//
//      * how many seats are taken / free on each trip
//      * may this student request N seats on this trip?
//      * may the driver confirm this pending request, or shrink the bus?
//
//  The invariant: a *pending* request never holds a seat. Only a request the
//  driver has confirmed reduces the free-seat counter.
// ===========================================================================

#include <string>
#include <vector>

namespace seatplan {

using Id = long long;

struct BookingRow {
  Id id{};
  Id tripId{};
  Id userId{};
  int seatCount{1};
  std::string status;  // pending | confirmed | cancelled
};

struct TripRow {
  Id tripId{};
  Id routeId{};
  Id vehicleId{};
  Id driverId{};
  int totalSeats{};
  int fareCents{};
  std::string status;        // scheduled | boarding | in_progress | completed | cancelled
  std::string routeStatus;   // active | inactive
  std::string vehicleStatus; // operational | unavailable | maintenance
};

struct TripSeats {
  Id tripId{};
  int totalSeats{};
  int occupiedSeats{};
  int pendingSeats{};
  int availableSeats{};
  double loadPercent{};
  bool bookable{};
};

struct Decision {
  bool allowed{};
  std::string reason;
  int fareCents{};
  int availableSeats{};
};

class SeatPlanner final {
 public:
  /** Seat counts for every trip, in the order the trips were given. */
  [[nodiscard]] static std::vector<TripSeats> plan(const std::vector<TripRow>& trips, const std::vector<BookingRow>& bookings);

  /** Can this student request `seatCount` seats on this trip right now? */
  [[nodiscard]] static Decision canRequest(const TripRow& trip, const std::vector<BookingRow>& bookings, Id userId, int seatCount);

  /** Can the driver confirm this pending request without overselling? */
  [[nodiscard]] static Decision canConfirm(const TripRow& trip, const std::vector<BookingRow>& bookings, Id bookingId);

  /** Confirmed seats on a driver's active trips for one vehicle — the floor a capacity change may not go below. */
  [[nodiscard]] static int committedSeatsForVehicle(Id vehicleId, const std::vector<TripRow>& trips, const std::vector<BookingRow>& bookings);

  /** Is a trip in a state where seats may still be sold? */
  [[nodiscard]] static bool isBookable(const TripRow& trip);
};

}  // namespace seatplan
