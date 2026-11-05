import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, ShieldAlert, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { auditPeople, listAudit, type AuditFilter } from "@/lib/audit";
import { verifyChain } from "@/lib/audit-chain";
import { KIND_GROUPS } from "@/lib/audit-format";
import { listRfxs } from "@/lib/rfx";
import { can } from "@/lib/roles";
import { AuditFeed } from "@/components/audit-feed";
import { InfoTip } from "@/components/tip";

export const metadata = { title: "Audit log · Bidline" };
export const maxDuration = 60;

const PAGE = 100;
const field = "h-9 rounded-lg bg-card px-3 text-[13.5px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (user.role === "viewer") redirect("/");
  const sp = await searchParams;
  const all = can(user.role, "audit_all");
  const f: AuditFilter = {
    rfx: sp.rfx || null, person: sp.person || null, actor: sp.actor || null, group: sp.group || null,
    from: sp.from || null, to: sp.to || null, search: sp.q || null, before: sp.before ? Number(sp.before) : null, limit: PAGE,
  };
  const [entries, people, events, chain] = await Promise.all([
    listAudit(user.id, f, { all }), auditPeople(user.id), listRfxs(user.id), all ? verifyChain(user.workspace_id) : Promise.resolve(null),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "before") as Array<[string, string]>);
  const older = entries.length === PAGE ? `/audit?${new URLSearchParams({ ...Object.fromEntries(qs), before: String(entries.at(-1)!.id) })}` : null;
  const filtered = [...qs.keys()].length > 0;

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] leading-tight tracking-[-0.01em]">Audit log</h1>
          <p className="mt-1 max-w-[70ch] text-[14px] text-ink-secondary">
            Every change in {user.workspace_name}: who made it (a person, their Claude or an approver), when, what they did, the item it touched and the values before and after.
            {all ? "" : " You see entries for the events you can open."}
          </p>
        </div>
        <a href={`/api/audit/export?${qs}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-card px-3.5 text-[13.5px] ring-1 ring-border hover:bg-muted">
          <Download className="size-4" /> Export CSV
        </a>
      </header>

      {chain ? (
        <div className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[13.5px] ring-1 ${chain.intact ? "bg-success/5 ring-success/20" : "bg-destructive/5 ring-destructive/30"}`}>
          {chain.intact ? <ShieldCheck className="size-5 text-success" /> : <ShieldAlert className="size-5 text-destructive" />}
          <span className="min-w-0 flex-1">
            <span className="font-medium">{chain.intact ? "Record intact" : "The record has been altered"}</span>
            <span className="text-ink-secondary">
              {chain.intact
                ? ` · all ${chain.sealed.toLocaleString("en-IN")} entries match their seal; none edited or removed.`
                : ` · ${chain.changed} entr${chain.changed === 1 ? "y does" : "ies do"} not match their seal and ${chain.missingLinks} link${chain.missingLinks === 1 ? " is" : "s are"} missing.`}
            </span>
          </span>
          <InfoTip label="How the check works" text="Each entry is sealed with a fingerprint of its content and of the entry before it, written by the database. Editing or deleting any entry breaks the chain, and this check shows it. Exports carry the fingerprints so a copy can be checked later." />
        </div>
      ) : null}

      <form className="grid gap-2 rounded-xl bg-card p-3 ring-1 ring-border sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto_auto]">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search what happened" aria-label="Search" className={field} />
        <select name="rfx" defaultValue={sp.rfx ?? ""} aria-label="Sourcing event" className={field}>
          <option value="">All events</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.code} {e.title}</option>)}
        </select>
        <select name="person" defaultValue={sp.person ?? ""} aria-label="Person" className={field}>
          <option value="">Everyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="actor" defaultValue={sp.actor ?? ""} aria-label="Done through" className={field}>
          <option value="">Any source</option>
          <option value="user">In the app</option>
          <option value="claude">Through Claude</option>
          <option value="approver">On an approval link</option>
        </select>
        <select name="group" defaultValue={sp.group ?? ""} aria-label="Type of action" className={field}>
          <option value="">Any action</option>
          {KIND_GROUPS.filter((g) => all || g.key !== "access").map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <input type="date" name="from" defaultValue={sp.from ?? ""} aria-label="From date" className={`${field} min-w-0 flex-1`} />
          <input type="date" name="to" defaultValue={sp.to ?? ""} aria-label="To date" className={`${field} min-w-0 flex-1`} />
        </div>
        <div className="flex gap-2">
          <button className="h-9 rounded-lg bg-primary px-4 text-[13.5px] text-white hover:bg-primary/90">Apply</button>
          {filtered ? <Link href="/audit" className="inline-flex h-9 items-center rounded-lg px-3 text-[13.5px] text-ink-secondary hover:bg-muted">Clear</Link> : null}
        </div>
      </form>

      <section className="rounded-xl bg-card px-4 py-3 ring-1 ring-border sm:px-5">
        <AuditFeed entries={entries} showEvent />
        <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-[12.5px] text-ink-secondary">
          <span>{entries.length} entr{entries.length === 1 ? "y" : "ies"}{f.before ? " (older page)" : ""}. Entries cannot be edited or deleted.</span>
          <span className="flex gap-3">
            {f.before ? <Link href={`/audit?${qs}`} className="text-primary hover:underline">Newest</Link> : null}
            {older ? <Link href={older} className="text-primary hover:underline">Older entries</Link> : null}
          </span>
        </div>
      </section>
    </div>
  );
}
