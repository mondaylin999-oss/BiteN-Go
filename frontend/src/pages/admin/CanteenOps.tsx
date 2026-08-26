// ===========================================================================
//  admin/CanteenOps.tsx — every dish and every order, across all agents.
//  Read-only on purpose: agents own their own boards and their own kitchens.
// ===========================================================================

import { useState } from "react";
import { Clock, UtensilsCrossed } from "lucide-react";
import { api, type MenuRow, type OrderRow, type PreorderWindow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { dateTime, kyats } from "@/lib/format";
import { Badge, Card, EmptyState, ErrorNote, PageHeader, Select, Spinner, StatTile, StatusBadge } from "@/components/ui";

type Bundle = { window: PreorderWindow; items: MenuRow[]; orders: OrderRow[] };

export default function CanteenOps() {
  const { data, loading, error, refresh } = useApiData<Bundle>(async () => {
    const [menu, orders] = await Promise.all([
      api.get<{ window: PreorderWindow; items: MenuRow[] }>("/canteen/menu"),
      api.get<{ orders: OrderRow[] }>("/canteen/orders"),
    ]);
    return { window: menu.window, items: menu.items, orders: orders.orders };
  }, []);
  const [statusFilter, setStatusFilter] = useState("all");

  if (loading) return <Spinner label="Loading canteen operations…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  const orders = statusFilter === "all" ? data.orders : data.orders.filter(order => order.status === statusFilter);
  const revenue = data.orders.filter(order => order.paymentStatus === "paid").reduce((sum, order) => sum + order.totalCents, 0);
  const unpaid = data.orders.filter(order => order.paymentStatus === "awaiting_confirmation");

  return (
    <>
      <PageHeader
        title="Canteen Ops"
        subtitle={data.window.message}
        actions={
          <Badge tone={data.window.orderingOpen ? "canteen" : "warning"}>
            <Clock className="h-3.5 w-3.5" /> {data.window.orderingOpen ? "Window open" : "Window closed"}
          </Badge>
        }
      />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Dishes" value={data.items.length} tone="canteen" icon={<UtensilsCrossed className="h-4 w-4" />} hint={`${data.items.filter(row => row.item.availability === "available").length} published`} />
        <StatTile label="Orders" value={data.orders.length} />
        <StatTile label="Confirmed revenue" value={kyats(revenue)} tone="canteen" />
        <StatTile label="Cash awaiting" value={unpaid.length} tone={unpaid.length ? "warning" : "neutral"} hint="Agents confirm at the counter" />
      </div>

      <Card
        title="Orders"
        actions={
          <Select className="h-9 w-[170px]" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {["pending", "preparing", "ready", "completed", "cancelled"].map(status => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        }
      >
        {orders.length === 0 ? (
          <EmptyState title="No orders" description="Student pre-orders appear here as soon as they are placed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Items</th>
                  <th className="text-right">Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id}>
                    <td className="tabular font-semibold">{order.id}</td>
                    <td>{order.studentName}</td>
                    <td className="max-w-[260px] text-[13px] text-on-surface-variant">{order.items.map(item => `${item.quantity}× ${item.name}`).join(", ")}</td>
                    <td className="tabular text-right font-semibold">{kyats(order.totalCents)}</td>
                    <td>
                      <Badge tone={order.paymentStatus === "paid" ? "canteen" : "warning"}>
                        {order.paymentMethod === "wallet" ? "wallet" : "cash"} · {order.paymentStatus === "paid" ? "paid" : "due"}
                      </Badge>
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="tabular whitespace-nowrap text-on-surface-variant">{dateTime(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Menus by agent">
        {data.items.length === 0 ? (
          <EmptyState title="No dishes yet" description="Canteen agents build their own boards." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dish</th>
                  <th>Agent</th>
                  <th>Category</th>
                  <th className="text-right">Price</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(row => (
                  <tr key={row.item.id}>
                    <td className="font-semibold">{row.item.name}</td>
                    <td className="text-on-surface-variant">{row.agentName ?? `#${row.item.agentId}`}</td>
                    <td className="text-on-surface-variant">{row.item.category}</td>
                    <td className="tabular text-right">{kyats(row.item.priceCents)}</td>
                    <td>
                      <StatusBadge status={row.item.availability} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
