// ===========================================================================
//  agent/KitchenDisplay.tsx — the Kitchen Display System (KDS).
//
//  Three lanes — Incoming, Preparing, Ready — exactly as in the design pack.
//  The order of the tickets inside a lane is NOT decided here: the C++ engine
//  scores every ticket (waiting time, unpaid cash, item count) and flags the
//  ones that have waited too long as ASAP. This screen draws what it returns
//  and refreshes every 15 seconds.
// ===========================================================================

import { useState, type ReactNode } from "react";
import { AlertTriangle, ChefHat, CircleDollarSign, Clock, Inbox, PackageCheck, Timer } from "lucide-react";
import { api, ApiError, type KdsBoard, type KdsTicket } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats } from "@/lib/format";
import { Badge, Button, ErrorNote, Notice, PageHeader, Spinner, StatTile } from "@/components/ui";

const NEXT_STATUS: Record<KdsTicket["lane"], { label: string; status: "preparing" | "ready" | "completed" }> = {
  incoming: { label: "Move to prep", status: "preparing" },
  preparing: { label: "Mark ready", status: "ready" },
  ready: { label: "Complete", status: "completed" },
};

export default function KitchenDisplay() {
  const { data, loading, error, refresh } = useApiData<KdsBoard>(() => api.get<KdsBoard>("/canteen/kds"), [], { pollMs: 15_000 });
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "canteen" | "error"; text: string } | null>(null);

  async function advance(ticket: KdsTicket) {
    const next = NEXT_STATUS[ticket.lane];
    setBusy(ticket.orderId);
    setMessage(null);
    try {
      await api.patch(`/canteen/orders/${ticket.orderId}/status`, { status: next.status });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not move that ticket." });
    } finally {
      setBusy(null);
    }
  }

  async function confirmCash(ticket: KdsTicket) {
    setBusy(ticket.orderId);
    setMessage(null);
    try {
      await api.post(`/canteen/orders/${ticket.orderId}/confirm-cash`);
      setMessage({ tone: "canteen", text: `Cash confirmed for #${ticket.orderId} — ${kyats(ticket.totalCents)} added to your float.` });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not confirm the cash." });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="Loading the kitchen board…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const lane = (title: string, icon: ReactNode, tickets: KdsTicket[], accent: string) => (
    <section className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
      <header className="flex items-center justify-between border-b border-outline-variant bg-surface px-4 py-3">
        <h2 className="flex items-center gap-2 text-headline-md font-semibold text-on-surface">
          {icon}
          {title}
        </h2>
        <span className="tabular rounded-full bg-primary-container px-2 py-1 text-[13px] font-bold text-on-primary-container">{tickets.length}</span>
      </header>

      <div className="kds-scroll flex flex-1 flex-col gap-stack-md overflow-y-auto p-stack-md">
        {tickets.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-on-surface-variant">Nothing here right now.</p>
        ) : (
          tickets.map(ticket => {
            const unpaidCash = ticket.paymentMethod === "direct_cash" && ticket.paymentStatus !== "paid";
            return (
              <article
                key={ticket.orderId}
                className={`relative overflow-hidden rounded-lg border bg-surface-container-lowest p-stack-md shadow-card ${
                  ticket.asap ? "border-2 border-error" : "border-outline-variant"
                }`}
              >
                <div className={`absolute inset-x-0 top-0 h-1 ${ticket.asap ? "bg-error" : accent}`} />

                <div className="flex items-start justify-between gap-2">
                  <span className="tabular text-headline-md font-bold text-on-surface">#{ticket.orderId}</span>
                  {ticket.asap ? (
                    <span className="chip pulse-soft bg-error-container text-on-error-container">
                      <Timer className="h-3.5 w-3.5" /> ASAP
                    </span>
                  ) : (
                    <span className="tabular chip bg-surface-container-high text-on-surface">{ticket.waitingMinutes} min</span>
                  )}
                </div>

                <p className="mt-1 text-[12px] text-on-surface-variant">
                  {ticket.studentName} · {ticket.paymentMethod === "wallet" ? "Wallet" : "Cash"} · priority {ticket.priorityScore}
                </p>

                <ul className="mt-3 divide-y divide-outline-variant border-t border-outline-variant pt-2">
                  {ticket.items.map(item => (
                    <li key={item.id} className="flex items-center justify-between py-1.5 text-[14px]">
                      <span className="font-semibold text-on-surface">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="tabular text-on-surface-variant">{kyats(item.lineTotalCents)}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center justify-between">
                  <span className="tabular text-[15px] font-bold text-secondary">{kyats(ticket.totalCents)}</span>
                  {unpaidCash ? (
                    <Badge tone="warning">
                      <CircleDollarSign className="h-3.5 w-3.5" /> cash due
                    </Badge>
                  ) : (
                    <Badge tone="canteen">paid</Badge>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  {unpaidCash ? (
                    <Button variant="ghost" className="flex-1" busy={busy === ticket.orderId} onClick={() => void confirmCash(ticket)}>
                      Confirm cash
                    </Button>
                  ) : null}
                  <Button variant="canteen" className="flex-1" busy={busy === ticket.orderId} onClick={() => void advance(ticket)}>
                    {NEXT_STATUS[ticket.lane].label}
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );

  return (
    <>
      <PageHeader
        title="Kitchen Display"
        subtitle="Tickets are ordered by how long they have waited, whether the cash is still owed, and how big the order is. Refreshes every 15 seconds."
        actions={
          <Button variant="ghost" className="h-9" onClick={() => void refresh()}>
            Refresh now
          </Button>
        }
      />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open tickets" value={data.openTickets} tone="canteen" icon={<ChefHat className="h-4 w-4" />} />
        <StatTile label="ASAP" value={data.asapTickets} tone={data.asapTickets ? "error" : "neutral"} icon={<AlertTriangle className="h-4 w-4" />} hint="Waiting 12 min or more" />
        <StatTile label="Open value" value={kyats(data.openValueCents)} icon={<CircleDollarSign className="h-4 w-4" />} />
        <StatTile label="Average wait" value={`${data.averageWaitMinutes.toFixed(1)} min`} icon={<Clock className="h-4 w-4" />} />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-stack-md lg:grid-cols-3">
        {lane("Incoming", <Inbox className="h-5 w-5 text-on-surface-variant" />, data.incoming, "bg-primary")}
        {lane("Preparing", <ChefHat className="h-5 w-5 text-on-surface-variant" />, data.preparing, "bg-tertiary")}
        {lane("Ready", <PackageCheck className="h-5 w-5 text-on-surface-variant" />, data.ready, "bg-secondary")}
      </div>
    </>
  );
}
