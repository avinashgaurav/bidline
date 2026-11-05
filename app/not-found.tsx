import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <p className="eyebrow">Not found</p>
        <h1 className="mt-2 text-[28px]">This page does not exist.</h1>
        <Link href="/" className="mt-4 inline-block text-primary hover:underline">Go to your sourcing events</Link>
      </div>
    </main>
  );
}
