#pragma once
// ===========================================================================
//  CanteenService.hpp
//  Smart-canteen ordering rules. This is the authority for:
//
//    * the Myanmar pre-order window  (12:00 PM  ->  12:00 AM, Asia/Yangon)
//    * "one agent per order" (a basket may not mix two canteen vendors)
//    * item availability at the moment the basket is priced
//    * the order total, in kyat minor units, computed in integer maths
//    * whether a wallet balance can cover the basket
//
//  The Node API layer calls into here through the engine CLI, so the same
//  numbers are produced no matter which screen asked for them.
// ===========================================================================

#include <stdexcept>
#include <string>
#include <vector>

namespace canteen {

using Id = long long;

class CanteenError final : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

enum class Availability { Available, Unavailable, SoldOut };

Availability availabilityFromString(const std::string& value);
std::string availabilityToString(Availability value);

struct MenuItem {
  Id id{};
  Id agentId{};
  std::string name;
  int priceCents{};
  Availability availability{Availability::Available};
};

struct BasketLine {
  Id foodItemId{};
  int quantity{};
};

struct QuotedLine {
  Id foodItemId{};
  std::string name;
  int quantity{};
  int unitPriceCents{};
  int lineTotalCents{};
};

struct Quote {
  Id agentId{};
  int totalCents{};
  int itemCount{};
  std::vector<QuotedLine> lines;
};

/** 12:00–23:59 Asia/Yangon is the ordering window; 00:00–11:59 is closed. */
[[nodiscard]] bool isPreorderWindowOpen(int yangonHour);

/** Human-readable message shown next to the menu. */
[[nodiscard]] std::string preorderWindowMessage(bool open);

class CanteenService final {
 public:
  /**
   * Price a basket against the menu.
   * Throws CanteenError when the window is closed, an item is missing or
   * unavailable, the basket mixes agents, or a quantity is out of range.
   */
  [[nodiscard]] static Quote quote(const std::vector<MenuItem>& menu, const std::vector<BasketLine>& basket, int yangonHour);

  /** A wallet order is only allowed when the balance covers the whole basket. */
  [[nodiscard]] static bool walletCovers(long long balanceCents, int totalCents);

  /** Guard used before an agent flips an item back to "available". */
  static void assertCanPublish(int yangonHour);

 private:
  static constexpr int kMaxQuantityPerLine = 20;
};

}  // namespace canteen
