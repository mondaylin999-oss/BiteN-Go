// ===========================================================================
//  student/Dashboard.tsx — the student's landing screen: wallet, next meal,
//  next ferry, and anything that needs attention.
// ===========================================================================

import { Link } from "wouter";
import { ArrowRight, Bus, Clock, Receipt, UtensilsCrossed, Wallet } from "lucide-react";
import { api, type FlowSummary, type OrderRow, type PreorderWindow, type TripRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/lib/auth";
import { clock, dateTime, kyats, relative } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorNote, LoadBar, PageHeader, Spinner, StatTile, StatusBadge } from "@/components/ui";

type Bundle = {
  window: PreorderWindow;
  wallet: number;
  summary: FlowSummary;
  orders: OrderRow[];
  trips: TripRow[];
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useApiData<Bundle>(async () => {
    const [window, overview, orders, trips] = await Promise.all([
      api.get<PreorderWindow>("/canteen/window"),
      api.get<{ summary: FlowSummary; wallet: number }>("/cashflow/overview"),
      api.get<{ orders: OrderRow[] }>("/canteen/orders"),
      api.get<{ trips: TripRow[] }>("/transport/trips"),
    ]);
    return { window, wallet: overview.wallet, summary: overview.summary, orders: orders.orders, trips: trips.trips };
  }, []);

  if (loading) return <Spinner label="Loading your day…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const openOrders = data.orders.filter(order => !["completed", "cancelled"].includes(order.status));
  const nextTrip = data.trips.find(trip => trip.trip.status === "scheduled" || trip.trip.status === "boarding");
  // One line per ferry road, not per departure — the same road often has
  // several departures and listing each one just repeats the same name.
  const nextPerRoad = Array.from(
    data.trips
      .reduce((roads, trip) => {
        const existing = roads.get(trip.route.id);
        if (!existing || new Date(trip.trip.departureAt).getTime() < new Date(existing.trip.departureAt).getTime()) roads.set(trip.route.id, trip);
        return roads;
      }, new Map<number, (typeof data.trips)[number]>())
      .values(),
  ).sort((left, right) => new Date(left.trip.departureAt).getTime() - new Date(right.trip.departureAt).getTime());
  const mySeats = data.trips.filter(trip => trip.ownPass).length;

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
          label="Next ferry"
          value={nextTrip ? clock(nextTrip.trip.departureAt) : "—"}
          tone="ferry"
          icon={<Bus className="h-4 w-4" />}
          hint={nextTrip ? `${nextTrip.route.name} · ${relative(nextTrip.trip.departureAt)}` : "No upcoming trip"}
        />
        <StatTile label="Ferry seats" value={mySeats} tone="ferry" icon={<Clock className="h-4 w-4" />} hint="Departures covered by your monthly seat" />
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
          {nextPerRoad.length === 0 ? (
            <EmptyState title="No trips scheduled" description="The administrator schedules departures; they show up here as soon as they do." />
          ) : (
            <ul className="space-y-4">
              {nextPerRoad.slice(0, 3).map(trip => (
                <li key={trip.trip.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-on-surface">{trip.route.name}</p>
                      <p className="text-[12px] text-on-surface-variant">
                        {trip.route.startPoint} → {trip.route.destination} · {trip.vehicle.plateNumber}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-[15px] font-bold text-tertiary">{clock(trip.trip.departureAt)}</p>
                      <p className="text-[11px] text-on-surface-variant">{relative(trip.trip.departureAt)}</p>
                    </div>
                  </div>
                  <LoadBar percent={trip.loadPercent} />
                  <p className="tabular text-[12px] text-on-surface-variant">
                    {trip.availableSeats} of {trip.vehicle.totalSeats} seats free
                    {trip.ownPass ? ` · your seat this month is ${trip.ownPass.status === "confirmed" ? "accepted" : "waiting"}` : ""}
                  </p>
                </li>
              ))}
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
