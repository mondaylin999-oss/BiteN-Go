// ===========================================================================
//  student/Dashboard.tsx — the student's landing screen: wallet, next meal,
//  next ferry, and anything that needs attention.
// ===========================================================================

import { Link } from "wouter";
import { ArrowRight, Bus, Clock, Receipt, UtensilsCrossed, Wallet } from "lucide-react";
import { api, type FlowSummary, type OrderRow, type PreorderWindow, type RoadRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/lib/auth";
import { dateTime, kyats, monthName } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorNote, LoadBar, PageHeader, Spinner, StatTile, StatusBadge } from "@/components/ui";

type Bundle = {
  window: PreorderWindow;
  wallet: number;
  summary: FlowSummary;
  orders: OrderRow[];
  roads: RoadRow[];
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useApiData<Bundle>(async () => {
    const [window, overview, orders, roads] = await Promise.all([
      api.get<PreorderWindow>("/canteen/window"),
      api.get<{ summary: FlowSummary; wallet: number }>("/cashflow/overview"),
      api.get<{ orders: OrderRow[] }>("/canteen/orders"),
      api.get<{ roads: RoadRow[] }>("/transport/roads"),
    ]);
    return { window, wallet: overview.wallet, summary: overview.summary, orders: orders.orders, roads: roads.roads };
  }, []);

  if (loading) return <Spinner label="Loading your day…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const openOrders = data.orders.filter(order => !["completed", "cancelled"].includes(order.status));
  // One line per ferry road. A road runs every day at the two times written on
  // it, so there is no list of departures to summarise.
  const roads = data.roads;
  const mySeats = roads.reduce((sum, road) => sum + road.months.filter(month => month.ownPass).length, 0);
  const nextMonth = roads.flatMap(road => road.months.map(month => month.month)).sort()[0] ?? "";

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name?.split(" ")[0] ?? "there"}`}
        subtitle={data.window.message}
        actions={<Badge tone={data.window.orderingOpen ? "canteen" : "warning"}>{data.window.orderingOpen ? "Pre-orders open" : "Window closed"}</Badge>}
      />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Wallet" value={kyats(data.wallet)} tone="canteen" icon={<Wallet className="h-4 w-4" />} hint="Spendable in the canteen" />
        <StatTile label="Open orders" value={openOrders.length} icon={<Receipt className="h-4 w-4" />} hint={`${data.orders.length} in total`} />
        <StatTile
          label="Ferry leaves"
          value={roads[0]?.route.morningTime ?? "—"}
          tone="ferry"
          icon={<Bus className="h-4 w-4" />}
          hint={roads[0] ? `${roads[0].route.name}${roads[0].route.eveningTime ? ` · back ${roads[0].route.eveningTime}` : ""}` : "No road yet"}
        />
        <StatTile
          label="My ferry months"
          value={mySeats}
          tone="ferry"
          icon={<Clock className="h-4 w-4" />}
          hint={nextMonth ? `On sale from ${monthName(nextMonth)}` : "Nothing on sale"}
        />
      </div>

      <div className="grid gap-stack-md lg:grid-cols-2">
        <Card
          title="Today's meals"
          accent="canteen"
          actions={
            <Link href="/student/canteen" className="inline-flex items-center gap-1 text-[13px] font-semibold text-secondary">
              Menu <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          {openOrders.length === 0 ? (
            <EmptyState title="No open orders" description="Pre-order from the canteen menu — the kitchen prepares it for tomorrow." />
          ) : (
            <ul className="space-y-3">
              {openOrders.slice(0, 4).map(order => (
                <li key={order.id} className="flex items-start justify-between gap-3 border-b border-surface-container-high pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="tabular text-[14px] font-bold text-on-surface">#{order.id}</p>
                    <p className="truncate text-[13px] text-on-surface-variant">
                      {order.items.map(item => `${item.quantity}× ${item.name}`).join(", ") || "—"}
                    </p>
                    <p className="text-[12px] text-on-surface-variant">{dateTime(order.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular text-[14px] font-bold">{kyats(order.totalCents)}</span>
                    <StatusBadge status={order.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Ferry bus"
          accent="ferry"
          actions={
            <Link href="/student/ferry" className="inline-flex items-center gap-1 text-[13px] font-semibold text-tertiary">
              Tracking <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          {roads.length === 0 ? (
            <EmptyState title="No ferry road yet" description="A transport agent opens a road from their own screen; it shows up here as soon as they do." />
          ) : (
            <ul className="space-y-4">
              {roads.slice(0, 3).map(road => {
                const month = road.months.find(entry => entry.ownPass) ?? road.months[0];
                return (
                  <li key={road.route.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-on-surface">{road.route.name}</p>
                        <p className="text-[12px] text-on-surface-variant">
                          {road.route.startPoint} → {road.route.destination}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tabular text-[15px] font-bold text-tertiary">{road.route.morningTime}</p>
                        <p className="tabular text-[11px] text-on-surface-variant">
                          {road.route.eveningTime ? `back ${road.route.eveningTime}` : "once a day"}
                        </p>
                      </div>
                    </div>
                    <LoadBar percent={month?.loadPercent ?? 0} />
                    <p className="tabular text-[12px] text-on-surface-variant">
                      {month ? `${month.availableSeats} of ${month.totalSeats} seats free in ${monthName(month.month)}` : "not on sale yet"}
                      {month?.ownPass ? ` · your seat is ${month.ownPass.status === "confirmed" ? "accepted" : "waiting"}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Quick actions">
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/student/canteen" className="card card-pad flex items-center gap-3 transition-colors hover:bg-surface-container-low">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-on-secondary">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <span className="text-[14px] font-semibold">Pre-order a meal</span>
          </Link>
          <Link href="/student/ferry" className="card card-pad flex items-center gap-3 transition-colors hover:bg-surface-container-low">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-tertiary text-on-tertiary">
              <Bus className="h-5 w-5" />
            </span>
            <span className="text-[14px] font-semibold">Book a ferry seat</span>
          </Link>
          <Link href="/student/wallet" className="card card-pad flex items-center gap-3 transition-colors hover:bg-surface-container-low">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-on-primary">
              <Wallet className="h-5 w-5" />
            </span>
            <span className="text-[14px] font-semibold">Check the wallet</span>
          </Link>
        </div>
      </Card>
    </>
  );
}
