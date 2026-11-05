import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { one, q } from "./db";
import { BadInput } from "./rfx";

/**
 * The buyer's own mailbox, connected over SMTP with an app password, so
 * supplier follow-ups go out from their address and replies come back to them.
 */

export interface Provider {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  help: string;
  helpUrl?: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: "gmail", label: "Gmail or Google Workspace", host: "smtp.gmail.com", port: 465, secure: true,
    help: "Turn on 2-Step Verification, then create an app password in your Google Account and paste it here.",
    helpUrl: "https://support.google.com/accounts/answer/185833",
  },
  {
    id: "outlook", label: "Microsoft 365 or Outlook", host: "smtp.office365.com", port: 587, secure: false,
    help: "Your IT admin may need to allow SMTP sending for your mailbox. Use your full email as the username.",
  },
  {
    id: "zoho", label: "Zoho Mail (India)", host: "smtp.zoho.in", port: 465, secure: true,
    help: "Create an application-specific password in Zoho Mail security settings.",
  },
  { id: "custom", label: "Other mail server", host: "", port: 587, secure: false, help: "Use the SMTP details from your email provider." },
];

export interface EmailAccount {
  provider: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  signature: string | null;
  bcc_self: boolean;
  verified_at: string | null;
  last_error: string | null;
}

function key(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(`bidline-smtp:${s}`).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export async function getEmailAccount(userId: string): Promise<EmailAccount | null> {
  return one<EmailAccount>(
    `select provider, from_name, from_email, reply_to, smtp_host, smtp_port, smtp_secure, smtp_user, signature, bcc_self, verified_at, last_error
       from email_accounts where user_id = $1`,
    [userId],
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function transport(a: { smtp_host: string; smtp_port: number; smtp_secure: boolean; smtp_user: string }, pass: string) {
  return nodemailer.createTransport({
    host: a.smtp_host, port: a.smtp_port, secure: a.smtp_secure,
    auth: { user: a.smtp_user, pass },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
}

/** Check the details against the mail server before saving anything. */
export async function saveEmailAccount(userId: string, input: {
  provider: string; fromName: string; fromEmail: string; replyTo?: string | null; host: string; port: number;
  secure: boolean; user: string; password?: string | null; signature?: string | null; bccSelf: boolean;
}): Promise<void> {
  if (!input.fromName.trim()) throw new BadInput("Enter the name suppliers will see.");
  if (!EMAIL.test(input.fromEmail)) throw new BadInput("Enter a valid sender email address.");
  if (input.replyTo && !EMAIL.test(input.replyTo)) throw new BadInput("Enter a valid reply-to address, or leave it empty.");
  if (!input.host.trim()) throw new BadInput("Enter the SMTP server, for example smtp.gmail.com.");
  if (!(input.port > 0 && input.port < 65536)) throw new BadInput("Enter a valid SMTP port, usually 465 or 587.");
  if (!input.user.trim()) throw new BadInput("Enter the SMTP username, usually your email address.");
  const existing = await one<{ smtp_pass_enc: string }>("select smtp_pass_enc from email_accounts where user_id = $1", [userId]);
  const password = input.password?.trim() ? input.password.trim() : existing ? decrypt(existing.smtp_pass_enc) : "";
  if (!password) throw new BadInput("Enter the app password for this mailbox.");
  const account = { smtp_host: input.host.trim(), smtp_port: input.port, smtp_secure: input.secure, smtp_user: input.user.trim() };
  try {
    await transport(account, password).verify();
  } catch (e) {
    throw new BadInput(`The mail server did not accept these details: ${(e as Error).message}. Check the server, port, username and app password.`);
  }
  await q(
    `insert into email_accounts (user_id, provider, from_name, from_email, reply_to, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_enc, signature, bcc_self, verified_at, last_error, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),null,now())
     on conflict (user_id) do update set provider = excluded.provider, from_name = excluded.from_name, from_email = excluded.from_email,
       reply_to = excluded.reply_to, smtp_host = excluded.smtp_host, smtp_port = excluded.smtp_port, smtp_secure = excluded.smtp_secure,
       smtp_user = excluded.smtp_user, smtp_pass_enc = excluded.smtp_pass_enc, signature = excluded.signature, bcc_self = excluded.bcc_self,
       verified_at = now(), last_error = null, updated_at = now()`,
    [
      userId, input.provider, input.fromName.trim(), input.fromEmail.trim(), input.replyTo?.trim() || null,
      account.smtp_host, account.smtp_port, account.smtp_secure, account.smtp_user, encrypt(password),
      input.signature?.trim() || null, input.bccSelf,
    ],
  );
}

export async function disconnectEmail(userId: string) {
  await q("delete from email_accounts where user_id = $1", [userId]);
}

/** Send one message from the buyer's mailbox. Returns the server's message id. */
export async function sendMail(userId: string, msg: { to: string; subject: string; text: string }): Promise<string> {
  const row = await one<EmailAccount & { smtp_pass_enc: string }>("select * from email_accounts where user_id = $1", [userId]);
  if (!row) throw new BadInput("No email is connected. Connect your mailbox in Settings, then try again.");
  if (!EMAIL.test(msg.to)) throw new BadInput(`'${msg.to}' is not a valid email address.`);
  const text = row.signature ? `${msg.text.trimEnd()}\n\n${row.signature}` : msg.text;
  try {
    const info = await transport(row, decrypt(row.smtp_pass_enc)).sendMail({
      from: { name: row.from_name, address: row.from_email },
      to: msg.to,
      replyTo: row.reply_to ?? undefined,
      bcc: row.bcc_self ? row.from_email : undefined,
      subject: msg.subject,
      text,
    });
    await q("update email_accounts set last_error = null where user_id = $1", [userId]);
    return info.messageId;
  } catch (e) {
    await q("update email_accounts set last_error = $2 where user_id = $1", [userId, (e as Error).message.slice(0, 500)]);
    throw new BadInput(`The email was not sent: ${(e as Error).message}`);
  }
}
