import { Link2, Quote, Scale } from "lucide-react";
import { ClaudeMark } from "@/components/claude-mark";
import { LoopingPreview } from "./looping-preview";

const PROOF = [
  { icon: Scale, title: "Like for like", body: "Units, packs and currencies converted." },
  { icon: Quote, title: "Every price traced", body: "Back to the supplier's own words." },
  { icon: Link2, title: "Approval on a link", body: "Your approver decides in one click." },
];

/** The dark half of sign-in and sign-up: what Bidline does, shown and then said. Fits one screen. */
export function AuthStory() {
  return (
    <div className="mx-auto grid w-full max-w-[540px] gap-6 xl:gap-7">
      <div className="grid gap-2.5">
        <h2 className="text-[28px] leading-[1.12] text-balance text-on-dark sm:text-[32px] xl:text-[36px]">
          Pick the right supplier, and prove it.
        </h2>
        <p className="max-w-[44ch] text-[15px] leading-relaxed text-fog sm:text-[16px]" style={{ fontWeight: 360 }}>
          Every price traced to the supplier&apos;s own words, every change logged, approval in one click.
        </p>
      </div>

      <LoopingPreview />

      <ul className="grid gap-4 sm:grid-cols-3 sm:gap-4">
        {PROOF.map(({ icon: Icon, title, body }) => (
          <li key={title} className="grid content-start gap-1 border-t border-white/10 pt-3">
            <p className="flex items-center gap-2 text-[13.5px] font-medium text-on-dark">
              <Icon aria-hidden className="size-4 text-[#9cb4e8]" strokeWidth={1.75} />
              {title}
            </p>
            <p className="text-[12.5px] leading-snug text-fog">{body}</p>
          </li>
        ))}
      </ul>

      <p className="flex items-center gap-2 text-[12.5px] text-fog">
        <ClaudeMark className="size-3.5 shrink-0" /> No AI inside Bidline. Your own Claude does the reading.
      </p>
    </div>
  );
}
