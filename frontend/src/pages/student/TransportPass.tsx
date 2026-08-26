// ===========================================================================
//  student/TransportPass.tsx — the boarding passes for confirmed seats.
//  A confirmed booking prints as a pass with a scannable-looking code built
//  from the booking id; a pending one shows as awaiting the driver.
// ===========================================================================

import { Bus, Ticket } from "lucide-react";
import { api, type BookingRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { clock, day, kyats } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorNote, PageHeader, Spinner, StatTile, StatusBadge } from "@/components/ui";

/** A deterministic block pattern from the booking id — a stand-in for a QR. */
function PassCode({ id }: { id: number }) {
  const cells = Array.from({ length: 36 }, (_, index) => ((id * 7 + index * 13) % 5 < 2 ? 1 : 0));
  return (
    <div className="grid w-[92px] shrink-0 grid-cols-6 gap-[2px] rounded-md bg-surface-container-lowest p-2">
      {cells.map((cell, index) => (
        <span key={index} className={`aspect-square rounded-[1px] ${cell ? "bg-on-surface" : "bg-surface-container-high"}`} />
      ))}
    </div>
  );
}

export default function TransportPass() {
  const { data, loading, error, refresh } = useApiData<BookingRow[]>(
    async () => (await api.get<{ bookings: BookingRow[] }>("/transport/bookings")).bookings,
    [],
  );

  if (loading) return <Spinner label="Loading your passes…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;

  const bookings = data ?? [];
  const confirmed = bookings.filter(row => row.booking.status === "confirmed");
  const pending = bookings.filter(row => row.booking.status === "pending");
  const seats = confirmed.reduce((sum, row) => sum + row.booking.seatCount, 0);

  return (
    <>
      <PageHeader title="Transport Pass" subtitle="Show a confirmed pass to the driver when you board." />

      <div className="grid gap-stack-md sm:grid-cols-3">
        <StatTile label="Confirmed" value={confirmed.length} tone="ferry" icon={<Ticket className="h-4 w-4" />} hint={`${seats} seat(s) held`} />
        <StatTile label="Awaiting driver" value={pending.length} tone="warning" />
        <StatTile label="Fares" value={kyats(confirmed.reduce((sum, row) => sum + row.booking.fareCents, 0))} hint="Confirmed bookings" />
      </div>

      {bookings.length === 0 ? (
        <EmptyState title="No passes yet" description="Request a seat from Ferry Tracking; once the driver accepts it, the pass appears here." />
      ) : (
        <div className="grid gap-stack-md sm:grid-cols-2">
          {bookings.map(row => (
            <Card
              key={row.booking.id}
              accent={row.booking.status === "confirmed" ? "ferry" : undefined}
              title={row.route?.name ?? "Ferry trip"}
              subtitle={row.route ? `${row.route.startPoint} → ${row.route.destination}` : undefined}
              actions={<StatusBadge status={row.booking.status} />}
            >
              <div className="flex items-start gap-4">
                <PassCode id={row.booking.id} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="tabular text-[20px] font-bold text-on-surface">{clock(row.trip?.departureAt)}</p>
                  <p className="text-[12px] text-on-surface-variant">{day(row.trip?.departureAt)}</p>
                  <p className="tabular text-[13px] text-on-surface-variant">
                    Pass BG-{String(row.booking.id).padStart(5, "0")} · {row.booking.seatCount} seat{row.booking.seatCount === 1 ? "" : "s"}
                    {row.booking.seatNumber ? ` · seat ${row.booking.seatNumber}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge tone="ferry">{kyats(row.booking.fareCents)}</Badge>
                    {row.trip ? (
                      <Badge tone="neutral">
                        <Bus className="h-3.5 w-3.5" /> {row.trip.status.replace("_", " ")}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              {row.booking.status === "pending" ? (
                <p className="mt-3 rounded-lg bg-warning-container px-3 py-2 text-[12px] text-on-warning-container">
                  This pass is not valid yet — the driver has to accept the request first.
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
