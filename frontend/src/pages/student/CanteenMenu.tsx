// ===========================================================================
//  student/CanteenMenu.tsx — the Smart Canteen Menu screen from the design.
//
//  The basket total, the "one agent at a time" rule and the pre-order window
//  are decided by the backend's C++ engine; this screen shows a running total
//  while you pick, then sends the basket to be priced for real.
// ===========================================================================

import { useMemo, useState } from "react";
import { Clock, Minus, Plus, ShoppingBasket, UtensilsCrossed, Wallet } from "lucide-react";
import { api, ApiError, type MenuRow, type PreorderWindow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorNote, Notice, PageHeader, Spinner, StatTile } from "@/components/ui";

type MenuResponse = { window: PreorderWindow; items: MenuRow[]; walletBalance: number };

export default function CanteenMenu() {
  const { data, loading, error, refresh } = useApiData<MenuResponse>(() => api.get<MenuResponse>("/canteen/menu"), []);
  const [basket, setBasket] = useState<Record<number, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "direct_cash">("wallet");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "canteen" | "error"; text: string } | null>(null);
  const [category, setCategory] = useState("All");

  const items = data?.items ?? [];
  const categories = useMemo(() => ["All", ...new Set(items.map(row => row.item.category))], [items]);
  const visible = category === "All" ? items : items.filter(row => row.item.category === category);

  const basketLines = useMemo(
    () =>
      Object.entries(basket)
        .map(([id, quantity]) => ({ row: items.find(entry => entry.item.id === Number(id)), quantity: Number(quantity) }))
        .filter((line): line is { row: MenuRow; quantity: number } => Boolean(line.row) && line.quantity > 0),
    [basket, items],
  );

  const total = basketLines.reduce((sum, line) => sum + line.row.item.priceCents * line.quantity, 0);
  const agentIds = new Set(basketLines.map(line => line.row.item.agentId));
  const mixedAgents = agentIds.size > 1;
  const walletShort = paymentMethod === "wallet" && total > (data?.walletBalance ?? 0);

  const setQuantity = (id: number, quantity: number) =>
    setBasket(current => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = Math.min(20, quantity);
      return next;
    });

  async function placeOrder() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.post<{ orderId: number; totalCents: number }>("/canteen/orders", {
        items: basketLines.map(line => ({ foodItemId: line.row.item.id, quantity: line.quantity })),
        paymentMethod,
      });
      setBasket({});
      setMessage({ tone: "canteen", text: `Order #${response.orderId} placed — ${kyats(response.totalCents)}.` });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not place the order." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading today's menu…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;

  return (
    <>
      <PageHeader
        title="Canteen Menu"
        subtitle={data?.window.message}
        actions={
          <Badge tone={data?.window.orderingOpen ? "canteen" : "warning"}>
            <Clock className="h-3.5 w-3.5" /> {data?.window.orderingOpen ? "Pre-orders open" : "Window closed"}
          </Badge>
        }
      />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Wallet balance" value={kyats(data?.walletBalance ?? 0)} tone="canteen" icon={<Wallet className="h-4 w-4" />} hint="Topped up by your canteen agent" />
        <StatTile label="Basket" value={kyats(total)} hint={`${basketLines.reduce((sum, line) => sum + line.quantity, 0)} item(s)`} icon={<ShoppingBasket className="h-4 w-4" />} />
        <StatTile label="Dishes available" value={items.length} hint={data?.window.orderingOpen ? "Published for tomorrow" : "Agents publish from 12:00"} />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-stack-md lg:grid-cols-[1fr_320px]">
        {/* ---------------- menu ---------------- */}
        <div className="space-y-stack-md">
          <div className="flex flex-wrap gap-2">
            {categories.map(name => (
              <button
                key={name}
                onClick={() => setCategory(name)}
                className={`chip transition-colors ${category === name ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"}`}
              >
                {name}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title={data?.window.orderingOpen ? "No dishes published yet" : "Pre-orders are closed right now"}
              description={
                data?.window.orderingOpen
                  ? "The canteen agents have not published tomorrow's menu yet. Check back shortly."
                  : "The kitchen publishes tomorrow's food from 12:00 PM Myanmar time. Come back after noon."
              }
            />
          ) : (
            <div className="grid gap-stack-md sm:grid-cols-2 xl:grid-cols-3">
              {visible.map(row => {
                const quantity = basket[row.item.id] ?? 0;
                return (
                  <article key={row.item.id} className="card flex flex-col overflow-hidden">
                    {/* The photo leads the card and runs edge to edge: it is
                        what people actually choose by. A fixed 4:3 box rather
                        than a fixed height, so every card in the row lines up
                        whatever shape the picture was taken in, and a dish
                        with no photo still holds the same space instead of
                        leaving a ragged grid. */}
                    <DishPhoto url={row.item.imageUrl} name={row.item.name} />

                    <div className="card-pad flex flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-headline-md font-semibold text-on-surface">{row.item.name}</h3>
                        <p className="text-label uppercase tracking-wider text-on-surface-variant">
                          {row.item.category} · {row.agentName ?? "Canteen"}
                        </p>
                      </div>
                      <span className="tabular shrink-0 text-[17px] font-bold text-secondary">{kyats(row.item.priceCents)}</span>
                    </div>

                    {row.item.description ? <p className="line-clamp-2 text-[13px] leading-relaxed text-on-surface-variant">{row.item.description}</p> : null}

                    <div className="mt-auto flex items-center justify-between gap-2">
                      <Badge tone="canteen">Available</Badge>
                      {quantity === 0 ? (
                        <Button variant="canteen" className="h-9" onClick={() => setQuantity(row.item.id, 1)} disabled={!data?.window.orderingOpen}>
                          <Plus className="h-4 w-4" /> Add
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container-high"
                            onClick={() => setQuantity(row.item.id, quantity - 1)}
                            aria-label={`Remove one ${row.item.name}`}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="tabular w-6 text-center text-[15px] font-bold">{quantity}</span>
                          <button
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant hover:bg-surface-container-high"
                            onClick={() => setQuantity(row.item.id, quantity + 1)}
                            aria-label={`Add one ${row.item.name}`}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* ---------------- basket ---------------- */}
        <Card title="Your basket" subtitle="Pick-up tomorrow at the counter" accent="canteen" className="lg:sticky lg:top-20 lg:self-start">
          {basketLines.length === 0 ? (
            <p className="text-[14px] text-on-surface-variant">Nothing selected yet. Add a dish to start a pre-order.</p>
          ) : (
            <div className="space-y-3">
              {basketLines.map(line => (
                <div key={line.row.item.id} className="flex items-start justify-between gap-3 border-b border-surface-container-high pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-on-surface">{line.row.item.name}</p>
                    <p className="tabular text-[12px] text-on-surface-variant">
                      {line.quantity} × {kyats(line.row.item.priceCents)} · {line.row.agentName ?? "Canteen"}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-[14px] font-bold">{kyats(line.row.item.priceCents * line.quantity)}</span>
                </div>
              ))}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[14px] font-semibold">Total</span>
                <span className="tabular text-[20px] font-bold text-secondary">{kyats(total)}</span>
              </div>

              <div className="space-y-2">
                <p className="field-label">Payment</p>
                {(["wallet", "direct_cash"] as const).map(method => (
                  <label
                    key={method}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[14px] ${
                      paymentMethod === method ? "border-secondary bg-secondary-container/40" : "border-outline-variant"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input type="radio" name="payment" checked={paymentMethod === method} onChange={() => setPaymentMethod(method)} />
                      {method === "wallet" ? "Campus wallet" : "Cash at the counter"}
                    </span>
                    {method === "wallet" ? <span className="tabular text-[12px] text-on-surface-variant">{kyats(data?.walletBalance ?? 0)}</span> : null}
                  </label>
                ))}
              </div>

              {mixedAgents ? <Notice tone="error">Choose items from one canteen agent at a time.</Notice> : null}
              {walletShort ? <Notice tone="warning">Your wallet is short — ask your agent for a top-up, or pay cash at the counter.</Notice> : null}

              <Button
                variant="canteen"
                className="w-full"
                busy={busy}
                disabled={mixedAgents || walletShort || !data?.window.orderingOpen}
                onClick={() => void placeOrder()}
              >
                Place pre-order · {kyats(total)}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

/** The dish photo from Supabase Storage, in a fixed 4:3 frame.
 *  Falls back to a plain placeholder when there is no photo, or when the URL
 *  will not load - a deleted object, or a bucket left private - so a card
 *  never shows a broken-image icon and never collapses out of the grid. */
function DishPhoto({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  const frame = "aspect-[4/3] w-full shrink-0 border-b border-outline-variant bg-surface-container";

  if (!url || broken) {
    return (
      <div className={`${frame} flex items-center justify-center text-on-surface-variant`}>
        <UtensilsCrossed className="h-10 w-10 opacity-60" />
      </div>
    );
  }
  return <img src={url} alt={name} loading="lazy" onError={() => setBroken(true)} className={`${frame} object-cover`} />;
}
