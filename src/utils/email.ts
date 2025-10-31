import nodemailer from "nodemailer";

type SendEmailArgs = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;      // voliteľné – ak nepošleš, vezmeme z ENV
  replyTo?: string;   // voliteľné – napr. info@majolika.sk
};

export async function sendEmail({ to, subject, text, html, from, replyTo }: SendEmailArgs) {
  const host = process.env.SMTP_HOST || "mail.webhouse.sk";
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  // 1) Vyber „from“
  // Priorita: explicitný `from` param → MAIL_FROM → odvodené zo SMTP_USER
  const envFrom = process.env.MAIL_FROM; // napr. "MAJOLIKA MODRA <objednavky@majolika.sk>"
  const fallbackFrom = user ? `"MAJOLIKA MODRA" <${user}>` : undefined;
  const finalFrom = from || envFrom || fallbackFrom;

  if (!finalFrom) {
    throw new Error("Missing sender: set MAIL_FROM or SMTP_USER in environment.");
  }
  if (!user || !pass) {
    throw new Error("Missing SMTP credentials: set SMTP_USER and SMTP_PASS.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // 587 = STARTTLS
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from: finalFrom,          // header From
    to,
    subject,
    text,
    html,
    replyTo: replyTo || process.env.MAIL_REPLY_TO || undefined,
    // envelope: { from: extractAddress(finalFrom), to }, // ak by provider vyžadoval zhodu MAIL FROM
  });

  console.log("✅ Email odoslaný:", info.messageId);
  return info;
}
