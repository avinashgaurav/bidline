import { sendDueReminders } from "@/lib/reminders";
import { expireStaleAwards } from "@/lib/expiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called once a day by Vercel Cron (vercel.json). Vercel sends the CRON_SECRET as a bearer token. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed.", { status: 401 });
  const expired = await expireStaleAwards();
  return Response.json({ ...(await sendDueReminders()), expired });
}
