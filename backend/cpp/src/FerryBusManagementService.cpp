#include "FerryBusManagementService.hpp"

#include <algorithm>
#include <regex>

namespace ferry_bus {

std::string FerryBusManagementService::required(std::string value, const std::string& field) {
  if (value.empty()) throw FerryBusError(field + " is required.");
  return value;
}

void FerryBusManagementService::registerDriver(Driver driver) {
  if (driver.id <= 0) throw FerryBusError("Driver ID must be positive.");
  driver.name = required(std::move(driver.name), "Driver name");
  driver.phone = required(std::move(driver.phone), "Driver phone");
  repository_.saveDriver(driver);
}

void FerryBusManagementService::registerStudent(Student student) {
  if (student.id <= 0) throw FerryBusError("Student ID must be positive.");
  student.name = required(std::move(student.name), "Student name");
  student.destination = required(std::move(student.destination), "Student destination");
  repository_.saveStudent(student);
}

void FerryBusManagementService::registerBus(FerryBus bus) {
  if (bus.id <= 0 || bus.driverId <= 0 || bus.totalCapacity <= 0 || bus.monthlyFeeKyats <= 0) throw FerryBusError("Bus ID, Driver, capacity, and monthly fee must be positive.");
  if (!repository_.findDriver(bus.driverId)) throw FerryBusError("Assign the bus to an existing Driver.");
  bus.plateNumber = required(std::move(bus.plateNumber), "Bus plate number");
  repository_.saveBus(bus);
}

void FerryBusManagementService::publishRoute(FerryRoute route) {
  if (route.id <= 0 || route.driverId <= 0 || route.busId <= 0) throw FerryBusError("Route, Driver, and Bus IDs must be positive.");
  const auto bus = repository_.findBus(route.busId);
  if (!bus || bus->driverId != route.driverId) throw FerryBusError("A Driver can publish routes only for their assigned ferry bus.");
  route.name = required(std::move(route.name), "Route name");
  route.startPoint = required(std::move(route.startPoint), "Route start point");
  route.destination = required(std::move(route.destination), "Route destination");
  if (route.stops.empty()) throw FerryBusError("At least one pickup stop is required.");
  if (!route.googleMapsUrl.empty() && !std::regex_match(route.googleMapsUrl, std::regex(R"(https://.+)"))) throw FerryBusError("Google Maps URL must be HTTPS.");
  repository_.saveRoute(route);
}

void FerryBusManagementService::updateDriverContact(Id driverId, std::string phone) {
  auto driver = repository_.findDriver(driverId);
  if (!driver) throw FerryBusError("Driver was not found.");
  driver->phone = required(std::move(phone), "Driver phone");
  repository_.saveDriver(*driver);
}

void FerryBusManagementService::updateMonthlyFee(Id driverId, Id routeId, int monthlyFeeKyats) {
  auto route = repository_.findRoute(routeId);
  if (!route || route->driverId != driverId) throw FerryBusError("Drivers can update only their own route fee.");
  auto bus = repository_.findBus(route->busId);
  if (!bus || bus->driverId != driverId) throw FerryBusError("Assigned ferry bus was not found.");
  if (monthlyFeeKyats <= 0) throw FerryBusError("Monthly ferry fee must be positive.");
  bus->monthlyFeeKyats = monthlyFeeKyats;
  repository_.saveBus(*bus);
}

void FerryBusManagementService::updateRouteMap(Id driverId, Id routeId, std::string googleMapsUrl, std::string coordinates) {
  auto route = repository_.findRoute(routeId);
  if (!route || route->driverId != driverId) throw FerryBusError("Drivers can update only their own route map.");
  if (!googleMapsUrl.empty() && !std::regex_match(googleMapsUrl, std::regex(R"(https://.+)"))) throw FerryBusError("Google Maps URL must be HTTPS.");
  route->googleMapsUrl = std::move(googleMapsUrl);
  route->coordinates = std::move(coordinates);
  repository_.saveRoute(*route);
}

int FerryBusManagementService::occupiedSeats(Id busId) const {
  int seats = 0;
  for (const auto& request : repository_.requestsForBus(busId)) if (isAccepted(request)) seats += request.seats;
  return seats;
}

FerryAvailability FerryBusManagementService::makeAvailability(const FerryRoute& route, const FerryBus& bus, const Driver& driver, int occupied) {
  return FerryAvailability{route, bus, driver, occupied, std::max(0, bus.totalCapacity - occupied)};
}

FerryAvailability FerryBusManagementService::availabilityForRoute(Id routeId) const {
  const auto route = repository_.findRoute(routeId);
  if (!route) throw FerryBusError("Ferry route was not found.");
  const auto bus = repository_.findBus(route->busId);
  const auto driver = repository_.findDriver(route->driverId);
  if (!bus || !driver) throw FerryBusError("Ferry route assignment is incomplete.");
  return makeAvailability(*route, *bus, *driver, occupiedSeats(bus->id));
}

std::vector<FerryAvailability> FerryBusManagementService::searchAvailableFerries(const std::string& routeOrDestination) const {
  std::vector<FerryAvailability> matches;
  for (const auto& route : repository_.findRoutes(routeOrDestination)) {
    const auto availability = availabilityForRoute(route.id);
    if (availability.availableSeats > 0) matches.push_back(availability);
  }
  return matches;
}

FerryRequest FerryBusManagementService::sendStudentRequest(Id studentId, Id routeId, int seats) {
  if (seats <= 0) throw FerryBusError("Request at least one seat.");
  if (!repository_.findStudent(studentId)) throw FerryBusError("Student was not found.");
  const auto availability = availabilityForRoute(routeId);
  if (availability.availableSeats <= 0) throw FerryBusError("No ferry seats remain available.");
  FerryRequest request{0, routeId, availability.bus.id, studentId, seats, RequestStatus::Pending};
  request.id = routeId * 1'000'000 + studentId;  // Replace with database-generated IDs in a persistent adapter.
  repository_.saveRequest(request);
  return request;
}

void FerryBusManagementService::decideStudentRequest(Id driverId, Id requestId, bool accept) {
  auto request = repository_.findRequest(requestId);
  if (!request || request->status != RequestStatus::Pending) throw FerryBusError("Only a pending request can be decided.");
  const auto route = repository_.findRoute(request->routeId);
  if (!route || route->driverId != driverId) throw FerryBusError("Drivers can decide only requests for their own ferry route.");
  const auto availability = availabilityForRoute(route->id);
  if (accept && request->seats > availability.availableSeats) throw FerryBusError("Accepting this request would exceed ferry-bus capacity.");
  request->status = accept ? RequestStatus::Accepted : RequestStatus::Rejected;
  repository_.saveRequest(*request);
}

}  // namespace ferry_bus
