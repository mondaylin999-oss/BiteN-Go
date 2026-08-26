# BiteN Go

> ## ⚡ What is new in this version
>
> This is the merge of your two BiteN Go zips, rebuilt the way the GameBuddy
> project is built:
>
> - **The frontend is a separate app, wired to a separate backend.** They talk
>   over a plain REST API, and every screen reads and writes **one shared
>   PostgreSQL database**. Register on your laptop, log in on your phone — same
>   account. An agent confirms a payment on their computer → the student's
>   wallet changes on the student's phone.
> - **PostgreSQL instead of the managed/MySQL database.** `database/schema.sql`
>   is written for pgAdmin4 and creates all 14 tables.
> - **Nothing from the hosting platform is left.** No Manus SDK, no hosted
>   OAuth, no cloud storage, no LLM calls — the app owns its own accounts and
>   runs completely on your own computer.
> - **The UI is the "Nexus Transit & Dining" design** from your frontend zip:
>   its colours, its Inter + JetBrains Mono type scale, its 8px grid, its top
>   bar / side rail / mobile bottom bar, the Smart Canteen Menu, the Ferry Live
>   Tracking screen and the Kitchen Display System, applied across every screen.
> - **C++ is the core of the project, not a side module.** Every rule that
>   decides money, seats, kitchen order or the pre-order window lives in
>   `backend/cpp` and is executed by a compiled C++ engine. The Node API asks
>   it; it does not decide by itself.
>
> **You must run the database and the backend.** The frontend alone shows only
> a "Cannot reach the BiteN Go server" message. Section 2 has the commands.

A campus platform with two halves that share one wallet:

- **Smart canteen** — agents publish a menu inside the Myanmar pre-order window
  (12:00 PM → midnight), students pre-order with the wallet or with cash, and
  the kitchen works a three-lane display board.
- **Ferry bus** — the administrator registers buses, routes and departures; the
  transport agent runs their own ferry and accepts seat requests; students book
  a seat and carry a pass.
- **4 roles / 4 portals:** Administrator, Canteen agent, Transport agent
  (driver), Student. Each has its own screens and never sees another's.
- **Stack:** C++20 (the rules engine), Node + Express + TypeScript (the API),
  PostgreSQL (the database), React + TypeScript + Vite + Tailwind (the app).
- Fully responsive: it works down to a small phone and scales up to a desktop.

```
biten-go/
├── backend/      Node + Express REST API, Drizzle ORM, and the C++ engine
│   └── cpp/      ← the C++ domain code: ferry, canteen, cash flow, kitchen
├── frontend/     React / Vite / TypeScript app in the Nexus design
├── database/     PostgreSQL schema for pgAdmin4 (+ a reset script)
├── verify/       scripts that prove the engine, the schema and the API work
├── deploy/       notes for running it on a small server
└── README.md     this file
```

---

## Table of contents

1. [The four portals](#1-the-four-portals)
2. [Install & run — quick reference](#2-install--run--quick-reference)
3. [PostgreSQL & pgAdmin4 — the full guide](#3-postgresql--pgadmin4--the-full-guide)
4. [Starter logins & first run](#4-starter-logins--first-run)
5. [Windows (PowerShell) setup, and your Wi-Fi](#5-windows-powershell-setup-and-your-wi-fi)
6. [The C++ engine](#6-the-c-engine)
7. [How the frontend is wired to the backend](#7-how-the-frontend-is-wired-to-the-backend)
8. [The rules the system enforces](#8-the-rules-the-system-enforces)
9. [API reference](#9-api-reference)
10. [Project layout, file by file](#10-project-layout-file-by-file)
11. [Verifying it works](#11-verifying-it-works)
12. [Troubleshooting](#12-troubleshooting)
13. [What changed from your two zips](#13-what-changed-from-your-two-zips)
14. [The ferry map — real roads with Leaflet + OSRM](#14-the-ferry-map--real-roads-with-leaflet--osrm)

---

## 1. The four portals

| Role | Where they land | What they do |
|---|---|---|
| **Student** | `/student` | Dashboard, **Canteen Menu**, **Meal Orders**, **Wallet**, **Ferry Tracking**, **Transport Pass** |
| **Canteen agent** | `/agent` | **Kitchen Display** (the KDS board), **Menu Board**, **Float & Top-ups** |
| **Transport agent** | `/driver` | **Ferry Console** (seat requests, trips, capacity, faults), **Route & Map** |
| **Administrator** | `/admin` | **Overview**, **People**, **Transport Ops**, **Canteen Ops**, **Cash Flow** |

It is one React app, and the routes are guarded: a student who types `/admin`
is sent back to their own screen.

Money flows in one direction, and the database records every step:

```
   Administrator ──allocates──►  Canteen agent ──tops up──►  Student wallet
                                       ▲                          │
                                       └────── pays for meals ────┘
```

---

## 2. Install & run — quick reference

Three terminals, in this order. (Full detail in sections 3–5.)

```bash
# 1) DATABASE — do this first, once
#    In pgAdmin4: create a database called  biten_go_db
#    then open database/schema.sql in the Query Tool and run it (F5).

# 2) BACKEND
cd backend
npm install
cp .env.example .env          # Windows: copy .env.example .env
#   → edit .env: your PostgreSQL password, and a JWT_SECRET
bash cpp/build.sh             # compiles the C++ engine (Windows: cpp\build.bat)
npm run dev                   # http://localhost:8000

# 3) FRONTEND (a second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Frontend: `http://localhost:5173` — Backend health: `http://localhost:8000/health`

> **Order matters:** database → backend → frontend. The app keeps no data of
> its own, so if the backend is not running you get "Cannot reach the BiteN Go
> server".
>
> There are also one-click starters: `backend/start.sh` (macOS/Linux) and
> `backend\start.bat` (Windows) create `.env`, install dependencies, build the
> C++ engine and start the API.

### Requirements

| Tool | Version | Needed for |
|---|---|---|
| **Node.js** | 20 LTS or newer | backend and frontend |
| **PostgreSQL + pgAdmin4** | 14 or newer | the database |
| **A C++20 compiler** | g++ 11+, clang 14+, or MSVC 2022 | the C++ engine |
| **CMake** | 3.16+ | optional — `build.sh` falls back to a direct `g++` call |

The app still runs **without** a C++ compiler: the API then uses an equivalent
TypeScript implementation of the same rules and says so at startup and on
`/health`. Build the engine when you want the C++ to be the one deciding.

---

## 3. PostgreSQL & pgAdmin4 — the full guide

### 3.1 Install

Download PostgreSQL from <https://www.postgresql.org/download/>. The installer
includes **pgAdmin4**. During installation you choose a password for the
`postgres` superuser — **write it down**, `.env` needs it.

### 3.2 Create the database

**In pgAdmin4:**

1. Open pgAdmin4 and connect to *PostgreSQL 16* (or whichever version).
2. Right-click **Databases → Create → Database…**
3. **Database:** `biten_go_db` — **Owner:** `postgres` — **Save**.

**Or on the command line:**

```bash
createdb -U postgres biten_go_db
```

### 3.3 Create the tables

**In pgAdmin4:**

1. Click `biten_go_db`, then **Tools → Query Tool**.
2. Press the folder icon and open `database/schema.sql` from this project.
3. Press **F5** (or ▶). It prints a few "already exists, skipping" notices if
   you run it twice — that is fine, the script is written to be re-runnable.
4. Refresh **Schemas → public → Tables**: **14 tables** appear.

**Or on the command line:**

```bash
psql -U postgres -d biten_go_db -f database/schema.sql
```

To wipe everything and start again, run `database/reset.sql` first.

### 3.4 Point the backend at it

`backend/.env` (copy it from `.env.example`):

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/biten_go_db
JWT_SECRET=some-long-random-string
```

> **Special characters in the password must be percent-encoded**, or the URL is
> parsed wrongly and you get a login failure:
>
> | character | write it as | | character | write it as |
> |---|---|---|---|---|
> | `#` | `%23` | | `:` | `%3A` |
> | `@` | `%40` | | `?` | `%3F` |
> | `/` | `%2F` | | `%` | `%25` |
>
> So the password `MDLPK2006#` becomes `MDLPK2006%23` in `DATABASE_URL`.

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3.5 What is in the database

| Table | Holds |
|---|---|
| `users` | every account, all four roles, with a scrypt password hash |
| `transactions` | every money movement, in integer kyat, never edited |
| `food_items` | the dishes on each agent's board |
| `orders`, `order_items` | pre-orders and their lines |
| `vehicles` | ferry buses, their seats and monthly fee |
| `driver_profiles` | the transport agent's phone, licence, availability |
| `transport_routes`, `route_stops` | routes and their pickup stops |
| `route_map_nodes` | the geographic points that draw the route line |
| `trips` | one departure of a route |
| `ride_bookings` | one student's seat request on one trip |
| `transport_payments` | the link between a booking and its charge |
| `vehicle_maintenance` | faults reported by the transport agent |

Money is stored as an **integer number of kyat**. No floating point is used in
any balance, anywhere in the project.

---

## 4. Starter logins & first run

The backend seeds these accounts the first time it starts (`SEED_ON_START=true`
in `.env`), and repairs them if a password hash was ever damaged:

| Role | Username | Password | Lands on |
|---|---|---|---|
| Administrator | `admin` | `biten123` | `/admin` |
| Canteen agent | `agent01` | `biten123` | `/agent` |
| Canteen agent | `agent02` | `biten123` | `/agent` |
| Transport agent | `driver01` | `biten123` | `/driver` |
| Students | `student01` … `student05` | `biten123` | `/student` |

Change `SEED_PASSWORD` in `.env` before the first run if you want a different
one, and **change all of them before anyone real uses this**. You can re-run the
seed at any time with `cd backend && npm run seed`.

The seed also adds 8 demo dishes, one ferry bus with a route and two upcoming
departures, and some opening allocations so the dashboards are not empty.

### First run, end to end (3 minutes)

1. Open `http://localhost:5173` and sign in as `agent01`. You land on the
   **Kitchen Display**.
2. Go to **Menu Board** → **Add dish** → name it, price it, save. Set its
   availability to **Available**. *(If it refuses: the pre-order window is
   closed — it only opens from 12:00 PM Myanmar time. That is rule number one.)*
3. In another browser (or a private window) sign in as `student01` →
   **Canteen Menu** → add the dish → **Place pre-order**.
4. Back in the agent window, the ticket is on the **Incoming** lane of the
   Kitchen Display, with a priority score. Move it to prep, then ready, then
   complete.
5. As the student, open **Wallet**: the order was taken out of the balance, and
   the running balance came out of PostgreSQL.
6. As the student open **Ferry Tracking** → request a seat. Notice the free-seat
   count does **not** change: a pending request holds nothing.
7. Sign in as `driver01` → **Ferry Console** → accept the request. *Now* the
   seat count drops. The student's **Transport Pass** becomes valid.
8. Sign in as `admin` → **Overview**: the allocations, the agents' positions,
   the kitchen and the ferry, all on one screen.

---

## 5. Windows (PowerShell) setup, and your Wi-Fi

### Install once

- **Node.js LTS (20+)** — <https://nodejs.org> (restart PowerShell afterwards).
- **PostgreSQL + pgAdmin4** — section 3.
- **A C++ compiler** — either **Visual Studio Build Tools** with "Desktop
  development with C++", or **MinGW-w64** (gives you `g++`). Optional, but the
  C++ engine is the point of this project, so install it.

If PowerShell refuses to run npm's scripts with an "execution policy" error,
open PowerShell **as Administrator** once and run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### Run

```powershell
# terminal 1 — backend
cd backend
npm install
copy .env.example .env
notepad .env               # DATABASE_URL + JWT_SECRET
cpp\build.bat              # compiles the C++ engine
npm run dev

# terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Or just double-click `backend\start.bat`.

### Opening it from your phone (same Wi-Fi, no internet needed)

1. Find your laptop's address:

   ```powershell
   ipconfig
   ```

   Look for **IPv4 Address** under your active Wi-Fi adapter, e.g. `192.168.1.42`.
2. The Vite dev server already listens on every interface (`host: true`), so on
   your phone open `http://192.168.1.42:5173`.
3. The API also listens on every interface by default (`HOST=0.0.0.0` in
   `.env`). You do **not** have to configure the address anywhere: the app
   finds the backend by itself (section 7).
4. If Windows Firewall asks whether to allow Node.js on private networks, say
   yes.

---

## 6. The C++ engine

`backend/cpp` is where the project's thinking happens. It is a plain C++20
codebase with no third-party dependencies — the JSON reader/writer it needs is
in `include/Json.hpp` — so it compiles anywhere with `cmake` or a bare `g++`.

```
backend/cpp/
├── include/
│   ├── Json.hpp                       a small JSON value / parser / writer
│   ├── FerryBusDomain.hpp             Driver, Student, FerryBus, Route, Request
│   ├── FerryBusRepository.hpp         the storage port (interface)
│   ├── InMemoryFerryBusRepository.hpp the adapter used by the demo and tests
│   ├── FerryBusManagementService.hpp  the ferry aggregate and its invariants
│   ├── SeatPlanner.hpp                the same rules, in the shape the API uses
│   ├── CanteenService.hpp             pre-order window, basket pricing
│   ├── CashflowEngine.hpp             balances, ledgers, monthly buckets
│   └── KitchenBoard.hpp               the KDS lanes and their priority scoring
├── src/…                              the implementations
│   ├── engine_main.cpp                the CLI the Node API calls
│   └── demo_main.cpp                  a console walk-through of everything
├── tests/engine_tests.cpp             assert-based unit tests, run by CTest
├── CMakeLists.txt
├── build.sh / build.bat
```

### Build it

```bash
bash backend/cpp/build.sh          # macOS / Linux / Git Bash / WSL
backend\cpp\build.bat              # Windows
```

That produces three programs in `backend/cpp/build/`:

| Program | What it is |
|---|---|
| `biten_engine` | the JSON command-line filter the API calls |
| `biten_demo` | a console demo of the whole domain — no database needed |
| `biten_tests` | the unit tests (`ctest --test-dir build`) |

### How the API talks to it

```
Node  ── JSON on stdin ──►  biten_engine <command>  ── JSON on stdout ──►  Node
```

You can drive it by hand:

```bash
echo '{"yangonHour":14}' | backend/cpp/build/biten_engine canteen.window
# {"ok":true,"result":{"orderingOpen":true,"message":"Pre-orders are open …"}}

backend/cpp/build/biten_engine info
```

| Command | Decides |
|---|---|
| `canteen.window`, `canteen.publishGuard` | whether the pre-order window is open |
| `canteen.quote` | basket total, one-agent rule, availability, wallet cover |
| `cashflow.summary`, `cashflow.history`, `cashflow.monthly`, `cashflow.agents` | every balance and running total in the app |
| `ferry.plan`, `ferry.canRequest`, `ferry.canConfirm`, `ferry.capacityFloor` | seats taken, seats free, may this be booked / confirmed / shrunk |
| `kds.board`, `kds.canAdvance` | kitchen lanes, ticket priority, legal transitions |
| `info` | which engine is answering |

### The fallback

If the binary has not been built, `backend/src/engine.ts` runs an equivalent
TypeScript implementation of the same rules, so the app never breaks on a
machine without a compiler — the same idea as GameBuddy's optional C++
matchmaking module. Which one is live is printed at startup and shown in
`GET /health`, in the top bar of the app, and on the Profile screen.

Set `BITEN_ENGINE_REQUIRED=true` in `.env` to refuse to start without the C++
binary instead.

`backend/src/engine.test.ts` runs the *same scenarios* as the C++ unit tests
through whichever engine is live, which is what keeps the two in step.

---

## 7. How the frontend is wired to the backend

There is no mock data anywhere in the app. Every screen calls the API, which
reads and writes PostgreSQL.

**Finding the API.** `frontend/src/lib/api.ts` tries several addresses and keeps
the first that answers `/health`:

1. `VITE_API_URL` from `frontend/.env`, if you set one (use this in production)
2. `<this page's origin>/api` — the Vite dev proxy in `vite.config.ts`, which
   works no matter which address you opened the page from, including a phone
3. `<this page's host>:8000` — the API on the same machine
4. `http://localhost:8000`, then `http://127.0.0.1:8000`

That is what avoids the classic *"cannot reach the server at
http://172.16.x.x:8000"* problem, where Windows serves the page from a virtual
adapter (WSL / Hyper-V / VirtualBox) that the API is not listening on.

**Sessions.** Logging in returns a JWT. The app keeps it in `localStorage` and
sends it as `Authorization: Bearer …` on every request. No cookies are used, so
nothing breaks when the page and the API are on different addresses.

**Freshness.** Screens that other people change reload by themselves: the
kitchen board every 15 seconds, ferry departures every 20, meal orders every 30.
Everything else reloads right after you change it.

**The map** is the one screen that also calls the outside world — it fetches map
tiles from OpenStreetMap and the driving path from OSRM. Section 14 explains it,
including what happens when the laptop is offline.

---

## 8. The rules the system enforces

These are decided in C++ and cannot be worked around from the browser.

**Canteen**

- Pre-orders are open only from **12:00 PM to midnight, Asia/Yangon** — that
  window buys tomorrow's food. Outside it, students see an empty menu and agents
  cannot publish a dish.
- One basket, **one agent**. Two vendors in one basket is refused.
- A wallet order is refused unless the balance covers the whole basket.
- A cash order is created **awaiting confirmation**; the money only moves when
  the agent confirms it at the counter.
- Kitchen tickets move `pending → preparing → ready → completed` and no other
  way. A cash ticket cannot be completed before the cash is confirmed.
- Board priority = waiting minutes + 6 for an unpaid cash ticket + 2 per item;
  anything waiting 12 minutes or more is flagged **ASAP** and pinned to the top.

**Ferry**

- A **pending** seat request holds nothing. Only a request the driver has
  **confirmed** reduces the free-seat count.
- A student may hold only one active request per departure; 1–8 seats each.
- The driver may not confirm a request that would oversell the bus, and may not
  shrink capacity below the seats already confirmed.
- Trips move `scheduled → boarding → in_progress → completed`, with
  cancellation allowed only before departure.
- Only the assigned transport agent can edit a route or publish its map, and a
  map link must be `https://`.

**Money**

- Every movement is an immutable row. Balances are always derived, never stored.
- An agent cannot pay out more than the float they hold.
- Admin's "network balance" is what they funded minus what the agents actually
  disbursed.
- Accounts are **deactivated**, never deleted, so the history stays honest.

---

## 9. API reference

Base URL `http://localhost:8000`. Everything is JSON. Authenticated calls need
`Authorization: Bearer <token>`.

### Public

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | status, which engine is live, database version, Myanmar time |
| `GET` | `/engine` | what the C++ engine reports about itself |
| `POST` | `/auth/login` | `{username, password}` → `{token, user}` |
| `POST` | `/auth/register` | student self-registration → `{token, user}` |
| `GET` | `/auth/me` | the signed-in account |
| `POST` | `/auth/password` | change your own password |

### Canteen

| Method | Path | Who |
|---|---|---|
| `GET` | `/canteen/window` | anyone |
| `GET` | `/canteen/menu` | every role sees their own view |
| `POST` | `/canteen/menu` | agent — add a dish |
| `PATCH` | `/canteen/menu/:id/availability` | agent |
| `DELETE` | `/canteen/menu/:id` | agent |
| `GET` | `/canteen/orders` | student / agent / admin, scoped |
| `POST` | `/canteen/orders` | student — place a pre-order |
| `POST` | `/canteen/orders/:id/confirm-cash` | agent |
| `PATCH` | `/canteen/orders/:id/status` | agent |
| `GET` | `/canteen/kds` | agent — the kitchen board |

### Transport

| Method | Path | Who |
|---|---|---|
| `GET` | `/transport/routes` · `/transport/trips` · `/transport/bookings` | everyone, scoped |
| `GET` | `/transport/drivers` · `/vehicles` · `/maintenance` | admin |
| `POST`/`PATCH` | `/transport/vehicles`, `/transport/vehicles/:id` | admin |
| `POST`/`PATCH` | `/transport/routes`, `/transport/routes/:id` | admin |
| `POST` | `/transport/trips` | admin |
| `PATCH` | `/transport/maintenance/:id` | admin |
| `GET` | `/transport/driver/dashboard` · `/driver/profile` | driver |
| `PATCH` | `/transport/driver/profile` · `/driver/vehicle-capacity` · `/driver/routes/:id` | driver |
| `POST` | `/transport/driver/routes/:id/map` | driver — publish the route line |
| `PATCH` | `/transport/driver/trips/:id/status` · `/driver/bookings/:id` | driver |
| `POST` | `/transport/driver/maintenance` | driver |
| `POST`/`DELETE` | `/transport/bookings`, `/transport/bookings/:id` | student |

### Money

| Method | Path | Who |
|---|---|---|
| `GET` | `/cashflow/overview` · `/monthly` · `/history` · `/wallet` | everyone, scoped |
| `GET` | `/cashflow/participants` | admin (everyone) / agent (students) |
| `POST` | `/cashflow/participants` | admin — create an account |
| `POST` | `/cashflow/participants/:id/deactivate` · `/activate` | admin |
| `POST` | `/cashflow/allocate` | admin — fund an agent |
| `POST` | `/cashflow/pay-user` | agent — top up a student wallet |
| `POST`/`DELETE` | `/cashflow/entries`, `/cashflow/entries/:id` | admin / agent |
| `GET` | `/cashflow/admin-flow` | admin — each agent's position |

Errors always come back as `{ "error": "a sentence you can show the user" }`
with a sensible status: 400 a broken rule, 401 not signed in, 403 wrong role,
404 missing, 409 already taken, 429 too many login attempts.

### A scheduled job

```bash
curl -X POST http://localhost:8000/scheduled/close-food-preorders
```

Closes every dish at Myanmar midnight. Point Task Scheduler or cron at it if you
want it automatic.

---

## 10. Project layout, file by file

```
backend/
├── src/
│   ├── index.ts        the Express server, CORS, /health, startup banner
│   ├── env.ts          everything read from .env
│   ├── database.ts     the PostgreSQL pool + "have you run schema.sql?" check
│   ├── auth.ts         scrypt passwords, JWT sessions, login rate limiting
│   ├── engine.ts       the bridge to the C++ engine + the TypeScript twin
│   ├── engine.test.ts  parity tests (npm test)
│   ├── accounts.ts     user records
│   ├── canteen.ts      menu, orders, kitchen board
│   ├── transport.ts    vehicles, routes, trips, bookings, maintenance
│   ├── cashflow.ts     money movements (all figures come from the engine)
│   ├── seed.ts         starter accounts and demo data
│   ├── time.ts         Asia/Yangon hour and date
│   ├── http.ts         route helpers, role guards, one error shape
│   └── routes/         auth.ts · canteen.ts · transport.ts · cashflow.ts
├── drizzle/schema.ts   the TypeScript mirror of database/schema.sql
└── cpp/                the C++ engine (section 6)

frontend/src/
├── main.tsx · App.tsx           mount, routing, role guards
├── index.css                    the Nexus design tokens as Tailwind theme
├── lib/api.ts                   API discovery, session token, typed calls
├── lib/auth.tsx                 who is signed in
├── lib/format.ts                kyat, dates, relative times
├── hooks/useApiData.ts          load / loading / error / refresh / poll
├── components/AppShell.tsx      top bar, side rail, mobile bottom bar
├── components/ui.tsx            cards, stat tiles, badges, buttons, tables
├── components/RouteMap.tsx      draws a published ferry route as SVG
└── pages/
    ├── Login.tsx · Profile.tsx · NotFound.tsx
    ├── student/  Dashboard · CanteenMenu · MealOrders · WalletPage
    │             FerryTracking · TransportPass
    ├── agent/    KitchenDisplay · MenuBoard · AgentFloat
    ├── driver/   FerryConsole · RouteEditor
    └── admin/    Overview · People · TransportOps · CanteenOps · CashHistory
```

---

## 11. Verifying it works

```bash
# the C++ engine: compile, unit tests, then drive the CLI like the API does
bash verify/verify_engine.sh

# the schema: apply it to a real database twice, count the tables
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/biten_go_db \
  bash verify/verify_schema.sh

# the whole API: log in as four roles, publish a dish, order it, run it across
# the kitchen board, request a ferry seat, confirm it   (needs the backend up)
bash verify/verify_api.sh
```

Plus:

```bash
cd backend  && npm run check && npm test    # typecheck + engine parity tests
cd frontend && npm run check && npm run build
backend/cpp/build/biten_demo                # the console walk-through
```

---

## 12. Troubleshooting

**"Cannot reach the BiteN Go server"**
The backend is not running, or it crashed at startup. Look at its terminal.
Check `http://localhost:8000/health` in a browser.

**The backend exits with "Cannot connect to PostgreSQL"**
`DATABASE_URL` is wrong. Most often it is an unencoded `#` or `@` in the
password — see section 3.4. Confirm the same string works with
`psql "postgresql://…"`.

**"The BiteN Go tables are missing from this database"**
You created the database but did not run `database/schema.sql`. Section 3.3.

**"Invalid username or password" for a starter account**
Run `cd backend && npm run seed`. It repairs any account whose password hash is
not a real scrypt hash and prints the password it used.

**The menu is empty / "Pre-orders are closed"**
That is the rule, not a bug: the window is 12:00 PM → midnight Myanmar time.
To demonstrate outside those hours, change your computer's clock, or call the
API directly, or temporarily widen the window in
`backend/cpp/src/CanteenService.cpp` (`isPreorderWindowOpen`) — and rebuild.

**The top bar says "TypeScript fallback"**
The C++ engine has not been compiled, or the binary is somewhere else. Run
`bash backend/cpp/build.sh` and restart the backend, or point
`BITEN_ENGINE_PATH` at the binary in `.env`.

**`cmake` not found**
`build.sh` falls back to a direct `g++ -std=c++20` call. If you have neither,
install MinGW-w64 (Windows) or `build-essential` (Linux) or Xcode command line
tools (macOS).

**The phone shows the page but nothing loads**
The API must listen on every interface: `HOST=0.0.0.0` in `.env` (the default),
and allow Node.js through the firewall on private networks.

**Port 5173 or 8000 already in use**
Change `PORT` in `backend/.env`, or `server.port` in `frontend/vite.config.ts`.

---

## 13. What changed from your two zips

| Was | Now |
|---|---|
| One folder with `client/` + `server/` and a shared build | `frontend/` and `backend/` are separate apps that talk over REST, like GameBuddy |
| tRPC procedures | plain REST endpoints (section 9) |
| MySQL through Drizzle | PostgreSQL through Drizzle, plus a hand-written `database/schema.sql` for pgAdmin4 |
| Hosted OAuth login, `server/_core/*` platform SDK, cloud storage, LLM and voice helpers | local username + password, scrypt hashes, JWT sessions; every platform file deleted |
| `client/public/__manus__/*`, `vite-plugin-manus-runtime`, `ManusDialog`, `AIChatBox` | removed |
| Seeded "preview" data mixed into the UI | one real seed that writes to PostgreSQL (`backend/src/seed.ts`) |
| `cpp/ferry_bus/` — a standalone module the app never called (and missing `FerryBusRepository.hpp`, so it did not compile) | `backend/cpp/` — the project's core: ferry, canteen, cash flow and kitchen rules, called by the API on every request, with unit tests and a demo |
| The Stitch design pack as three loose HTML mockups | the design system implemented across every screen of the app |

Nothing was dropped from your feature set: the canteen board, the pre-order
window, cash-or-wallet payment, the money flow between admin, agents and
students, the ferry buses, routes, stops, trips, seat requests, driver-published
route maps, capacity limits and maintenance reports are all here — running on
PostgreSQL, in the new design.

---

## 14. The ferry map — real roads with Leaflet + OSRM

The route line on the map **follows real roads**. It is not a straight line
between the stops and it is not a picture — the path is calculated by a routing
engine, the same way openstreetmap.org gives you directions.

### The four pieces, and what each one does

| Piece | Job | Cost |
|---|---|---|
| **Leaflet** | the map itself: tiles, pan, zoom, the numbered pins | free (MIT) |
| **OpenStreetMap** | the map images | free, no account, no key |
| **OSRM** | given the stops, returns the driving path along real roads, plus the real distance and driving time | free demo server, no key |
| **Leaflet Routing Machine** | the glue: sends the stops to OSRM and draws the path Leaflet | free (BSD) |

There is **no API key anywhere**. The earlier version of this project drew the
map with Google Maps through a hosted proxy, which needed a key that stopped
working the moment the app was made to run on your own computer.

All of it lives in one file: `frontend/src/components/RouteMap.tsx`.

### Where the stops come from

The transport agent (driver) publishes them in **Route & Map**, and they are
stored in the `route_map_nodes` table — name, latitude, longitude, order.
The API endpoint is `POST /transport/driver/routes/:id/map`; students read them
back with the route in `GET /transport/routes`.

So the *stops* are yours, in your database. Only the *road between them* is
worked out by OSRM, live, in the browser.

### Drawing a route as the driver

1. Log in as `driver01`, open **Route & Map**.
2. **Click the map** where the bus stops. Each click adds a point with its
   coordinates already filled in — no more copying numbers out of Google Maps.
3. **Drag a numbered pin** to move a stop; the trash button removes one.
4. The caption under the map shows what OSRM measured, e.g.
   *"5 stops · Main Gate → North Hall · 4.8 km by road · about 14 min driving"*.
5. **Publish route line** saves the stops. **Save route** additionally stores the
   measured `distance_km` and `estimated_minutes` on the route, so those numbers
   are measured rather than guessed.

Students then see the same road line in **Ferry Tracking**.

### If the laptop is offline

Tiles will not load and OSRM cannot answer. The map then draws a **dashed
straight line** between the stops and says so in small print underneath, so a
demo without internet still shows the shape of the route instead of an error.

### Using your own routing server (optional)

The public demo server `https://router.project-osrm.org` is rate limited and
asks not to be hammered. If you want the map to work with no internet at all,
or you need it to be reliable during a presentation, run OSRM yourself from a
Myanmar map extract:

```bash
# once: prepare the data (about 10 minutes for Myanmar)
wget https://download.geofabrik.de/asia/myanmar-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/myanmar-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/myanmar-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/myanmar-latest.osrm

# then: serve it on port 5000
docker run -t -i -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/myanmar-latest.osrm
```

Then put this in `frontend/.env`:

```
VITE_OSRM_URL=http://localhost:5000/route/v1
```

(Tiles would still come from the internet. For a fully offline map you would
also self-host a tile server, which is a much bigger job — usually not worth it
for a demo.)

### Packages this added

`frontend/package.json` gained `leaflet`, `leaflet-routing-machine` and
`@types/leaflet`. A plain `npm install` in `frontend/` installs them.
