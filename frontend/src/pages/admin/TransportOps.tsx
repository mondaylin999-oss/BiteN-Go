// ===========================================================================
//  admin/TransportOps.tsx — what the transport agents are running.
//
//  READ ONLY. The office opens and closes accounts (People) and watches the
//  ferry from here; the buses, the roads, the monthly timetables and the seats
//  belong to the transport agents themselves.
// ===========================================================================

import { Bus, Wrench } from "lucide-react";
import { api, type DriverRow, type MaintenanceRow, type RouteRow, type TripRow, type VehicleRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { clock, day, kyats } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorNote, PageHeader, Spinner, StatTile, StatusBadge } from "@/components/ui";

type Bundle = { vehicles: VehicleRow[]; routes: RouteRow[]; trips: TripRow[]; drivers: DriverRow[]; maintenance: MaintenanceRow[] };

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

  if (loading) return <Spinner label="Loading transport operations…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const openIssues = data.maintenance.filter(row => row.report.status !== "resolved");

  return (
    <>
      <PageHeader
        title="Transport"
        subtitle="What the transport agents are running. The office opens and closes accounts; the agents own their own buses, roads, timetables and seats."
      />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Ferry buses" value={data.vehicles.length} tone="ferry" icon={<Bus className="h-4 w-4" />} />
        <StatTile label="Roads" value={data.routes.length} tone="ferry" />
        <StatTile label="Departures to come" value={data.trips.filter(trip => ["scheduled", "boarding", "in_progress"].includes(trip.trip.status)).length} />
        <StatTile label="Open issues" value={openIssues.length} tone={openIssues.length ? "error" : "neutral"} icon={<Wrench className="h-4 w-4" />} />
      </div>

      
      <Card title="Ferry buses">
        {data.vehicles.length === 0 ? (
          <EmptyState title="No ferry buses yet" description="A transport agent registers their own bus from their screen." />
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
          <EmptyState title="Nothing scheduled" description="Transport agents publish a timetable for the month; the departures show up here." />
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
          <EmptyState title="Nothing reported" description="Transport agents report and close off problems from their own screen." />
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
                <StatusBadge status={row.report.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

    </>
  );
}
