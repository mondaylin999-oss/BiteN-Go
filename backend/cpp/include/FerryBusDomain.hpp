#pragma once

#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace ferry_bus {

using Id = long long;

class FerryBusError final : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

enum class RequestStatus { Pending, Accepted, Rejected, Cancelled };

struct Driver {
  Id id{};
  std::string name;
  std::string phone;
};

struct Student {
  Id id{};
  std::string name;
  std::string destination;
};

struct FerryBus {
  Id id{};
  Id driverId{};
  std::string plateNumber;
  int totalCapacity{};
  int monthlyFeeKyats{};
};

struct FerryRoute {
  Id id{};
  Id driverId{};
  Id busId{};
  std::string name;
  std::string startPoint;
  std::string destination;
  std::vector<std::string> stops;
  std::string googleMapsUrl;
  std::string coordinates;  // "latitude, longitude"
};

struct FerryRequest {
  Id id{};
  Id routeId{};
  Id busId{};
  Id studentId{};
  int seats{1};
  RequestStatus status{RequestStatus::Pending};
};

struct FerryAvailability {
  FerryRoute route;
  FerryBus bus;
  Driver driver;
  int occupiedSeats{};
  int availableSeats{};
};

}  // namespace ferry_bus
