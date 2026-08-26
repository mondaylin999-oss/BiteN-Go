// ===========================================================================
//  admin/CashHistory.tsx — the full ledger, with filters.
//  Every row shows the running balance the C++ engine calculated, and can be
//  deleted (admin only) if it was entered by mistake.
// ===========================================================================

import { useState } from "react";
import { Filter, Trash2 } from "lucide-react";
import { api, ApiError, type HistoryRow, type SessionUser } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { dateTime, kyats } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner, StatTile } from "@/components/ui";

export default function CashHistory() {
  const [filters, setFilters] = useState<{ start?: string; end?: string; direction?: string; agentId?: string }>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "canteen" | "error"; text: string } | null>(null);

  const { data, loading, error, refresh } = useApiData<{ history: HistoryRow[]; agents: SessionUser[] }>(async () => {
    const [history, participants] = await Promise.all([
      api.get<{ history: HistoryRow[] }>("/cashflow/history", {
        start: filters.start || undefined,
        end: filters.end || undefined,
        direction: filters.direction || undefined,
        agentId: filters.agentId || undefined,
      }),
      api.get<{ participants: SessionUser[] }>("/cashflow/participants"),
    ]);
    return { history: history.history, agents: participants.participants.filter(person => person.role === "agent") };
  }, [filters.start, filters.end, filters.direction, filters.agentId]);

  async function remove(id: number) {
    setBusy(id);
    setMessage(null);
    try {
      await api.delete(`/cashflow/entries/${id}`);
      setMessage({ tone: "canteen", text: `Entry #${id} deleted.` });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not delete that entry." });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="Loading the ledger…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;

  const history = data?.history ?? [];
  const inflow = history.filter(row => row.direction === "in").reduce((sum, row) => sum + row.amountCents, 0);
  const outflow = history.filter(row => row.direction === "out").reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <>
      <PageHeader title="Cash Flow" subtitle="Admin allocations to agents. Agent-to-student top-ups appear in each agent's own ledger." />

      <div className="grid gap-stack-md sm:grid-cols-3">
        <StatTile label="Rows" value={history.length} />
        <StatTile label="In" value={kyats(inflow)} tone="canteen" />
        <StatTile label="Out" value={kyats(outflow)} />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <Card title="Filters" subtitle="Leave everything empty to see the whole ledger." actions={<Filter className="h-4 w-4 text-on-surface-variant" />}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From">
            <Input type="date" value={filters.start ?? ""} onChange={event => setFilters(current => ({ ...current, start: event.target.value }))} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.end ?? ""} onChange={event => setFilters(current => ({ ...current, end: event.target.value }))} />
          </Field>
          <Field label="Direction">
            <Select value={filters.direction ?? ""} onChange={event => setFilters(current => ({ ...current, direction: event.target.value }))}>
              <option value="">Both</option>
              <option value="in">In</option>
              <option value="out">Out</option>
            </Select>
          </Field>
          <Field label="Agent">
            <Select value={filters.agentId ?? ""} onChange={event => setFilters(current => ({ ...current, agentId: event.target.value }))}>
              <option value="">Every agent</option>
              {(data?.agents ?? []).map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name ?? agent.username}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {Object.values(filters).some(Boolean) ? (
          <Button variant="ghost" className="mt-4 h-9" onClick={() => setFilters({})}>
            Clear filters
          </Button>
        ) : null}
      </Card>

      <Card title="Ledger">
        {history.length === 0 ? (
          <EmptyState title="Nothing matches" description="Try widening the date range or clearing the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>When</th>
                  <th>Detail</th>
                  <th>Flow</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map(row => (
                  <tr key={row.id}>
                    <td className="tabular text-on-surface-variant">{row.id}</td>
                    <td className="tabular whitespace-nowrap">{dateTime(row.occurredAt)}</td>
                    <td>
                      <p className="font-medium text-on-surface">{row.note ?? "—"}</p>
                      <p className="text-[12px] text-on-surface-variant">{row.counterparty ?? ""}</p>
                    </td>
                    <td>
                      <Badge tone={row.direction === "in" ? "canteen" : "neutral"}>
                        {row.sourceRole} → {row.targetRole}
                      </Badge>
                    </td>
                    <td className={`tabular whitespace-nowrap text-right font-bold ${row.direction === "in" ? "text-secondary" : "text-on-surface"}`}>
                      {row.direction === "in" ? "+" : "−"}
                      {kyats(row.amountCents)}
                    </td>
                    <td className="tabular whitespace-nowrap text-right text-on-surface-variant">{kyats(row.balanceAfter)}</td>
                    <td className="text-right">
                      <Button variant="ghost" className="h-9 px-3" busy={busy === row.id} onClick={() => void remove(row.id)} aria-label={`Delete entry ${row.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
