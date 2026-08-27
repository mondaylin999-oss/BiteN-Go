// ===========================================================================
//  Profile.tsx — the signed-in account, the password, and (for a transport
//  agent) their contact details.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { Cpu, Database, KeyRound, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select, StatTile } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = { admin: "Administrator", agent: "Canteen agent", driver: "Transport agent", user: "Student" };

export default function Profile() {
  const { user, health, refresh } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "canteen" | "error"; text: string } | null>(null);

  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [availability, setAvailability] = useState<"available" | "unavailable">("available");

  if (!user) return null;

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/auth/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setMessage({ tone: "canteen", text: "Password changed. Use the new one next time you sign in." });
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not change the password." });
    } finally {
      setBusy(false);
    }
  }

  async function saveDriverProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.patch("/transport/driver/profile", {
        phone: phone.trim() || undefined,
        licenseNumber: licenseNumber.trim() || undefined,
        availability,
      });
      setMessage({ tone: "canteen", text: "Driver details saved." });
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not save your details." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account and this installation." />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Signed in as" value={user.name ?? user.username ?? "—"} hint={`@${user.username ?? "—"}`} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatTile label="Role" value={ROLE_LABEL[user.role]} tone={user.role === "driver" ? "ferry" : "canteen"} />
        <StatTile label="System" value={health ? "Ready" : "Not answering"} icon={<Cpu className="h-4 w-4" />} hint={health?.myanmarTime ? `${health.myanmarTime} Yangon` : undefined} />
        <StatTile label="Records" value={health?.database?.startsWith("connected") ? "Saved" : "Unavailable"} icon={<Database className="h-4 w-4" />} hint="Everything you do is written to the campus records" />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-stack-md lg:grid-cols-2">
        <Card title="Account">
          <dl className="space-y-3 text-[14px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-on-surface-variant">Username</dt>
              <dd className="tabular font-semibold">{user.username ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-on-surface-variant">Email</dt>
              <dd className="font-medium">{user.email ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-on-surface-variant">Status</dt>
              <dd>
                <Badge tone={user.status === "active" ? "canteen" : "error"}>{user.status}</Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-on-surface-variant">Last signed in</dt>
              <dd className="tabular">{dateTime(user.lastSignedIn)}</dd>
            </div>
            {health?.myanmarTime ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant">Myanmar time</dt>
                <dd className="tabular">{health.myanmarTime}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card title="Change password" accent="canteen">
          <form className="space-y-4" onSubmit={changePassword}>
            <Field label="Current password">
              <Input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required autoComplete="current-password" />
            </Field>
            <Field label="New password" hint="At least 6 characters.">
              <Input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required minLength={6} autoComplete="new-password" />
            </Field>
            <Button type="submit" busy={busy}>
              <KeyRound className="h-4 w-4" /> Update password
            </Button>
          </form>
        </Card>
      </div>

      {user.role === "driver" ? (
        <Card title="Transport agent details" accent="ferry" subtitle="Students see your phone number next to your trips.">
          <form className="grid gap-4 sm:grid-cols-3" onSubmit={saveDriverProfile}>
            <Field label="Phone">
              <Input value={phone} onChange={event => setPhone(event.target.value)} placeholder="+95 9 555 0101" />
            </Field>
            <Field label="Licence number">
              <Input value={licenseNumber} onChange={event => setLicenseNumber(event.target.value)} placeholder="YGN-DRV-4471" />
            </Field>
            <Field label="Availability">
              <Select value={availability} onChange={event => setAvailability(event.target.value as "available" | "unavailable")}>
                <option value="available">Available</option>
                <option value="unavailable">Unavailable</option>
              </Select>
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" variant="ferry" busy={busy}>
                Save details
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}
