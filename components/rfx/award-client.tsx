"use client";

import { useActionState, useState } from "react";
import { createAwardUI, type FormState } from "@/app/actions";
import { Field, FormMessage, SubmitButton, areaClass, fieldClass } from "@/components/form-bits";

export function AwardForm({ rfxId, suppliers, hasQuestions }: { rfxId: string; suppliers: Array<{ code: string; name: string }>; hasQuestions: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(createAwardUI.bind(null, rfxId), {});
  const [scenario, setScenario] = useState(hasQuestions ? "cheapest_qualified" : "cheapest_all");
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Award basis">
          <select name="scenario" value={scenario} onChange={(e) => setScenario(e.target.value)} className={fieldClass}>
            {hasQuestions ? <option value="cheapest_qualified">Cheapest per line, qualified suppliers only</option> : null}
            <option value="cheapest_all">Cheapest per line, all suppliers</option>
            <option value="single_supplier">All lines to one supplier</option>
          </select>
        </Field>
        {scenario === "single_supplier" ? (
          <Field label="Supplier">
            <select name="supplier" className={fieldClass}>{suppliers.map((s) => <option key={s.code} value={s.code}>{s.code} {s.name}</option>)}</select>
          </Field>
        ) : null}
      </div>
      <Field label="Recommendation (optional). Bidline adds the figures.">
        <textarea name="commentary" rows={3} className={areaClass} placeholder="Split the award across the qualified suppliers. The lower quotes failed mandatory requirements." />
      </Field>
      <div className="flex items-center gap-3"><SubmitButton>Draft award</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}
