// import nodemailer from "nodemailer";

// export default ({ env }) => ({
//   email: {
//     config: {
//       provider: "nodemailer",
//       providerOptions: {
//         host: env("SMTP_HOST", "smtp.m1.websupport.sk"),
//         port: env.int("SMTP_PORT", 587),
//         secure: false, // port 587 = STARTTLS
//         auth: {
//           user: env("SMTP_USER"),
//           pass: env("SMTP_PASS"),
//         },
//       },
//       settings: {
//         defaultFrom: env("EMAIL_DEFAULT_FROM", "info@appdesign.sk"),
//         defaultReplyTo: env("EMAIL_REPLY_TO", "info@appdesign.sk"),
//       },
//     },
//   },
// });