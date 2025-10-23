//../../uyils/email.ts
import nodemailer from "nodemailer";

export async function sendEmail({ to, subject, text, html }: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.m1.websupport.sk",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  const defaultFrom = process.env.MAIL_FROM || '"MAJOLIKA MODRA" <info@majolika.sk>';
  const info = await transporter.sendMail({
    from: defaultFrom,
    to,
    subject,
    text,
    html,
  });

  console.log("✅ Email odoslaný:", info.messageId);
  return info;
}
