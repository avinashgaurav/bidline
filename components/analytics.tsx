"use client";

import { Analytics as VercelAnalytics, type BeforeSend } from "@vercel/analytics/next";

// The approval link (/share/<token>) and the invite link (/invite/<id>) carry
// secrets in the path. Mask that segment before any event leaves the browser.
const redactSecrets: BeforeSend = (event) => ({
  ...event,
  url: event.url.replace(/\/(share|invite)\/[^/?#]+/, "/$1/:id"),
});

export function Analytics() {
  return <VercelAnalytics beforeSend={redactSecrets} />;
}
