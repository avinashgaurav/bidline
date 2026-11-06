import { redirect } from "next/navigation";

/** Connecting Claude now lives on the Ask Claude page, next to what to ask it. */
export default function ConnectPage() {
  redirect("/ask#connect");
}
