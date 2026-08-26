// ===========================================================================
//  agent/MenuBoard.tsx — the canteen agent's menu.
//
//  Adding a dish is always allowed; PUBLISHING one (making it available) is
//  only allowed inside the Myanmar pre-order window — that rule is enforced by
//  the C++ engine on the server, and mirrored here so the button explains
//  itself instead of just failing.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { Clock, Plus, Trash2 } from "lucide-react";
import { api, ApiError, type MenuRow, type PreorderWindow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Input, Modal, Notice, PageHeader, Select, Spinner, StatTile, Textarea } from "@/components/ui";

type MenuResponse = { window: PreorderWindow; items: MenuRow[] };

const AVAILABILITY: Array<{ value: "available" | "unavailable" | "sold_out"; label: string }> = [
  { value: "available", label: "Available" },
  { value: "sold_out", label: "Sold out" },
  { value: "unavailable", label: "Hidden" },
];

export default function MenuBoard() {
  const { data, loading, error, refresh } = useApiData<MenuResponse>(() => api.get<MenuResponse>("/canteen/menu"), []);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "canteen" | "error"; text: string } | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Main");
  const [description, setDescription] = useState("");

  async function addDish(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/canteen/menu", {
        name: name.trim(),
        priceCents: Math.round(Number(price)),
        category: category.trim() || "Main",
        description: description.trim() || undefined,
      });
      setAdding(false);
      setName("");
      setPrice("");
      setDescription("");
      setMessage({ tone: "canteen", text: "Dish added. Publish it when the pre-order window is open." });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not add the dish." });
    } finally {
      setBusy(false);
    }
  }

  async function setAvailability(id: number, availability: "available" | "unavailable" | "sold_out") {
    setBusy(true);
    setMessage(null);
    try {
      await api.patch(`/canteen/menu/${id}/availability`, { availability });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not update that dish." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      await api.delete(`/canteen/menu/${id}`);
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not remove that dish." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading your menu board…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;

  const items = data?.items ?? [];
  const published = items.filter(row => row.item.availability === "available");
  const open = data?.window.orderingOpen ?? false;

  return (
    <>
      <PageHeader
        title="Menu Board"
        subtitle={data?.window.message}
        actions={
          <>
            <Badge tone={open ? "canteen" : "warning"}>
              <Clock className="h-3.5 w-3.5" /> {open ? "Window open" : "Window closed"}
            </Badge>
            <Button variant="canteen" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add dish
            </Button>
          </>
        }
      />

      <div className="grid gap-stack-md sm:grid-cols-3">
        <StatTile label="Published" value={published.length} tone="canteen" hint="Students can order these now" />
        <StatTile label="On the board" value={items.length} hint="Including hidden dishes" />
        <StatTile
          label="Average price"
          value={kyats(items.length ? Math.round(items.reduce((sum, row) => sum + row.item.priceCents, 0) / items.length) : 0)}
        />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {!open ? <Notice tone="warning">Dishes can only be published between 12:00 PM and midnight Myanmar time — that is tomorrow's pre-order window.</Notice> : null}

      <Card title="Your dishes">
        {items.length === 0 ? (
          <EmptyState title="Nothing on the board yet" description="Add your first dish; publish it when the window opens." action={<Button variant="canteen" onClick={() => setAdding(true)}>Add dish</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Dish</th>
                  <th>Category</th>
                  <th className="text-right">Price</th>
                  <th>Availability</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map(row => (
                  <tr key={row.item.id}>
                    <td>
                      <p className="font-semibold text-on-surface">{row.item.name}</p>
                      {row.item.description ? <p className="max-w-sm text-[12px] text-on-surface-variant">{row.item.description}</p> : null}
                    </td>
                    <td className="text-on-surface-variant">{row.item.category}</td>
                    <td className="tabular text-right font-semibold">{kyats(row.item.priceCents)}</td>
                    <td>
                      <Select
                        className="h-9 w-[150px]"
                        value={row.item.availability}
                        disabled={busy}
                        onChange={event => void setAvailability(row.item.id, event.target.value as "available" | "unavailable" | "sold_out")}
                      >
                        {AVAILABILITY.map(option => (
                          <option key={option.value} value={option.value} disabled={option.value === "available" && !open}>
                            {option.label}
                            {option.value === "available" && !open ? " (window closed)" : ""}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="text-right">
                      <Button variant="ghost" className="h-9 px-3" disabled={busy} onClick={() => void remove(row.item.id)} aria-label={`Remove ${row.item.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {adding ? (
        <Modal title="Add a dish" onClose={() => setAdding(false)}>
          <form className="space-y-4" onSubmit={addDish}>
            <Field label="Name">
              <Input value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={120} placeholder="Mohinga" />
            </Field>
            <Field label="Price (kyat)">
              <Input type="number" min={1} step={50} value={price} onChange={event => setPrice(event.target.value)} required placeholder="1500" />
            </Field>
            <Field label="Category">
              <Select value={category} onChange={event => setCategory(event.target.value)}>
                {["Main", "Salad", "Snack", "Drink", "Dessert"].map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description (optional)">
              <Textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={280} placeholder="Rice noodles in fish broth." />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="canteen" busy={busy}>
                Add to board
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
