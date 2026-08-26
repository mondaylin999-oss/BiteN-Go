#include "KitchenBoard.hpp"

#include <algorithm>

namespace kds {

std::string laneToString(Lane lane) {
  switch (lane) {
    case Lane::Incoming: return "incoming";
    case Lane::Preparing: return "preparing";
    case Lane::Ready: return "ready";
    default: return "archived";
  }
}

Lane laneForStatus(const std::string& status) {
  if (status == "preparing") return Lane::Preparing;
  if (status == "ready") return Lane::Ready;
  if (status == "pending") return Lane::Incoming;
  return Lane::Archived;  // completed / cancelled leave the board
}

int KitchenBoard::priorityScore(const Ticket& ticket, int waitingMinutes) {
  int score = std::max(0, waitingMinutes);
  const bool unpaidCash = ticket.paymentMethod == "direct_cash" && ticket.paymentStatus != "paid";
  if (unpaidCash) score += kUnpaidCashWeight;
  score += std::max(0, ticket.itemCount) * kPerItemWeight;
  return score;
}

bool KitchenBoard::canAdvance(const std::string& from, const std::string& to) {
  if (from == "pending") return to == "preparing" || to == "cancelled";
  if (from == "preparing") return to == "ready" || to == "cancelled";
  if (from == "ready") return to == "completed";
  return false;
}

Board KitchenBoard::build(const std::vector<Ticket>& tickets, long long nowMs) {
  Board board;
  long long totalWait = 0;

  for (const auto& ticket : tickets) {
    const Lane lane = laneForStatus(ticket.status);
    if (lane == Lane::Archived) continue;

    const long long elapsedMs = nowMs > ticket.placedAtMs ? nowMs - ticket.placedAtMs : 0;
    const int waitingMinutes = static_cast<int>(elapsedMs / 60000);

    ScoredTicket scored;
    scored.ticket = ticket;
    scored.lane = lane;
    scored.waitingMinutes = waitingMinutes;
    scored.priorityScore = priorityScore(ticket, waitingMinutes);
    scored.asap = waitingMinutes >= kAsapAfterMinutes;

    board.openTickets += 1;
    board.openValueCents += ticket.totalCents;
    if (scored.asap) board.asapTickets += 1;
    totalWait += waitingMinutes;

    switch (lane) {
      case Lane::Incoming: board.incoming.push_back(scored); break;
      case Lane::Preparing: board.preparing.push_back(scored); break;
      default: board.ready.push_back(scored); break;
    }
  }

  const auto byPriority = [](const ScoredTicket& left, const ScoredTicket& right) {
    if (left.asap != right.asap) return left.asap;                       // ASAP tickets pin to the top
    if (left.priorityScore != right.priorityScore) return left.priorityScore > right.priorityScore;
    return left.ticket.placedAtMs < right.ticket.placedAtMs;             // then oldest first
  };

  std::stable_sort(board.incoming.begin(), board.incoming.end(), byPriority);
  std::stable_sort(board.preparing.begin(), board.preparing.end(), byPriority);
  std::stable_sort(board.ready.begin(), board.ready.end(), byPriority);

  board.averageWaitMinutes = board.openTickets ? static_cast<double>(totalWait) / static_cast<double>(board.openTickets) : 0.0;
  return board;
}

}  // namespace kds
