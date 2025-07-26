import { sendEmail } from "../../../../utils/email";

export default {
  async afterCreate(event) {
    const { result } = event;

    const confirmLink = `${process.env.FRONTEND_URL}/confirm-email?token=12345`;

    await sendEmail({
      to: result.email,
      subject: "✅ Potvrď svoju registráciu",
      text: `Ahoj ${result.username}, klikni na link: ${confirmLink}`,
      html: `<p>Ahoj <b>${result.username}</b>!<br>Potvrď registráciu kliknutím na <a href="${confirmLink}">tento odkaz</a>.</p>`,
    });
  }
};
