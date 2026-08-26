#pragma once

#include "FerryBusRepository.hpp"

#include <vector>

namespace ferry_bus {

/**
 * Application service for Driver and Student ferry-bus workflows.
 * The service owns all capacity and ownership rules; UI layers never calculate availability.
 */
class FerryBusManagementService final {
 public:
  explicit FerryBusManagementService(FerryBusRepository& repository) : repository_(repository) {}

  void registerDriver(Driver driver);
  void registerStudent(Student student);
  void registerBus(FerryBus bus);
  void publishRoute(FerryRoute route);

  void updateDriverContact(Id driverId, std::string phone);
  void updateMonthlyFee(Id driverId, Id routeId, int monthlyFeeKyats);
  void updateRouteMap(Id driverId, Id routeId, std::string googleMapsUrl, std::string coordinates);

  [[nodiscard]] std::vector<FerryAvailability> searchAvailableFerries(const std::string& routeOrDestination) const;
  [[nodiscard]] FerryAvailability availabilityForRoute(Id routeId) const;

  FerryRequest sendStudentRequest(Id studentId, Id routeId, int seats = 1);
  void decideStudentRequest(Id driverId, Id requestId, bool accept);

 private:
  [[nodiscard]] int occupiedSeats(Id busId) const;
  [[nodiscard]] static bool isAccepted(const FerryRequest& request) { return request.status == RequestStatus::Accepted; }
  [[nodiscard]] static std::string required(std::string value, const std::string& field);
  [[nodiscard]] static FerryAvailability makeAvailability(const FerryRoute& route, const FerryBus& bus, const Driver& driver, int occupiedSeats);

  FerryBusRepository& repository_;
};

}  // namespace ferry_bus
