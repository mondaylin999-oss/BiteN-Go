#include "SeatPlanner.hpp"

#include <algorithm>

namespace seatplan {

static bool isActiveTripStatus(const std::string& status) {
  return status == "scheduled" || status == "boarding" || status == "in_progress";
}

bool SeatPlanner::isBookable(const TripRow& trip) {
  return (trip.status == "scheduled" || trip.status == "boarding") && trip.routeStatus == "active" && trip.vehicleStatus == "operational";
}

static int seatsWithStatus(Id tripId, const std::vector<BookingRow>& bookings, const std::string& status) {
  int seats = 0;
  for (const auto& booking : bookings)
    if (booking.tripId == tripId && booking.status == status) seats += booking.seatCount;
  return seats;
}

std::vector<TripSeats> SeatPlanner::plan(const std::vector<TripRow>& trips, const std::vector<BookingRow>& bookings) {
  std::vector<TripSeats> result;
  result.reserve(trips.size());
  for (const auto& trip : trips) {
    TripSeats seats;
    seats.tripId = trip.tripId;
    seats.totalSeats = trip.totalSeats;
    seats.occupiedSeats = seatsWithStatus(trip.tripId, bookings, "confirmed");
    seats.pendingSeats = seatsWithStatus(trip.tripId, bookings, "pending");
    seats.availableSeats = std::max(0, trip.totalSeats - seats.occupiedSeats);
    seats.loadPercent = trip.totalSeats > 0 ? (static_cast<double>(seats.occupiedSeats) * 100.0) / static_cast<double>(trip.totalSeats) : 0.0;
    seats.bookable = isBookable(trip) && seats.availableSeats > 0;
    result.push_back(seats);
  }
  return result;
}

Decision SeatPlanner::canRequest(const TripRow& trip, const std::vector<BookingRow>& bookings, Id userId, int seatCount) {
  Decision decision;
  decision.fareCents = trip.fareCents * std::max(0, seatCount);

  if (seatCount < 1 || seatCount > 8) {
    decision.reason = "Request between 1 and 8 seats.";
    return decision;
  }
  if (!isBookable(trip)) {
    decision.reason = "This trip is not available for booking.";
    return decision;
  }

  const bool alreadyBooked = std::any_of(bookings.begin(), bookings.end(), [&](const BookingRow& booking) {
    return booking.tripId == trip.tripId && booking.userId == userId && (booking.status == "pending" || booking.status == "confirmed");
  });
  if (alreadyBooked) {
    decision.reason = "You already have an active booking for this trip.";
    return decision;
  }

  const int occupied = seatsWithStatus(trip.tripId, bookings, "confirmed");
  decision.availableSeats = std::max(0, trip.totalSeats - occupied);
  if (decision.availableSeats <= 0) {
    decision.reason = "There are no seats remaining on this trip.";
    return decision;
  }
  if (seatCount > decision.availableSeats) {
    decision.reason = "This request exceeds the currently available ferry seats.";
    return decision;
  }

  decision.allowed = true;
  return decision;
}

Decision SeatPlanner::canConfirm(const TripRow& trip, const std::vector<BookingRow>& bookings, Id bookingId) {
  Decision decision;
  const auto found = std::find_if(bookings.begin(), bookings.end(), [&](const BookingRow& booking) { return booking.id == bookingId; });
  if (found == bookings.end()) {
    decision.reason = "Booking request was not found.";
    return decision;
  }
  if (found->status != "pending") {
    decision.reason = "Only pending bookings can be confirmed or rejected.";
    return decision;
  }

  const int occupied = seatsWithStatus(trip.tripId, bookings, "confirmed");
  decision.availableSeats = std::max(0, trip.totalSeats - occupied);
  decision.fareCents = found->seatCount * trip.fareCents;

  if (occupied + found->seatCount > trip.totalSeats) {
    decision.reason = "This request cannot be accepted because the ferry bus is full.";
    return decision;
  }

  decision.allowed = true;
  return decision;
}

int SeatPlanner::committedSeatsForVehicle(Id vehicleId, const std::vector<TripRow>& trips, const std::vector<BookingRow>& bookings) {
  int seats = 0;
  for (const auto& trip : trips) {
    if (trip.vehicleId != vehicleId || !isActiveTripStatus(trip.status)) continue;
    seats += seatsWithStatus(trip.tripId, bookings, "confirmed");
  }
  return seats;
}

}  // namespace seatplan
