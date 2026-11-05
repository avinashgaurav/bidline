import { requireUser } from "@/lib/auth";
import { appUrlFromHeaders } from "@/lib/app-url";
import { ConnectCard } from "@/components/connect-card";
import { PromptList } from "@/components/prompt-list";

export const metadata = { title: "Connect Claude · Bidline" };

const SAMPLES = [
  ["Zenith: Excel quote", "01-vendor-zenith/Zenith_Quotation_ZIS-NBR-2026-1184.xlsx"],
  ["Zenith: revised Excel quote", "01-vendor-zenith/Zenith_Quotation_ZIS-NBR-2026-1184-R2_REVISED.xlsx"],
  ["Cygnus: PDF quote, partly in USD", "02-vendor-cygnus/Cygnus_Quotation_CTI-Q-2026-0918.pdf"],
  ["Orbit: Word letter, prices in the text", "03-vendor-orbit/Orbit_Offer_OSS-QT-2026-27-0442.docx"],
  ["Vector: photo of a rate card", "04-vendor-vector/IMG_20260917_1142_vector_rate_card.jpg"],
  ["Helios: quote by email", "05-vendor-helios/helios_reply_2026-09-17.eml"],
];

export default async function ConnectPage() {
  const user = await requireUser();
  const base = await appUrlFromHeaders();
  return (
    <div className="mx-auto grid max-w-4xl gap-8">
      <div>
        <p className="eyebrow">Connect Claude</p>
        <h1 className="mt-2 text-[24px] leading-tight">Claude reads the documents. Bidline keeps the record.</h1>
        <p className="mt-2 max-w-2xl text-ink-secondary">
          Bidline has no AI inside. It gives your Claude a set of tools over MCP: create a sourcing event, read a supplier&apos;s quote, record the prices,
          compare, edit, send follow-ups and draft the award. Bidline does every calculation, and every change shows in the app straight away.
        </p>
      </div>
      <ConnectCard url={`${base}/mcp/${user.mcp_token}`} connectedAt={user.last_mcp_at} />
      <section className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
        <p className="eyebrow">Things to ask Claude</p>
        <div className="mt-3"><PromptList /></div>
      </section>
      <section className="rounded-xl bg-card p-4 ring-1 ring-border sm:p-5">
        <p className="eyebrow">Sample supplier files</p>
        <p className="mt-1 text-sm text-ink-secondary">Fictional quotes for the demo event. Upload them to a sourcing event, or attach one to a Claude chat.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {SAMPLES.map(([label, path]) => (
            <li key={path}>
              <a className="block rounded-lg bg-muted px-4 py-3 text-sm hover:bg-lavender" href={`/samples/${path}`} download>
                {label}
                <span className="block text-xs text-ink-secondary">{path.split("/").pop()}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
