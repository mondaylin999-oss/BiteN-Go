BEGIN;

CREATE TYPE user_role AS ENUM ('admin', 'agent', 'user', 'driver');
CREATE TYPE account_status AS ENUM ('active', 'inactive');
CREATE TYPE flow_direction AS ENUM ('in', 'out');
CREATE TYPE food_availability AS ENUM ('available', 'unavailable', 'sold_out');
CREATE TYPE order_status AS ENUM ('pending', 'preparing', 'ready', 'completed', 'cancelled');
CREATE TYPE payment_method AS ENUM ('wallet', 'direct_cash');
CREATE TYPE payment_status AS ENUM ('paid', 'awaiting_confirmation');
CREATE TYPE vehicle_status AS ENUM ('operational', 'unavailable', 'maintenance');
CREATE TYPE maintenance_flag AS ENUM ('clear', 'reported', 'in_service');
CREATE TYPE maintenance_status AS ENUM ('reported', 'in_progress', 'resolved');
CREATE TYPE route_status AS ENUM ('active', 'inactive');
CREATE TYPE driver_availability AS ENUM ('available', 'unavailable');
CREATE TYPE trip_status AS ENUM ('scheduled', 'boarding', 'in_progress', 'completed', 'cancelled');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled');
CREATE TYPE transport_pay_status AS ENUM ('charged', 'refunded');

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    open_id VARCHAR(64) NOT NULL UNIQUE,
    username VARCHAR(64) UNIQUE,
    password_hash VARCHAR(255),
    name TEXT,
    email VARCHAR(320),
    login_method VARCHAR(64) DEFAULT 'local',
    role user_role NOT NULL DEFAULT 'user',
    status account_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_signed_in TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    created_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    direction flow_direction NOT NULL,
    source_role user_role NOT NULL,
    target_role user_role NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    note TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE food_items (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(280),
    category VARCHAR(60) NOT NULL DEFAULT 'Main',
    image_url VARCHAR(2048),
    price_cents INTEGER NOT NULL CHECK (price_cents > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    availability food_availability NOT NULL DEFAULT 'available',
    availability_reset_date VARCHAR(10) NOT NULL DEFAULT '1970-01-01',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status order_status NOT NULL DEFAULT 'pending',
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    payment_method payment_method NOT NULL DEFAULT 'wallet',
    payment_status payment_status NOT NULL DEFAULT 'paid',
    pickup_note VARCHAR(280),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    food_item_id INTEGER NOT NULL REFERENCES food_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0)
);

CREATE TABLE vehicles (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    plate_number VARCHAR(32) UNIQUE,
    vehicle_type VARCHAR(80) NOT NULL DEFAULT 'Ferry bus',
    model VARCHAR(120) NOT NULL DEFAULT 'Unspecified',
    total_seats INTEGER NOT NULL CHECK (total_seats > 0),
    monthly_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_fee_cents >= 0),
    status vehicle_status NOT NULL DEFAULT 'operational',
    maintenance_status maintenance_flag NOT NULL DEFAULT 'clear',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE driver_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    phone VARCHAR(32),
    license_number VARCHAR(80),
    availability driver_availability NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transport_routes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL DEFAULT 'Campus route',
    driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    start_point VARCHAR(160) NOT NULL,
    destination VARCHAR(160) NOT NULL,
    pickup_locations TEXT NOT NULL,
    map_url VARCHAR(2048),
    map_coordinates VARCHAR(128),
    route_line_color VARCHAR(7) NOT NULL DEFAULT '#0284C7',
    distance_km INTEGER,
    estimated_minutes INTEGER,
    fare_cents INTEGER NOT NULL CHECK (fare_cents > 0),
    status route_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE route_stops (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    stop_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT route_stops_route_order_unique UNIQUE (route_id, stop_order)
);

CREATE TABLE route_map_nodes (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    latitude VARCHAR(32) NOT NULL,
    longitude VARCHAR(32) NOT NULL,
    node_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT route_map_nodes_route_order_unique UNIQUE (route_id, node_order)
);

CREATE TABLE trips (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
    driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
    departure_at TIMESTAMPTZ NOT NULL,
    arrived_at TIMESTAMPTZ,
    status trip_status NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ride_bookings (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
    trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL,
    seat_count INTEGER NOT NULL DEFAULT 1 CHECK (seat_count > 0),
    seat_number VARCHAR(16),
    fare_cents INTEGER NOT NULL CHECK (fare_cents >= 0),
    status booking_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE route_timetables (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL,
    times TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT route_timetables_route_month_unique UNIQUE (route_id, month)
);

CREATE TABLE transport_payments (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL UNIQUE REFERENCES ride_bookings(id) ON DELETE CASCADE,
    transaction_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    status transport_pay_status NOT NULL DEFAULT 'charged',
    refunded_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    refunded_at TIMESTAMPTZ
);

CREATE TABLE vehicle_maintenance (
    id SERIAL PRIMARY KEY,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    reported_by_driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    issue TEXT NOT NULL,
    status maintenance_status NOT NULL DEFAULT 'reported',
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

COMMIT;