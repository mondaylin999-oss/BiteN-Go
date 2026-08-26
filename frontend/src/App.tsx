// ===========================================================================
//  App.tsx — routing and the role gate.
//
//  Four portals, one app:
//     /student…  the student (canteen + ferry)
//     /agent…    the canteen agent (kitchen display, menu, float)
//     /driver…   the transport agent (seat requests, trips, route map)
//     /admin…    the administrator (people, money, operations)
//
//  A signed-out visitor always sees the login screen; a signed-in one can
//  never open another role's screens.
// ===========================================================================

import { useEffect, type ReactNode } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useAuth, homePathFor } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ErrorNote, Spinner } from "@/components/ui";
import type { Role } from "@/lib/api";

import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Profile from "@/pages/Profile";

import StudentDashboard from "@/pages/student/Dashboard";
import CanteenMenu from "@/pages/student/CanteenMenu";
import MealOrders from "@/pages/student/MealOrders";
import WalletPage from "@/pages/student/WalletPage";
import FerryTracking from "@/pages/student/FerryTracking";
import TransportPass from "@/pages/student/TransportPass";

import KitchenDisplay from "@/pages/agent/KitchenDisplay";
import MenuBoard from "@/pages/agent/MenuBoard";
import AgentFloat from "@/pages/agent/AgentFloat";

import FerryConsole from "@/pages/driver/FerryConsole";
import RouteEditor from "@/pages/driver/RouteEditor";

import AdminOverview from "@/pages/admin/Overview";
import AdminPeople from "@/pages/admin/People";
import TransportOps from "@/pages/admin/TransportOps";
import CanteenOps from "@/pages/admin/CanteenOps";
import CashHistory from "@/pages/admin/CashHistory";

/** Renders a page only for the roles that are allowed to see it. */
function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Redirect to="/" />;
  if (!roles.includes(user.role)) return <Redirect to={homePathFor(user.role)} />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading, error, refresh } = useAuth();
  const [location, navigate] = useLocation();

  // Once signed in, "/" is not a page — send the user to their own portal.
  useEffect(() => {
    if (user && location === "/") navigate(homePathFor(user.role), { replace: true });
  }, [user, location, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Spinner label="Starting BiteN Go…" />
      </div>
    );
  }

  if (!user) {
    // The login screen shows the connection error itself; this covers the
    // case where the server disappears while someone is signed out.
    return (
      <Switch>
        <Route path="/" component={Login} />
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    );
  }

  return (
    <AppShell>
      {error ? (
        <div className="mb-4">
          <ErrorNote message={error} onRetry={() => void refresh()} />
        </div>
      ) : null}

      <Switch>
        {/* ---------------- student ---------------- */}
        <Route path="/student">
          <Guard roles={["user"]}>
            <StudentDashboard />
          </Guard>
        </Route>
        <Route path="/student/canteen">
          <Guard roles={["user"]}>
            <CanteenMenu />
          </Guard>
        </Route>
        <Route path="/student/orders">
          <Guard roles={["user"]}>
            <MealOrders />
          </Guard>
        </Route>
        <Route path="/student/wallet">
          <Guard roles={["user"]}>
            <WalletPage />
          </Guard>
        </Route>
        <Route path="/student/ferry">
          <Guard roles={["user"]}>
            <FerryTracking />
          </Guard>
        </Route>
        <Route path="/student/passes">
          <Guard roles={["user"]}>
            <TransportPass />
          </Guard>
        </Route>

        {/* ---------------- canteen agent ---------------- */}
        <Route path="/agent">
          <Guard roles={["agent"]}>
            <KitchenDisplay />
          </Guard>
        </Route>
        <Route path="/agent/menu">
          <Guard roles={["agent"]}>
            <MenuBoard />
          </Guard>
        </Route>
        <Route path="/agent/wallet">
          <Guard roles={["agent"]}>
            <AgentFloat />
          </Guard>
        </Route>

        {/* ---------------- transport agent ---------------- */}
        <Route path="/driver">
          <Guard roles={["driver"]}>
            <FerryConsole />
          </Guard>
        </Route>
        <Route path="/driver/route">
          <Guard roles={["driver"]}>
            <RouteEditor />
          </Guard>
        </Route>

        {/* ---------------- administrator ---------------- */}
        <Route path="/admin">
          <Guard roles={["admin"]}>
            <AdminOverview />
          </Guard>
        </Route>
        <Route path="/admin/people">
          <Guard roles={["admin"]}>
            <AdminPeople />
          </Guard>
        </Route>
        <Route path="/admin/transport">
          <Guard roles={["admin"]}>
            <TransportOps />
          </Guard>
        </Route>
        <Route path="/admin/canteen">
          <Guard roles={["admin"]}>
            <CanteenOps />
          </Guard>
        </Route>
        <Route path="/admin/history">
          <Guard roles={["admin"]}>
            <CashHistory />
          </Guard>
        </Route>

        {/* ---------------- shared ---------------- */}
        <Route path="/profile" component={Profile} />
        <Route path="/" >
          <Redirect to={homePathFor(user.role)} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}
