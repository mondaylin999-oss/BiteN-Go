-- ===========================================================================
--  BiteN Go — reset the database
--  Drops every table and type created by schema.sql. ALL DATA IS LOST.
--  Run this in the pgAdmin4 Query Tool, then run schema.sql again.
-- ===========================================================================

BEGIN;

DROP TABLE IF EXISTS transport_payments   CASCADE;
DROP TABLE IF EXISTS ride_bookings        CASCADE;
DROP TABLE IF EXISTS trips                CASCADE;
DROP TABLE IF EXISTS route_map_nodes      CASCADE;
DROP TABLE IF EXISTS route_stops          CASCADE;
DROP TABLE IF EXISTS transport_routes     CASCADE;
DROP TABLE IF EXISTS vehicle_maintenance  CASCADE;
DROP TABLE IF EXISTS driver_profiles      CASCADE;
DROP TABLE IF EXISTS vehicles             CASCADE;
DROP TABLE IF EXISTS order_items          CASCADE;
DROP TABLE IF EXISTS orders               CASCADE;
DROP TABLE IF EXISTS food_items           CASCADE;
DROP TABLE IF EXISTS transactions         CASCADE;
DROP TABLE IF EXISTS users                CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

DROP TYPE IF EXISTS transport_pay_status CASCADE;
DROP TYPE IF EXISTS booking_status       CASCADE;
DROP TYPE IF EXISTS trip_status          CASCADE;
DROP TYPE IF EXISTS driver_availability  CASCADE;
DROP TYPE IF EXISTS route_status         CASCADE;
DROP TYPE IF EXISTS maintenance_status   CASCADE;
DROP TYPE IF EXISTS maintenance_flag     CASCADE;
DROP TYPE IF EXISTS vehicle_status       CASCADE;
DROP TYPE IF EXISTS payment_status       CASCADE;
DROP TYPE IF EXISTS payment_method       CASCADE;
DROP TYPE IF EXISTS order_status         CASCADE;
DROP TYPE IF EXISTS food_availability    CASCADE;
DROP TYPE IF EXISTS flow_direction       CASCADE;
DROP TYPE IF EXISTS account_status       CASCADE;
DROP TYPE IF EXISTS user_role            CASCADE;

COMMIT;
