#pragma once
// ===========================================================================
//  FerryBusRepository.hpp
//  The storage port used by FerryBusManagementService. Keeping this an
//  abstract interface is what lets the same domain rules run against the
//  in-memory adapter (unit tests + the console demo) and, later, against a
//  PostgreSQL-backed adapter without touching a single rule.
// ===========================================================================

#include "FerryBusDomain.hpp"

#include <optional>
#include <string>
#include <vector>

namespace ferry_bus {

class FerryBusRepository {
 public:
  virtual ~FerryBusRepository() = default;

  virtual void saveDriver(const Driver& driver) = 0;
  virtual void saveStudent(const Student& student) = 0;
  virtual void saveBus(const FerryBus& bus) = 0;
  virtual void saveRoute(const FerryRoute& route) = 0;
  virtual void saveRequest(const FerryRequest& request) = 0;

  [[nodiscard]] virtual std::optional<Driver> findDriver(Id id) const = 0;
  [[nodiscard]] virtual std::optional<Student> findStudent(Id id) const = 0;
  [[nodiscard]] virtual std::optional<FerryBus> findBus(Id id) const = 0;
  [[nodiscard]] virtual std::optional<FerryRoute> findRoute(Id id) const = 0;
  [[nodiscard]] virtual std::optional<FerryRequest> findRequest(Id id) const = 0;

  /** Free-text search over route name, start point, destination and stops. */
  [[nodiscard]] virtual std::vector<FerryRoute> findRoutes(const std::string& query) const = 0;

  /** Every request (any status) recorded against one ferry bus. */
  [[nodiscard]] virtual std::vector<FerryRequest> requestsForBus(Id busId) const = 0;
};

}  // namespace ferry_bus
