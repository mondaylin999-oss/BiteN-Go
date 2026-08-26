#pragma once

#include "FerryBusRepository.hpp"

#include <algorithm>
#include <cctype>
#include <unordered_map>

namespace ferry_bus {

/** A deterministic in-memory adapter suited to the console demo and unit tests. */
class InMemoryFerryBusRepository final : public FerryBusRepository {
 public:
  void saveDriver(const Driver& driver) override { drivers_[driver.id] = driver; }
  void saveStudent(const Student& student) override { students_[student.id] = student; }
  void saveBus(const FerryBus& bus) override { buses_[bus.id] = bus; }
  void saveRoute(const FerryRoute& route) override { routes_[route.id] = route; }
  void saveRequest(const FerryRequest& request) override { requests_[request.id] = request; }

  [[nodiscard]] std::optional<Driver> findDriver(Id id) const override { return lookup(drivers_, id); }
  [[nodiscard]] std::optional<Student> findStudent(Id id) const override { return lookup(students_, id); }
  [[nodiscard]] std::optional<FerryBus> findBus(Id id) const override { return lookup(buses_, id); }
  [[nodiscard]] std::optional<FerryRoute> findRoute(Id id) const override { return lookup(routes_, id); }
  [[nodiscard]] std::optional<FerryRequest> findRequest(Id id) const override { return lookup(requests_, id); }

  [[nodiscard]] std::vector<FerryRoute> findRoutes(const std::string& query) const override {
    const auto needle = normalized(query);
    std::vector<FerryRoute> matches;
    for (const auto& [_, route] : routes_) {
      if (needle.empty() || matchesText(route.name, needle) || matchesText(route.startPoint, needle) ||
          matchesText(route.destination, needle) || std::any_of(route.stops.begin(), route.stops.end(), [&](const std::string& stop) { return matchesText(stop, needle); })) {
        matches.push_back(route);
      }
    }
    return matches;
  }

  [[nodiscard]] std::vector<FerryRequest> requestsForBus(Id busId) const override {
    std::vector<FerryRequest> matches;
    for (const auto& [_, request] : requests_) if (request.busId == busId) matches.push_back(request);
    return matches;
  }

 private:
  template <typename T>
  static std::optional<T> lookup(const std::unordered_map<Id, T>& source, Id id) {
    const auto found = source.find(id);
    return found == source.end() ? std::nullopt : std::optional<T>{found->second};
  }

  static std::string normalized(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char character) { return static_cast<char>(std::tolower(character)); });
    return value;
  }

  static bool matchesText(const std::string& text, const std::string& needle) { return normalized(text).find(needle) != std::string::npos; }

  std::unordered_map<Id, Driver> drivers_;
  std::unordered_map<Id, Student> students_;
  std::unordered_map<Id, FerryBus> buses_;
  std::unordered_map<Id, FerryRoute> routes_;
  std::unordered_map<Id, FerryRequest> requests_;
};

}  // namespace ferry_bus
