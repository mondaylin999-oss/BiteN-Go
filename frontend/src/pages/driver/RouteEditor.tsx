// ===========================================================================
//  driver/RouteEditor.tsx — the transport agent's own route and its map.
//
//  The agent's whole road in one screen: the stops, the monthly price, the two
//  times the bus runs every day, the months it is sold for, and the line on the
//  map. There is nothing per-day to fill in anywhere.
//  assigned to them, and publishes the geographic nodes that draw the route
//  line students see in Ferry Tracking.
// ===========================================================================

import { useEffect, useState, type FormEvent } from "react";
import { MapPin, Plus, Save, Trash2 } from "lucide-react";
import { api, ApiError, type DriverDashboard, type RouteRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { kyats } from "@/lib/format";
import { RouteMap } from "@/components/RouteMap";
import { Button, Card, ErrorNote, Field, Input, Notice, PageHeader, Spinner } from "@/components/ui";

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
  // The whole timetable: one time out in the morning, one back in the evening.
  const [morningTime, setMorningTime] = useState("06:30");
  const [eveningTime, setEveningTime] = useState("16:30");
  // The months this road is sold for.
  const [sellFrom, setSellFrom] = useState("");
  const [sellTo, setSellTo] = useState("");
  // Filled in by the map: the real driving distance and time OSRM reports
  // for the published stops. Saved with the route so nobody has to guess.
  const [road, setRoad] = useState<{ km: number; minutes: number } | null>(null);
  const [newRoad, setNewRoad] = useState({
    name: "",
    startPoint: "",
    destination: "",
    stops: "",
    fareCents: "45000",
    morningTime: "06:30",
    eveningTime: "16:30",
    sellFrom: "",
    sellTo: "",
  });

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
    setMorningTime(selected.route.morningTime || "06:30");
    setEveningTime(selected.route.eveningTime ?? "");
    setSellFrom(selected.route.sellFrom ?? "");
    setSellTo(selected.route.sellTo ?? "");
    setRoad(null);
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
        morningTime,
        eveningTime,
        sellFrom: sellFrom || undefined,
        sellTo,
        distanceKm: road?.km,
        estimatedMinutes: road?.minutes,
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

  // The office only opens accounts, so an agent with no road opens their own.
  if (!selected)
    return (
      <>
        <PageHeader title="Road & Map" subtitle="Open the road your ferry bus runs. You can draw its line on the map straight afterwards." />
        <Card title="Open my road" accent="ferry">
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              setBusy(true);
              setMessage(null);
              api
                .post("/transport/driver/routes", {
                  name: newRoad.name.trim(),
                  startPoint: newRoad.startPoint.trim(),
                  destination: newRoad.destination.trim(),
                  stops: newRoad.stops
                    .split(",")
                    .map(stop => stop.trim())
                    .filter(Boolean),
                  fareCents: Math.round(Number(newRoad.fareCents)),
                  morningTime: newRoad.morningTime,
                  eveningTime: newRoad.eveningTime,
                  sellFrom: newRoad.sellFrom || undefined,
                  sellTo: newRoad.sellTo || undefined,
                })
                .then(() => refresh())
                .catch(caught => setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not open the road." }))
                .finally(() => setBusy(false));
            }}
          >
            {message ? (
              <div className="sm:col-span-2">
                <Notice tone={message.tone}>{message.text}</Notice>
              </div>
            ) : null}
            <Field label="Road name">
              <Input value={newRoad.name} onChange={event => setNewRoad({ ...newRoad, name: event.target.value })} required minLength={2} placeholder="North Hall Ferry" />
            </Field>
            <Field label="Price of one seat for a month (kyat)">
              <Input type="number" min={1} step={1} value={newRoad.fareCents} onChange={event => setNewRoad({ ...newRoad, fareCents: event.target.value })} required placeholder="45000" />
            </Field>
            <Field label="Start point">
              <Input value={newRoad.startPoint} onChange={event => setNewRoad({ ...newRoad, startPoint: event.target.value })} required minLength={2} placeholder="Main Gate" />
            </Field>
            <Field label="Destination">
              <Input value={newRoad.destination} onChange={event => setNewRoad({ ...newRoad, destination: event.target.value })} required minLength={2} placeholder="North Hall" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Pickup stops" hint="Separate with commas — they appear in order.">
                <Input value={newRoad.stops} onChange={event => setNewRoad({ ...newRoad, stops: event.target.value })} required placeholder="Library, Science Block, Sports Field" />
              </Field>
            </div>
            <Field label="Leaves in the morning" hint="The same time every day.">
              <Input type="time" value={newRoad.morningTime} onChange={event => setNewRoad({ ...newRoad, morningTime: event.target.value })} required />
            </Field>
            <Field label="Comes back in the evening" hint="Leave empty if it only runs once.">
              <Input type="time" value={newRoad.eveningTime} onChange={event => setNewRoad({ ...newRoad, eveningTime: event.target.value })} />
            </Field>
            <Field label="Selling from" hint="Leave empty to start this month.">
              <Input type="month" value={newRoad.sellFrom} onChange={event => setNewRoad({ ...newRoad, sellFrom: event.target.value })} />
            </Field>
            <Field label="Selling until" hint="Leave empty to sell a year ahead.">
              <Input type="month" value={newRoad.sellTo} onChange={event => setNewRoad({ ...newRoad, sellTo: event.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" variant="ferry" busy={busy}>
                <Plus className="h-4 w-4" /> Open the road
              </Button>
              <p className="mt-2 text-[12px] text-on-surface-variant">Register your ferry bus first if you have not — a road needs a bus to carry it.</p>
            </div>
          </form>
        </Card>
      </>
    );

  const previewNodes = nodes
    .filter(node => node.name.trim() && node.latitude.trim() && node.longitude.trim())
    .map((node, index) => ({ name: node.name, latitude: node.latitude, longitude: node.longitude, nodeOrder: index + 1 }));

  return (
    <>
      <PageHeader
        title="Road & Map"
        subtitle="Your road: the stops, the monthly price of a seat, and the line students see on the map."
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
              <Field label="Leaves in the morning" hint="The same time every day — this is the whole timetable.">
                <Input type="time" value={morningTime} onChange={event => setMorningTime(event.target.value)} required />
              </Field>
              <Field label="Comes back in the evening" hint="Leave empty if the bus only runs once a day.">
                <Input type="time" value={eveningTime} onChange={event => setEveningTime(event.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Selling from" hint="Empty means from this month.">
                <Input type="month" value={sellFrom} onChange={event => setSellFrom(event.target.value)} />
              </Field>
              <Field label="Selling until" hint="Empty means a year ahead.">
                <Input type="month" value={sellTo} onChange={event => setSellTo(event.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="One seat for a month (kyat)" hint={`Now ${kyats(selected.route.fareCents)} a month`}>
                <Input type="number" min={1} step={1} value={fare} onChange={event => setFare(event.target.value)} required />
              </Field>
              <Field label="Extra map link (optional)" hint="Any https:// link. The map below needs no link at all.">
                <Input value={mapUrl} onChange={event => setMapUrl(event.target.value)} placeholder="https://www.openstreetmap.org/#map=15/16.8409/96.1735" />
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

            <RouteMap
              nodes={previewNodes}
              color={color}
              mapUrl={mapUrl || null}
              height={360}
              editable
              // Clicking the map appends a stop with its coordinates already
              // filled in — no need to read coordinates off any other site.
              onAddNode={(latitude, longitude) =>
                setNodes(current => [
                  ...current,
                  { name: `Point ${current.length + 1}`, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) },
                ])
              }
              // Dragging a numbered pin moves that stop.
              onMoveNode={(index, latitude, longitude) =>
                setNodes(current =>
                  current.map((entry, position) =>
                    position === index ? { ...entry, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) } : entry,
                  ),
                )
              }
              // OSRM measures the real driving distance and time; keep them so
              // "Save route" can store them on the route.
              onSummary={next =>
                setRoad({ km: Math.max(1, Math.round(next.distanceMetres / 1000)), minutes: Math.max(1, Math.round(next.durationSeconds / 60)) })
              }
            />
          </div>
        </Card>
      </div>
    </>
  );
}
