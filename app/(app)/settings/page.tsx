import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { appUrlFromHeaders } from "@/lib/app-url";
import { PROVIDERS, getEmailAccount } from "@/lib/mail";
import { NOTIFY_KINDS, readNotify } from "@/lib/notify";
import { can, roleLabel } from "@/lib/roles";
import { ConnectCard } from "@/components/connect-card";
import { DefaultsForm, EmailForm, NotifyForm, ProfileForm } from "@/components/settings/forms";
import { AdminPanel } from "@/components/admin/panel";
import { ChannelForm, ChannelRow, ReadOnlyLink } from "@/components/settings/extra";
import { CHANNEL_KINDS, listChannels } from "@/lib/channels";

export const metadata = { title: "Settings · Bidline" };
export const maxDuration = 60;

const PERSONAL = [
  ["profile", "Profile"],
  ["notifications", "Notifications"],
  ["integrations", "Integrations"],
  ["claude", "API and Claude"],
] as const;
const ADMIN = [
  ["organisation", "Organisation"],
  ["team", "Team and roles"],
  ["workflow", "Approvals and reminders"],
  ["security", "Security and data"],
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const admin = can(user.role, "team");
  const { tab: t } = await searchParams;
  const tabs = [...PERSONAL, ...(admin ? ADMIN : [])];
  const tab = tabs.some(([k]) => k === t) ? t! : "profile";
  const [me, account, base, channels] = await Promise.all([
    one<{ company: string | null; job_title: string | null; followup_days: number; default_approver_name: string | null; default_approver_email: string | null; notify: unknown; mcp_token_ro: string | null }>(
      "select company, job_title, followup_days, default_approver_name, default_approver_email, notify, mcp_token_ro from users where id = $1", [user.id]),
    getEmailAccount(user.id),
    appUrlFromHeaders(),
    admin ? listChannels(user.workspace_id) : Promise.resolve([]),
  ]);

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-[24px] leading-tight tracking-[-0.01em]">Settings</h1>
        <p className="mt-1 text-[14px] text-ink-secondary">Your own settings, and{admin ? " as an admin," : ""} how {user.workspace_name} works. You are {roleLabel(user.role) === "Admin" ? "an" : "a"} {roleLabel(user.role)} here.</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:sticky lg:top-[72px] lg:grid lg:h-fit lg:gap-px">
          <p className="hidden px-2.5 pt-1 pb-1 text-[11px] font-medium tracking-[0.08em] text-ink-secondary uppercase lg:block">You</p>
          {PERSONAL.map(([k, l]) => <TabLink key={k} k={k} l={l} on={tab === k} />)}
          {admin ? (
            <>
              <p className="hidden px-2.5 pt-3 pb-1 text-[11px] font-medium tracking-[0.08em] text-ink-secondary uppercase lg:block">Organisation</p>
              {ADMIN.map(([k, l]) => <TabLink key={k} k={k} l={l} on={tab === k} />)}
            </>
          ) : null}
        </nav>

        <div className="grid min-w-0 content-start gap-5">
          {tab === "profile" ? (
            <>
              <Section title="Profile" text="Shown on award notes, follow-ups and in the audit log.">
                <ProfileForm name={user.name} email={user.email} company={me?.company ?? ""} jobTitle={me?.job_title ?? ""} />
              </Section>
              <Section title="Defaults" text="Applied when you create a sourcing event or a follow-up. You can change them on each one.">
                <DefaultsForm followupDays={me?.followup_days ?? 3} approverName={me?.default_approver_name ?? ""} approverEmail={me?.default_approver_email ?? ""} />
              </Section>
            </>
          ) : null}
          {tab === "notifications" ? (
            <Section title="Email me when" text="Pick what deserves an email. Everything also shows under the bell at the top of every page.">
              <NotifyForm prefs={readNotify(me?.notify)} kinds={NOTIFY_KINDS} mailbox={Boolean(account)} />
            </Section>
          ) : null}
          {tab === "integrations" ? (
            <>
              <Section id="email" title="Email for supplier follow-ups" text="Connect your own mailbox with an app password. Bidline then sends follow-ups, reminders and your notifications from your address, and supplier replies come back to you.">
                <EmailForm account={account} providers={PROVIDERS} defaultName={user.name} defaultEmail={user.email} />
              </Section>
              {admin ? (
                <Section title="Alerts to Slack, Teams or a webhook" text="Post chosen events to a team channel. Events on restricted sourcing events are never posted. Admins only.">
                  {channels.length ? <ul className="-mt-2">{channels.map((c) => <ChannelRow key={c.id} c={c} />)}</ul> : null}
                  <ChannelForm kinds={CHANNEL_KINDS.map((k) => ({ ...k }))} events={NOTIFY_KINDS.map((k) => ({ key: k.key, label: k.label }))} />
                </Section>
              ) : null}
              <Link href="/tools" className="flex items-center justify-between rounded-xl bg-card px-5 py-4 ring-1 ring-border hover:bg-muted/40">
                <span><span className="block text-[15px] font-medium">Claude tools and other integrations</span><span className="block text-[13px] text-ink-secondary">What Claude can do in Bidline, and what is connected or planned.</span></span>
                <ArrowRight className="size-4 text-ink-secondary" />
              </Link>
            </>
          ) : null}
          {tab === "claude" ? (
            <Section id="claude" title="Your Claude connection" text={`Your private connector link. Claude acts as you, with your role (${roleLabel(user.role)}): a Viewer's Claude can only read. Keep the link private; replace it if it leaks.`}>
              <ConnectCard url={`${base}/mcp/${user.mcp_token}`} connectedAt={user.last_mcp_at} bare />
            </Section>
          ) : null}
          {tab === "claude" ? (
            <Section title="Read-only Claude link" text="A second link for analysis or reviews. Claude connected with it can read and compare, but cannot change anything, whatever your role.">
              <ReadOnlyLink url={me?.mcp_token_ro ? `${base}/mcp/${me.mcp_token_ro}` : null} />
            </Section>
          ) : null}
          {admin && ADMIN.some(([k]) => k === tab) ? <AdminPanel user={user} tab={tab} /> : null}
        </div>
      </div>
    </div>
  );
}

function TabLink({ k, l, on }: { k: string; l: string; on: boolean }) {
  return (
    <Link href={`/settings?tab=${k}`} aria-current={on ? "page" : undefined}
      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[13.5px] whitespace-nowrap ${on ? "bg-secondary text-foreground" : "text-ink-secondary hover:bg-muted hover:text-foreground"}`}>{l}</Link>
  );
}

function Section({ id, title, text, children }: { id?: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
      <div>
        <h2 className="text-[16px] font-medium">{title}</h2>
        <p className="mt-1 text-[13.5px] text-ink-secondary">{text}</p>
      </div>
      {children}
    </section>
  );
}
