// ===========================================================================
//  student/MealOrders.tsx — every pre-order this student has placed.
// ===========================================================================

import { api, type OrderRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { dateTime, kyats } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorNote, PageHeader, Spinner, StatTile, StatusBadge } from "@/components/ui";

export default function MealOrders() {
  const { data, loading, error, refresh } = useApiData<OrderRow[]>(
    async () => (await api.get<{ orders: OrderRow[] }>("/canteen/orders")).orders,
    [],
    { pollMs: 30_000 },
  );

  if (loading) return <Spinner label="Loading your orders…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;

  const orders = data ?? [];
  const open = orders.filter(order => !["completed", "cancelled"].includes(order.status));
  const spent = orders.filter(order => order.paymentStatus === "paid").reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <>
      <PageHeader title="Meal Orders" subtitle="Kitchen status updates by itself every 30 seconds." />

      <div className="grid gap-stack-md sm:grid-cols-3">
        <StatTile label="Open" value={open.length} tone="canteen" hint="Being prepared or waiting for pick-up" />
        <StatTile label="All time" value={orders.length} hint="Orders placed" />
        <StatTile label="Paid" value={kyats(spent)} hint="Wallet and confirmed cash" />
      </div>

      {orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Your pre-orders appear here with their kitchen status." />
      ) : (
        <div className="space-y-stack-md">
          {orders.map(order => (
            <Card
              key={order.id}
              title={<span className="tabular">Order #{order.id}</span>}
              subtitle={dateTime(order.createdAt)}
              accent={order.status === "ready" ? "canteen" : undefined}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={order.status} />
                  <Badge tone={order.paymentStatus === "paid" ? "canteen" : "warning"}>
                    {order.paymentMethod === "wallet" ? "Wallet" : "Cash"} · {order.paymentStatus === "paid" ? "paid" : "awaiting agent"}
                  </Badge>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Unit</th>
                      <th className="text-right">Line</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map(item => (
                      <tr key={item.id}>
                        <td className="font-medium">{item.name}</td>
                        <td className="tabular text-right">{item.quantity}</td>
                        <td className="tabular text-right">{kyats(item.unitPriceCents)}</td>
                        <td className="tabular text-right font-semibold">{kyats(item.lineTotalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="text-right text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        Total
                      </td>
                      <td className="tabular text-right text-[16px] font-bold text-secondary">{kyats(order.totalCents)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {order.paymentStatus === "awaiting_confirmation" ? (
                <p className="mt-3 rounded-lg bg-warning-container px-3 py-2 text-[13px] text-on-warning-container">
                  Pay at the counter — the agent confirms the cash and the kitchen then completes your order.
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
