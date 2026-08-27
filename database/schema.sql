-- ===========================================================================
--  BiteN Go — PostgreSQL schema
--  Smart Canteen + Ferry Bus platform
--
--  HOW TO RUN THIS FILE (pgAdmin4)
--  ------------------------------------------------------------------------
--   1. Open pgAdmin4 and connect to your local PostgreSQL server.
--   2. Right-click "Databases" -> Create -> Database…  name it  biten_go_db
--   3. Select that database, open  Tools -> Query Tool.
--   4. Open this file (the folder icon), then press F5 / the ▶ button.
--   5. Refresh the "Schemas -> public -> Tables" node: 14 tables appear.
--
--  HOW TO RUN THIS FILE (command line)
--  ------------------------------------------------------------------------
--      createdb -U postgres biten_go_db
--      psql -U postgres -d biten_go_db -f database/schema.sql
--
--  The file is idempotent: running it twice does not fail and does not
--  destroy data. To start over, run database/reset.sql first.
--
--  You do NOT need to insert any accounts by hand. The backend seeds the
--  admin / agent / student / driver logins on its first start
--  (backend/src/seed.ts) — see section 4 of README.md.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Enumerated types
--    Postgres enums are strict: a bad value is rejected by the database, not
--    only by the application. DO-blocks make the CREATE re-runnable.
-- ---------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE user_role            AS ENUM ('admin', 'agent', 'user', 'driver');                                  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE account_status       AS ENUM ('active', 'inactive');                                                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE flow_direction       AS ENUM ('in', 'out');                                                         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE food_availability    AS ENUM ('available', 'unavailable', 'sold_out');                              EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE order_status         AS ENUM ('pending', 'preparing', 'ready', 'completed', 'cancelled');           EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_method       AS ENUM ('wallet', 'direct_cash');                                             EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_status       AS ENUM ('paid', 'awaiting_confirmation');                                     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE vehicle_status       AS ENUM ('operational', 'unavailable', 'maintenance');                         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE maintenance_flag     AS ENUM ('clear', 'reported', 'in_service');                                   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE maintenance_status   AS ENUM ('reported', 'in_progress', 'resolved');                               EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE route_status         AS ENUM ('active', 'inactive');                                                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE driver_availability  AS ENUM ('available', 'unavailable');                                          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE trip_status          AS ENUM ('scheduled', 'boarding', 'in_progress', 'completed', 'cancelled');    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE booking_status       AS ENUM ('pending', 'confirmed', 'cancelled');                                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transport_pay_status AS ENUM ('charged', 'refunded');                                               EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1. Accounts
--    One table for all four roles. `password_hash` holds a scrypt hash
--    produced by backend/src/auth.ts — never a plain password.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  open_id        VARCHAR(64)  NOT NULL UNIQUE,          -- stable public id used in session tokens
  username       VARCHAR(64)  UNIQUE,
  password_hash  VARCHAR(255),
  name           TEXT,
  email          VARCHAR(320),
  login_method   VARCHAR(64)  DEFAULT 'local',
  role           user_role      NOT NULL DEFAULT 'user',
  status         account_status NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_signed_in TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_role_status_idx ON users (role, status);

-- ---------------------------------------------------------------------------
-- 2. Money movement
--    Every row is an immutable movement in kyat *minor units* (integer).
--    Direction plus the source/target role pair describes the flow:
--       admin -> agent   : 'in'   (funding an agent / canteen float)
--       agent -> user    : 'out'  (payout / wallet top-up for a student)
--       user  -> agent   : 'out'  with source_role='user' (a canteen order)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id            SERIAL PRIMARY KEY,
  created_by_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  agent_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  user_id       INTEGER REFERENCES users (id) ON DELETE SET NULL,
  direction     flow_direction NOT NULL,
  source_role   user_role      NOT NULL,
  target_role   user_role      NOT NULL,
  amount_cents  INTEGER        NOT NULL CHECK (amount_cents > 0),
  note          TEXT,
  occurred_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_agent_idx    ON transactions (agent_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS transactions_user_idx     ON transactions (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS transactions_occurred_idx ON transactions (occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Smart canteen
--    A food item belongs to exactly one agent (canteen vendor).
--    `availability_reset_date` is the Myanmar (Asia/Yangon) date on which the
--    item was last switched — the pre-order window closes at midnight there.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS food_items (
  id                      SERIAL PRIMARY KEY,
  agent_id                INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name                    VARCHAR(120) NOT NULL,
  description             VARCHAR(280),
  category                VARCHAR(60)  NOT NULL DEFAULT 'Main',
  image_url               VARCHAR(2048),
  price_cents             INTEGER      NOT NULL CHECK (price_cents > 0),
  active                  BOOLEAN      NOT NULL DEFAULT TRUE,
  availability            food_availability NOT NULL DEFAULT 'available',
  availability_reset_date VARCHAR(10)  NOT NULL DEFAULT '1970-01-01',
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_items_agent_idx ON food_items (agent_id, availability);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status         order_status   NOT NULL DEFAULT 'pending',
  total_cents    INTEGER        NOT NULL CHECK (total_cents >= 0),
  payment_method payment_method NOT NULL DEFAULT 'wallet',
  payment_status payment_status NOT NULL DEFAULT 'paid',
  pickup_note    VARCHAR(280),
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_user_idx    ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx  ON orders (status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id               SERIAL PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  food_item_id     INTEGER NOT NULL REFERENCES food_items (id) ON DELETE RESTRICT,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0)
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

-- ---------------------------------------------------------------------------
-- 4. Ferry bus transport
--    A "driver" is the transport agent. One driver owns one vehicle; a route
--    is published on that vehicle; a trip is one departure of that route;
--    a booking is one student's seat request on one trip.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id                 SERIAL PRIMARY KEY,
  driver_id          INTEGER UNIQUE REFERENCES users (id) ON DELETE SET NULL,
  plate_number       VARCHAR(32) UNIQUE,
  vehicle_type       VARCHAR(80)  NOT NULL DEFAULT 'Ferry bus',
  model              VARCHAR(120) NOT NULL DEFAULT 'Unspecified',
  total_seats        INTEGER      NOT NULL CHECK (total_seats > 0),
  monthly_fee_cents  INTEGER      NOT NULL DEFAULT 0 CHECK (monthly_fee_cents >= 0),
  status             vehicle_status   NOT NULL DEFAULT 'operational',
  maintenance_status maintenance_flag NOT NULL DEFAULT 'clear',
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_profiles (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  phone          VARCHAR(32),
  license_number VARCHAR(80),
  availability   driver_availability NOT NULL DEFAULT 'available',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_routes (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(120) NOT NULL DEFAULT 'Campus route',
  driver_id         INTEGER REFERENCES users (id) ON DELETE SET NULL,
  vehicle_id        INTEGER REFERENCES vehicles (id) ON DELETE SET NULL,
  start_point       VARCHAR(160) NOT NULL,
  destination       VARCHAR(160) NOT NULL,
  pickup_locations  TEXT         NOT NULL,
  map_url           VARCHAR(2048),
  map_coordinates   VARCHAR(128),
  route_line_color  VARCHAR(7)   NOT NULL DEFAULT '#0284C7',
  distance_km       INTEGER,
  estimated_minutes INTEGER,
  fare_cents        INTEGER      NOT NULL CHECK (fare_cents > 0),
  status            route_status NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transport_routes_driver_idx ON transport_routes (driver_id);

CREATE TABLE IF NOT EXISTS route_stops (
  id         SERIAL PRIMARY KEY,
  route_id   INTEGER      NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  name       VARCHAR(160) NOT NULL,
  stop_order INTEGER      NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT route_stops_route_order_unique UNIQUE (route_id, stop_order)
);

-- Geographic nodes the transport agent publishes to draw the route line.
CREATE TABLE IF NOT EXISTS route_map_nodes (
  id         SERIAL PRIMARY KEY,
  route_id   INTEGER      NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  name       VARCHAR(160) NOT NULL,
  latitude   VARCHAR(32)  NOT NULL,
  longitude  VARCHAR(32)  NOT NULL,
  node_order INTEGER      NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT route_map_nodes_route_order_unique UNIQUE (route_id, node_order)
);
CREATE INDEX IF NOT EXISTS route_map_nodes_route_idx ON route_map_nodes (route_id);

CREATE TABLE IF NOT EXISTS trips (
  id           SERIAL PRIMARY KEY,
  route_id     INTEGER     NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  driver_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  vehicle_id   INTEGER     NOT NULL REFERENCES vehicles (id) ON DELETE RESTRICT,
  departure_at TIMESTAMPTZ NOT NULL,
  arrived_at   TIMESTAMPTZ,
  status       trip_status NOT NULL DEFAULT 'scheduled',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trips_driver_departure_idx ON trips (driver_id, departure_at);
CREATE INDEX IF NOT EXISTS trips_route_departure_idx  ON trips (route_id, departure_at);

-- A MONTHLY SEAT, not a seat on one departure.
-- A student takes one seat on one road for a whole calendar month; the
-- transport agent accepts it once and the monthly fare is charged once.
-- `month` is the Myanmar calendar month as 'YYYY-MM'.
CREATE TABLE IF NOT EXISTS ride_bookings (
  id          SERIAL PRIMARY KEY,
  route_id    INTEGER        NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  trip_id     INTEGER        REFERENCES trips (id) ON DELETE CASCADE,  -- kept for history; monthly seats leave it NULL
  user_id     INTEGER        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  month       VARCHAR(7)     NOT NULL,
  seat_count  INTEGER        NOT NULL DEFAULT 1 CHECK (seat_count > 0),
  seat_number VARCHAR(16),
  fare_cents  INTEGER        NOT NULL CHECK (fare_cents >= 0),
  status      booking_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ride_bookings_trip_idx  ON ride_bookings (trip_id, status);
CREATE INDEX IF NOT EXISTS ride_bookings_user_idx  ON ride_bookings (user_id, created_at DESC);

-- The two indexes that mention `month` are created further down, in the
-- upgrade section. On a database made by an older version of this file the
-- table already exists WITHOUT that column, and CREATE TABLE IF NOT EXISTS
-- leaves it alone — so an index on `month` here would fail with
-- 'column "month" does not exist' before the ALTER ever runs.

-- The daily timetable a road runs to for one month. Publishing it creates the
-- `trips` rows for every day of that month (see backend/src/transport.ts).
CREATE TABLE IF NOT EXISTS route_timetables (
  id         SERIAL PRIMARY KEY,
  route_id   INTEGER     NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  month      VARCHAR(7)  NOT NULL,
  times      TEXT        NOT NULL,  -- 'HH:MM,HH:MM' in Myanmar time, in order
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT route_timetables_route_month_unique UNIQUE (route_id, month)
);

CREATE TABLE IF NOT EXISTS transport_payments (
  id                      SERIAL PRIMARY KEY,
  booking_id              INTEGER NOT NULL UNIQUE REFERENCES ride_bookings (id) ON DELETE CASCADE,
  transaction_id          INTEGER NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE RESTRICT,
  amount_cents            INTEGER NOT NULL CHECK (amount_cents >= 0),
  status                  transport_pay_status NOT NULL DEFAULT 'charged',
  refunded_transaction_id INTEGER REFERENCES transactions (id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  refunded_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id                     SERIAL PRIMARY KEY,
  vehicle_id             INTEGER NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  reported_by_driver_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  issue                  TEXT    NOT NULL,
  status                 maintenance_status NOT NULL DEFAULT 'reported',
  resolution_note        TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS vehicle_maintenance_vehicle_idx ON vehicle_maintenance (vehicle_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. updated_at is maintained by the database, not by the application.
--    (MySQL had ON UPDATE CURRENT_TIMESTAMP; in Postgres this is a trigger.)
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Upgrading a database created by an older version of this file.
-- Everything above uses CREATE TABLE IF NOT EXISTS, which leaves an existing
-- table exactly as it was — so the columns added for the monthly ferry are
-- added here instead. All of this is safe to run on a fresh database too.
-- ---------------------------------------------------------------------------
ALTER TABLE ride_bookings ADD COLUMN IF NOT EXISTS month VARCHAR(7);
UPDATE ride_bookings SET month = to_char(created_at, 'YYYY-MM') WHERE month IS NULL;
ALTER TABLE ride_bookings ALTER COLUMN month SET NOT NULL;

-- Old per-trip seats could give one student several live seats on the same
-- road in the same month — they booked Monday's departure and Tuesday's. A
-- monthly seat is one per student per road per month, so the extras are
-- retired here (the earliest one is kept). Without this the unique index
-- below would refuse to be created and the whole file would stop.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY route_id, user_id, month ORDER BY id) AS position
  FROM ride_bookings
  WHERE status <> 'cancelled'
)
UPDATE ride_bookings SET status = 'cancelled'
WHERE id IN (SELECT id FROM ranked WHERE position > 1);

CREATE INDEX IF NOT EXISTS ride_bookings_month_idx ON ride_bookings (route_id, month, status);
CREATE UNIQUE INDEX IF NOT EXISTS ride_bookings_one_per_month
  ON ride_bookings (route_id, user_id, month)
  WHERE status <> 'cancelled';

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'food_items', 'orders', 'vehicles', 'driver_profiles', 'transport_routes', 'trips', 'ride_bookings', 'route_timetables']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Quick check — run this after the script finishes:
--     SELECT table_name FROM information_schema.tables
--      WHERE table_schema = 'public' ORDER BY table_name;
-- You should see 15 tables.
-- ---------------------------------------------------------------------------
