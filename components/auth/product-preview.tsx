import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import s from "./product-preview.module.css";

/** Delay for one step of the sequence, read by the CSS module as --d. */
const at = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

const DOCS = [
  { tag: "XLSX", tone: "#3fa36b", file: "Zenith.xlsx", from: "Zenith Industrial" },
  { tag: "PDF", tone: "#e0675f", file: "Cygnus.pdf", from: "Cygnus Technical" },
  { tag: "EML", tone: "#9cb4e8", file: "Re: RFQ 1184", from: "Helios Supplies" },
  { tag: "JPG", tone: "#d9a440", file: "Rate card.jpg", from: "Vector Spares" },
];

const PRICES = [
  { supplier: "Zenith", price: "182.40" },
  { supplier: "Cygnus", price: "176.00", best: true },
  { supplier: "Helios", price: "189.50" },
  { supplier: "Vector", price: "184.00" },
];

/**
 * A pure CSS and SVG picture of what Bidline does: four quotes in four
 * formats become one like-for-like row, the lowest price shows the
 * supplier's own words, and the award comes back approved.
 */
export function ProductPreview() {
  return (
    <figure
      role="img"
      aria-label="Four supplier quotes, a spreadsheet, a PDF, an email and a photo, combine into one comparison row. The lowest price links to the supplier's own words, and the award is approved."
      className="w-full select-none"
    >
      <div aria-hidden className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DOCS.map((d, i) => (
          <div
            key={d.tag}
            className={`${s.rise} min-w-0 rounded-[10px] bg-white/[0.04] px-2.5 py-2 ring-1 ring-white/10`}
            style={at(150 + i * 130)}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="rounded-[4px] px-1 py-px text-[9.5px] leading-[14px] font-medium tracking-[0.06em] text-night"
                style={{ background: d.tone }}
              >
                {d.tag}
              </span>
              <span className="truncate text-[11.5px] text-on-dark">{d.file}</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-fog/80">{d.from}</p>
          </div>
        ))}
      </div>

      <svg aria-hidden viewBox="0 0 400 36" preserveAspectRatio="none" className="block h-9 w-full text-[#9cb4e8]">
        {[50, 150, 250, 350].map((x, i) => (
          <path
            key={x}
            d={`M${x} 0 C ${x} 20, 200 14, 200 36`}
            pathLength={1}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.45}
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
            className={s.line}
            style={at(780 + i * 90)}
          />
        ))}
      </svg>

      <div aria-hidden className={`${s.rise} rounded-xl bg-night-raised p-3.5 ring-1 ring-white/10 sm:p-4`} style={at(1350)}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-[13px] text-on-dark">Bearing 6205-2RS, 400 pcs</p>
          <p className="text-[11px] text-fog/80">INR per piece, like for like</p>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2">
          {PRICES.map((p, i) => (
            <div
              key={p.supplier}
              className={`${p.best ? s.best : s.rise} min-w-0 rounded-lg px-2 py-2 ${p.best ? "bg-[#5fd39a]/12 ring-1 ring-[#5fd39a]/40" : "bg-white/[0.03]"}`}
              style={at(1600 + i * 120)}
            >
              <p className="truncate text-[10.5px] text-fog/80">{p.supplier}</p>
              <p className={`num mt-0.5 text-[13px] sm:text-[14px] ${p.best ? "text-[#8ce3b6]" : "text-on-dark"}`}>
                <span className="text-fog/70">₹</span>{p.price}
              </p>
            </div>
          ))}
        </div>

        <div className="relative mt-3">
          <span
            className={`${s.tether} absolute -top-3 left-[37.5%] h-3 w-px bg-[#5fd39a]/60`}
            style={at(2450)}
          />
          <div className={`${s.reveal} rounded-[10px] bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10`} style={at(2600)}>
            <p className="text-[12.5px] leading-snug text-on-dark">&ldquo;USD 2.11 per piece, FOB Chennai, valid 30 days&rdquo;</p>
            <p className="mt-1 text-[11px] text-fog/80">Cygnus_Quotation.pdf, page 2. Converted at 83.40 to ₹176.00</p>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <div className="min-w-0">
            <p className="text-[11px] text-fog/80">Award</p>
            <p className="num truncate text-[13px] text-on-dark">Cygnus, ₹70,400</p>
          </div>
          <span
            className={`${s.stamp} inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-[#8ce3b6] uppercase ring-[1.5px] ring-[#5fd39a]/70`}
            style={at(3450)}
          >
            <Check className="size-3.5" strokeWidth={2.25} />
            Approved
          </span>
        </div>
      </div>
    </figure>
  );
}
