import { Link2, Quote, Scale } from "lucide-react";
import { ClaudeMark } from "@/components/claude-mark";
import { ProductPreview } from "./product-preview";

const PROOF = [
  { icon: Scale, title: "Like for like", body: "Units, pack sizes and currencies converted, so every supplier sits in one row." },
  { icon: Quote, title: "Every price traced", body: "Open any number to see the supplier's own words and the page they came from." },
  { icon: Link2, title: "Approval on a link", body: "Your approver reads the award note and approves or rejects it from one link." },
];

/** The dark half of sign-in and sign-up: what Bidline does, shown and then said. */
export function AuthStory() {
  return (
    <div className="mx-auto grid w-full max-w-[560px] gap-8 xl:gap-9">
      <div className="grid gap-4">
        <h2 className="text-[30px] leading-[1.12] text-balance text-on-dark sm:text-[36px] xl:text-[40px]">
          Every supplier quote, compared like for like.
        </h2>
        <p className="max-w-[46ch] text-[16px] leading-relaxed text-fog sm:text-[17px]" style={{ fontWeight: 360 }}>
          Suppliers send spreadsheets, PDFs, emails and photos. Bidline lines every price up in one table, keeps the record
          and gets the award approved.
        </p>
      </div>

      <ProductPreview />

      <ul className="grid gap-5 sm:grid-cols-3 sm:gap-4 xl:gap-6">
        {PROOF.map(({ icon: Icon, title, body }) => (
          <li key={title} className="grid content-start gap-1.5 border-t border-white/10 pt-4">
            <p className="flex items-center gap-2 text-[14px] font-medium text-on-dark">
              <Icon aria-hidden className="size-4 text-[#9cb4e8]" strokeWidth={1.75} />
              {title}
            </p>
            <p className="text-[13px] leading-relaxed text-fog">{body}</p>
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-fog">
        <ClaudeMark className="mt-0.5 size-4 shrink-0" />
        <span>Your own Claude does the reading, on your Claude plan. No AI runs inside Bidline.</span>
      </p>
    </div>
  );
}
