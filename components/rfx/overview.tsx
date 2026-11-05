import Link from "next/link";
import type { Comparison } from "@/lib/comparison";
import { inr, inrShort } from "@/lib/view";
import { shortName } from "@/lib/ui";
import { Tip } from "@/components/tip";

/*
 * Charts for one sourcing event, all computed from the same comparison the
 * grid and the award use. Colours validated with the dataviz checker
 * (adjacent CVD and normal-vision separation on white):
 *   quality stack  #3a4cc4 comparable · #9a8cf0 with caveat · #eb6834 needs review · hatched grey not quoted
 *   budget delta   #5266eb under budget · #eb6834 over budget (diverging, grey axis at zero)
 * The light violet sits below 3:1 on white, so every chart carries direct
 * labels and a table view.
 */
const C = { comparable: "#3a4cc4", caveat: "#9a8cf0", review: "#eb6834", under: "#5266eb", over: "#eb6834", bar: "#5266eb", budget: "#28253b" };
const HATCH = "repeating-linear-gradient(135deg, #dcdce6 0 3px, #f3f3f8 3px 6px)";

type Kind = "comparable" | "caveat" | "review" | "missing";
const KIND: Record<Kind, { label: string; help: string }> = {
  comparable: { label: "Comparable", help: "A firm price Bidline could convert like for like. Counted in totals." },
  caveat: { label: "With caveat", help: "Priced, but the offer differs from the spec or carries a condition. Counted, and flagged." },
  review: { label: "Needs review", help: "Unreadable, or the reading could not be converted safely. Kept out of totals until a person checks it." },
  missing: { label: "No firm price", help: "Left blank, declined, not a firm price, priced only by reference to an old order, or not read yet." },
};

function kindOf(status: string | undefined): Kind {
  if (status === "comparable") return "comparable";
  if (status === "comparable_with_caveat") return "caveat";
  // Same definition as the "Needs review" figure: what only a person can settle.
  if (status === "needs_review" || status === "unreadable") return "review";
  return "missing";
}

const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;

export function OverviewTab({ cmp }: { cmp: Comparison }) {
  const lines = cmp.lines;
  if (!cmp.hasAnyReading) {
    return (
      <div className="grid place-items-center gap-2 rounded-xl bg-card px-6 py-14 text-center ring-1 ring-border">
        <p className="text-[17px] font-medium">Charts appear once Claude reads the first quote</p>
        <p className="max-w-[52ch] text-sm text-ink-secondary">
          Upload the supplier quotes on Documents and ask your Claude to read them. Totals against budget, lines won and quote quality fill in here as each one lands.
        </p>
        <Link href={`/rfx/${cmp.rfx.id}?tab=documents`} className="mt-2 inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-sm text-white hover:bg-primary/90">Go to Documents</Link>
      </div>
    );
  }

  const naive = cmp.compliance.naive;
  const rows = cmp.suppliers.map((s) => {
    const m = cmp.matrix[s.code] ?? {};
    const counts: Record<Kind, number> = { comparable: 0, caveat: 0, review: 0, missing: 0 };
    let quoted = 0;
    let budget = 0;
    let priced = 0;
    for (const l of lines) {
      const cell = m[l.no];
      const k = kindOf(cell?.status);
      counts[k]++;
      if ((k === "comparable" || k === "caveat") && cell?.unitInr !== null && cell?.unitInr !== undefined && l.baseline_inr > 0) {
        quoted += cell.extendedInr ?? cell.unitInr * l.qty;
        budget += l.baseline_inr * l.qty;
        priced++;
      }
    }
    const won = Object.values(naive.picks).filter((p) => p.vendor === s.code).length;
    return { code: s.code, name: shortName(s.name), full: s.name, counts, quoted, budget, priced, delta: budget ? ((quoted - budget) / budget) * 100 : null, won };
  });

  // Lowest quote per category against the budget for the same lines.
  const groups = new Map<string, { lowest: number; budget: number; priced: number; total: number }>();
  for (const l of lines) {
    const g = groups.get(l.group || "Other") ?? { lowest: 0, budget: 0, priced: 0, total: 0 };
    g.total++;
    const p = naive.picks[l.no];
    if (p) {
      g.lowest += p.extendedInr;
      g.budget += (l.baseline_inr || 0) * l.qty;
      g.priced++;
    }
    groups.set(l.group || "Other", g);
  }
  const cats = [...groups.entries()].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.budget - a.budget);

  const pickedBudget = Object.keys(naive.picks).reduce((a, no) => {
    const l = lines.find((x) => x.no === Number(no));
    return a + (l ? (l.baseline_inr || 0) * l.qty : 0);
  }, 0);
  const saving = pickedBudget - naive.totalInr;

  const withDelta = rows.filter((r) => r.delta !== null);
  const cheapest = [...withDelta].sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))[0];
  const topWinner = [...rows].sort((a, b) => b.won - a.won)[0];
  const span = Math.max(10, ...withDelta.map((r) => Math.abs(r.delta ?? 0)));
  const maxWon = Math.max(1, ...rows.map((r) => r.won));
  const maxCat = Math.max(1, ...cats.map((c) => Math.max(c.lowest, c.budget)));
  const reviewTotal = rows.reduce((a, r) => a + r.counts.review, 0);
  const unmatched = cmp.unmapped.filter((u) => !u.resolution).length;

  return (
    <div className="grid gap-4">
      <p className="rounded-xl bg-card px-4 py-3 text-[14px] ring-1 ring-border">
        Buying every line from its cheapest supplier costs <b className="num font-medium">{inrShort(naive.totalInr)}</b> for {naive.linesAwarded} of {lines.length} lines,{" "}
        {pickedBudget ? (
          <>
            <b className={`num font-medium ${saving >= 0 ? "text-success" : "text-warning"}`}>{inrShort(Math.abs(saving))} {saving >= 0 ? "under" : "over"}</b> the budget for those lines ({pct(-((saving / pickedBudget) * 100)).replace("+", "+")}).
          </>
        ) : "with no budget set for those lines."}
        {naive.unfilledLines.length ? <span className="text-ink-secondary"> {naive.unfilledLines.length} line{naive.unfilledLines.length === 1 ? " has" : "s have"} no comparable price yet.</span> : null}
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <Chart
          title={cheapest && cheapest.delta !== null ? `${cheapest.name} is ${Math.abs(cheapest.delta).toFixed(1)}% ${cheapest.delta < 0 ? "under" : "over"} budget on the lines it priced` : "Price against budget"}
          sub="Each supplier's quoted total against the budget for the same lines, so suppliers who priced fewer lines are still compared fairly."
          legend={[{ swatch: C.under, label: "Under budget" }, { swatch: C.over, label: "Over budget" }]}
          table={{ head: ["Supplier", "Lines priced", "Quoted", "Budget", "Difference"], rows: rows.map((r) => [r.full, String(r.priced), inr(r.quoted), inr(r.budget), r.delta === null ? "No budget" : pct(r.delta)]) }}
        >
          <div className="grid gap-2.5">
            {rows.map((r) => (
              <Row key={r.code} label={r.name} code={r.code}>
                <div className="relative h-5">
                  <span aria-hidden className="absolute inset-y-[-3px] left-1/2 w-px bg-[#c3c3cc]" />
                  {r.delta === null ? (
                    <span className="absolute left-1/2 pl-2 text-xs leading-5 text-ink-secondary">No comparable prices</span>
                  ) : (
                    <Tip text={<>{r.full}: quoted {inr(r.quoted)} against a budget of {inr(r.budget)} on {r.priced} line{r.priced === 1 ? "" : "s"}. {pct(r.delta)}.</>}>
                      <span tabIndex={0} className="absolute inset-y-0 outline-none"
                        style={r.delta < 0
                          ? { right: "50%", width: `${(Math.abs(r.delta) / span) * 38}%` }
                          : { left: "50%", width: `${(r.delta / span) * 38}%` }}>
                        <span className="absolute inset-y-0.5 inset-x-0 min-w-[3px] hover:opacity-85"
                          style={{ background: r.delta < 0 ? C.under : C.over, borderRadius: r.delta < 0 ? "4px 0 0 4px" : "0 4px 4px 0" }} />
                        <span className={`num absolute top-0 text-xs leading-5 whitespace-nowrap ${r.delta < 0 ? "right-full pr-1.5" : "left-full pl-1.5"}`}>{pct(r.delta)}</span>
                      </span>
                    </Tip>
                  )}
                </div>
              </Row>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-[84px_1fr] gap-3 text-[11px] text-ink-secondary"><span /><span className="relative h-4"><span className="absolute left-[12%] -translate-x-1/2">−{span.toFixed(0)}%</span><span className="absolute left-1/2 -translate-x-1/2">Budget</span><span className="absolute left-[88%] -translate-x-1/2">+{span.toFixed(0)}%</span></span></div>
        </Chart>

        <Chart
          title={topWinner && topWinner.won ? `${topWinner.name} is cheapest on ${topWinner.won} of ${lines.length} lines` : "Lines won"}
          sub="How many lines each supplier offers the lowest comparable price on. Ignores qualification."
          table={{ head: ["Supplier", "Lines won"], rows: rows.map((r) => [r.full, String(r.won)]) }}
        >
          <div className="grid gap-2.5">
            {[...rows].sort((a, b) => b.won - a.won).map((r) => (
              <Row key={r.code} label={r.name} code={r.code}>
                <Tip text={`${r.full} is cheapest on ${r.won} line${r.won === 1 ? "" : "s"}.`}>
                  <span tabIndex={0} className="flex h-5 items-center gap-1.5 outline-none">
                    <span className="h-4 rounded-r-[4px] hover:opacity-85" style={{ width: `${(r.won / maxWon) * 85}%`, minWidth: r.won ? 3 : 0, background: C.bar }} />
                    <span className="num text-xs">{r.won}</span>
                  </span>
                </Tip>
              </Row>
            ))}
          </div>
        </Chart>

        <Chart
          title={reviewTotal ? `${reviewTotal} price${reviewTotal === 1 ? "" : "s"} need a person before they count` : "Every price read is usable"}
          sub={`How each supplier's ${lines.length} lines were read. Only comparable prices and prices with a caveat count in totals.${unmatched ? ` Also ${unmatched} quoted item${unmatched === 1 ? "" : "s"} matching no line, on Compare quotes.` : ""}`}
          legend={(["comparable", "caveat", "review", "missing"] as Kind[]).map((k) => ({ swatch: k === "missing" ? HATCH : C[k], label: KIND[k].label, help: KIND[k].help }))}
          table={{ head: ["Supplier", "Comparable", "With caveat", "Needs review", "No firm price"], rows: rows.map((r) => [r.full, String(r.counts.comparable), String(r.counts.caveat), String(r.counts.review), String(r.counts.missing)]) }}
        >
          <div className="grid gap-2.5">
            {rows.map((r) => (
              <Row key={r.code} label={r.name} code={r.code}>
                <span className="flex h-5 gap-[2px]">
                  {(["comparable", "caveat", "review", "missing"] as Kind[]).filter((k) => r.counts[k]).map((k, i, arr) => (
                    <Tip key={k} text={`${r.full}: ${r.counts[k]} ${KIND[k].label.toLowerCase()}. ${KIND[k].help}`}>
                      <span tabIndex={0} className="grid h-full place-items-center text-[11px] text-white outline-none hover:opacity-85"
                        style={{
                          width: `${(r.counts[k] / lines.length) * 100}%`, background: k === "missing" ? HATCH : C[k],
                          borderRadius: `${i === 0 ? 4 : 0}px ${i === arr.length - 1 ? 4 : 0}px ${i === arr.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px`,
                          color: k === "missing" || k === "caveat" ? "#28253b" : "#fff",
                        }}>
                        {r.counts[k] / lines.length >= 0.08 ? r.counts[k] : ""}
                      </span>
                    </Tip>
                  ))}
                </span>
              </Row>
            ))}
          </div>
        </Chart>

        <Chart
          title="Lowest quotes by category, against budget"
          sub="The cheapest price on each line, added up by category, with the budget for the same lines."
          legend={[{ swatch: C.bar, label: "Lowest quoted" }, { swatch: C.budget, label: "Budget", tick: true }]}
          table={{ head: ["Category", "Lines priced", "Lowest quoted", "Budget"], rows: cats.map((c) => [c.name, `${c.priced} of ${c.total}`, inr(c.lowest), inr(c.budget)]) }}
        >
          <div className="grid gap-2.5">
            {cats.map((c) => (
              <Row key={c.name} label={c.name} wide>
                <Tip text={`${c.name}: lowest ${inr(c.lowest)} against a budget of ${inr(c.budget)} on ${c.priced} of ${c.total} lines.`}>
                  <span tabIndex={0} className="relative flex h-5 items-center outline-none">
                    <span className="h-4 rounded-r-[4px] hover:opacity-85" style={{ width: `${(c.lowest / maxCat) * 82}%`, minWidth: c.lowest ? 3 : 0, background: C.bar }} />
                    {c.budget ? <span aria-hidden className="absolute inset-y-0 w-[2px] rounded" style={{ left: `${(c.budget / maxCat) * 82}%`, background: C.budget }} /> : null}
                    <span className="num ml-auto pl-2 text-xs whitespace-nowrap">{inrShort(c.lowest)}</span>
                  </span>
                </Tip>
              </Row>
            ))}
          </div>
        </Chart>
      </div>
    </div>
  );
}

function Row({ label, code, wide = false, children }: { label: string; code?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid items-center gap-3 ${wide ? "grid-cols-[132px_1fr]" : "grid-cols-[84px_1fr]"}`}>
      <span className="truncate text-[13px]" title={label}>{code ? <span className="num mr-1 text-ink-secondary">{code}</span> : null}{label}</span>
      {children}
    </div>
  );
}

function Chart({ title, sub, legend, table, children }: {
  title: string; sub: string; children: React.ReactNode;
  legend?: Array<{ swatch: string; label: string; help?: string; tick?: boolean }>;
  table: { head: string[]; rows: string[][] };
}) {
  return (
    <section className="grid content-start gap-3 rounded-xl bg-card p-4 ring-1 ring-border">
      <div>
        <h3 className="text-[16px] font-medium text-balance">{title}</h3>
        <p className="mt-0.5 text-[13px] text-ink-secondary">{sub}</p>
      </div>
      {legend ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-secondary">
          {legend.map((l) => (
            <li key={l.label} className="inline-flex items-center gap-1.5" title={l.help}>
              <span aria-hidden className={l.tick ? "h-3 w-[2px] rounded" : "size-2.5 rounded-[3px]"} style={{ background: l.swatch }} />{l.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div>{children}</div>
      <details className="text-[13px]">
        <summary className="cursor-pointer text-ink-secondary hover:text-primary">View as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-xs text-ink-secondary">{table.head.map((h) => <th key={h} className="py-1 pr-4 font-medium">{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className={`py-1 pr-4 ${j ? "num whitespace-nowrap" : ""}`}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
