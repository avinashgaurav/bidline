import Link from "next/link";

/** Home's two views: the organisation overview and the person's own queue. */
export function HomeTabs({ active, workCount }: { active: "overview" | "work"; workCount: number }) {
  const tab = (key: "overview" | "work", href: string, label: string, n?: number) => (
    <Link href={href} aria-current={active === key ? "page" : undefined}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] ${active === key ? "border-primary text-foreground" : "border-transparent text-ink-secondary hover:text-foreground"}`}>
      {label}{n ? <span className="num rounded-full bg-warning/10 px-1.5 text-[11px] leading-[18px] text-warning">{n}</span> : null}
    </Link>
  );
  return (
    <nav aria-label="Home views" className="flex gap-1 border-b border-border">
      {tab("overview", "/", "Overview")}
      {tab("work", "/my-work", "My work", workCount)}
    </nav>
  );
}
