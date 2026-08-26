// ===========================================================================
//  driver/RouteEditor.tsx — the transport agent's own route and its map.
//
//  The driver edits the stops, the fare and the Google Maps link of the routes
//  assigned to them, and publishes the geographic nodes that draw the route
//  line students see in Ferry Tracking.
// ===========================================================================

import { useEffect, useState, type FormEvent } from "react";
import { MapPin, Plus, Save, Trash2 } from "lucide-react";
import { api, ApiError, type DriverDashboard, type RouteRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats } from "@/lib/format";
import { RouteMap } from "@/components/RouteMap";
import { Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Spinner } from "@/components/ui";

type NodeDraft = { name: string; latitude: string; longitude: string };

export default function RouteEditor() {
  const { data, loading, error, refresh } = useApiData<DriverDashboard>(() => api.get<DriverDashboard>("/transport/driver/dashboard"), []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ferry" | "error"; text: string } | null>(null);

  const [name, setName] = useState("");
  const [startPoint, setStartPoint] = useState("");
  const [destination, setDestination] = useState("");
  const [stops, setStops] = useState("");
  const [fare, setFare] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [color, setColor] = useState("#0284C7");
  const [nodes, setNodes] = useState<NodeDraft[]>([]);

  const routes: RouteRow[] = data?.routes ?? [];
  const selected = routes.find(row => row.route.id === selectedId) ?? routes[0] ?? null;

  // Load the selected route into the form whenever it changes.
  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.route.id);
    setName(selected.route.name);
    setStartPoint(selected.route.startPoint);
    setDestination(selected.route.destination);
    setStops(selected.stops.map(stop => stop.name).join(", ") || selected.route.pickupLocations);
    setFare(String(selected.route.fareCents));
    setMapUrl(selected.route.mapUrl ?? "");
    setColor(selected.route.routeLineColor || "#0284C7");
    setNodes(
      selected.mapNodes.length
        ? selected.mapNodes.map(node => ({ name: node.name, latitude: String(node.latitude), longitude: String(node.longitude) }))
        : [
            { name: selected.route.startPoint, latitude: "", longitude: "" },
            { name: selected.route.destination, latitude: "", longitude: "" },
          ],
    );
  }, [selected?.route.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveRoute(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.patch(`/transport/driver/routes/${selected.route.id}`, {
        name: name.trim(),
        startPoint: startPoint.trim(),
        destination: destination.trim(),
        stops: stops
          .split(",")
          .map(stop => stop.trim())
          .filter(Boolean),
        fareCents: Math.round(Number(fare)),
        mapUrl: mapUrl.trim() || undefined,
      });
      setMessage({ tone: "ferry", text: "Route saved." });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not save the route." });
    } finally {
      setBusy(false);
    }
  }

  async function publishMap() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.post(`/transport/driver/routes/${selected.route.id}/map`, {
        routeLineColor: color,
        nodes: nodes
          .filter(node => node.name.trim() && node.latitude.trim() && node.longitude.trim())
          .map(node => ({ name: node.name.trim(), latitude: Number(node.latitude), longitude: Number(node.longitude) })),
      });
      setMessage({ tone: "ferry", text: "Route line published — students see it in Ferry Tracking." });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not publish the map." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading your routes…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;

  if (!selected)
    return (
      <>
        <PageHeader title="Route & Map" />
        <EmptyState title="No route assigned" description="The administrator assigns a route to your ferry bus; it then becomes editable here." />
      </>
    );

  const previewNodes = nodes
    .filter(node => node.name.trim() && node.latitude.trim() && node.longitude.trim())
    .map((node, index) => ({ name: node.name, latitude: node.latitude, longitude: node.longitude, nodeOrder: index + 1 }));

  return (
    <>
      <PageHeader
        title="Route & Map"
        subtitle="Only the routes assigned to your ferry bus can be edited."
        actions={
          routes.length > 1 ? (
            <select className="input h-9 w-[220px]" value={selected.route.id} onChange={event => setSelectedId(Number(event.target.value))}>
              {routes.map(row => (
                <option key={row.route.id} value={row.route.id}>
                  {row.route.name}
                </option>
              ))}
            </select>
          ) : null
        }
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-stack-md lg:grid-cols-2">
        <Card title="Route details" accent="ferry">
          <form className="space-y-4" onSubmit={saveRoute}>
            <Field label="Route name">
              <Input value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={120} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start point">
                <Input value={startPoint} onChange={event => setStartPoint(event.target.value)} required minLength={2} />
              </Field>
              <Field label="Destination">
                <Input value={destination} onChange={event => setDestination(event.target.value)} required minLength={2} />
              </Field>
            </div>
            <Field label="Pickup stops" hint="Separate with commas — they appear in order.">
              <Input value={stops} onChange={event => setStops(event.target.value)} required placeholder="Library, Science Block, Sports Field" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fare per seat (kyat)" hint={`Now ${kyats(selected.route.fareCents)}`}>
                <Input type="number" min={1} step={100} value={fare} onChange={event => setFare(event.target.value)} required />
              </Field>
              <Field label="Google Maps link" hint="Must start with https://">
                <Input value={mapUrl} onChange={event => setMapUrl(event.target.value)} placeholder="https://maps.google.com/?q=16.84,96.17" />
              </Field>
            </div>
            <Button type="submit" variant="ferry" busy={busy}>
              <Save className="h-4 w-4" /> Save route
            </Button>
          </form>
        </Card>

        <Card
          title="Route line"
          subtitle="Two to fifty points, in travel order."
          accent="ferry"
          actions={
            <label className="flex items-center gap-2 text-[12px] font-semibold text-on-surface-variant">
              Colour
              <input type="color" value={color} onChange={event => setColor(event.target.value)} className="h-8 w-10 cursor-pointer rounded border border-outline-variant" />
            </label>
          }
        >
          <div className="space-y-3">
            {nodes.map((node, index) => (
              <div key={index} className="grid grid-cols-[1fr_90px_90px_40px] items-end gap-2">
                <Field label={index === 0 ? "Stop name" : ""}>
                  <Input
                    value={node.name}
                    onChange={event => setNodes(current => current.map((entry, position) => (position === index ? { ...entry, name: event.target.value } : entry)))}
                    placeholder="Library"
                  />
                </Field>
                <Field label={index === 0 ? "Latitude" : ""}>
                  <Input
                    value={node.latitude}
                    onChange={event => setNodes(current => current.map((entry, position) => (position === index ? { ...entry, latitude: event.target.value } : entry)))}
                    placeholder="16.8409"
                  />
                </Field>
                <Field label={index === 0 ? "Longitude" : ""}>
                  <Input
                    value={node.longitude}
                    onChange={event => setNodes(current => current.map((entry, position) => (position === index ? { ...entry, longitude: event.target.value } : entry)))}
                    placeholder="96.1735"
                  />
                </Field>
                <button
                  type="button"
                  className="mb-[1px] flex h-[42px] w-[40px] items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                  onClick={() => setNodes(current => current.filter((_, position) => position !== index))}
                  aria-label="Remove this point"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => setNodes(current => [...current, { name: "", latitude: "", longitude: "" }])}>
                <Plus className="h-4 w-4" /> Add point
              </Button>
              <Button type="button" variant="ferry" busy={busy} disabled={previewNodes.length < 2} onClick={() => void publishMap()}>
                <MapPin className="h-4 w-4" /> Publish route line
              </Button>
            </div>

            <RouteMap nodes={previewNodes} color={color} mapUrl={mapUrl || null} />
          </div>
        </Card>
      </div>
    </>
  );
}
