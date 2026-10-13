import nodemailer from "nodemailer";

// Sends mail through any SMTP account (Gmail app password, Brevo, SendGrid SMTP, ...). Set SMTP_HOST,
// SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM. With no SMTP_HOST, mail is only printed to the server
// console outside production - handy for local testing - and is reported as not sent in production.
export function mailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<boolean> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[mail not configured - printed instead]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
      return true;
    }
    console.error("mail: SMTP_HOST is not set, cannot send mail");
    return false;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  try {
    await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
    return true;
  } catch (e) {
    console.error("mail: send failed", e instanceof Error ? e.message : e);
    return false;
  }
}
