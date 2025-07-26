import nodemailer from "nodemailer";

// ✅ tvoje údaje z .env
const transporter = nodemailer.createTransport({
  host: "smtp.m1.websupport.sk",
  port: 587,           // ✅ TLS port
  secure: false,       // false pre port 587 (STARTTLS)
  auth: {
    user: "info@appdesign.sk",
    pass: "DFR$$09gty12FG@q" // pozor na správne skopírovanie!
  },
});

async function sendTestMail() {
  try {
    const info = await transporter.sendMail({
      from: 'info@appdesign.sk',
      to: 'milanmartis@gmail.com',
      subject: '✅ SMTP Websupport test',
      text: 'Ak vidíš tento mail, SMTP je funkčné.',
    });

    console.log('✅ Email odoslaný:', info.messageId);
  } catch (err) {
    console.error('❌ Chyba pri odoslaní:', err);
  }
}

sendTestMail();
