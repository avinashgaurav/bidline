import Link from "next/link";
import { BarChart3, Building2, CheckCircle2, Circle, ClipboardList, Clock, Compass, FileText, Hash, Inbox, KeyRound, Mail, MessageCircle, PencilLine, Scale, Send, Stamp, Wrench } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { disabledTools } from "@/lib/team";
import { getEmailAccount } from "@/lib/mail";
import { toolCatalog } from "@/lib/mcp/server";
import { INTEGRATIONS, LOCKED_TOOLS, TOOL_GROUPS, toolAllowed, toolOn } from "@/lib/mcp/catalog";
import { can, roleLabel } from "@/lib/roles";
import { ToolToggle } from "@/components/tool-toggle";
import { ClaudeMark } from "@/components/claude-mark";
import { CopyButton } from "@/components/copy-button";

export const metadata = { title: "Claude tools · Bidline" };

// The first sentence, without stopping at "e.g." or "i.e.".
const firstSentence = (s: string) => (s.replace(/\b(e\.g|i\.e)\./g, "$1\u0000").match(/^.*?[.!?](\s|$)/)?.[0] ?? s).replace(/\u0000/g, ".").trim();

export default async function ToolsPage() {
  const user = await requireUser();
  const [off, email] = await Promise.all([disabledTools(user.workspace_id), getEmailAccount(user.id)]);
  const tools = toolCatalog();
  const byName = new Map(tools.map((t) => [t.name, t]));
  const admin = can(user.role, "tools");
  const mine = tools.filter((t) => toolAllowed(t, user.role, off)).length;
  const connected = Boolean(user.last_mcp_at);
  const live: Record<string, boolean> = { claude: connected, smtp: Boolean(email) };

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] leading-tight tracking-[-0.01em]">Claude tools and integrations</h1>
          <p className="mt-1 max-w-[72ch] text-[14px] text-ink-secondary">
            Bidline has no AI of its own. It gives your Claude a set of tools, listed below by job: you just ask in plain words and Claude picks the right one. Your Claude can use {mine} of them
            ({roleLabel(user.role)} role{off.filter((t) => !t.startsWith("+")).length ? `, ${off.filter((t) => !t.startsWith("+")).length} switched off for the workspace` : ""}).{admin ? " As an admin you can switch any tool off for everyone." : ""}
          </p>
        </div>
        <Link href="/connect" className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13.5px] ${connected ? "bg-card ring-1 ring-border hover:bg-muted" : "bg-primary text-white hover:bg-primary/90"}`}>
          <ClaudeMark className="size-4" color={connected ? undefined : "currentColor"} />{connected ? "Claude connected" : "Connect Claude"}
        </Link>
      </header>

      <section className="rounded-xl bg-card ring-1 ring-border">
        <h2 className="border-b border-border px-4 py-3 text-[15px] font-medium">Integrations</h2>
        <ul className="grid sm:grid-cols-2">
          {INTEGRATIONS.map((i) => {
            const on = live[i.key];
            return (
              <li key={i.key} className="flex gap-3 border-b border-border px-4 py-3 sm:odd:border-r">
                <IntegrationLogo k={i.key} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">{i.name}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[11.5px] font-normal ${i.status === "planned" ? "bg-muted text-ink-secondary" : on ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                      {i.status === "planned" ? <Clock className="size-3" /> : on ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
                      {i.status === "planned" ? "Planned" : on ? "Connected" : "Not connected"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[13px] text-ink-secondary">{i.what}</span>
                  {i.status === "live" && !on ? <Link href={i.key === "claude" ? "/connect" : "/settings#email"} className="mt-1 inline-block text-[13px] text-primary hover:underline">Set up</Link> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {TOOL_GROUPS.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-start gap-3">
              <GroupIcon k={g.key} />
              <div>
                <h2 className="text-[15px] font-medium">{g.label}</h2>
                <p className="text-[13px] text-ink-secondary">{g.help}</p>
              </div>
            </div>
            <div className="flex max-w-full items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-[12.5px]">
              <span className="text-ink-secondary">Try:</span><span className="truncate">&ldquo;{g.example}&rdquo;</span>
              <CopyButton text={g.example} label="Copy" />
            </div>
          </div>
          <ul>
            {g.tools.map((name) => {
              const t = byName.get(name);
              if (!t) return null;
              const workspaceOn = toolOn(name, off) || LOCKED_TOOLS.includes(name);
              const forMe = toolAllowed(t, user.role, off);
              return (
                <li key={name} className="grid gap-2 border-b border-border px-4 py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px]" title={`Technical name: ${t.name}`}>{t.title}</span>
                      <span className={`rounded-full px-1.5 py-px text-[11px] ${t.readOnly ? "bg-muted text-ink-secondary" : "bg-secondary text-primary"}`}>{t.readOnly ? "Reads only" : "Makes changes"}</span>
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-secondary">{firstSentence(t.description)}</span>
                  </span>
                  <span className="flex items-center gap-3 text-[12px]">
                    <span className={forMe ? "text-success" : "text-ink-secondary"}>
                      {forMe ? "Available to you" : !workspaceOn ? "Off for the workspace" : `Not for ${roleLabel(user.role)}s`}
                    </span>
                    {admin ? <ToolToggle tool={name} enabled={workspaceOn} locked={LOCKED_TOOLS.includes(name)} /> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="text-[12.5px] text-ink-secondary">Changes take effect the next time Claude starts a chat. Every switch is recorded in the audit log.</p>
    </div>
  );
}

/** A small mark for each integration: the service's colour with a plain icon (no third-party logos copied). */
function IntegrationLogo({ k }: { k: string }) {
  const map: Record<string, { bg: string; fg: string; icon: React.ReactNode }> = {
    claude: { bg: "#F6EEE8", fg: "#D97757", icon: <ClaudeMark className="size-5" /> },
    smtp: { bg: "#edecfb", fg: "#5266eb", icon: <Mail className="size-5" /> },
    gmail: { bg: "#fdecea", fg: "#d93025", icon: <Inbox className="size-5" /> },
    whatsapp: { bg: "#e7f8ee", fg: "#1f9d55", icon: <MessageCircle className="size-5" /> },
    erp: { bg: "#e8f1fb", fg: "#1b6fbf", icon: <Building2 className="size-5" /> },
    slack: { bg: "#f3eaf6", fg: "#611f69", icon: <Hash className="size-5" /> },
    sso: { bg: "#eef0f3", fg: "#3c4257", icon: <KeyRound className="size-5" /> },
  };
  const m = map[k] ?? map.smtp;
  return <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: m.bg, color: m.fg }}>{m.icon}</span>;
}

function GroupIcon({ k }: { k: string }) {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    orient: Compass, setup: ClipboardList, read: FileText, compare: Scale, correct: PencilLine, followup: Send, insight: BarChart3, award: Stamp,
  };
  const Icon = icons[k] ?? Wrench;
  return <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Icon className="size-4" /></span>;
}
