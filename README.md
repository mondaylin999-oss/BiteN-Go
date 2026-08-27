<<<<<<< HEAD
# 1) BACKEND
=======
# BiteN Go

> ## ⚡ What is new in this version
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
15. [doctor.bat — one click that checks everything](#15-doctorbat--one-click-that-checks-everything)
16. [Version history](#16-version-history)

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
>>>>>>> 5cd25439dcca63afbad32383f0119d61e16557a4
cd backend
npm install
cp .env.example .env          # Windows: copy .env.example .env
#   → edit .env: your PostgreSQL password, and a JWT_SECRET
bash cpp/build.sh             # compiles the C++ engine (Windows: cpp\build.bat)
npm run dev                   # http://localhost:8000

# 2) FRONTEND (a second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173