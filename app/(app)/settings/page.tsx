import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { appUrlFromHeaders } from "@/lib/app-url";
import { PROVIDERS, getEmailAccount } from "@/lib/mail";
import { ConnectCard } from "@/components/connect-card";
import { DefaultsForm, EmailForm, ProfileForm } from "@/components/settings/forms";

export const metadata = { title: "Settings · Bidline" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [me, account, base] = await Promise.all([
    one<{ company: string | null; job_title: string | null; followup_days: number; default_approver_name: string | null; default_approver_email: string | null }>(
      "select company, job_title, followup_days, default_approver_name, default_approver_email from users where id = $1", [user.id]),
    getEmailAccount(user.id),
    appUrlFromHeaders(),
  ]);
  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <div>
        <h1 className="text-[24px] leading-tight">Settings</h1>
        <p className="mt-1 text-ink-secondary">Your profile, the mailbox follow-ups are sent from, your Claude connection and defaults for new sourcing events.</p>
      </div>
      <Section title="Profile" text="Shown on award notes and follow-ups.">
        <ProfileForm name={user.name} email={user.email} company={me?.company ?? ""} jobTitle={me?.job_title ?? ""} />
      </Section>
      <Section id="email" title="Email for supplier follow-ups" text="Connect your own mailbox with an app password. Bidline then sends follow-ups from your address, and supplier replies come back to you.">
        <EmailForm account={account} providers={PROVIDERS} defaultName={user.name} defaultEmail={user.email} />
      </Section>
      <Section id="claude" title="Claude connection" text="Your personal connector link. Anyone with it can work in your Bidline account, so keep it private.">
        <ConnectCard url={`${base}/mcp/${user.mcp_token}`} connectedAt={user.last_mcp_at} bare />
      </Section>
      <Section title="Defaults" text="Applied when a new sourcing event or follow-up is created. You can change them on each one.">
        <DefaultsForm followupDays={me?.followup_days ?? 3} approverName={me?.default_approver_name ?? ""} approverEmail={me?.default_approver_email ?? ""} />
      </Section>
    </div>
  );
}

function Section({ id, title, text, children }: { id?: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-4 rounded-xl bg-card p-4 ring-1 ring-border sm:p-6">
      <div>
        <h2 className="text-[18px]">{title}</h2>
        <p className="mt-1 text-sm text-ink-secondary">{text}</p>
      </div>
      {children}
    </section>
  );
}
