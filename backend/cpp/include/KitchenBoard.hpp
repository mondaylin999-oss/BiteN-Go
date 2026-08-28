#pragma once
// ===========================================================================
//  KitchenBoard.hpp <<
//  The Kitchen Display System (KDS) board.
//
//  The agent's kitchen screen is a three-lane Kanban — Incoming, Preparing,
//  Ready — and the order tickets appear inside a lane in the order this
//  engine decides. That ordering is a real scheduling rule, not a UI detail:
//
//    priority = waiting minutes
//             + 6 per unpaid cash ticket (chase the money early)
//             + 2 per item on the ticket (big tickets need a head start)
//    a ticket older than 12 minutes is flagged ASAP and pinned to the top.
//
//  Keeping it in C++ means the same board order is produced for every screen
//  that asks, and it can be unit-tested without a database or a browser.
// ===========================================================================

#include <string>
#include <vector>

namespace kds {

using Id = long long;

enum class Lane { Incoming, Preparing, Ready, Archived };

struct Ticket {
  Id orderId{};
  long long placedAtMs{};
  std::string status;         // pending | preparing | ready | completed | cancelled
  std::string paymentMethod;  // wallet | direct_cash
  std::string paymentStatus;  // paid | awaiting_confirmation
  std::string studentName;
  int itemCount{1};
  long long totalCents{};
};

struct ScoredTicket {
  Ticket ticket;
  Lane lane{Lane::Incoming};
  int waitingMinutes{};
  int priorityScore{};
  bool asap{false};
};

struct Board {
  std::vector<ScoredTicket> incoming;
  std::vector<ScoredTicket> preparing;
  std::vector<ScoredTicket> ready;
  int openTickets{};
  int asapTickets{};
  long long openValueCents{};
  double averageWaitMinutes{};
};

std::string laneToString(Lane lane);
Lane laneForStatus(const std::string& status);

class KitchenBoard final {
 public:
  static constexpr int kAsapAfterMinutes = 12;
  static constexpr int kUnpaidCashWeight = 6;
  static constexpr int kPerItemWeight = 2;

  /** Score every ticket and sort it into its lane, highest priority first. */
  [[nodiscard]] static Board build(const std::vector<Ticket>& tickets, long long nowMs);

  /** The scheduling score for one ticket. Exposed for the unit tests. */
  [[nodiscard]] static int priorityScore(const Ticket& ticket, int waitingMinutes);

  /** Which status transitions the kitchen screen is allowed to perform. */
  [[nodiscard]] static bool canAdvance(const std::string& from, const std::string& to);
};

}  // namespace kds
