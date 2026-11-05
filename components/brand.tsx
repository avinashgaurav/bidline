import Link from "next/link";

/** The Bidline mark: an indigo square with three bid lines. Same drawing as app/icon.svg. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#5266eb" />
      <rect x="8" y="9" width="16" height="3.2" rx="1.6" fill="#fff" />
      <rect x="8" y="14.4" width="10" height="3.2" rx="1.6" fill="#fff" />
      <rect x="8" y="19.8" width="13" height="3.2" rx="1.6" fill="#fff" fillOpacity=".55" />
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${dark ? "text-on-dark" : "text-foreground"}`}>
      <Mark />
      <span className="text-[17px] tracking-wide" style={{ fontWeight: 480 }}>Bidline</span>
    </Link>
  );
}
