// ===========================================================================
//  agent/AgentFloat.tsx — the canteen agent's money.
//
//  The float is what the admin allocated minus what the agent has paid out.
//  A top-up beyond the float is refused by the server, so the balance can
//  never go negative.
// ===========================================================================

import { useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Send, Wallet } from "lucide-react";
import { api, ApiError, type FlowSummary, type HistoryRow, type MonthRow, type SessionUser } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { dateTime, kyats, monthName } from "@/lib/format";
import { Button, Card, EmptyState, ErrorNote, Field, Input, Notice, PageHeader, Select, Spinner, StatTile } from "@/components/ui";

type Bundle = { summary: FlowSummary; balance: number; history: HistoryRow[]; months: MonthRow[]; students: SessionUser[] };

export default function AgentFloat() {
  const { data, loading, error, refresh } = useApiData<Bundle>(async () => {
    const [overview, history, monthly, participants] = await Promise.all([
      api.get<{ summary: FlowSummary; wallet: number }>("/cashflow/overview"),
      api.get<{ history: HistoryRow[] }>("/cashflow/history"),
      api.get<{ months: MonthRow[] }>("/cashflow/monthly"),
      api.get<{ participants: SessionUser[] }>("/cashflow/participants"),
    ]);
    return {
      summary: overview.summary,
      balance: overview.summary.balance,
      history: history.history,
      months: monthly.months,
      students: participants.participants.filter(person => person.role === "user" && person.status === "active"),
    };
  }, []);

  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "canteen" | "error"; text: string } | null>(null);

  async function topUp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/cashflow/pay-user", { userId: Number(userId), amountCents: Math.round(Number(amount)), note: note.trim() || undefined });
      const student = data?.students.find(person => person.id === Number(userId));
      setMessage({ tone: "canteen", text: `${kyats(Number(amount))} added to ${student?.name ?? "the student"}'s wallet.` });
      setAmount("");
      setNote("");
      await refresh();
    } catch (caught) {
      setMessage({ tone: "error", text: caught instanceof ApiError ? caught.message : "Could not send the top-up." });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading your float…" />;
  if (error) return <ErrorNote message={error} onRetry={() => void refresh()} />;
  if (!data) return null;

  return (
    <>
      <PageHeader title="Float & Top-ups" subtitle="Funding from the administrator, and wallet top-ups you give to students." />

      <div className="grid gap-stack-md sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Float in hand" value={kyats(data.balance)} tone="canteen" icon={<Wallet className="h-4 w-4" />} />
        <StatTile label="Received" value={kyats(data.summary.received)} icon={<ArrowDownLeft className="h-4 w-4" />} hint={`${data.summary.fundingTransfers} transfer(s)`} />
        <StatTile label="Paid out" value={kyats(data.summary.paidOut)} icon={<ArrowUpRight className="h-4 w-4" />} hint="Top-ups + canteen settlements" />
        <StatTile label="Students" value={data.students.length} hint="Active accounts you can top up" />
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-stack-md lg:grid-cols-[340px_1fr]">
        <Card title="Top up a student" accent="canteen">
          <form className="space-y-4" onSubmit={topUp}>
            <Field label="Student">
              <Select value={userId} onChange={event => setUserId(event.target.value)} required>
                <option value="">Choose a student…</option>
                {data.students.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.name ?? student.username} ({student.username})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount (kyat)" hint={`Your float: ${kyats(data.balance)}`}>
              <Input type="number" min={1} step={1} value={amount} onChange={event => setAmount(event.target.value)} required placeholder="10000" />
            </Field>
            <Field label="Note (optional)">
              <Input value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="Weekly allowance" />
            </Field>
            <Button type="submit" variant="canteen" className="w-full" busy={busy} disabled={!userId || !amount || Number(amount) > data.balance}>
              <Send className="h-4 w-4" /> Send top-up
            </Button>
            {Number(amount) > data.balance ? <p className="text-[12px] font-medium text-error">More than your float — ask the administrator for funding first.</p> : null}
          </form>
        </Card>

        <Card title="Movements" subtitle="Newest first, with the running balance">
          {data.history.length === 0 ? (
            <EmptyState title="No movements yet" description="Funding from the administrator will show up here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Detail</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map(row => (
                    <tr key={row.id}>
                      <td className="tabular whitespace-nowrap text-on-surface-variant">{dateTime(row.occurredAt)}</td>
                      <td>
                        <p className="font-medium text-on-surface">{row.note ?? (row.direction === "in" ? "Funding" : "Payout")}</p>
                        <p className="text-[12px] text-on-surface-variant">
                          {row.direction === "in" ? "From the administrator" : `To ${row.counterparty ?? "a student"}`}
                        </p>
                      </td>
                      <td className={`tabular whitespace-nowrap text-right font-bold ${row.direction === "in" ? "text-secondary" : "text-error"}`}>
                        {row.direction === "in" ? "+" : "−"}
                        {kyats(row.amountCents)}
                      </td>
                      <td className="tabular whitespace-nowrap text-right text-on-surface-variant">{kyats(row.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {data.months.length > 0 ? (
        <Card title="By month">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="text-right">Funded</th>
                  <th className="text-right">Paid out</th>
                  <th className="text-right">Kept</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map(month => (
                  <tr key={month.month}>
                    <td className="font-medium">{monthName(month.month)}</td>
                    <td className="tabular text-right text-secondary">{kyats(month.invested)}</td>
                    <td className="tabular text-right">{kyats(month.returned)}</td>
                    <td className="tabular text-right font-semibold">{kyats(month.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}
