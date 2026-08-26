// ===========================================================================
//  admin/TransportOps.tsx — ferry buses, routes, departures, maintenance.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { Bus, CalendarPlus, MapPinned, Plus, Wrench } from "lucide-react";
import { api, ApiError, type DriverRow, type MaintenanceRow, type RouteRow, type TripRow, type VehicleRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { clock, day, kyats } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Modal, Notice, PageHeader, Select, Spinner, StatTile, StatusBadge } from "@/components/ui";

type Bundle = { vehicles: VehicleRow[]; routes: RouteRow[]; trips: TripRow[]; drivers: DriverRow[]; maintenance: MaintenanceRow[] };
type Dialog = "vehicle" | "route" | "trip" | null;

export default function TransportOps() {
  const { data, loading, error, refresh } = useApiData<Bundle>(async () => {
    const [vehicles, routes, trips, drivers, maintenance] = await Promise.all([
      api.get<{ vehicles: VehicleRow[] }>("/transport/vehicles"),
      api.get<{ routes: RouteRow[] }>("/transport/routes"),
      api.get<{ trips: TripRow[] }>("/transport/trips"),
      api.get<{ drivers: DriverRow[] }>("/transport/drivers"),
      api.get<{ maintenance: MaintenanceRow[] }>("/transport/maintenance"),
    ]);
    return { vehicles: vehicles.vehicles, routes: routes.routes, trips: trips.trips, drivers: drivers.drivers, maintenance: maintenance.maintenance };
  }, []);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ferry" | "error"; text: string } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const set = (key: string) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (dialog === "vehicle") {
        await api.post("/transport/vehicles", {
          plateNumber: (form.plateNumber ?? "").trim(),
          vehicleType: (form.vehicleType ?? "Ferry bus").trim(),
          model: (form.model ?? "Unspecified").trim(),
          totalSeats: Math.round(Number(form.totalSeats ?? 18)),
          monthlyFeeCents: form.monthlyFeeCents ? Math.round(Number(form.monthlyFeeCents)) : undefined,
          driverId: form.driverId ? Number(form.driverId) : undefined,
        });
        setMessage({ tone: "ferry", text: "Ferry bus registered." });
      } else if (dialog === "route") {
        await api.post("/transport/routes", {
          name: (form.name ?? "").trim(),
          startPoint: (form.startPoint ?? "").trim(),
          destination: (form.destination ?? "").trim(),
          stops: (form.stops ?? "")
            .split(",")
            .map(stop => stop.trim())
            .filter(Boolean),
          fareCents: Math.round(Number(form.fareCents ?? 0)),
          driverId: form.driverId ? Number(form.driverId) : undefined,
          vehicleId: form.vehicleId ? Number(form.vehicleId) : undefined,
          mapUrl: form.mapUrl?.trim() || undefined,
          distanceKm: form.distanceKm ? Math.round(Number(form.distanceKm)) : undefined,
          estimatedMinutes: form.estimatedMinutes ? Math.round(Number(form.estimatedMinutes)) : undefined,
        });
        setMessage({ tone: "ferry", text: "Route created." });
      } else if (dialog === "trip") {
        await api.post("/transport/trips", {
          routeId: Number(form.routeId),
          driverId: Number(form.driverId),
          vehicleId: Number(form.vehicleId),
          departureAt: new Date(form.departureAt ?? "").toISOString(),
        });
        setMessage({ tone: "ferry", text: "Departure scheduled." });
      }
      setDialog(null);
      setForm({});
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "That did not work." });
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: number, status: "in_progress" | "resolved") {
    setBusy(true);
    try {
      await api.patch(`/transport/maintenance/${id}`, { status });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not update that report." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading transport operations…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const openIssues = data.maintenance.filter(row => row.report.status !== "resolved");

  return (
    <>
      <PageHeader
        title="Transport Ops"
        subtitle="Register the ferry buses, publish routes, and schedule departures."
        actions={
          <>
            <Button variant="ghost" onClick={() => setDialog("vehicle")}>
              <Plus className="h-4 w-4" /> Ferry bus
            </Button>
            <Button variant="ghost" onClick={() => setDialog("route")}>
              <MapPinned className="h-4 w-4" /> Route
            </Button>
            <Button variant="ferry" onClick={() => setDialog("trip")}>
              <CalendarPlus className="h-4 w-4" /> Departure
            </Button>
          </>
        }
      />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Ferry buses" value={data.vehicles.length} tone="ferry" icon={<Bus className="h-4 w-4" />} />
        <StatTile label="Routes" value={data.routes.length} tone="ferry" />
        <StatTile label="Upcoming trips" value={data.trips.filter(trip => ["scheduled", "boarding", "in_progress"].includes(trip.trip.status)).length} />
        <StatTile label="Open issues" value={openIssues.length} tone={openIssues.length ? "error" : "neutral"} icon={<Wrench className="h-4 w-4" />} />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <Card title="Ferry buses">
        {data.vehicles.length === 0 ? (
          <EmptyState title="No ferry buses yet" description="Register one and assign it to a transport agent." action={<Button variant="ferry" onClick={() => setDialog("vehicle")}>Register a ferry bus</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Plate</th>
                  <th>Model</th>
                  <th className="text-right">Seats</th>
                  <th className="text-right">Monthly fee</th>
                  <th>Driver</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.vehicles.map(row => (
                  <tr key={row.vehicle.id}>
                    <td className="tabular font-semibold">{row.vehicle.plateNumber}</td>
                    <td className="text-on-surface-variant">
                      {row.vehicle.vehicleType} · {row.vehicle.model}
                    </td>
                    <td className="tabular text-right">{row.vehicle.totalSeats}</td>
                    <td className="tabular text-right">{kyats(row.vehicle.monthlyFeeCents)}</td>
                    <td>{row.driverName ?? <span className="text-on-surface-variant">unassigned</span>}</td>
                    <td className="space-x-1">
                      <StatusBadge status={row.vehicle.status} />
                      {row.vehicle.maintenanceStatus !== "clear" ? <Badge tone="warning">{row.vehicle.maintenanceStatus.replace("_", " ")}</Badge> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Routes">
        {data.routes.length === 0 ? (
          <EmptyState title="No routes yet" description="A route needs a start, a destination and at least one pickup stop." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Stops</th>
                  <th className="text-right">Fare</th>
                  <th>Driver</th>
                  <th>Map</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.routes.map(row => (
                  <tr key={row.route.id}>
                    <td>
                      <p className="font-semibold text-on-surface">{row.route.name}</p>
                      <p className="text-[12px] text-on-surface-variant">
                        {row.route.startPoint} → {row.route.destination}
                      </p>
                    </td>
                    <td className="max-w-[220px] text-[13px] text-on-surface-variant">{row.stops.map(stop => stop.name).join(", ") || row.route.pickupLocations}</td>
                    <td className="tabular text-right">{kyats(row.route.fareCents)}</td>
                    <td>{row.driverName ?? <span className="text-on-surface-variant">unassigned</span>}</td>
                    <td>{row.mapNodes.length ? <Badge tone="ferry">{row.mapNodes.length} nodes</Badge> : <span className="text-[12px] text-on-surface-variant">not drawn</span>}</td>
                    <td>
                      <StatusBadge status={row.route.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Departures">
        {data.trips.length === 0 ? (
          <EmptyState title="Nothing scheduled" description="Schedule a departure for a route, its driver and its bus." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Route</th>
                  <th>Driver</th>
                  <th className="text-right">Seats</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.trips.map(trip => (
                  <tr key={trip.trip.id}>
                    <td className="tabular whitespace-nowrap">
                      {day(trip.trip.departureAt)} {clock(trip.trip.departureAt)}
                    </td>
                    <td>{trip.route.name}</td>
                    <td>{trip.driverName ?? "—"}</td>
                    <td className="tabular text-right">
                      {trip.occupiedSeats}/{trip.vehicle.totalSeats}
                      {trip.pendingSeats ? <span className="text-on-surface-variant"> (+{trip.pendingSeats})</span> : null}
                    </td>
                    <td>
                      <StatusBadge status={trip.trip.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Maintenance reports" accent={openIssues.length ? "error" : undefined}>
        {data.maintenance.length === 0 ? (
          <EmptyState title="Nothing reported" description="Transport agents report mechanical problems from their console." />
        ) : (
          <div className="space-y-3">
            {data.maintenance.map(row => (
              <div key={row.report.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-outline-variant px-3 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-on-surface">
                    {row.plateNumber} · {row.driverName ?? "driver"}
                  </p>
                  <p className="text-[13px] text-on-surface-variant">{row.report.issue}</p>
                  {row.report.resolutionNote ? <p className="text-[12px] text-secondary">Resolution: {row.report.resolutionNote}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={row.report.status} />
                  {row.report.status !== "resolved" ? (
                    <>
                      {row.report.status === "reported" ? (
                        <Button variant="ghost" className="h-9" disabled={busy} onClick={() => void resolve(row.report.id, "in_progress")}>
                          In service
                        </Button>
                      ) : null}
                      <Button variant="ferry" className="h-9" disabled={busy} onClick={() => void resolve(row.report.id, "resolved")}>
                        Resolve
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------------- dialogs ---------------- */}
      {dialog ? (
        <Modal
          title={dialog === "vehicle" ? "Register a ferry bus" : dialog === "route" ? "Create a route" : "Schedule a departure"}
          onClose={() => {
            setDialog(null);
            setForm({});
          }}
        >
          <form className="space-y-4" onSubmit={submit}>
            {dialog === "vehicle" ? (
              <>
                <Field label="Plate number">
                  <Input value={form.plateNumber ?? ""} onChange={set("plateNumber")} required placeholder="YGN-FERRY-02" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Type">
                    <Input value={form.vehicleType ?? "Ferry bus"} onChange={set("vehicleType")} required />
                  </Field>
                  <Field label="Model">
                    <Input value={form.model ?? ""} onChange={set("model")} required placeholder="Hino Rainbow" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Seats">
                    <Input type="number" min={1} max={200} value={form.totalSeats ?? "18"} onChange={set("totalSeats")} required />
                  </Field>
                  <Field label="Monthly fee (kyat)">
                    <Input type="number" min={0} step={1000} value={form.monthlyFeeCents ?? "45000"} onChange={set("monthlyFeeCents")} />
                  </Field>
                </div>
                <Field label="Assign to transport agent">
                  <Select value={form.driverId ?? ""} onChange={set("driverId")}>
                    <option value="">Unassigned</option>
                    {data.drivers.map(driver => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name ?? driver.username}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : null}

            {dialog === "route" ? (
              <>
                <Field label="Route name">
                  <Input value={form.name ?? ""} onChange={set("name")} required placeholder="South Gate Ferry" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Start point">
                    <Input value={form.startPoint ?? ""} onChange={set("startPoint")} required placeholder="Main Gate" />
                  </Field>
                  <Field label="Destination">
                    <Input value={form.destination ?? ""} onChange={set("destination")} required placeholder="South Hall" />
                  </Field>
                </div>
                <Field label="Pickup stops" hint="Separate with commas.">
                  <Input value={form.stops ?? ""} onChange={set("stops")} required placeholder="Library, Science Block" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Fare per seat (kyat)">
                    <Input type="number" min={1} step={100} value={form.fareCents ?? ""} onChange={set("fareCents")} required placeholder="1500" />
                  </Field>
                  <Field label="Google Maps link (optional)">
                    <Input value={form.mapUrl ?? ""} onChange={set("mapUrl")} placeholder="https://maps.google.com/?q=…" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Transport agent">
                    <Select value={form.driverId ?? ""} onChange={set("driverId")}>
                      <option value="">Unassigned</option>
                      {data.drivers.map(driver => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name ?? driver.username}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Ferry bus">
                    <Select value={form.vehicleId ?? ""} onChange={set("vehicleId")}>
                      <option value="">Unassigned</option>
                      {data.vehicles.map(row => (
                        <option key={row.vehicle.id} value={row.vehicle.id}>
                          {row.vehicle.plateNumber} ({row.vehicle.totalSeats} seats)
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </>
            ) : null}

            {dialog === "trip" ? (
              <>
                <Field label="Route">
                  <Select value={form.routeId ?? ""} onChange={set("routeId")} required>
                    <option value="">Choose a route…</option>
                    {data.routes.map(row => (
                      <option key={row.route.id} value={row.route.id}>
                        {row.route.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Transport agent">
                    <Select value={form.driverId ?? ""} onChange={set("driverId")} required>
                      <option value="">Choose…</option>
                      {data.drivers.map(driver => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name ?? driver.username}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Ferry bus" hint="Must already be assigned to that agent.">
                    <Select value={form.vehicleId ?? ""} onChange={set("vehicleId")} required>
                      <option value="">Choose…</option>
                      {data.vehicles.map(row => (
                        <option key={row.vehicle.id} value={row.vehicle.id}>
                          {row.vehicle.plateNumber}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Departure time" hint="Must be in the future.">
                  <Input type="datetime-local" value={form.departureAt ?? ""} onChange={set("departureAt")} required />
                </Field>
              </>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDialog(null);
                  setForm({});
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="ferry" busy={busy}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
