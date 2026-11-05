import Link from "next/link";
import { Download, KeyRound, MapPin, ShieldCheck, ShieldAlert, Wrench } from "lucide-react";
import type { User } from "@/lib/auth";
import { listMembers, disabledTools } from "@/lib/team";
import { getSettings } from "@/lib/workspace";
import { verifyChain } from "@/lib/audit-chain";
import { listRfxs } from "@/lib/rfx";
import { toolCatalog } from "@/lib/mcp/server";
import { ROLES, roleLabel } from "@/lib/roles";
import { CancelInvite, InviteForm, RemoveMember, RenameWorkspace, RoleSelect, WorkflowForm } from "@/components/admin/forms";

/** The admin parts of Settings: team and roles, approvals and reminders, security, the organisation. Admins only. */
export async function AdminPanel({ user, tab }: { user: User; tab: string }) {
  const [{ members, invites }, settings, chain, events, off] = await Promise.all([
    listMembers(user.id), getSettings(user.workspace_id), verifyChain(user.workspace_id), listRfxs(user.id), disabledTools(user.workspace_id),
  ]);
  const restricted = events.filter((e) => e.restricted);
  const tools = toolCatalog();

  return (
    <div className="grid gap-5">

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border lg:grid-cols-4">
        <Tile label="People" value={String(members.length)} sub={invites.length ? `${invites.length} invite${invites.length === 1 ? "" : "s"} pending` : "No pending invites"} />
        <Tile label="Restricted events" value={String(restricted.length)} sub="Visible to named people only" />
        <Tile label="Claude tools on" value={`${tools.length - off.length} of ${tools.length}`} sub={<Link href="/tools" className="text-primary hover:underline">Manage tools</Link>} />
        <Tile label="Audit record" value={chain.intact ? "Intact" : "Altered"} warn={!chain.intact} sub={`${chain.sealed.toLocaleString("en-IN")} sealed entries`} />
      </div>


      {tab === "team" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid content-start gap-5">
            <Card title="Invite someone" text="People with a Bidline account join straight away. Others get a sign-up link and join when they create their account with that email.">
              <InviteForm />
            </Card>
            <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_150px_140px_80px] gap-4 border-b border-border bg-[var(--grid-head)] px-4 py-2 text-[12px] text-ink-secondary md:grid">
                <span>Person</span><span>Role</span><span>Claude</span><span />
              </div>
              <ul>
                {members.map((m) => (
                  <li key={m.user_id} className="grid gap-2 border-b border-border px-4 py-3 last:border-0 md:grid-cols-[minmax(0,1fr)_150px_140px_80px] md:items-center md:gap-4">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{m.name}{m.user_id === user.id ? <span className="ml-1.5 text-[12px] font-normal text-ink-secondary">(you)</span> : null}</span>
                      <span className="block truncate text-[12px] text-ink-secondary">{m.email} · joined {new Date(m.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                    </span>
                    <RoleSelect memberId={m.user_id} role={m.role} self={m.user_id === user.id} />
                    <span className="text-[12.5px] text-ink-secondary">{m.last_mcp_at ? `Used ${new Date(m.last_mcp_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "Not connected"}</span>
                    <span className="md:text-right">{m.user_id === user.id ? null : <RemoveMember memberId={m.user_id} name={m.name} />}</span>
                  </li>
                ))}
                {invites.map((i) => (
                  <li key={i.id} className="grid gap-2 border-b border-border bg-muted/30 px-4 py-3 last:border-0 md:grid-cols-[minmax(0,1fr)_150px_140px_80px] md:items-center md:gap-4">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px]">{i.email}</span>
                      <span className="block truncate text-[12px] text-ink-secondary">Invited {new Date(i.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}{i.invited_by_name ? ` by ${i.invited_by_name}` : ""}</span>
                    </span>
                    <span className="text-[13px]">{roleLabel(i.role)}</span>
                    <span className="text-[12.5px] text-warning">Not signed up yet</span>
                    <span className="md:text-right"><CancelInvite inviteId={i.id} /></span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <aside className="grid content-start gap-4">
            <Card title="What each role can do">
              <ul className="grid gap-3">
                {ROLES.map((r) => (
                  <li key={r.key}><p className="text-[14px] font-medium">{r.label}</p><p className="text-[13px] text-ink-secondary">{r.help}</p></li>
                ))}
              </ul>
            </Card>
            <Card title="Restricting one event" text="Open an event and use Access in its header to limit it to named people. Admins and the person who created it always see it.">
              {restricted.length ? (
                <ul className="grid gap-1.5 text-[13px]">
                  {restricted.map((e) => <li key={e.id}><Link href={`/rfx/${e.id}`} className="text-primary hover:underline"><span className="num">{e.code}</span> {e.title}</Link></li>)}
                </ul>
              ) : <p className="text-[13px] text-ink-secondary">No event is restricted.</p>}
            </Card>
          </aside>
        </div>
      ) : null}

      {tab === "workflow" ? (
        <Card title="Approvals and reminders" text="These apply to every sourcing event in the workspace. Changes are recorded in the audit log.">
          <WorkflowForm settings={settings} />
        </Card>
      ) : null}

      {tab === "security" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Audit record">
            <div className="flex items-start gap-3">
              {chain.intact ? <ShieldCheck className="mt-0.5 size-5 text-success" /> : <ShieldAlert className="mt-0.5 size-5 text-destructive" />}
              <div className="text-[13.5px]">
                <p className="font-medium">{chain.intact ? "Intact: no entry has been edited or removed." : `Altered: ${chain.changed} changed, ${chain.missingLinks} missing links.`}</p>
                <p className="mt-1 text-ink-secondary">Each entry is sealed by the database with a fingerprint of its content and of the entry before it. Entries cannot be edited; removing one breaks the chain. Checked {new Date(chain.checkedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</p>
                <a href="/api/audit/export" className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-card px-3.5 ring-1 ring-border hover:bg-muted"><Download className="size-4" /> Export the full log (CSV, with fingerprints)</a>
              </div>
            </div>
          </Card>
          <Card title="Claude access">
            <div className="flex items-start gap-3 text-[13.5px]">
              <KeyRound className="mt-0.5 size-5 text-primary" />
              <div>
                <p>Each person has their own private connector link; Claude acts as that person, with their role. A Viewer&apos;s Claude can only read.</p>
                <p className="mt-1 text-ink-secondary">{off.length ? `${off.length} tool${off.length === 1 ? " is" : "s are"} switched off for everyone.` : "All tools are on."}</p>
                <Link href="/tools" className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-card px-3.5 ring-1 ring-border hover:bg-muted"><Wrench className="size-4" /> Claude tools</Link>
              </div>
            </div>
          </Card>
          <Card title="Where data is kept">
            <div className="flex items-start gap-3 text-[13.5px]">
              <MapPin className="mt-0.5 size-5 text-primary" />
              <p className="text-ink-secondary">Bidline stores events and the audit log in a managed Postgres database and supplier files in private blob storage. Files open only for signed-in members who can see the event. Keeping all data in India is on the roadmap.</p>
            </div>
          </Card>
          <Card title="No AI inside">
            <p className="text-[13.5px] text-ink-secondary">Bidline holds no AI keys and runs no AI model. Documents are read only by the Claude each person connects, under their own Claude plan.</p>
          </Card>
        </div>
      ) : null}

      {tab === "organisation" ? (
        <Card title="Workspace" text="One workspace is one organisation. People can belong to several and switch from the top of the sidebar.">
          <RenameWorkspace name={user.workspace_name} />
        </Card>
      ) : null}
    </div>
  );
}

function Tile({ label, value, sub, warn = false }: { label: string; value: string; sub: React.ReactNode; warn?: boolean }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[12px] text-ink-secondary">{label}</p>
      <p className={`num mt-1 text-[22px] leading-tight ${warn ? "text-destructive" : ""}`}>{value}</p>
      <p className="mt-0.5 text-[12px] text-ink-secondary">{sub}</p>
    </div>
  );
}

function Card({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
      <h2 className="text-[16px] font-medium">{title}</h2>
      {text ? <p className="mt-1 mb-4 text-[13.5px] text-ink-secondary">{text}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}
