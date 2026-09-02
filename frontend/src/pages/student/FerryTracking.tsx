// ===========================================================================
//  student/FerryTracking.tsx — the ferry, sold by the month.
//
//  ONE CARD PER ROAD. A seat is taken for a whole calendar month, not for a
//  single departure: pick the month, ask for the seat, ring the agent on the
//  number shown and send them the fare the way you always do. The agent then
//  accepts, and the seat is yours on every departure of that month.
//
//  NO MONEY PASSES THROUGH THIS APP for the ferry. The wallet here is the
//  canteen wallet; the ferry fare goes straight from the student to the agent
//  outside it, so nobody's balance is touched by a seat.
//
//  The card shows, for the month you picked: the daily times the bus runs,
//  how many seats are left, what the month costs, and your own seat if you
//  already have one.
// ===========================================================================

import { useState } from "react";
import { Bus, Clock, MapPin, Minus, Phone, Plus, Users } from "lucide-react";
import { api, ApiError, type RoadMonthRow, type RoadRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats, monthName } from "@/lib/format";
import { RouteMap } from "@/components/RouteMap";
import { Badge, Button, Card, EmptyState, ErrorNote, LoadBar, Notice, PageHeader, Spinner, StatTile } from "@/components/ui";

type Payload = { months: string[]; roads: RoadRow[] };

export default function FerryTracking() {
  const { data, loading, error, refresh } = useApiData<Payload>(() => api.get<Payload>("/transport/roads"), [], { pollMs: 30_000 });
  const [chosenMonth, setChosenMonth] = useState<Record<number, string>>({});
  const [seats, setSeats] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "ferry" | "error"; text: string } | null>(null);
  const [openMap, setOpenMap] = useState<number | null>(null);

  async function request(road: RoadRow, month: RoadMonthRow) {
    setBusy(road.route.id);
    setMessage(null);
    try {
      const response = await api.post<{ passId: number; fareCents: number; month: string }>("/transport/seats", {
        routeId: road.route.id,
        month: month.month,
        seatCount: seats[road.route.id] ?? 1,
      });
      setMessage({
        tone: "ferry",
        text: `Asked for a seat on ${road.route.name} for ${monthName(response.month)} — ${kyats(response.fareCents)}. Now ring ${road.driverName ?? "the transport agent"}${road.driverPhone ? ` on ${road.driverPhone}` : ""} and send the fare; they accept the seat once they have it.`,
      });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not ask for that seat." });
    } finally {
      setBusy(null);
    }
  }

  async function giveUp(passId: number, roadId: number) {
    setBusy(roadId);
    setMessage(null);
    try {
      await api.delete(`/transport/seats/${passId}`);
      setMessage({ tone: "ferry", text: "Seat given up. Anything you already sent the agent is between the two of you — the app never held it." });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not give up that seat." });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="Loading the ferry roads…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;

  const roads = data?.roads ?? [];
  // The months on offer are whatever the agents have published, so the tile
  // names the nearest one rather than assuming "this month".
  const nearestMonth = roads.flatMap(road => road.months.map(month => month.month)).sort()[0] ?? "";
  const mySeats = roads.flatMap(road => road.months.filter(month => month.ownPass)).length;
  const seatsFree = roads.reduce((sum, road) => sum + (road.months[0]?.availableSeats ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Ferry"
        subtitle="A seat is taken for a whole month. Pick the month, ask for the seat, and it is yours on every departure once the transport agent accepts."
      />

      <div className="grid gap-stack-md sm:grid-cols-3">
        <StatTile label="Ferry roads" value={roads.length} tone="ferry" icon={<Bus className="h-4 w-4" />} />
        <StatTile
          label={nearestMonth ? `Seats free · ${monthName(nearestMonth)}` : "Seats free"}
          value={seatsFree}
          tone="ferry"
          icon={<Users className="h-4 w-4" />}
        />
        <StatTile label="My seats" value={mySeats} hint="Waiting or accepted" />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {roads.length === 0 ? (
        <EmptyState title="No ferry road is running yet" description="A transport agent opens a road and publishes its timetable; it appears here straight away." />
      ) : (
        <div className="space-y-stack-md">
          {roads.map(road => {
            const selected = chosenMonth[road.route.id] ?? road.months.find(month => month.ownPass)?.month ?? road.months[0]?.month ?? "";
            const month = road.months.find(entry => entry.month === selected) ?? road.months[0];
            if (!month) return null;
            const wanted = seats[road.route.id] ?? 1;
            const own = month.ownPass;
            // The whole timetable: the same two times every day.
            const times = [road.route.morningTime, road.route.eveningTime].filter(Boolean) as string[];

            return (
              <Card
                key={road.route.id}
                accent="ferry"
                title={road.route.name}
                subtitle={`${road.route.startPoint} → ${road.route.destination} · ${road.vehicle?.plateNumber ?? "ferry bus"} · ${road.driverName ?? "—"}`}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="ferry">{kyats(road.route.fareCents)} / seat / month</Badge>
                  </div>
                }
              >
                {/* ---- which month ---- */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="field-label mb-0 mr-1">Month</span>
                  {road.months.map(entry => {
                    const active = entry.month === month.month;
                    return (
                      <button
                        key={entry.month}
                        type="button"
                        onClick={() => setChosenMonth(current => ({ ...current, [road.route.id]: entry.month }))}
                        className={
                          "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors " +
                          (active
                            ? "border-tertiary bg-tertiary-container text-on-tertiary-container"
                            : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-tertiary hover:text-tertiary")
                        }
                        aria-pressed={active}
                      >
                        {monthName(entry.month)}
                        {entry.ownPass ? <span className="ml-1" title="You have a seat this month">•</span> : null}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-stack-md lg:grid-cols-[240px_1fr]">
                  <div className="space-y-3">
                    <div>
                      <p className="tabular text-[28px] font-bold leading-none text-tertiary">{kyats(road.route.fareCents * wanted)}</p>
                      <p className="text-[12px] text-on-surface-variant">
                        for {monthName(month.month)} · {wanted} seat{wanted === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div>
                      <LoadBar percent={month.loadPercent} />
                      <p className="tabular mt-1 text-[12px] text-on-surface-variant">
                        {month.occupiedSeats}/{month.totalSeats} seats sold · {month.availableSeats} left
                        {month.pendingSeats ? ` · ${month.pendingSeats} waiting` : ""}
                      </p>
                    </div>
                    {road.route.estimatedMinutes ? (
                      <p className="text-[12px] text-on-surface-variant">
                        About {road.route.estimatedMinutes} min{road.route.distanceKm ? ` · ${road.route.distanceKm} km` : ""}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-on-surface-variant">
                      <MapPin className="h-4 w-4 text-tertiary" />
                      <span>{road.route.pickupLocations}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-on-surface-variant">
                      <Phone className="h-4 w-4 text-tertiary" />
                      {road.driverPhone ? (
                        <span>
                          Pay {road.driverName ?? "the agent"} directly —{" "}
                          <a className="tabular font-semibold text-tertiary underline" href={`tel:${road.driverPhone.replace(/\s+/g, "")}`}>
                            {road.driverPhone}
                          </a>
                        </span>
                      ) : (
                        <span>{road.driverName ?? "The agent"} has not put a phone number up yet — ask at the office.</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-on-surface-variant">
                      <Clock className="h-4 w-4 text-tertiary" />
                      <span className="tabular">
                        Every day · leaves {times[0]}
                        {times[1] ? ` · comes back ${times[1]}` : ""}
                      </span>
                    </div>

                    {own ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-tertiary/40 bg-tertiary-container/40 px-3 py-2">
                        <div>
                          <p className="text-[14px] font-semibold text-on-tertiary-container">
                            Your seat for {monthName(own.month)}: {own.seatCount} seat{own.seatCount === 1 ? "" : "s"} · {kyats(own.fareCents)}
                          </p>
                          <p className="text-[12px] text-on-tertiary-container/80">
                            {own.status === "pending"
                              ? `Ring ${road.driverName ?? "the agent"}${road.driverPhone ? ` on ${road.driverPhone}` : ""} and send the fare — they accept the seat once they have it.`
                              : "Accepted — the seat is yours every day this month."}
                          </p>
                        </div>
                        <Button variant="ghost" className="h-9" busy={busy === road.route.id} onClick={() => void giveUp(own.id, road.route.id)}>
                          Give it up
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="field-label mb-0">Seats</span>
                          <button
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container-high"
                            onClick={() => setSeats(current => ({ ...current, [road.route.id]: Math.max(1, wanted - 1) }))}
                            aria-label="One seat fewer"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="tabular w-6 text-center font-bold">{wanted}</span>
                          <button
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container-high"
                            onClick={() => setSeats(current => ({ ...current, [road.route.id]: Math.min(8, wanted + 1) }))}
                            aria-label="One seat more"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <Button variant="ferry" busy={busy === road.route.id} disabled={!month.sellable} onClick={() => void request(road, month)}>
                          Ask for {monthName(month.month)} · {kyats(road.route.fareCents * wanted)}
                        </Button>
                        {!month.sellable ? (
                          <span className="text-[12px] text-on-surface-variant">
                            {month.availableSeats === 0 ? "Every seat is taken for that month." : "This month is not on sale."}
                          </span>
                        ) : null}
                      </div>
                    )}

                    <button
                      className="text-[13px] font-semibold text-tertiary underline"
                      onClick={() => setOpenMap(openMap === road.route.id ? null : road.route.id)}
                    >
                      {openMap === road.route.id ? "Hide the road map" : "Show the road map"}
                    </button>

                    {openMap === road.route.id ? (
                      <RouteMap nodes={road.mapNodes ?? []} color={road.route.routeLineColor} mapUrl={road.route.mapUrl} />
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
