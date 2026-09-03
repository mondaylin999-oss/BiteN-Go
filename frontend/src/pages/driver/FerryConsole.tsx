// ===========================================================================
//  driver/FerryConsole.tsx — the transport agent's own screen.
//
//  The agent owns the ferry outright: the bus, the road's two daily times, the
//  seats they accept, the departures they run and the problems they report.
//  The office only opens and closes accounts.
//
//  Seats are sold BY THE MONTH. Accepting a request is also when the money
//  moves — the month's fare leaves the student's wallet at that moment.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { Bus, CalendarPlus, CheckCircle2, Clock, Users, Wrench, X, XCircle } from "lucide-react";
import { api, ApiError, type DriverDashboard, type RoadRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats, monthName, monthShort } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner, StatTile, StatusBadge, Textarea } from "@/components/ui";

type Payload = { dashboard: DriverDashboard; roads: RoadRow[]; months: string[] };

export default function FerryConsole() {
  const { data, loading, error, refresh } = useApiData<Payload>(
    async () => {
      const [dashboard, roads] = await Promise.all([
        api.get<DriverDashboard>("/transport/driver/dashboard"),
        api.get<{ months: string[]; roads: RoadRow[] }>("/transport/roads"),
      ]);
      return { dashboard, roads: roads.roads, months: roads.months };
    },
    [],
    { pollMs: 20_000 },
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ferry" | "error"; text: string } | null>(null);
  const [seats, setSeats] = useState("");
  const [issue, setIssue] = useState("");
  const [availability, setAvailability] = useState<"available" | "unavailable">("available");
  const [bus, setBus] = useState({ plateNumber: "", model: "", totalSeats: "18", monthlyFeeCents: "45000" });
  const [table, setTable] = useState({ routeId: "", month: "", times: "05:05, 16:30" });

  async function act(key: string, action: () => Promise<unknown>, successText?: string) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      if (successText) setMessage({ tone: "ferry", text: successText });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "That did not work." });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="Loading your ferry…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const dashboard = data.dashboard;
  const vehicle = dashboard.vehicle?.vehicle;
  const myRoads = data.roads.filter(road => dashboard.routes.some(mine => mine.route.id === road.route.id));
  const openMaintenance = dashboard.maintenance.filter(row => row.report.status !== "resolved");
  const thisMonth = data.months[0] ?? "";
  const soldThisMonth = myRoads.reduce((sum, road) => sum + (road.months.find(entry => entry.month === thisMonth)?.occupiedSeats ?? 0), 0);

  return (
    <>
      <PageHeader
        title="My Ferry"
        subtitle={vehicle ? `${vehicle.plateNumber} · ${vehicle.model} · ${vehicle.totalSeats} seats` : "Register your ferry bus to get started."}
        actions={
          <Select
            className="h-9 w-[190px]"
            value={dashboard.profile?.profile.availability ?? availability}
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
        <StatTile label={`Seats sold · ${monthShort(thisMonth)}`} value={soldThisMonth} tone="ferry" icon={<Users className="h-4 w-4" />} />
        <StatTile
          label="Waiting requests"
          value={dashboard.pendingBookings.length}
          tone={dashboard.pendingBookings.length ? "warning" : "neutral"}
          icon={<Users className="h-4 w-4" />}
          hint="Waiting for you"
        />
        <StatTile
          label="Seats left this month"
          value={myRoads.reduce((sum, road) => sum + (road.months.find(entry => entry.month === thisMonth)?.availableSeats ?? 0), 0)}
          tone="ferry"
          icon={<Bus className="h-4 w-4" />}
        />
        <StatTile label="Open problems" value={openMaintenance.length} tone={openMaintenance.length ? "error" : "neutral"} icon={<Wrench className="h-4 w-4" />} />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {/* Students pay the agent directly, so a missing phone number means
          nobody can pay — worth saying loudly. */}
      {!dashboard.profile?.profile.phone ? (
        <Notice tone="warning">
          Put your phone number on your Profile. Students ring it to send you the monthly fare — without it they cannot pay you, and the
          seat requests will just sit here waiting.
        </Notice>
      ) : null}

      {/* ---------- register the bus, if there is none yet ---------- */}
      {!vehicle ? (
        <Card title="Register your ferry bus" subtitle="One bus per agent. Everything else — roads, timetables, seats — hangs off it." accent="ferry">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void act(
                "bus",
                () =>
                  api.post("/transport/driver/vehicle", {
                    plateNumber: bus.plateNumber.trim(),
                    model: bus.model.trim() || undefined,
                    totalSeats: Math.round(Number(bus.totalSeats)),
                    monthlyFeeCents: Math.round(Number(bus.monthlyFeeCents)) || undefined,
                  }),
                "Ferry bus registered.",
              );
            }}
          >
            <Field label="Plate number">
              <Input value={bus.plateNumber} onChange={event => setBus({ ...bus, plateNumber: event.target.value })} required minLength={2} placeholder="YGN-FERRY-02" />
            </Field>
            <Field label="Model">
              <Input value={bus.model} onChange={event => setBus({ ...bus, model: event.target.value })} placeholder="Hino Rainbow" />
            </Field>
            <Field label="Seats">
              <Input type="number" min={1} max={200} step={1} value={bus.totalSeats} onChange={event => setBus({ ...bus, totalSeats: event.target.value })} required />
            </Field>
            <Field label="What the bus costs you a month (kyat)" hint="Kept for your own record.">
              <Input type="number" min={0} step={1} value={bus.monthlyFeeCents} onChange={event => setBus({ ...bus, monthlyFeeCents: event.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="ferry" busy={busy === "bus"}>
                <Bus className="h-4 w-4" /> Register the bus
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {/* ---------- monthly seat requests ---------- */}
      <Card title="Seat requests" subtitle="A request holds no seat until you accept it. Take the fare from the student yourself — by phone, the way you always do — then accept." accent="ferry">
        {dashboard.pendingBookings.length === 0 ? (
          <EmptyState title="Nothing waiting" description="New requests appear here within 20 seconds." />
        ) : (
          <div className="space-y-3">
            {dashboard.pendingBookings.map(row => (
              <div key={row.pass.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-outline-variant px-3 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-on-surface">
                    {row.passengerName ?? row.passengerUsername ?? "Student"} · {row.pass.seatCount} seat{row.pass.seatCount === 1 ? "" : "s"}
                  </p>
                  <p className="tabular text-[12px] text-on-surface-variant">
                    {monthName(row.pass.month)} · {row.route?.name ?? "road"} · {kyats(row.pass.fareCents)} for the month
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ferry"
                    className="h-9"
                    busy={busy === `seat-${row.pass.id}`}
                    onClick={() => void act(`seat-${row.pass.id}`, () => api.patch(`/transport/driver/seats/${row.pass.id}`, { status: "confirmed" }), "Seat accepted and the fare collected.")}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Accept
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-9"
                    busy={busy === `seat-${row.pass.id}`}
                    onClick={() => void act(`seat-${row.pass.id}`, () => api.patch(`/transport/driver/seats/${row.pass.id}`, { status: "cancelled" }), "Request refused.")}
                  >
                    <XCircle className="h-4 w-4" /> Refuse
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------- the month, road by road ---------- */}
      <Card
        title="My roads, month by month"
        subtitle="How many seats are sold in each month you are selling. Remove a month from either end to shorten the list."
      >
        {myRoads.length === 0 ? (
          <EmptyState title="No road yet" description="Open your road in Road & Map — the fee, the two daily times and the months you sell all live there." />
        ) : (
          <div className="space-y-4">
            {myRoads.map(road => (
              <div key={road.route.id} className="rounded-lg border border-outline-variant p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-semibold text-on-surface">{road.route.name}</p>
                    <p className="tabular text-[12px] text-on-surface-variant">
                      Every day · {road.route.morningTime}
                      {road.route.eveningTime ? ` out, ${road.route.eveningTime} back` : ""}
                    </p>
                  </div>
                  <Badge tone="ferry">{kyats(road.route.fareCents)} / seat / month</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {road.months.map((month, index) => {
                    // A road is sold as a run of months, so a month can be
                    // taken off sale from either END of that run. Showing the
                    // × only there means the agent never meets the refusal.
                    const atAnEnd = index === 0 || index === road.months.length - 1;
                    const held = month.occupiedSeats + month.pendingSeats;
                    const canRemove = atAnEnd && held === 0;

                    return (
                      <div key={month.month} className="relative rounded-lg bg-surface-container-low px-3 py-2">
                        {canRemove ? (
                          <button
                            type="button"
                            className="absolute right-1.5 top-1.5 rounded-full p-1 text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
                            aria-label={`Stop selling ${monthName(month.month)}`}
                            title={`Stop selling ${monthName(month.month)}`}
                            disabled={busy === `month-${road.route.id}-${month.month}`}
                            onClick={() =>
                              void act(
                                `month-${road.route.id}-${month.month}`,
                                () => api.delete(`/transport/driver/routes/${road.route.id}/months/${month.month}`),
                                `${monthName(month.month)} is no longer on sale.`,
                              )
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}

                        <p className="pr-6 text-[13px] font-semibold text-on-surface">{monthName(month.month)}</p>
                        <p className="tabular text-[12px] text-on-surface-variant">
                          {month.occupiedSeats}/{month.totalSeats} sold
                          {month.pendingSeats ? ` · ${month.pendingSeats} waiting` : ""}
                        </p>
                        <p className="tabular text-[12px] font-semibold text-tertiary">{kyats(month.occupiedSeats * road.route.fareCents)} taken</p>

                        {atAnEnd && held > 0 ? (
                          <p className="mt-1 text-[11px] text-on-surface-variant">Seats are taken — cancel them to remove this month.</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------- capacity ---------- */}
      <Card title="Seats on the bus" subtitle="Cannot go below what students have already paid for.">
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!vehicle) return;
            void act("capacity", () => api.patch("/transport/driver/vehicle-capacity", { vehicleId: vehicle.id, totalSeats: Math.round(Number(seats)) }), "Seat count updated.");
          }}
        >
          <Field label="Total seats" hint={vehicle ? `Currently ${vehicle.totalSeats}` : undefined} className="w-[160px]">
            <Input type="number" min={1} max={200} step={1} value={seats} onChange={event => setSeats(event.target.value)} placeholder={String(vehicle?.totalSeats ?? 18)} required />
          </Field>
          <Button type="submit" variant="ferry" busy={busy === "capacity"} disabled={!vehicle}>
            Update the seat count
          </Button>
        </form>
      </Card>

      {/* ---------- maintenance ---------- */}
      <Card title="Problems with the bus" subtitle="Report one and the bus is marked out of service until you close it off.">
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!vehicle) return;
            void act("issue", () => api.post("/transport/driver/maintenance", { vehicleId: vehicle.id, issue: issue.trim() }), "Problem reported.").then(() => setIssue(""));
          }}
        >
          <Field label="What is wrong?">
            <Textarea value={issue} onChange={event => setIssue(event.target.value)} minLength={4} maxLength={2000} required placeholder="Front left tyre losing pressure." />
          </Field>
          <Button type="submit" variant="ghost" busy={busy === "issue"} disabled={!vehicle}>
            <Wrench className="h-4 w-4" /> Report
          </Button>
        </form>

        {dashboard.maintenance.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-outline-variant pt-3">
            {dashboard.maintenance.slice(0, 6).map(row => (
              <li key={row.report.id} className="flex flex-wrap items-start justify-between gap-3 text-[13px]">
                <span className="min-w-0 flex-1 text-on-surface-variant">{row.report.issue}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={row.report.status === "resolved" ? "canteen" : row.report.status === "in_progress" ? "ferry" : "warning"}>{row.report.status.replace("_", " ")}</Badge>
                  {row.report.status !== "resolved" ? (
                    <Button
                      variant="ghost"
                      className="h-8"
                      busy={busy === `fix-${row.report.id}`}
                      onClick={() => void act(`fix-${row.report.id}`, () => api.patch(`/transport/driver/maintenance/${row.report.id}`, { status: "resolved" }), "Bus back in service.")}
                    >
                      Fixed
                    </Button>
                  ) : null}find . -mindepth 1 -maxdepth 1 ! -name ".git" -exec rm -rf {} +
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
