import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden flex-col justify-between bg-night p-12 text-on-dark lg:flex">
        <Logo dark />
        <div className="max-w-md">
          <p className="eyebrow !text-fog">Supplier quote comparison</p>
          <h1 className="mt-4 text-[42px] leading-[1.15]">Claude reads the quotes. Bidline does the calculations.</h1>
          <p className="mt-5 text-[17px] leading-relaxed text-fog" style={{ fontWeight: 360 }}>
            Suppliers send quotes as spreadsheets, PDFs, emails and photos. Your Claude reads them. Bidline builds one
            like-for-like comparison, links every price to the supplier&apos;s document, and routes the award for
            approval.
          </p>
        </div>
        <p className="text-xs text-fog">Bidline has no AI inside. Your Claude plan reads the documents.</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          {children}
        </div>
      </main>
    </div>
  );
}
