// Leaflet Routing Machine ships no TypeScript types of its own and is used
// here only through the global `L.Routing`, so a plain module declaration is
// all TypeScript needs to accept the side-effect import in RouteMap.tsx.
declare module "leaflet-routing-machine";
declare module "leaflet-routing-machine/dist/leaflet-routing-machine.css";
