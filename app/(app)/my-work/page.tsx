import Link from "next/link";
import { AlarmClock, CheckCircle2, ChevronRight, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listRfxs } from "@/lib/rfx";
import { awaitingMyApproval } from "@/lib/notifications";
import { can } from "@/lib/roles";
import { myQueue, todos } from "@/lib/work";
import { todoStates } from "@/lib/todo-state";
import { listMembers } from "@/lib/team";
import { HomeTabs } from "@/components/home-tabs";
import { ApprovalsBanner } from "@/components/approvals-banner";
import { TodoMenu } from "@/components/todo-menu";

export const metadata = { title: "My work · Bidline" };
export const maxDuration = 60;

/**
 * One person's queue: next steps on their own events, anything a teammate
 * assigned to them, and approvals waiting on them. Snoozed items wait until
 * their date. Empty means done.
 */
export default async function MyWork({ searchParams }: { searchParams: Promise<{ snoozed?: string }> }) {
  const user = await requireUser();
  const { snoozed: showSnoozed } = await searchParams;
  const [events, approvals, states, team] = await Promise.all([
    listRfxs(user.id), awaitingMyApproval(user.id), todoStates(user.workspace_id), listMembers(user.id),
  ]);
  const q = myQueue(todos(events.filter((e) => !e.archived_at), [], can(user.role, "edit")), user.id, states, Number(new Date()));
  const list = showSnoozed ? q.snoozed : q.active;
  const snoozedCount = q.snoozed.length;
  const isSnoozed = (k: string) => q.snoozed.some((t) => t.key === k);
  const members = team.members.map((m) => ({ user_id: m.user_id, name: m.name }));

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-[28px] leading-tight tracking-[-0.01em]">My work</h1>
        <p className="mt-1 text-[14px] text-ink-secondary">Next steps on the events you created, anything assigned to you, and awards waiting for your approval. Assign or snooze an item from its menu.</p>
      </header>
      <HomeTabs active="work" workCount={q.active.length + approvals.length} />
      {!showSnoozed ? <ApprovalsBanner items={approvals.map((a) => ({ rfxId: a.rfx_id, code: a.code, title: a.title, totalInr: a.total_inr, since: a.created_at }))} /> : null}
      {list.length ? (
        <ul className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          {list.map((t, i) => {
            const st = states.get(t.key);
            return (
              <li key={t.key} className="rise flex items-center gap-2 border-b border-border pr-3 last:border-0" style={{ animationDelay: `${i * 40}ms` }}>
                <Link href={t.href} className="group flex min-w-0 flex-1 items-center gap-3 px-4 py-3 hover:bg-muted/50">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${t.tone === "warn" ? "bg-warning/10 text-warning" : t.tone === "go" ? "bg-success/10 text-success" : "bg-secondary text-primary"}`}><t.icon className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px]">{t.text}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-secondary">
                      <span className="truncate"><span className="num">{t.rfx.code}</span> · {t.rfx.title}</span>
                      {st?.assigned_to && t.rfx.user_id !== user.id ? <span className="inline-flex items-center gap-1 text-primary"><UserRound className="size-3" /> Assigned to you</span> : null}
                      {st?.assigned_to && st.assigned_to !== user.id ? <span className="inline-flex items-center gap-1"><UserRound className="size-3" /> {st.assignee_name}</span> : null}
                      {showSnoozed && st?.snoozed_until ? <span className="inline-flex items-center gap-1"><AlarmClock className="size-3" /> until {new Date(st.snoozed_until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span> : null}
                    </span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] text-primary ring-1 ring-border group-hover:bg-secondary sm:inline-flex">{t.action}<ChevronRight className="size-3.5" /></span>
                </Link>
                <TodoMenu todoKey={t.key} rfxId={t.rfx.id} text={t.text} members={members} assignedTo={st?.assigned_to ?? null} snoozed={isSnoozed(t.key)} />
              </li>
            );
          })}
        </ul>
      ) : !approvals.length || showSnoozed ? (
        <div className="grid place-items-center rounded-xl bg-card px-6 py-14 text-center ring-1 ring-border">
          <CheckCircle2 className="size-8 text-success" />
          <p className="mt-3 text-[17px] font-medium">{showSnoozed ? "Nothing snoozed" : "You are all caught up"}</p>
          <p className="mt-1 max-w-[46ch] text-[14px] text-ink-secondary">{showSnoozed ? "Snoozed items come back on their date." : "Nothing on your events needs you right now. New quotes, overdue follow-ups and approvals will show up here."}</p>
          <Link href="/events" className="mt-4 text-[14px] text-primary hover:underline">See all sourcing events</Link>
        </div>
      ) : null}
      {snoozedCount || showSnoozed ? (
        <Link href={showSnoozed ? "/my-work" : "/my-work?snoozed=1"} className="justify-self-start text-[13px] text-primary hover:underline">
          {showSnoozed ? "Back to my work" : `${snoozedCount} snoozed item${snoozedCount === 1 ? "" : "s"}`}
        </Link>
      ) : null}
    </div>
  );
}
