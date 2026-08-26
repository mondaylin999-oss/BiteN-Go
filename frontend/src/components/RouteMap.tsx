// ===========================================================================
//  RouteMap.tsx — draws a published ferry route.
//
//  The transport agent publishes an ordered list of latitude/longitude nodes
//  (backend: POST /transport/driver/routes/:id/map). This component projects
//  them onto an SVG canvas, so the route line renders with no map provider,
//  no API key and no internet connection. The "Open in Google Maps" link is
//  there for when a real map is wanted.
// ===========================================================================

import { MapPin, ExternalLink } from "lucide-react";

export type MapNode = { id?: number; name: string; latitude: string | number; longitude: string | number; nodeOrder?: number };

export function RouteMap({
  nodes,
  color = "#0284C7",
  mapUrl,
  height = 260,
}: {
  nodes: MapNode[];
  color?: string;
  mapUrl?: string | null;
  height?: number;
}) {
  const points = nodes
    .slice()
    .sort((left, right) => (left.nodeOrder ?? 0) - (right.nodeOrder ?? 0))
    .map(node => ({ ...node, lat: Number(node.latitude), lng: Number(node.longitude) }))
    .filter(node => Number.isFinite(node.lat) && Number.isFinite(node.lng));

  if (points.length < 2) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant text-center text-on-surface-variant">
        <MapPin className="h-5 w-5" />
        <p className="text-[13px]">No route line published yet.</p>
        {mapUrl ? (
          <a className="text-[13px] font-semibold text-tertiary underline" href={mapUrl} target="_blank" rel="noreferrer">
            Open the route in Google Maps
          </a>
        ) : null}
      </div>
    );
  }

  // Project lat/lng into the SVG box, keeping a margin so labels fit.
  const width = 640;
  const margin = 44;
  const lats = points.map(point => point.lat);
  const lngs = points.map(point => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 0.0005;
  const spanLng = maxLng - minLng || 0.0005;

  const projected = points.map(point => ({
    ...point,
    x: margin + ((point.lng - minLng) / spanLng) * (width - margin * 2),
    // Latitude grows northwards, the SVG y-axis grows downwards.
    y: margin + (1 - (point.lat - minLat) / spanLat) * (height - margin * 2),
  }));

  const path = projected.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Ferry route line">
          <defs>
            <pattern id="bng-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#bng-grid)" />

          <path d={path} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />

          {projected.map((point, index) => {
            const isEnd = index === 0 || index === projected.length - 1;
            return (
              <g key={`${point.name}-${index}`}>
                <circle cx={point.x} cy={point.y} r={isEnd ? 8 : 5} fill={isEnd ? color : "#ffffff"} stroke={color} strokeWidth={3} />
                <text
                  x={point.x}
                  y={point.y - 14}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight={isEnd ? 700 : 500}
                  fill="#191c1e"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  {point.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-on-surface-variant">
        <span className="tabular">
          {projected.length} nodes · {projected[0]?.name} → {projected[projected.length - 1]?.name}
        </span>
        {mapUrl ? (
          <a className="inline-flex items-center gap-1 font-semibold text-tertiary underline" href={mapUrl} target="_blank" rel="noreferrer">
            Google Maps <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </div>
  );
}
