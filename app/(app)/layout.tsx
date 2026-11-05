import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { logoutAction, switchWorkspaceAction } from "@/app/actions";
import { listRfxs } from "@/lib/rfx";
import { myWorkspaces } from "@/lib/team";
import { versionOf } from "@/lib/events";
import { can } from "@/lib/roles";
import { one } from "@/lib/db";
import { readPrefs } from "@/lib/prefs";
import { PrefsProvider } from "@/components/prefs-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu, SearchButton } from "@/components/command-menu";
import { NotificationBell } from "@/components/notifications";
import { LiveRefresh } from "@/components/live-refresh";
import { NewMenu } from "@/components/new-menu";
import { BidlineAgent } from "@/components/bidline-agent";
import { FirstRun } from "@/components/first-run";
import { appUrlFromHeaders } from "@/lib/app-url";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [events, workspaces, version, base, prefRow] = await Promise.all([
    listRfxs(user.id), myWorkspaces(user.id), versionOf({ userId: user.id }), appUrlFromHeaders(),
    one<{ prefs: unknown }>("select prefs from users where id = $1", [user.id]),
  ]);
  const prefs = readPrefs(prefRow?.prefs);
  const sidebarEvents = events.map((e) => ({
    id: e.id, code: e.code, title: e.title, status: e.status, restricted: e.restricted, archived_at: e.archived_at,
    line_count: e.line_count, supplier_count: e.supplier_count, responded: e.responded, doc_count: e.doc_count, unread_docs: e.unread_docs,
    question_count: e.question_count, open_chases: e.open_chases, overdue_chases: e.overdue_chases, needs_review: e.needs_review, award_status: e.award_status, starred: e.starred,
  }));
  return (
    <PrefsProvider prefs={prefs}>
    <div className="min-h-screen lg:flex">
      <Suspense>
        <AppSidebar
          user={{ name: user.name, email: user.email, role: user.role }}
          workspace={{ name: user.workspace_name }}
          workspaces={workspaces}
          events={sidebarEvents}
          connected={Boolean(user.last_mcp_at)}
          switchAction={switchWorkspaceAction}
          logoutAction={logoutAction}
        />
      </Suspense>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 hidden h-14 grid-cols-[1fr_minmax(0,560px)_1fr] items-center gap-3 border-b border-border bg-background/85 px-6 backdrop-blur-md lg:grid xl:px-8">
          <span />
          <SearchButton />
          <div className="flex items-center justify-end gap-2">
            <NotificationBell />
            {can(user.role, "edit") ? (
              <NewMenu canTeam={can(user.role, "team")} openEvents={events.filter((e) => !e.archived_at && !["awarded", "closed"].includes(e.status)).map((e) => ({ id: e.id, code: e.code, title: e.title }))} />
            ) : null}
          </div>
        </div>
        <main className="px-4 py-5 sm:px-6 xl:px-8">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
      <CommandMenu />
      <Suspense>
        <FirstRun hasEvents={events.length > 0} canEdit={can(user.role, "edit")} connected={Boolean(user.last_mcp_at)} connectorUrl={`${base}/mcp/${user.mcp_token}`} />
      </Suspense>
      <LiveRefresh initial={version} />
      <BidlineAgent connected={Boolean(user.last_mcp_at)} events={events.map((e) => ({ id: e.id, code: e.code }))} />
    </div>
    </PrefsProvider>
  );
}
