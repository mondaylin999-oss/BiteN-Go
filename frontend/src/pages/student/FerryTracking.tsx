// ===========================================================================
//  student/FerryTracking.tsx — the Ferry Live Tracking screen.
//
//  ONE CARD PER ROAD.
//  A ferry road (route) usually has several departures — this morning's, this
//  evening's, tomorrow's. Showing one card per departure meant the same
//  "North Hall Ferry" appeared over and over, which is just noise. So the
//  screen groups every departure under its road and shows a row of times
//  inside that one card; picking a time updates the seat counts, the map and
//  the request button underneath.
//
//  Seats free / bookable come from the C++ seat planner.
// ===========================================================================

import { useState } from "react";
import { Bus, MapPin, Minus, Plus, Users } from "lucide-react";
import { api, ApiError, type TripRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { clock, day, kyats, relative } from "@/lib/format";
import { RouteMap } from "@/components/RouteMap";
import { Badge, Button, Card, EmptyState, ErrorNote, LoadBar, Notice, PageHeader, Spinner, StatTile, StatusBadge } from "@/components/ui";

/** All the departures of one ferry road, newest first. */
type RoadGroup = { routeId: number; route: TripRow["route"]; departures: TripRow[] };

function departureTime(trip: TripRow) {
  const value = new Date(trip.trip.departureAt).getTime();
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

/** Group the flat list of departures the API returns into one entry per road. */
function groupByRoad(trips: TripRow[]): RoadGroup[] {
  const roads = new Map<number, RoadGroup>();
  for (const trip of trips) {
    const existing = roads.get(trip.route.id);
    if (existing) existing.departures.push(trip);
    else roads.set(trip.route.id, { routeId: trip.route.id, route: trip.route, departures: [trip] });
  }
  for (const road of roads.values()) road.departures.sort((left, right) => departureTime(left) - departureTime(right));
  return Array.from(roads.values()).sort((left, right) => departureTime(left.departures[0]!) - departureTime(right.departures[0]!));
}

/** Which departure to show first: the one you already asked for, otherwise the
 *  next one that can still be booked, otherwise simply the next one. */
function defaultDeparture(road: RoadGroup) {
  return road.departures.find(trip => trip.ownBooking) ?? road.departures.find(trip => trip.bookable) ?? road.departures[0]!;
}

export default function FerryTracking() {
  const { data, loading, error, refresh } = useApiData<TripRow[]>(
    async () => (await api.get<{ trips: TripRow[] }>("/transport/trips")).trips,
    [],
    { pollMs: 20_000 },
  );
  const [seats, setSeats] = useState<Record<number, number>>({});
  const [busyTrip, setBusyTrip] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "ferry" | "error"; text: string } | null>(null);
  const [openMap, setOpenMap] = useState<number | null>(null);
  /** routeId -> the departure the student is currently looking at. */
  const [chosen, setChosen] = useState<Record<number, number>>({});

  async function book(trip: TripRow) {
    setBusyTrip(trip.trip.id);
    setMessage(null);
    try {
      const response = await api.post<{ bookingId: number; fareCents: number }>("/transport/bookings", {
        tripId: trip.trip.id,
        seatCount: seats[trip.trip.id] ?? 1,
      });
      setMessage({
        tone: "ferry",
        text: `Seat request #${response.bookingId} sent to ${trip.driverName ?? "the driver"} — fare ${kyats(response.fareCents)}. It holds no seat until the driver accepts.`,
      });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not send the seat request." });
    } finally {
      setBusyTrip(null);
    }
  }

  async function cancel(bookingId: number) {
    setBusyTrip(bookingId);
    setMessage(null);
    try {
      await api.delete(`/transport/bookings/${bookingId}`);
      setMessage({ tone: "ferry", text: "Booking cancelled." });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not cancel the booking." });
    } finally {
      setBusyTrip(null);
    }
  }

  if (loading) return <Spinner label="Loading ferry departures…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;

  const trips = data ?? [];
  const upcoming = trips.filter(trip => ["scheduled", "boarding", "in_progress"].includes(trip.trip.status));
  const totalFree = upcoming.reduce((sum, trip) => sum + trip.availableSeats, 0);
  const roads = groupByRoad(trips);

  return (
    <>
      <PageHeader title="Ferry Tracking" subtitle="One card per ferry road. Pick a departure time inside it — a request holds a seat only once the driver accepts." />

      <div className="grid gap-stack-md sm:grid-cols-3">
        <StatTile label="Ferry roads" value={roads.length} tone="ferry" icon={<Bus className="h-4 w-4" />} hint={`${upcoming.length} departure${upcoming.length === 1 ? "" : "s"} coming up`} />
        <StatTile label="Seats free" value={totalFree} tone="ferry" icon={<Users className="h-4 w-4" />} hint="Across all upcoming departures" />
        <StatTile label="My requests" value={trips.filter(trip => trip.ownBooking).length} hint="Pending or confirmed" />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {roads.length === 0 ? (
        <EmptyState title="No departures scheduled" description="The administrator schedules ferry trips; they appear here immediately." />
      ) : (
        <div className="space-y-stack-md">
          {roads.map(road => {
            // The departure being shown. Falls back if the chosen one has gone
            // (a trip can complete while the page is open — it polls).
            const fallback = defaultDeparture(road);
            const trip = road.departures.find(row => row.trip.id === chosen[road.routeId]) ?? fallback;
            const requested = seats[trip.trip.id] ?? 1;
            const own = trip.ownBooking;
            const myDepartures = road.departures.filter(row => row.ownBooking).length;

            return (
              <Card
                key={road.routeId}
                accent="ferry"
                title={road.route.name}
                subtitle={`${road.route.startPoint} → ${road.route.destination} · ${trip.vehicle.plateNumber ?? "ferry"} · driver ${trip.driverName ?? "—"}`}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={trip.trip.status} />
                    <Badge tone="ferry">{kyats(road.route.fareCents)} / seat</Badge>
                  </div>
                }
              >
                {/* ---- the departures of THIS road ---- */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="field-label mb-0 mr-1">
                    {road.departures.length} departure{road.departures.length === 1 ? "" : "s"}
                  </span>
                  {road.departures.map(row => {
                    const active = row.trip.id === trip.trip.id;
                    return (
                      <button
                        key={row.trip.id}
                        type="button"
                        onClick={() => setChosen(current => ({ ...current, [road.routeId]: row.trip.id }))}
                        className={
                          "tabular rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors " +
                          (active
                            ? "border-tertiary bg-tertiary-container text-on-tertiary-container"
                            : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-tertiary hover:text-tertiary")
                        }
                        aria-pressed={active}
                      >
                        {clock(row.trip.departureAt)}
                        <span className="ml-1 font-normal opacity-70">{day(row.trip.departureAt)}</span>
                        {row.ownBooking ? <span className="ml-1" title="You have a request on this departure">•</span> : null}
                      </button>
                    );
                  })}
                  {myDepartures > 0 ? (
                    <span className="text-[12px] text-on-surface-variant">• marks the {myDepartures === 1 ? "departure" : "departures"} you asked for</span>
                  ) : null}
                </div>

                <div className="grid gap-stack-md lg:grid-cols-[220px_1fr]">
                  <div className="space-y-3">
                    <div>
                      <p className="tabular text-[28px] font-bold leading-none text-tertiary">{clock(trip.trip.departureAt)}</p>
                      <p className="text-[12px] text-on-surface-variant">
                        {day(trip.trip.departureAt)} · {relative(trip.trip.departureAt)}
                      </p>
                    </div>
                    <div>
                      <LoadBar percent={trip.loadPercent} />
                      <p className="tabular mt-1 text-[12px] text-on-surface-variant">
                        {trip.occupiedSeats}/{trip.vehicle.totalSeats} seats taken · {trip.pendingSeats} awaiting the driver
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

                    {own ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-tertiary/40 bg-tertiary-container/40 px-3 py-2">
                        <div>
                          <p className="text-[14px] font-semibold text-on-tertiary-container">
                            Your request for {clock(trip.trip.departureAt)}: {own.seatCount} seat{own.seatCount === 1 ? "" : "s"} · {kyats(own.fareCents)}
                          </p>
                          <p className="text-[12px] text-on-tertiary-container/80">
                            {own.status === "pending" ? "Waiting for the driver to accept." : "Confirmed — your seat is held."}
                          </p>
                        </div>
                        <Button variant="ghost" className="h-9" busy={busyTrip === own.id} onClick={() => void cancel(own.id)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="field-label mb-0">Seats</span>
                          <button
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container-high"
                            onClick={() => setSeats(current => ({ ...current, [trip.trip.id]: Math.max(1, requested - 1) }))}
                            aria-label="One seat fewer"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="tabular w-6 text-center font-bold">{requested}</span>
                          <button
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container-high"
                            onClick={() => setSeats(current => ({ ...current, [trip.trip.id]: Math.min(8, requested + 1) }))}
                            aria-label="One seat more"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <Button variant="ferry" busy={busyTrip === trip.trip.id} disabled={!trip.bookable} onClick={() => void book(trip)}>
                          Request {requested} seat{requested === 1 ? "" : "s"} · {kyats(road.route.fareCents * requested)}
                        </Button>
                        {!trip.bookable ? <span className="text-[12px] text-on-surface-variant">This departure is not open for booking.</span> : null}
                      </div>
                    )}

                    <button
                      className="text-[13px] font-semibold text-tertiary underline"
                      onClick={() => setOpenMap(openMap === road.routeId ? null : road.routeId)}
                    >
                      {openMap === road.routeId ? "Hide route map" : "Show route map"}
                    </button>

                    {openMap === road.routeId ? (
                      <RouteMap nodes={road.route.mapNodes ?? []} color={road.route.routeLineColor} mapUrl={road.route.mapUrl} />
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
