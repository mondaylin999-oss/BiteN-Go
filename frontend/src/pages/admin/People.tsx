// ===========================================================================
//  admin/People.tsx — accounts for all four roles.
//  Accounts are deactivated, never deleted, so the money history stays honest.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { api, ApiError, type SessionUser } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { dateTime } from "@/lib/format";
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, Notice, PageHeader, Select, Spinner, StatTile } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = { admin: "Administrator", agent: "Canteen agent", driver: "Transport agent", user: "Student" };

export default function AdminPeople() {
  const { data, loading, error, refresh } = useApiData<SessionUser[]>(
    async () => (await api.get<{ participants: SessionUser[] }>("/cashflow/participants")).participants,
    [],
  );
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "canteen" | "error"; text: string } | null>(null);
  const [filter, setFilter] = useState("all");

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"agent" | "user" | "driver">("user");

  async function createPerson(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.post<{ participant: SessionUser }>("/cashflow/participants", {
        name: name.trim(),
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        password: password.trim() || undefined,
        role,
      });
      setMessage({
        tone: "canteen",
        text: `${response.participant.name} created as ${ROLE_LABEL[role]} — username "${response.participant.username}", password "${password.trim() || "biten123"}". Send it to them.`,
      });
      setCreating(false);
      setName("");
      setUsername("");
      setEmail("");
      setPassword("");
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not create that account." });
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(person: SessionUser) {
    setBusy(true);
    setMessage(null);
    try {
      const action = person.status === "active" ? "deactivate" : "activate";
      await api.post(`/cashflow/participants/${person.id}/${action}`);
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not update that account." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading accounts…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;

  const people = data ?? [];
  const visible = filter === "all" ? people : people.filter(person => person.role === filter);
  const count = (value: string) => people.filter(person => person.role === value).length;

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Create the staff accounts; students can also register themselves."
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" /> New account
          </Button>
        }
      />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Students" value={count("user")} tone="canteen" />
        <StatTile label="Canteen agents" value={count("agent")} tone="canteen" />
        <StatTile label="Transport agents" value={count("driver")} tone="ferry" />
        <StatTile label="Administrators" value={count("admin")} />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <Card
        title="All accounts"
        actions={
          <Select className="h-9 w-[180px]" value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="all">Every role</option>
            <option value="user">Students</option>
            <option value="agent">Canteen agents</option>
            <option value="driver">Transport agents</option>
            <option value="admin">Administrators</option>
          </Select>
        }
      >
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last signed in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map(person => (
                <tr key={person.id}>
                  <td>
                    <p className="font-semibold text-on-surface">{person.name ?? "—"}</p>
                    {person.email ? <p className="text-[12px] text-on-surface-variant">{person.email}</p> : null}
                  </td>
                  <td className="tabular">{person.username ?? "—"}</td>
                  <td>
                    <Badge tone={person.role === "driver" ? "ferry" : person.role === "admin" ? "neutral" : "canteen"}>{ROLE_LABEL[person.role]}</Badge>
                  </td>
                  <td>
                    <Badge tone={person.status === "active" ? "canteen" : "error"}>{person.status}</Badge>
                  </td>
                  <td className="tabular whitespace-nowrap text-on-surface-variant">{dateTime(person.lastSignedIn)}</td>
                  <td className="text-right">
                    {person.role === "admin" ? null : (
                      <Button variant="ghost" className="h-9" disabled={busy} onClick={() => void toggleStatus(person)}>
                        {person.status === "active" ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {creating ? (
        <Modal title="New account" onClose={() => setCreating(false)}>
          <form className="space-y-4" onSubmit={createPerson}>
            <Field label="Full name">
              <Input value={name} onChange={event => setName(event.target.value)} required minLength={2} placeholder="Daw Hla" />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={event => setRole(event.target.value as "agent" | "user" | "driver")}>
                <option value="user">Student</option>
                <option value="agent">Canteen agent</option>
                <option value="driver">Transport agent (ferry driver)</option>
              </Select>
            </Field>
            <Field label="Username" hint="Leave empty to build one from the name.">
              <Input value={username} onChange={event => setUsername(event.target.value)} placeholder="agent03" autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label="Email (optional)">
              <Input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="agent03@campus.edu" />
            </Field>
            <Field label="Password" hint='Leave empty to use "biten123" — tell them to change it.'>
              <Input value={password} onChange={event => setPassword(event.target.value)} minLength={6} placeholder="biten123" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" busy={busy}>
                Create account
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
