// ===========================================================================
//  admin/Overview.tsx — the whole system on one screen.
//  Network money, each agent's position, allocations, and the live state of
//  the canteen and the ferry.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { Banknote, Bus, TrendingUp, UtensilsCrossed, Wallet } from "lucide-react";
import { api, ApiError, type AgentPosition, type FlowSummary, type MonthRow, type OrderRow, type SessionUser, type TripRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { clock, day, kyats, monthName, percent } from "@/lib/format";
import { Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner, StatTile, StatusBadge } from "@/components/ui";

type Bundle = {
  summary: FlowSummary;
  agents: AgentPosition[];
  months: MonthRow[];
  orders: OrderRow[];
  trips: TripRow[];
  participants: SessionUser[];
};

export default function AdminOverview() {
  const { data, loading, error, refresh } = useApiData<Bundle>(async () => {
    const [overview, adminFlow, monthly, orders, trips, participants] = await Promise.all([
      api.get<{ summary: FlowSummary }>("/cashflow/overview"),
      api.get<{ agents: AgentPosition[] }>("/cashflow/admin-flow"),
      api.get<{ months: MonthRow[] }>("/cashflow/monthly"),
      api.get<{ orders: OrderRow[] }>("/canteen/orders"),
      api.get<{ trips: TripRow[] }>("/transport/trips"),
      api.get<{ participants: SessionUser[] }>("/cashflow/participants"),
    ]);
    return {
      summary: overview.summary,
      agents: adminFlow.agents,
      months: monthly.months,
      orders: orders.orders,
      trips: trips.trips,
      participants: participants.participants,
    };
  }, []);

  const [agentId, setAgentId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "canteen" | "error"; text: string } | null>(null);

  async function allocate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/cashflow/allocate", { agentId: Number(agentId), amountCents: Math.round(Number(amount)), note: note.trim() || undefined });
      setMessage({ tone: "canteen", text: `${kyats(Number(amount))} allocated.` });
      setAmount("");
      setNote("");
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not allocate that amount." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading the system overview…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const openOrders = data.orders.filter(order => !["completed", "cancelled"].includes(order.status));
  const upcomingTrips = data.trips.filter(trip => ["scheduled", "boarding", "in_progress"].includes(trip.trip.status));
  const activeAgents = data.participants.filter(person => person.role === "agent" && person.status === "active");

  return (
    <>
      <PageHeader title="Overview" subtitle="Everything the campus is doing right now, straight from PostgreSQL." />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Funded to agents" value={kyats(data.summary.received)} icon={<Banknote className="h-4 w-4" />} />
        <StatTile label="Agents disbursed" value={kyats(data.summary.downstreamPaidOut)} icon={<Wallet className="h-4 w-4" />} hint="Student wallet top-ups" />
        <StatTile label="Network balance" value={kyats(data.summary.balance)} tone="canteen" icon={<TrendingUp className="h-4 w-4" />} hint={percent(data.summary.profitPercentage)} />
        <StatTile label="People" value={data.participants.length} hint={`${activeAgents.length} active agent(s)`} />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-stack-md lg:grid-cols-[340px_1fr]">
        <Card title="Fund an agent" accent="canteen">
          <form className="space-y-4" onSubmit={allocate}>
            <Field label="Agent">
              <Select value={agentId} onChange={event => setAgentId(event.target.value)} required>
                <option value="">Choose an agent…</option>
                {activeAgents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name ?? agent.username}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount (kyat)">
              <Input type="number" min={1} step={1} value={amount} onChange={event => setAmount(event.target.value)} required placeholder="500000" />
            </Field>
            <Field label="Note (optional)">
              <Input value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="September float" />
            </Field>
            <Button type="submit" className="w-full" busy={busy} disabled={!agentId || !amount}>
              Allocate
            </Button>
          </form>
        </Card>

        <Card title="Agent positions" subtitle="Allocated, disbursed, and still holding">
          {data.agents.length === 0 ? (
            <EmptyState title="No agents yet" description="Create one in People." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th className="text-right">Allocated</th>
                    <th className="text-right">Disbursed</th>
                    <th className="text-right">Holding</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map(position => (
                    <tr key={position.agentId}>
                      <td>
                        <p className="font-semibold text-on-surface">{position.agent?.name ?? position.agent?.username ?? `#${position.agentId}`}</p>
                        <p className="text-[12px] text-on-surface-variant">{position.agent?.status}</p>
                      </td>
                      <td className="tabular text-right">{kyats(position.allocated)}</td>
                      <td className="tabular text-right">{kyats(position.disbursed)}</td>
                      <td className="tabular text-right font-bold text-secondary">{kyats(position.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-stack-md lg:grid-cols-2">
        <Card title="Canteen right now" accent="canteen" subtitle={`${openOrders.length} open ticket(s)`}>
          {openOrders.length === 0 ? (
            <EmptyState title="Kitchen is clear" description="No orders are waiting to be prepared." />
          ) : (
            <ul className="space-y-2">
              {openOrders.slice(0, 6).map(order => (
                <li key={order.id} className="flex items-center justify-between gap-3 border-b border-surface-container-high pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="tabular text-[14px] font-semibold">
                      #{order.id} <span className="font-normal text-on-surface-variant">· {order.studentName}</span>
                    </p>
                    <p className="truncate text-[12px] text-on-surface-variant">{order.items.map(item => `${item.quantity}× ${item.name}`).join(", ")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-[13px] font-bold">{kyats(order.totalCents)}</span>
                    <StatusBadge status={order.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-2 text-[13px] text-on-surface-variant">
            <UtensilsCrossed className="h-4 w-4" /> {data.orders.length} orders in total
          </div>
        </Card>

        <Card title="Ferry right now" accent="ferry" subtitle={`${upcomingTrips.length} upcoming departure(s)`}>
          {upcomingTrips.length === 0 ? (
            <EmptyState title="No departures scheduled" description="Schedule one in Transport Ops." />
          ) : (
            <ul className="space-y-2">
              {upcomingTrips.slice(0, 6).map(trip => (
                <li key={trip.trip.id} className="flex items-center justify-between gap-3 border-b border-surface-container-high pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{trip.route.name}</p>
                    <p className="tabular text-[12px] text-on-surface-variant">
                      {day(trip.trip.departureAt)} {clock(trip.trip.departureAt)} · {trip.driverName ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-[13px]">
                      {trip.occupiedSeats}/{trip.vehicle.totalSeats}
                    </span>
                    <StatusBadge status={trip.trip.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-2 text-[13px] text-on-surface-variant">
            <Bus className="h-4 w-4" /> {data.trips.length} trips in total
          </div>
        </Card>
      </div>

      {data.months.length > 0 ? (
        <Card title="Month by month">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="text-right">Funded</th>
                  <th className="text-right">Agents disbursed</th>
                  <th className="text-right">Held in the network</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map(month => (
                  <tr key={month.month}>
                    <td className="font-medium">{monthName(month.month)}</td>
                    <td className="tabular text-right">{kyats(month.invested)}</td>
                    <td className="tabular text-right">{kyats(month.downstreamPaidOut)}</td>
                    <td className="tabular text-right font-semibold text-secondary">{kyats(month.invested - month.downstreamPaidOut)}</td>
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
