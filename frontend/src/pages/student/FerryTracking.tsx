// ===========================================================================
//  student/FerryTracking.tsx — the Ferry Live Tracking screen.
//
//  Departures, seat load, the published route line, and the seat request the
//  driver has to accept. Seats free / bookable come from the C++ seat planner.
// ===========================================================================

import { useState } from "react";
import { Bus, MapPin, Minus, Plus, Users } from "lucide-react";
import { api, ApiError, type TripRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { clock, day, kyats, relative } from "@/lib/format";
import { RouteMap } from "@/components/RouteMap";
import { Badge, Button, Card, EmptyState, ErrorNote, LoadBar, Notice, PageHeader, Spinner, StatTile, StatusBadge } from "@/components/ui";

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

  return (
    <>
      <PageHeader title="Ferry Tracking" subtitle="Live seat counts. A request holds a seat only once the driver accepts it." />

      <div className="grid gap-stack-md sm:grid-cols-3">
        <StatTile label="Upcoming trips" value={upcoming.length} tone="ferry" icon={<Bus className="h-4 w-4" />} />
        <StatTile label="Seats free" value={totalFree} tone="ferry" icon={<Users className="h-4 w-4" />} hint="Across all upcoming departures" />
        <StatTile label="My requests" value={trips.filter(trip => trip.ownBooking).length} hint="Pending or confirmed" />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {trips.length === 0 ? (
        <EmptyState title="No departures scheduled" description="The administrator schedules ferry trips; they appear here immediately." />
      ) : (
        <div className="space-y-stack-md">
          {trips.map(trip => {
            const requested = seats[trip.trip.id] ?? 1;
            const own = trip.ownBooking;
            return (
              <Card
                key={trip.trip.id}
                accent="ferry"
                title={trip.route.name}
                subtitle={`${trip.route.startPoint} → ${trip.route.destination} · ${trip.vehicle.plateNumber ?? "ferry"} · driver ${trip.driverName ?? "—"}`}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={trip.trip.status} />
                    <Badge tone="ferry">{kyats(trip.route.fareCents)} / seat</Badge>
                  </div>
                }
              >
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
                    {trip.route.estimatedMinutes ? (
                      <p className="text-[12px] text-on-surface-variant">
                        About {trip.route.estimatedMinutes} min{trip.route.distanceKm ? ` · ${trip.route.distanceKm} km` : ""}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-on-surface-variant">
                      <MapPin className="h-4 w-4 text-tertiary" />
                      <span>{trip.route.pickupLocations}</span>
                    </div>

                    {own ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-tertiary/40 bg-tertiary-container/40 px-3 py-2">
                        <div>
                          <p className="text-[14px] font-semibold text-on-tertiary-container">
                            Your request: {own.seatCount} seat{own.seatCount === 1 ? "" : "s"} · {kyats(own.fareCents)}
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
                          Request {requested} seat{requested === 1 ? "" : "s"} · {kyats(trip.route.fareCents * requested)}
                        </Button>
                        {!trip.bookable ? <span className="text-[12px] text-on-surface-variant">This departure is not open for booking.</span> : null}
                      </div>
                    )}

                    <button
                      className="text-[13px] font-semibold text-tertiary underline"
                      onClick={() => setOpenMap(openMap === trip.trip.id ? null : trip.trip.id)}
                    >
                      {openMap === trip.trip.id ? "Hide route map" : "Show route map"}
                    </button>

                    {openMap === trip.trip.id ? (
                      <RouteMap nodes={trip.route.mapNodes ?? []} color={trip.route.routeLineColor} mapUrl={trip.route.mapUrl} />
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
