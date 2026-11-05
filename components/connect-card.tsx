import { CopyButton } from "@/components/copy-button";
import { RegenerateButton } from "@/components/regenerate-button";

/** The personal connector link and how to add it to Claude. */
export function ConnectCard({ url, connectedAt, compact = false }: { url: string; connectedAt: string | null; compact?: boolean }) {
  return (
    <div className="rounded-xl bg-card p-6 ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Your Claude connector</p>
          <p className="mt-1 text-sm text-ink-secondary">
            {connectedAt
              ? <>Connected. Claude last used Bidline {new Date(connectedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</>
              : "Not connected. Add this link to Claude once. It is unique to your account."}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs ${connectedAt ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {connectedAt ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-[13px]">{url}</code>
        <CopyButton text={url} label="Copy link" variant="default" />
      </div>
      {!compact ? (
        <ol className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <li className="rounded-lg bg-lavender p-4">
            <p className="font-medium">Claude on the web or desktop</p>
            <p className="mt-1 text-ink-secondary">Go to Settings, then Connectors, then <b>Add custom connector</b>. Name it Bidline, paste the link and save. In a chat, turn Bidline on from the tools menu.</p>
          </li>
          <li className="rounded-lg bg-lavender p-4">
            <p className="font-medium">Claude Code</p>
            <code className="mt-1 block break-all text-xs text-ink-secondary">claude mcp add --transport http bidline {url}</code>
          </li>
          <li className="rounded-lg bg-lavender p-4">
            <p className="font-medium">Start asking</p>
            <p className="mt-1 text-ink-secondary">Try &ldquo;What can Bidline do?&rdquo; Every change Claude makes shows here as it happens.</p>
          </li>
        </ol>
      ) : null}
      {!compact ? <div className="mt-4"><RegenerateButton /></div> : null}
    </div>
  );
}
