// ===========================================================================
//  RouteMap.tsx — the real road map for a ferry route.
//
//  WHAT THIS DRAWS
//  ---------------
//  The transport agent publishes an ordered list of latitude/longitude nodes
//  (backend: POST /transport/driver/routes/:id/map). This component puts them
//  on a real OpenStreetMap and asks a routing engine to work out how a bus
//  actually DRIVES between them, so the line follows the roads instead of
//  cutting across blocks in a straight line.
//
//  WHO DOES WHAT
//  -------------
//    Leaflet ................ the map itself (tiles, pan, zoom, markers)
//    OpenStreetMap .......... the map images. Free, no key, no account.
//    OSRM ................... the routing engine. Given the stops, it returns
//                             the driving path along real roads plus the real
//                             distance and driving time.
//    Leaflet Routing Machine  the glue: sends the stops to OSRM and draws the
//                             returned path on the Leaflet map.
//
//  No API key anywhere. By default it uses the public OSRM demo server; point
//  VITE_OSRM_URL at your own OSRM if you ever self-host (see README).
//
//  IF THE INTERNET IS DOWN
//  -----------------------
//  Tiles simply do not load and OSRM cannot answer. The component then falls
//  back to a dashed straight line between the stops and says so, so a demo on
//  an offline laptop still shows the shape of the route.
// ===========================================================================

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, MapPin } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";

import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

export type MapNode = {
  id?: number;
  name: string;
  latitude: string | number;
  longitude: string | number;
  nodeOrder?: number;
};

type Point = { name: string; lat: number; lng: number };

export type RoadSummary = {
  /** Metres along the road, straight from OSRM. */
  distanceMetres: number;
  /** Seconds of driving, straight from OSRM. */
  durationSeconds: number;
};

/** Where the routing engine lives. The public demo server is the default;
 *  put your own in frontend/.env as VITE_OSRM_URL to take the load off it. */
const OSRM_URL = (import.meta.env.VITE_OSRM_URL as string | undefined)?.trim() || "https://router.project-osrm.org/route/v1";

/** OSRM's demo server only carries the car profile, which is what a ferry bus
 *  needs anyway. Self-hosted servers can offer bike/foot as well. */
const OSRM_PROFILE = (import.meta.env.VITE_OSRM_PROFILE as string | undefined)?.trim() || "driving";

function toPoints(nodes: MapNode[]): Point[] {
  return nodes
    .slice()
    .sort((left, right) => (left.nodeOrder ?? 0) - (right.nodeOrder ?? 0))
    .map(node => ({ name: node.name, lat: Number(node.latitude), lng: Number(node.longitude) }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180);
}

/** A round numbered pin, drawn with HTML so there are no image files to ship
 *  (Leaflet's default marker icons break under bundlers unless you re-wire the
 *  image URLs — a div icon side-steps that entirely). */
function pinHtml(label: string, color: string, big: boolean) {
  const size = big ? 30 : 24;
  return `
    <div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      background:${big ? color : "#ffffff"};
      color:${big ? "#ffffff" : color};
      border:3px solid ${color};
      box-shadow:0 2px 8px rgba(0,0,0,.25);
      display:flex;align-items:center;justify-content:center;
      font:700 ${big ? 13 : 11}px/1 Inter,system-ui,sans-serif;
    ">${label}</div>`;
}

export function RouteMap({
  nodes,
  color = "#0284C7",
  mapUrl,
  height = 320,
  editable = false,
  onAddNode,
  onMoveNode,
  onSummary,
}: {
  nodes: MapNode[];
  color?: string;
  mapUrl?: string | null;
  height?: number;
  /** Driver's route editor: click the map to append a stop, drag pins to move them. */
  editable?: boolean;
  onAddNode?: (latitude: number, longitude: number) => void;
  onMoveNode?: (index: number, latitude: number, longitude: number) => void;
  /** Called with the real road distance/time every time OSRM answers. */
  onSummary?: (summary: RoadSummary) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const routingRef = useRef<{ remove?: () => void } | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const fallbackRef = useRef<{ remove?: () => void } | null>(null);

  // Callbacks live in refs so the map is not rebuilt when a parent re-renders.
  const addRef = useRef(onAddNode);
  const moveRef = useRef(onMoveNode);
  const summaryRef = useRef(onSummary);
  addRef.current = onAddNode;
  moveRef.current = onMoveNode;
  summaryRef.current = onSummary;

  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<RoadSummary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const points = toPoints(nodes);
  // One string that changes only when the geometry really changes — this is
  // what stops a keystroke in the editor from firing a routing request.
  const signature = points.map(point => `${point.lat.toFixed(6)},${point.lng.toFixed(6)},${point.name}`).join("|") + `#${color}`;

  // ---- create the map once -------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Leaflet ships both a CommonJS build (default export) and an ESM one
      // (named exports only). Take whichever this bundler hands back.
      const loaded = await import("leaflet");
      const L = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded) as typeof loaded;
      // Leaflet Routing Machine is a plugin: it attaches itself to the global
      // L, so L has to exist before it is imported. A dynamic import keeps
      // that order guaranteed (a static import would be hoisted above it).
      (window as unknown as { L: typeof loaded }).L = L;
      await import("leaflet-routing-machine");

      if (cancelled || !container.current || mapRef.current) return;

      const map = L.map(container.current, {
        // Scrolling the page over a map should scroll the page, not zoom.
        // Ctrl/⌘ + wheel still zooms, and the +/− buttons always work.
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: true,
      }).setView([16.8409, 96.1735], 12); // Yangon, until the route sets its own view

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      if (addRef.current) {
        map.on("click", event => addRef.current?.(event.latlng.lat, event.latlng.lng));
      }

      leafletRef.current = L;
      mapRef.current = map;
      setReady(true);
    })().catch(() => {
      if (!cancelled) setProblem("The map library could not be loaded. Run npm install in the frontend folder.");
    });

    return () => {
      cancelled = true;
      routingRef.current?.remove?.();
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      routingRef.current = null;
      markersRef.current = [];
      fallbackRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- draw the stops and ask OSRM for the road between them ---------------
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    // Clear whatever is on the map from the previous version of the route.
    routingRef.current?.remove?.();
    routingRef.current = null;
    fallbackRef.current?.remove?.();
    fallbackRef.current = null;
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    setSummary(null);
    setProblem(null);

    if (!points.length) return;

    // The numbered pins. These are ours, not the routing plugin's, so they
    // stay put whether OSRM answers or not.
    points.forEach((point, index) => {
      const isEnd = index === 0 || index === points.length - 1;
      const marker = L.marker([point.lat, point.lng], {
        draggable: Boolean(moveRef.current),
        icon: L.divIcon({
          className: "",
          html: pinHtml(String(index + 1), color, isEnd),
          iconSize: [isEnd ? 30 : 24, isEnd ? 30 : 24],
          iconAnchor: [isEnd ? 15 : 12, isEnd ? 15 : 12],
        }),
      })
        .addTo(map)
        .bindTooltip(point.name || `Point ${index + 1}`, { direction: "top", offset: [0, -14], permanent: isEnd });

      if (moveRef.current) {
        marker.on("dragend", () => {
          const position = marker.getLatLng();
          moveRef.current?.(index, position.lat, position.lng);
        });
      }
      markersRef.current.push(marker);
    });

    if (points.length === 1) {
      map.setView([points[0]!.lat, points[0]!.lng], 15);
      return;
    }

    map.fitBounds(
      L.latLngBounds(points.map(point => L.latLng(point.lat, point.lng))),
      { padding: [36, 36], maxZoom: 16 },
    );

    // Wait a moment before calling OSRM, so typing coordinates in the editor
    // does not fire one request per keystroke.
    const timer = window.setTimeout(() => {
      const Routing = (L as unknown as { Routing?: any }).Routing;
      if (!Routing) {
        setProblem("Leaflet Routing Machine is not installed — showing a straight line.");
        fallbackRef.current = L.polyline(points.map(point => L.latLng(point.lat, point.lng)), {
          color,
          weight: 4,
          dashArray: "8 8",
        }).addTo(map);
        return;
      }

      const control = Routing.control({
        waypoints: points.map(point => L.latLng(point.lat, point.lng)),
        router: Routing.osrmv1({ serviceUrl: OSRM_URL, profile: OSRM_PROFILE }),
        lineOptions: { styles: [{ color, weight: 6, opacity: 0.9 }], addWaypoints: false },
        // We draw our own pins and our own summary, so the plugin's marker
        // set and its turn-by-turn panel are switched off.
        createMarker: () => null,
        show: false,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        routeWhileDragging: false,
      });

      control.on("routesfound", (event: any) => {
        const found = event?.routes?.[0]?.summary;
        if (!found) return;
        const next: RoadSummary = { distanceMetres: found.totalDistance, durationSeconds: found.totalTime };
        setSummary(next);
        setProblem(null);
        summaryRef.current?.(next);
      });

      control.on("routingerror", () => {
        setProblem("The routing service could not be reached — showing a straight line instead.");
        if (!fallbackRef.current) {
          fallbackRef.current = L.polyline(points.map(point => L.latLng(point.lat, point.lng)), {
            color,
            weight: 4,
            dashArray: "8 8",
          }).addTo(map);
        }
      });

      control.addTo(map);
      routingRef.current = control;
    }, 500);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  const kilometres = summary ? (summary.distanceMetres / 1000).toFixed(1) : null;
  const minutes = summary ? Math.max(1, Math.round(summary.durationSeconds / 60)) : null;

  // "Open in OpenStreetMap" — the full route, in openstreetmap.org's own
  // directions view, using the same OSRM car engine this map uses. Built from
  // the stops themselves, so it is always correct and nobody has to paste a
  // link from anywhere.
  const osmLink =
    points.length >= 2
      ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${points
          .map(point => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`)
          .join(";")}`
      : null;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low" style={{ height }}>
        <div ref={container} className="h-full w-full" style={{ zIndex: 0 }} />

        {points.length < 2 ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/80 text-center text-on-surface-variant">
            <MapPin className="h-5 w-5" />
            <p className="text-[13px]">
              {editable ? "Click the map to drop the first stops of the route." : "No route line published yet."}
            </p>
          </div>
        ) : null}
      </div>

      {problem ? (
        <p className="flex items-start gap-2 text-[12px] text-on-surface-variant">
          <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0 text-error" />
          {problem}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-on-surface-variant">
        <span className="tabular">
          {points.length} stop{points.length === 1 ? "" : "s"}
          {points.length >= 2 ? ` · ${points[0]!.name} → ${points[points.length - 1]!.name}` : ""}
          {kilometres ? ` · ${kilometres} km by road · about ${minutes} min driving` : ""}
        </span>
        {osmLink ? (
          <a className="inline-flex items-center gap-1 font-semibold text-tertiary underline" href={osmLink} target="_blank" rel="noreferrer">
            Open in OpenStreetMap <ExternalLink className="h-3 w-3" />
          </a>
        ) : mapUrl ? (
          <a className="inline-flex items-center gap-1 font-semibold text-tertiary underline" href={mapUrl} target="_blank" rel="noreferrer">
            Open the saved map link <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      {editable ? (
        <p className="text-[12px] text-on-surface-variant">
          Click the map to add a stop at the end of the list, or drag a numbered pin to move it. The line always follows real roads — it is
          calculated by OSRM, the same engine behind openstreetmap.org directions.
        </p>
      ) : null}
    </div>
  );
}
