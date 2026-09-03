// ===========================================================================
//  api.ts — the single place where the app talks to the BiteN Go backend.
//
//  FINDING THE BACKEND
//  -------------------
//  The app does not assume one fixed URL. It tries several, in order, and
//  keeps the first that answers /health:
//
//    1. VITE_API_URL from frontend/.env, if you set one (use in production)
//    2. <this page's origin>/api  — the Vite dev proxy in vite.config.ts.
//       This works no matter which address you opened the page from,
//       including from your phone on the same Wi-Fi.
//    3. <this page's host>:8000  — the API on the same machine, direct
//    4. http://localhost:8000 / http://127.0.0.1:8000 — last resort
//
//  That is what avoids the classic "cannot reach the server at
//  http://172.16.x.x:8000" problem, where Windows serves the page from a
//  virtual adapter the API is not listening on.
//
//  SESSIONS
//  --------
//  Login returns a JWT. It is kept in localStorage and sent on every request
//  as  Authorization: Bearer <token>.  There are no cookies, so nothing
//  breaks when the app and the API are on different addresses.
// ===========================================================================

const TOKEN_KEY = "biten_go_token";
const BASE_CACHE_KEY = "biten_go_api_base";

function candidateBaseUrls(): string[] {
  const list: string[] = [];
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured && configured.trim()) list.push(configured.trim().replace(/\/+$/, ""));

  if (typeof window !== "undefined") {
    const { protocol, hostname, origin } = window.location;
    list.push(`${origin}/api`);
    list.push(`${protocol}//${hostname}:8000`);
  }
  list.push("http://localhost:8000");
  list.push("http://127.0.0.1:8000");

  return list.filter((value, index) => value && list.indexOf(value) === index);
}

export const API_BASE_GUESS = candidateBaseUrls()[0] ?? "http://localhost:8000";

let resolvedBase: string | null = null;
let resolving: Promise<string> | null = null;

async function pingHealth(base: string, timeoutMs = 2500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${base}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export async function resolveApiBase(): Promise<string> {
  if (resolvedBase) return resolvedBase;
  if (resolving) return resolving;

  resolving = (async () => {
    try {
      const cached = sessionStorage.getItem(BASE_CACHE_KEY);
      if (cached && (await pingHealth(cached))) {
        resolvedBase = cached;
        return cached;
      }
    } catch {
      /* sessionStorage blocked — just probe */
    }

    for (const candidate of candidateBaseUrls()) {
      if (await pingHealth(candidate)) {
        resolvedBase = candidate;
        try {
          sessionStorage.setItem(BASE_CACHE_KEY, candidate);
        } catch {
          /* ignore */
        }
        return candidate;
      }
    }

    throw new ApiError(
      0,
      "Cannot reach the BiteN Go server. Start the backend first:\n" +
        "    cd backend && npm run dev\n" +
        "then reload this page.",
    );
  })();

  try {
    return await resolving;
  } finally {
    resolving = null;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// --- session token ---------------------------------------------------------

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — the session then lasts for this page only */
  }
}

// --- requests --------------------------------------------------------------

type RequestOptions = { method?: string; body?: unknown; query?: Record<string, string | number | undefined> };

export async function request<T>(pathname: string, options: RequestOptions = {}): Promise<T> {
  const base = await resolveApiBase();
  const url = new URL(`${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    resolvedBase = null; // the address may have changed — probe again next time
    throw new ApiError(0, "Cannot reach the BiteN Go server. Is the backend still running?");
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const message = errorMessage(payload, `Request failed (${response.status}).`);
    if (response.status === 401) setToken(null);
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

/** The API always answers a failure with { error: "..." }; fall back to a
 *  generic line when the body is empty or is not that shape. */
function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error: unknown }).error;
    if (value) return String(value);
  }
  return fallback;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export const api = {
  get: <T>(pathname: string, query?: RequestOptions["query"]) => request<T>(pathname, { query }),
  post: <T>(pathname: string, body?: unknown) => request<T>(pathname, { method: "POST", body }),
  patch: <T>(pathname: string, body?: unknown) => request<T>(pathname, { method: "PATCH", body }),
  put: <T>(pathname: string, body?: unknown) => request<T>(pathname, { method: "PUT", body }),
  delete: <T>(pathname: string) => request<T>(pathname, { method: "DELETE" }),
};

// --- shared response types -------------------------------------------------

export type Role = "admin" | "agent" | "user" | "driver";

export type SessionUser = {
  id: number;
  username: string | null;
  name: string | null;
  email: string | null;
  role: Role;
  status: "active" | "inactive";
  lastSignedIn: string;
};

export type Health = {
  status: string;
  engine: "c++" | "typescript";
  database: string;
  postgres: string | null;
  /** True when food photos are configured (Supabase keys in backend/.env). */
  photos?: boolean;
  myanmarTime: string;
};

export type PreorderWindow = { orderingOpen: boolean; message: string };

export type MenuRow = {
  item: {
    id: number;
    agentId: number;
    name: string;
    description: string | null;
    category: string;
    priceCents: number;
    /** Public link to the dish photo, or null when it has none. */
    imageUrl: string | null;
    availability: "available" | "unavailable" | "sold_out";
    active: boolean;
  };
  agentName: string | null;
  agentUsername: string | null;
};

export type OrderLine = {
  id: number;
  foodItemId: number;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  agentId: number;
};

export type OrderRow = {
  id: number;
  userId: number;
  status: "pending" | "preparing" | "ready" | "completed" | "cancelled";
  totalCents: number;
  paymentMethod: "wallet" | "direct_cash";
  paymentStatus: "paid" | "awaiting_confirmation";
  pickupNote: string | null;
  createdAt: string;
  studentName: string;
  items: OrderLine[];
};

export type KdsTicket = {
  orderId: number;
  lane: "incoming" | "preparing" | "ready";
  status: OrderRow["status"];
  studentName: string;
  itemCount: number;
  totalCents: number;
  paymentMethod: OrderRow["paymentMethod"];
  paymentStatus: OrderRow["paymentStatus"];
  placedAtMs: number;
  waitingMinutes: number;
  priorityScore: number;
  asap: boolean;
  items: OrderLine[];
};

export type KdsBoard = {
  incoming: KdsTicket[];
  preparing: KdsTicket[];
  ready: KdsTicket[];
  openTickets: number;
  asapTickets: number;
  openValueCents: number;
  averageWaitMinutes: number;
};

export type RouteRow = {
  route: {
    id: number;
    name: string;
    driverId: number | null;
    vehicleId: number | null;
    startPoint: string;
    destination: string;
    pickupLocations: string;
    mapUrl: string | null;
    mapCoordinates: string | null;
    routeLineColor: string;
    distanceKm: number | null;
    estimatedMinutes: number | null;
    fareCents: number;
    /** The bus leaves at these two times every day — that is the timetable. */
    morningTime: string;
    eveningTime: string | null;
    /** The months this road is sold for. */
    sellFrom: string | null;
    sellTo: string | null;
    status: "active" | "inactive";
  };
  driverName: string | null;
  /** The agent's phone number — the student pays them outside the app. */
  driverPhone: string | null;
  vehiclePlate: string | null;
  vehicleSeats: number | null;
  vehicleStatus: string | null;
  stops: Array<{ id: number; name: string; stopOrder: number }>;
  mapNodes: Array<{ id: number; name: string; latitude: string; longitude: string; nodeOrder: number }>;
};

export type SeatRecord = {
  id: number;
  routeId: number;
  tripId: number | null;
  userId: number;
  /** "YYYY-MM" */
  month: string;
  seatCount: number;
  seatNumber: string | null;
  /** What the month costs, in kyat. */
  fareCents: number;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: string;
};

export type SeatRow = {
  pass: SeatRecord;
  route: RouteRow["route"] | null;
  passengerName: string | null;
  passengerUsername: string | null;
  /** Who to ring about this seat, and on what number. */
  driverName: string | null;
  driverPhone: string | null;
};

/** How one road stands in one month: seats sold, seats left, my own seat. */
export type RoadMonthRow = {
  month: string;
  totalSeats: number;
  occupiedSeats: number;
  pendingSeats: number;
  availableSeats: number;
  loadPercent: number;
  sellable: boolean;
  ownPass: SeatRecord | null;
};

/** A road, with every month currently on sale. */
export type RoadRow = RouteRow & {
  vehicle: { id: number; plateNumber: string | null; totalSeats: number; status: string; monthlyFeeCents: number } | null;
  months: RoadMonthRow[];
};

export type FlowSummary = {
  received: number;
  paidOut: number;
  balance: number;
  profit: number;
  profitPercentage: number;
  downstreamPaidOut: number;
  fundingTransfers: number;
};

export type HistoryRow = {
  id: number;
  direction: "in" | "out";
  sourceRole: Role;
  targetRole: Role;
  amountCents: number;
  note: string | null;
  occurredAt: string;
  balanceAfter: number;
  counterparty: string | null;
  agentId: number | null;
  userId: number | null;
};

export type MonthRow = {
  month: string;
  invested: number;
  returned: number;
  downstreamPaidOut: number;
  fundingTransfers: number;
  payoutTransfers: number;
  profit: number;
};

export type AgentPosition = {
  agentId: number;
  allocated: number;
  disbursed: number;
  balance: number;
  agent: { id: number; name: string | null; username: string | null; status: string };
};

export type VehicleRow = {
  vehicle: {
    id: number;
    driverId: number | null;
    plateNumber: string | null;
    vehicleType: string;
    model: string;
    totalSeats: number;
    monthlyFeeCents: number;
    status: "operational" | "unavailable" | "maintenance";
    maintenanceStatus: "clear" | "reported" | "in_service";
  };
  driverName: string | null;
  driverUsername: string | null;
};

export type DriverRow = {
  id: number;
  name: string | null;
  username: string | null;
  email: string | null;
  status: string;
  phone: string | null;
  licenseNumber: string | null;
  availability: "available" | "unavailable" | null;
};

export type MaintenanceRow = {
  report: { id: number; vehicleId: number; issue: string; status: "reported" | "in_progress" | "resolved"; resolutionNote: string | null; createdAt: string };
  plateNumber: string | null;
  driverName: string | null;
};

export type DriverDashboard = {
  profile: { profile: { id: number; phone: string | null; licenseNumber: string | null; availability: "available" | "unavailable" }; user: SessionUser } | undefined;
  vehicle: VehicleRow | null;
  routes: RouteRow[];
  pendingBookings: SeatRow[];
  confirmedBookings: number;
  maintenance: MaintenanceRow[];
};
