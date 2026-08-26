// ===========================================================================
//  driver/FerryConsole.tsx — the transport agent's screen.
//
//  Accept or reject seat requests, move a trip through its states, resize the
//  bus (never below the seats already confirmed — the C++ engine computes that
//  floor), and report a mechanical problem to the administrator.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { Bus, CheckCircle2, Users, Wrench, XCircle } from "lucide-react";
import { api, ApiError, type DriverDashboard } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { clock, day, kyats, relative } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner, StatTile, StatusBadge, Textarea } from "@/components/ui";

const NEXT_TRIP_STATUS: Record<string, Array<"boarding" | "in_progress" | "completed" | "cancelled">> = {
  scheduled: ["boarding", "cancelled"],
  boarding: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
};

export default function FerryConsole() {
  const { data, loading, error, refresh } = useApiData<DriverDashboard>(() => api.get<DriverDashboard>("/transport/driver/dashboard"), [], { pollMs: 20_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ferry" | "error"; text: string } | null>(null);
  const [seats, setSeats] = useState("");
  const [issue, setIssue] = useState("");
  const [availability, setAvailability] = useState<"available" | "unavailable">("available");

  async function act(key: string, action: () => Promise<unknown>, successText?: string) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      if (successText) setMessage({ tone: "ferry", text: successText });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "That action did not work." });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="Loading your ferry console…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const vehicle = data.vehicle?.vehicle;
  const activeTrips = data.trips.filter(trip => ["scheduled", "boarding", "in_progress"].includes(trip.trip.status));
  const openMaintenance = data.maintenance.filter(row => row.report.status !== "resolved");

  return (
    <>
      <PageHeader
        title="Ferry Console"
        subtitle={vehicle ? `${vehicle.plateNumber} · ${vehicle.model} · ${vehicle.totalSeats} seats` : "No ferry bus is assigned to you yet."}
        actions={
          <Select
            className="h-9 w-[190px]"
            value={data.profile?.profile.availability ?? availability}
            onChange={event => {
              const next = event.target.value as "available" | "unavailable";
              setAvailability(next);
              void act("availability", () => api.patch("/transport/driver/profile", { availability: next }), `You are now ${next}.`);
            }}
          >
            <option value="available">I am available</option>
            <option value="unavailable">Not available</option>
          </Select>
        }
      />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active trips" value={activeTrips.length} tone="ferry" icon={<Bus className="h-4 w-4" />} />
        <StatTile label="Seat requests" value={data.pendingBookings.length} tone={data.pendingBookings.length ? "warning" : "neutral"} icon={<Users className="h-4 w-4" />} hint="Waiting for you" />
        <StatTile label="Confirmed seats" value={data.confirmedBookings} tone="ferry" />
        <StatTile label="Open issues" value={openMaintenance.length} tone={openMaintenance.length ? "error" : "neutral"} icon={<Wrench className="h-4 w-4" />} />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {!vehicle ? <Notice tone="warning">Ask the administrator to assign a ferry bus to your account — trips and requests need one.</Notice> : null}

      {/* ---------- seat requests ---------- */}
      <Card title="Seat requests" subtitle="A request holds no seat until you accept it." accent="ferry">
        {data.pendingBookings.length === 0 ? (
          <EmptyState title="Nothing waiting" description="New student requests appear here within 20 seconds." />
        ) : (
          <div className="space-y-3">
            {data.pendingBookings.map(row => (
              <div key={row.booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant px-3 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-on-surface">
                    {row.passengerName ?? row.passengerUsername ?? "Student"} · {row.booking.seatCount} seat{row.booking.seatCount === 1 ? "" : "s"}
                  </p>
                  <p className="tabular text-[12px] text-on-surface-variant">
                    {row.trip ? `${day(row.trip.departureAt)} ${clock(row.trip.departureAt)} · ${relative(row.trip.departureAt)}` : "Trip removed"} · {kyats(row.booking.fareCents)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ferry"
                    className="h-9"
                    busy={busy === `booking-${row.booking.id}`}
                    onClick={() =>
                      void act(`booking-${row.booking.id}`, () => api.patch(`/transport/driver/bookings/${row.booking.id}`, { status: "confirmed" }), "Seat confirmed.")
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" /> Accept
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-9"
                    busy={busy === `booking-${row.booking.id}`}
                    onClick={() =>
                      void act(`booking-${row.booking.id}`, () => api.patch(`/transport/driver/bookings/${row.booking.id}`, { status: "cancelled" }), "Request rejected.")
                    }
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------- trips ---------- */}
      <Card title="My trips">
        {data.trips.length === 0 ? (
          <EmptyState title="No trips scheduled" description="The administrator schedules departures for your route." />
        ) : (
          <div className="space-y-3">
            {data.trips.map(trip => (
              <div key={trip.trip.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant px-3 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-on-surface">{trip.route.name}</p>
                  <p className="tabular text-[12px] text-on-surface-variant">
                    {day(trip.trip.departureAt)} {clock(trip.trip.departureAt)} · {trip.occupiedSeats}/{trip.vehicle.totalSeats} seats · {trip.pendingSeats} pending
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={trip.trip.status} />
                  {(NEXT_TRIP_STATUS[trip.trip.status] ?? []).map(next => (
                    <Button
                      key={next}
                      variant={next === "cancelled" ? "ghost" : "ferry"}
                      className="h-9"
                      busy={busy === `trip-${trip.trip.id}`}
                      onClick={() =>
                        void act(`trip-${trip.trip.id}`, () => api.patch(`/transport/driver/trips/${trip.trip.id}/status`, { status: next }), `Trip is now ${next.replace("_", " ")}.`)
                      }
                    >
                      {next.replace("_", " ")}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-stack-md lg:grid-cols-2">
        {/* ---------- capacity ---------- */}
        <Card title="Seat capacity" subtitle="Cannot go below the seats you have already confirmed.">
          <form
            className="space-y-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (!vehicle) return;
              void act(
                "capacity",
                () => api.patch("/transport/driver/vehicle-capacity", { vehicleId: vehicle.id, totalSeats: Math.round(Number(seats)) }),
                "Capacity updated.",
              );
            }}
          >
            <Field label="Total seats" hint={vehicle ? `Currently ${vehicle.totalSeats}` : undefined}>
              <Input type="number" min={1} max={200} value={seats} onChange={event => setSeats(event.target.value)} placeholder={String(vehicle?.totalSeats ?? 18)} required />
            </Field>
            <Button type="submit" variant="ferry" busy={busy === "capacity"} disabled={!vehicle}>
              Update capacity
            </Button>
          </form>
        </Card>

        {/* ---------- maintenance ---------- */}
        <Card title="Report a problem" subtitle="Goes straight to the administrator; the bus is marked under maintenance.">
          <form
            className="space-y-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (!vehicle) return;
              void act("issue", () => api.post("/transport/driver/maintenance", { vehicleId: vehicle.id, issue: issue.trim() }), "Issue reported.").then(() => setIssue(""));
            }}
          >
            <Field label="What is wrong?">
              <Textarea value={issue} onChange={event => setIssue(event.target.value)} minLength={4} maxLength={2000} required placeholder="Front left tyre losing pressure." />
            </Field>
            <Button type="submit" variant="ghost" busy={busy === "issue"} disabled={!vehicle}>
              <Wrench className="h-4 w-4" /> Report
            </Button>
          </form>

          {data.maintenance.length > 0 ? (
            <ul className="mt-4 space-y-2 border-t border-outline-variant pt-3">
              {data.maintenance.slice(0, 4).map(row => (
                <li key={row.report.id} className="flex items-start justify-between gap-3 text-[13px]">
                  <span className="min-w-0 flex-1 text-on-surface-variant">{row.report.issue}</span>
                  <Badge tone={row.report.status === "resolved" ? "canteen" : row.report.status === "in_progress" ? "ferry" : "warning"}>{row.report.status.replace("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    </>
  );
}
