import { checkGstin } from "@/lib/gstin";
import { Tip } from "@/components/tip";

const LIVE = "Checking that the registration is active (not cancelled or suspended) needs a paid GST data provider. Planned for V2.";

/** The GSTIN with the result of the offline check. */
export function GstinBadge({ gstin }: { gstin: string | null | undefined }) {
  const r = checkGstin(gstin);
  if (r.status === "missing") {
    return <Tip text={`No GSTIN recorded. Add it to check its format. ${LIVE}`}><span tabIndex={0} className="rounded-full bg-muted px-2 py-0.5 text-[12px] text-ink-secondary">No GSTIN</span></Tip>;
  }
  if (r.status === "invalid") {
    return <Tip text={`${r.why} ${LIVE}`}><span tabIndex={0} className="rounded-full bg-destructive/10 px-2 py-0.5 text-[12px] text-destructive">GSTIN looks wrong</span></Tip>;
  }
  return (
    <Tip text={`Format and check digit are correct (state ${r.state}, PAN ${r.pan}). ${LIVE}`}>
      <span tabIndex={0} className="rounded-full bg-success/10 px-2 py-0.5 text-[12px] text-success">GSTIN format OK</span>
    </Tip>
  );
}
