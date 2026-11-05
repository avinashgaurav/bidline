import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { spend } from "@/lib/analytics";
import { inrShort } from "@/lib/view";
import { CountUp } from "@/components/count-up";
import { InfoTip } from "@/components/tip";
import { BarList } from "@/components/bar-list";

export const metadata = { title: "Spend analytics · Bidline" };
export const maxDuration = 60;

export default async function AnalyticsPage() {
  const user = await requireUser();
  const s = await spend(user.id);
  const awarded = s.totals.awarded;
  const baseline = s.totals.baseline;
  const planned = s.byEvent.filter((e) => e.awarded === null && !["closed"].includes(e.status)).reduce((a, e) => a + e.budget, 0);
  const saved = baseline ? baseline - awarded : 0;
  const any = awarded > 0;

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-[24px] leading-tight tracking-[-0.01em]">Spend analytics</h1>
        <p className="mt-1 max-w-[72ch] text-[14px] text-ink-secondary">What has been committed through approved awards, against the budget you set on each line, and what is still planned. Figures come from each award&apos;s snapshot, so they match the note the approver signed off.</p>
      </header>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border lg:grid-cols-4">
        <Tile label="Awarded" help="Total of approved awards, ex-GST." value={<CountUp value={awarded} format="inr" />} />
        <Tile label="Budget for awarded lines" help="Quantity times your budget unit price, for the lines that were awarded." value={baseline ? <CountUp value={baseline} format="inr" /> : "n/a"} />
        <Tile label="Saved against budget" help="Budget for awarded lines minus the awarded total. Negative means over budget." value={baseline ? <CountUp value={saved} format="inr" /> : "n/a"} tone={saved < 0 ? "warn" : saved > 0 ? "good" : undefined} />
        <Tile label="Still planned" help="Budget on open events that have no approved award yet." value={<CountUp value={planned} format="inr" />} />
      </section>

      {!any ? (
        <p className="rounded-xl bg-card px-4 py-8 text-center text-[14px] text-ink-secondary ring-1 ring-border">
          No approved awards yet. Once an approver signs off an award, its spend shows here by category, supplier and month. <Link href="/events" className="text-primary hover:underline">Go to sourcing events</Link>
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Awarded against budget, by category" note="Bars show awarded value; the grey mark is the budget for the same lines.">
            <BarList rows={s.byCategory.map((c) => ({ label: c.category, value: c.awarded, ref: c.baseline, meta: `${c.lines} line${c.lines === 1 ? "" : "s"}` }))} />
          </Card>
          <Card title="Awarded by supplier" note="Approved awards only, across all events.">
            <BarList rows={s.bySupplier.map((x) => ({ label: x.supplier, value: x.awarded, meta: `${x.lines} lines · ${x.events} event${x.events === 1 ? "" : "s"}` }))} />
          </Card>
          <Card title="By event" note="Budget for the whole event, and the approved award where there is one.">
            <BarList rows={s.byEvent.filter((e) => e.budget || e.awarded).map((e) => ({ label: `${e.code} ${e.title}`, value: e.awarded ?? 0, ref: e.budget, meta: e.awarded === null ? "No award yet" : `${inrShort(e.awarded)} awarded`, href: `/rfx/${e.id}?tab=overview` }))} />
          </Card>
          <Card title="By month approved" note="Awarded value per month, with the budget for those lines.">
            <BarList rows={s.byMonth.map((m) => ({ label: new Date(`${m.month}-01`).toLocaleDateString("en-IN", { month: "short", year: "numeric" }), value: m.awarded, ref: m.baseline, meta: `${m.awards} award${m.awards === 1 ? "" : "s"}` }))} />
          </Card>
        </div>
      )}
    </div>
  );
}

function Tile({ label, help, value, tone }: { label: string; help: string; value: React.ReactNode; tone?: "warn" | "good" }) {
  return (
    <div className="bg-card px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[12px] text-ink-secondary">{label}<InfoTip text={help} label={`About ${label}`} /></p>
      <p className={`num mt-1 text-[24px] leading-tight ${tone === "warn" ? "text-warning" : tone === "good" ? "text-success" : ""}`}>{value}</p>
    </div>
  );
}

function Card({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
      <h2 className="text-[15px] font-medium">{title}</h2>
      <p className="mt-0.5 mb-3 text-[12.5px] text-ink-secondary">{note}</p>
      {children}
    </section>
  );
}
