#include "CanteenService.hpp"

#include <algorithm>
#include <set>

namespace canteen {

Availability availabilityFromString(const std::string& value) {
  if (value == "available") return Availability::Available;
  if (value == "sold_out") return Availability::SoldOut;
  return Availability::Unavailable;
}

std::string availabilityToString(Availability value) {
  switch (value) {
    case Availability::Available: return "available";
    case Availability::SoldOut: return "sold_out";
    default: return "unavailable";
  }
}

bool isPreorderWindowOpen(int yangonHour) { return yangonHour >= 12 && yangonHour <= 23; }

std::string preorderWindowMessage(bool open) {
  return open ? "Pre-orders are open until 12:00 AM for tomorrow's food."
              : "Pre-orders are closed from 12:00 AM to 12:00 PM Myanmar time.";
}

void CanteenService::assertCanPublish(int yangonHour) {
  if (!isPreorderWindowOpen(yangonHour))
    throw CanteenError("Food can be made available only from 12:00 PM Myanmar time for tomorrow's pre-orders.");
}

Quote CanteenService::quote(const std::vector<MenuItem>& menu, const std::vector<BasketLine>& basket, int yangonHour) {
  if (!isPreorderWindowOpen(yangonHour))
    throw CanteenError("Pre-orders open at 12:00 PM Myanmar time and close at 12:00 AM.");
  if (basket.empty()) throw CanteenError("Add at least one item to the basket.");

  Quote quote;
  std::set<Id> agents;

  for (const auto& line : basket) {
    if (line.quantity < 1 || line.quantity > kMaxQuantityPerLine)
      throw CanteenError("Choose between 1 and 20 of each item.");

    const auto found = std::find_if(menu.begin(), menu.end(), [&](const MenuItem& item) { return item.id == line.foodItemId; });
    if (found == menu.end()) throw CanteenError("One or more selected food items are unavailable.");
    if (found->availability != Availability::Available)
      throw CanteenError(found->name + " is no longer available today.");
    if (found->priceCents <= 0) throw CanteenError(found->name + " has no published price.");

    agents.insert(found->agentId);
    if (agents.size() > 1) throw CanteenError("Choose items from one agent at a time.");

    const int lineTotal = found->priceCents * line.quantity;
    quote.totalCents += lineTotal;
    quote.itemCount += line.quantity;
    quote.lines.push_back(QuotedLine{found->id, found->name, line.quantity, found->priceCents, lineTotal});
  }

  if (agents.empty()) throw CanteenError("Add at least one item to the basket.");
  quote.agentId = *agents.begin();
  if (quote.totalCents <= 0) throw CanteenError("The basket total must be greater than zero.");
  return quote;
}

bool CanteenService::walletCovers(long long balanceCents, int totalCents) {
  return totalCents > 0 && balanceCents >= static_cast<long long>(totalCents);
}

}  // namespace canteen
