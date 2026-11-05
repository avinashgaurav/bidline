import type { Comparison } from "@/lib/comparison";

const STATUS: Record<string, { label: string; cls: string }> = {
  supported: { label: "Pass", cls: "bg-success/10 text-success" },
  unanswered: { label: "No answer", cls: "bg-muted text-ink-secondary" },
  no_evidence: { label: "No evidence", cls: "bg-warning/10 text-warning" },
  evidence_contradicts: { label: "Evidence does not match", cls: "bg-destructive/10 text-destructive" },
  answer_falls_short: { label: "Below requirement", cls: "bg-destructive/10 text-destructive" },
};

export function QuestionnaireTab({ cmp }: { cmp: Comparison }) {
  if (!cmp.questions.length) {
    return <p className="rounded-xl bg-card p-8 text-sm text-ink-secondary ring-1 ring-border">This RFQ has no supplier questionnaire. Ask Claude to add questions, for example &ldquo;In Bidline, add ISO 27001:2022 certification as a mandatory question&rdquo;.</p>;
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-secondary">Claude records each supplier&apos;s answers and what their certificates say. Bidline decides pass or fail. An expired certificate, the wrong version of a standard or a figure below the threshold fails, whatever the answer says. A supplier whose answers have not been read shows as &ldquo;Not assessed&rdquo;, not &ldquo;Not qualified&rdquo;.</p>
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--grid-head)] text-left text-xs text-ink-secondary">
            <tr>
              <th className="min-w-[320px] px-4 py-3 font-medium">Question</th>
              {cmp.suppliers.map((s) => {
                const v = cmp.supplierInfo[s.code].verdict;
                return (
                  <th key={s.code} className="min-w-[150px] px-3 py-3 font-medium">
                    {s.code} {s.name.split(" ")[0]}
                    <span className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-[11px] font-normal ${!v.assessed ? "bg-muted text-ink-secondary" : v.qualified ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                      {!v.assessed ? "Not assessed" : v.qualified ? "Qualified" : "Not qualified"}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {cmp.questions.map((q) => (
              <tr key={q.no} className="border-t border-border align-top">
                <td className="px-4 py-3">
                  <span className="text-xs text-ink-secondary">{q.no} · {q.kind === "M" ? "mandatory" : "desirable"}{q.doc_required ? " · evidence required" : ""}</span>
                  <p>{q.q}</p>
                </td>
                {cmp.suppliers.map((s) => {
                  const a = cmp.supplierInfo[s.code].verdict.assessments.find((x) => x.questionNo === q.no);
                  if (!a) return <td key={s.code} className="px-3 py-3 text-xs text-ink-secondary">Not read</td>;
                  const st = STATUS[a.status] ?? STATUS.unanswered;
                  return (
                    <td key={s.code} className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                      <p className="mt-1 text-xs text-ink-secondary" title={a.why}>{a.why.length > 140 ? `${a.why.slice(0, 140)}...` : a.why}</p>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
