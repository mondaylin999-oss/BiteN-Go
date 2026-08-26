// ===========================================================================
//  student/WalletPage.tsx — the campus wallet and its full history.
//  Students never move money themselves: an agent tops the wallet up, and
//  canteen orders take from it. Every row here is a PostgreSQL record with the
//  running balance the C++ engine computed.
// ===========================================================================

import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { api, type FlowSummary, type HistoryRow, type MonthRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { dateTime, kyats, monthName } from "@/lib/format";
import { Card, EmptyState, ErrorNote, Notice, PageHeader, Spinner, StatTile } from "@/components/ui";

type Bundle = { summary: FlowSummary; wallet: number; history: HistoryRow[]; months: MonthRow[] };

export default function WalletPage() {
  const { data, loading, error, refresh } = useApiData<Bundle>(async () => {
    const [overview, history, monthly] = await Promise.all([
      api.get<{ summary: FlowSummary; wallet: number }>("/cashflow/overview"),
      api.get<{ history: HistoryRow[] }>("/cashflow/history"),
      api.get<{ months: MonthRow[] }>("/cashflow/monthly"),
    ]);
    return { summary: overview.summary, wallet: overview.wallet, history: history.history, months: monthly.months };
  }, []);

  if (loading) return <Spinner label="Loading your wallet…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  return (
    <>
      <PageHeader title="Wallet" subtitle="Topped up by your canteen agent; spent on pre-orders." />

      <div className="grid gap-stack-md sm:grid-cols-3">
        <StatTile label="Balance" value={kyats(data.wallet)} tone="canteen" icon={<Wallet className="h-4 w-4" />} />
        <StatTile label="Received" value={kyats(data.summary.received)} icon={<ArrowDownLeft className="h-4 w-4" />} hint="All top-ups" />
        <StatTile label="Spent" value={kyats(data.summary.paidOut)} icon={<ArrowUpRight className="h-4 w-4" />} hint="Canteen and fares" />
      </div>

      {data.wallet < 2000 ? <Notice tone="warning">Low balance — ask your canteen agent for a top-up before the next pre-order window.</Notice> : null}

      <Card title="History" subtitle="Newest first">
        {data.history.length === 0 ? (
          <EmptyState title="Nothing yet" description="Your first top-up from an agent will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Detail</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map(row => {
                  const credit = row.targetRole === "user";
                  return (
                    <tr key={row.id}>
                      <td className="tabular whitespace-nowrap text-on-surface-variant">{dateTime(row.occurredAt)}</td>
                      <td>
                        <p className="font-medium text-on-surface">{row.note ?? (credit ? "Wallet top-up" : "Canteen order")}</p>
                        <p className="text-[12px] text-on-surface-variant">{credit ? `From ${row.counterparty ?? "agent"}` : `To ${row.counterparty ?? "canteen"}`}</p>
                      </td>
                      <td className={`tabular whitespace-nowrap text-right font-bold ${credit ? "text-secondary" : "text-error"}`}>
                        {credit ? "+" : "−"}
                        {kyats(row.amountCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.months.length > 0 ? (
        <Card title="By month">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="text-right">Received</th>
                  <th className="text-right">Spent</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map(month => (
                  <tr key={month.month}>
                    <td className="font-medium">{monthName(month.month)}</td>
                    <td className="tabular text-right text-secondary">{kyats(month.invested)}</td>
                    <td className="tabular text-right">{kyats(month.returned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}
