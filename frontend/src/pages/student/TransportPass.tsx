// ===========================================================================
//  student/TransportPass.tsx — the monthly ferry passes.
//
//  An accepted seat prints as a pass for the whole month, with a code built
//  from the seat id; one still waiting shows as awaiting the transport agent.
// ===========================================================================

import { Bus, Ticket } from "lucide-react";
import { api, type SeatRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats, monthName } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorNote, PageHeader, Spinner, StatTile, StatusBadge } from "@/components/ui";

/** A deterministic block pattern from the pass id — a stand-in for a QR. */
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
  const { data, loading, error, refresh } = useApiData<SeatRow[]>(async () => (await api.get<{ seats: SeatRow[] }>("/transport/seats")).seats, []);

  if (loading) return <Spinner label="Loading your passes…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;

  const passes = (data ?? []).filter(row => row.pass.status !== "cancelled");
  const confirmed = passes.filter(row => row.pass.status === "confirmed");
  const pending = passes.filter(row => row.pass.status === "pending");
  const seats = confirmed.reduce((sum, row) => sum + row.pass.seatCount, 0);

  return (
    <>
      <PageHeader title="Ferry Pass" subtitle="One pass per month. Show it to the transport agent when you board — it is good for every departure of that month." />

      <div className="grid gap-stack-md sm:grid-cols-3">
        <StatTile label="Confirmed" value={confirmed.length} tone="ferry" icon={<Ticket className="h-4 w-4" />} hint={`${seats} seat(s) held`} />
        <StatTile label="Waiting" value={pending.length} tone="warning" hint="The transport agent has not accepted these yet" />
        <StatTile label="Paid" value={kyats(confirmed.reduce((sum, row) => sum + row.pass.fareCents, 0))} hint="Across the months you hold" />
      </div>

      {passes.length === 0 ? (
        <EmptyState title="No passes yet" description="Ask for a month on the Ferry screen; once the transport agent accepts it, the pass appears here." />
      ) : (
        <div className="grid gap-stack-md sm:grid-cols-2">
          {passes.map(row => (
            <Card
              key={row.pass.id}
              accent={row.pass.status === "confirmed" ? "ferry" : undefined}
              title={row.route?.name ?? "Ferry road"}
              subtitle={row.route ? `${row.route.startPoint} → ${row.route.destination}` : undefined}
              actions={<StatusBadge status={row.pass.status} />}
            >
              <div className="flex items-start gap-4">
                <PassCode id={row.pass.id} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[20px] font-bold text-on-surface">{monthName(row.pass.month)}</p>
                  <p className="text-[12px] text-on-surface-variant">Good for every departure of the month</p>
                  <p className="tabular text-[13px] text-on-surface-variant">
                    Pass BG-{String(row.pass.id).padStart(5, "0")} · {row.pass.seatCount} seat{row.pass.seatCount === 1 ? "" : "s"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge tone="ferry">{kyats(row.pass.fareCents)} for the month</Badge>
                    <Badge tone="neutral">
                      <Bus className="h-3.5 w-3.5" /> {row.route?.pickupLocations ? "via " + row.route.pickupLocations.split(",")[0] : "ferry bus"}
                    </Badge>
                  </div>
                </div>
              </div>
              {row.pass.status === "pending" ? (
                <p className="mt-3 rounded-lg bg-warning-container px-3 py-2 text-[12px] text-on-warning-container">
                  This pass is not valid yet — the transport agent has to accept it, and only then is the fare taken from your wallet.
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
