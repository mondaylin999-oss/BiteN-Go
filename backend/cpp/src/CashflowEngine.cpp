#include "CashflowEngine.hpp"

#include <algorithm>
#include <map>

namespace cashflow {

Role roleFromString(const std::string& value) {
  if (value == "admin") return Role::Admin;
  if (value == "agent") return Role::Agent;
  if (value == "driver") return Role::Driver;
  return Role::User;
}

std::string roleToString(Role role) {
  switch (role) {
    case Role::Admin: return "admin";
    case Role::Agent: return "agent";
    case Role::Driver: return "driver";
    default: return "user";
  }
}

Direction directionFromString(const std::string& value) { return value == "out" ? Direction::Out : Direction::In; }

std::string directionToString(Direction direction) { return direction == Direction::Out ? "out" : "in"; }

static std::string monthKey(const std::string& occurredAt) {
  return occurredAt.size() >= 7 ? occurredAt.substr(0, 7) : std::string("0000-00");
}

FlowSummary CashflowEngine::metrics(const std::vector<Movement>& rows) {
  FlowSummary summary;
  for (const auto& row : rows) {
    if (row.direction == Direction::In) summary.received += row.amountCents;
    else summary.paidOut += row.amountCents;
  }
  summary.balance = summary.received - summary.paidOut;
  summary.profit = summary.balance;
  summary.profitPercentage = summary.received ? (static_cast<double>(summary.balance) / static_cast<double>(summary.received)) * 100.0 : 0.0;
  return summary;
}

long long CashflowEngine::walletBalance(const std::vector<Movement>& rows) {
  long long balance = 0;
  for (const auto& row : rows) {
    if (row.targetRole == Role::User) balance += row.amountCents;
    else if (row.sourceRole == Role::User) balance -= row.amountCents;
  }
  return balance;
}

FlowSummary CashflowEngine::summaryForRole(Role role, const std::vector<Movement>& rows, const std::vector<Movement>& downstream) {
  if (role == Role::Driver) return FlowSummary{};

  FlowSummary summary = metrics(rows);

  if (role == Role::User) {
    long long received = 0;
    long long spent = 0;
    for (const auto& row : rows) {
      if (row.targetRole == Role::User) received += row.amountCents;
      if (row.sourceRole == Role::User) spent += row.amountCents;
    }
    summary.received = received;
    summary.paidOut = spent;
    summary.balance = received - spent;
    summary.profit = summary.balance;
    summary.profitPercentage = 0.0;
    summary.downstreamPaidOut = 0;
    summary.fundingTransfers = 0;
    return summary;
  }

  if (role == Role::Agent) {
    summary.fundingTransfers = static_cast<long long>(std::count_if(rows.begin(), rows.end(), [](const Movement& row) { return row.direction == Direction::In; }));
    summary.downstreamPaidOut = 0;
    return summary;
  }

  // Admin: the network position depends on what the agents actually paid out.
  long long downstreamPaidOut = 0;
  for (const auto& row : downstream)
    if (row.direction == Direction::Out && row.sourceRole == Role::Agent) downstreamPaidOut += row.amountCents;

  summary.downstreamPaidOut = downstreamPaidOut;
  summary.balance = summary.received - downstreamPaidOut;
  summary.profit = summary.balance;
  summary.profitPercentage = summary.received ? (static_cast<double>(summary.balance) / static_cast<double>(summary.received)) * 100.0 : 0.0;
  return summary;
}

std::vector<LedgerEntry> CashflowEngine::runningBalances(std::vector<Movement> rows) {
  std::stable_sort(rows.begin(), rows.end(), [](const Movement& left, const Movement& right) { return left.occurredAt < right.occurredAt; });
  std::vector<LedgerEntry> ledger;
  ledger.reserve(rows.size());
  long long running = 0;
  for (const auto& row : rows) {
    running += row.direction == Direction::In ? row.amountCents : -row.amountCents;
    ledger.push_back(LedgerEntry{row.id, running});
  }
  return ledger;
}

std::vector<MonthlyBucket> CashflowEngine::monthly(Role role, const std::vector<Movement>& rows, const std::vector<Movement>& downstream) {
  std::map<std::string, MonthlyBucket> buckets;

  const auto bucketFor = [&](const std::string& key) -> MonthlyBucket& {
    auto found = buckets.find(key);
    if (found == buckets.end()) {
      MonthlyBucket fresh;
      fresh.month = key;
      found = buckets.emplace(key, fresh).first;
    }
    return found->second;
  };

  for (const auto& row : rows) {
    MonthlyBucket& bucket = bucketFor(monthKey(row.occurredAt));
    if (role == Role::User) {
      if (row.targetRole == Role::User) bucket.invested += row.amountCents;
      else bucket.returned += row.amountCents;
    } else if (row.direction == Direction::In) {
      bucket.invested += row.amountCents;
      if (role == Role::Agent) bucket.fundingTransfers += 1;
    } else {
      bucket.returned += row.amountCents;
      if (role == Role::Agent) bucket.payoutTransfers += 1;
    }
  }

  if (role == Role::Admin) {
    for (const auto& row : downstream) {
      if (row.direction != Direction::Out || row.sourceRole != Role::Agent) continue;
      bucketFor(monthKey(row.occurredAt)).downstreamPaidOut += row.amountCents;
    }
  }

  std::vector<MonthlyBucket> result;
  result.reserve(buckets.size());
  for (auto& [month, bucket] : buckets) {
    bucket.profit = bucket.invested - bucket.returned;
    result.push_back(bucket);
  }
  // Newest month first, matching the dashboards.
  std::reverse(result.begin(), result.end());
  return result;
}

CashflowEngine::AgentPosition CashflowEngine::agentPosition(Id agentId, const std::vector<Movement>& rows) {
  AgentPosition position;
  position.agentId = agentId;
  for (const auto& row : rows) {
    if (row.agentId != agentId) continue;
    if (row.direction == Direction::In) position.allocated += row.amountCents;
    else position.disbursed += row.amountCents;
  }
  position.balance = position.allocated - position.disbursed;
  return position;
}

bool CashflowEngine::hasSufficientBalance(long long balanceCents, long long amountCents) {
  return amountCents > 0 && balanceCents >= amountCents;
}

}  // namespace cashflow
