#pragma once
// ===========================================================================
//  CashflowEngine.hpp
//  Every money figure the dashboards show is produced here.
//
//  Money is handled as `long long` kyat minor units. No floating point is
//  used anywhere in a balance calculation — the only double in this file is
//  the profit *percentage*, which is a presentation value.
//
//  Roles and what "balance" means for each:
//    admin  — network position: what admin funded minus what agents paid out
//    agent  — float in hand:    funding received minus payouts made
//    user   — wallet:           credited to the student minus what they spent
// ===========================================================================

#include <string>
#include <vector>

namespace cashflow {

using Id = long long;

enum class Role { Admin, Agent, User, Driver };
enum class Direction { In, Out };

Role roleFromString(const std::string& value);
std::string roleToString(Role role);
Direction directionFromString(const std::string& value);
std::string directionToString(Direction direction);

struct Movement {
  Id id{};
  Id agentId{};
  Id userId{};
  Direction direction{Direction::In};
  Role sourceRole{Role::Admin};
  Role targetRole{Role::Agent};
  long long amountCents{};
  std::string occurredAt;  // ISO-8601; only the leading "YYYY-MM" is read here
  std::string note;
};

struct FlowSummary {
  long long received{};
  long long paidOut{};
  long long balance{};
  long long profit{};
  double profitPercentage{};
  long long downstreamPaidOut{};
  long long fundingTransfers{};
};

struct MonthlyBucket {
  std::string month;  // "YYYY-MM"
  long long invested{};
  long long returned{};
  long long downstreamPaidOut{};
  long long fundingTransfers{};
  long long payoutTransfers{};
  long long profit{};
};

struct LedgerEntry {
  Id id{};
  long long balanceAfter{};
};

class CashflowEngine final {
 public:
  /** Received / paid out / balance / profit for a set of movements. */
  [[nodiscard]] static FlowSummary metrics(const std::vector<Movement>& rows);

  /**
   * Role-aware summary.
   * `downstream` carries the agent-to-user payouts and is only consulted for
   * the admin role, where the network balance is admin funding minus what the
   * agents actually disbursed.
   */
  [[nodiscard]] static FlowSummary summaryForRole(Role role, const std::vector<Movement>& rows, const std::vector<Movement>& downstream);

  /** A student's spendable wallet: credits to them minus their own spending. */
  [[nodiscard]] static long long walletBalance(const std::vector<Movement>& rows);

  /** Running balance for each row, oldest first, keyed by movement id. */
  [[nodiscard]] static std::vector<LedgerEntry> runningBalances(std::vector<Movement> rows);

  /** Month-by-month buckets, newest month first. */
  [[nodiscard]] static std::vector<MonthlyBucket> monthly(Role role, const std::vector<Movement>& rows, const std::vector<Movement>& downstream);

  /** What one agent was allocated, disbursed, and still holds. */
  struct AgentPosition {
    Id agentId{};
    long long allocated{};
    long long disbursed{};
    long long balance{};
  };
  [[nodiscard]] static AgentPosition agentPosition(Id agentId, const std::vector<Movement>& rows);

  /** Guard used before an agent pays a student. */
  [[nodiscard]] static bool hasSufficientBalance(long long balanceCents, long long amountCents);
};

}  // namespace cashflow
