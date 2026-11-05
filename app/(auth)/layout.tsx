import { Logo } from "@/components/brand";
import { AuthStory } from "@/components/auth/auth-story";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* On phones the form comes first and the story follows it; from lg up the story sits on the left. */}
      {/* From lg up the panel is fixed to the screen: it never scrolls. */}
      <aside className="order-last flex flex-col bg-night px-6 py-12 text-on-dark sm:px-10 lg:sticky lg:top-0 lg:order-none lg:h-dvh lg:overflow-hidden lg:px-10 lg:py-8 xl:px-16">
        <div className="hidden lg:block"><Logo dark /></div>
        <div className="flex min-h-0 flex-1 items-center lg:py-4">
          <AuthStory />
        </div>
      </aside>
      <main className="flex min-h-dvh flex-col px-6 py-8 sm:px-10 lg:sticky lg:top-0 lg:h-dvh lg:py-10">
        <div className="lg:hidden"><Logo /></div>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-12 lg:py-0">
          {children}
        </div>
      </main>
    </div>
  );
}
