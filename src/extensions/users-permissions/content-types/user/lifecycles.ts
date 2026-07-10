// import { sendEmail } from "../../../../utils/email";

// export default {
//   async afterCreate(event) {
//     const { result } = event;

//     const confirmLink = `${process.env.FRONTEND_URL}/confirm-email?token=12345`;

//     await sendEmail({
//       to: result.email,
//       subject: "✅ Potvrď svoju registráciu",
//       text: `Ahoj ${result.username}, klikni na link: ${confirmLink}`,
//       html: `<p>Ahoj <b>${result.username}</b>!<br>Potvrď registráciu kliknutím na <a href="${confirmLink}">tento odkaz</a>.</p>`,
//     });
//   }
// };


// src/extensions/users-permissions/content-types/user/lifecycles.ts
import { sendEmail } from "../../../../utils/email";

type LifecycleEvent = {
  params: {
    where?: { id?: number | string };
    data?: Record<string, any>;
  };
  result?: any;
  state?: Record<string, any>;
};

function buildConfirmedHtml(username: string) {
  return `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <title>Email potvrdený</title>
  <style>
    body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; }
    .container {
      max-width: 600px; margin: 40px auto; background: #fff url('https://majolika.sk/assets/img/corner6.png') no-repeat right bottom;
      background-size: 200px auto; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.05); overflow: hidden;
    }
    .header { background-color: #0e29a0; color: white; padding: 24px; text-align: center; }
    .content { padding: 32px; }
    .content h2 { margin-top: 0; color: #333; }
    .content p { font-size: 16px; line-height: 1.6; color: #444; }
    .button {
      display: inline-block; margin-top: 24px; padding: 12px 24px; background-color: #0e29a0;
      color: white !important; text-decoration: none; border-radius: 4px; font-weight: bold;
    }
    .footer { background-color: #fafafa; color: #777; font-size: 13px; padding: 24px; text-align: center; line-height: 1.5; }
    .footer a { color: #0e29a0; text-decoration: none; }
    .footer-logo { margin-top: 16px; }
    .footer-logo img { max-width: 120px; opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Vitajte v Majolike</h1>
    </div>

    <div class="content">
      <h2>Email úspešne potvrdený</h2>
      <p>Ahoj <b>${username}</b>,</p>
      <p>tvoj účet bol úspešne aktivovaný. Môžeš sa prihlásiť a začať nakupovať.</p>

      <p style="text-align: center;">
        <a class="button" href="https://majolika.sk/prihlasenie">
          Prihlásiť sa
        </a>
      </p>

      <p>Ak si to nerobil/a ty, ozvi sa nám prosím na <a href="mailto:info@majolika.sk">info@majolika.sk</a>.</p>
    </div>

    <div class="footer">
      <p>
        Slovenská ľudová majolika<br>
        Dolná 138, 900 01 Modra<br>
        IČO: 00 167 975 | DIČ: 2020360155<br>
        IBAN: SK97 0900 0000 0051 3558 7112 (SLSP)<br>
        <a href="mailto:majolika@majolika.sk">majolika@majolika.sk</a> |
        <a href="mailto:info@majolika.sk">info@majolika.sk</a><br>
        <a href="tel:+421911980105">+421 911 980 105</a><br><br>
        Otváracie hodiny: Po–Pia 8:00–16:00 | So–Ne 10:00–16:00
      </p>
 <p style="margin-top:18px;padding-top:18px;border-top:1px solid #e5e5e5;">
          <a href="https://www.majolika.sk/odstupenie-od-zmluvy"
            target="_blank"
            style="font-weight:bold;color:#0e29a0;">
            Odstúpenie od zmluvy | Contract termination
          </a>
        </p>
      <div class="footer-logo">
        <img src="https://majolika.sk/assets/img/logo-SLM-modre.gif" alt="SLM logo" />
      </div>
    </div>
  </div>
</body>
</html>`;
}

export default {
  // uložíme si pôvodný stav "confirmed", aby sme vedeli či nastal prechod false -> true
  async beforeUpdate(event: LifecycleEvent) {
    const id = event.params?.where?.id;
    if (!id) return;

    const prev = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      id as any,
      { fields: ["confirmed"] }
    );

    event.state = event.state || {};
    event.state.prevConfirmed = Boolean(prev?.confirmed);
  },

  async afterUpdate(event: LifecycleEvent) {
    const { result, params, state } = event;

    // posielame len keď sa v update práve nastavilo confirmed=true
    const isBeingConfirmed = params?.data?.confirmed === true;
    if (!isBeingConfirmed) return;

    // a iba keď predtým confirmed nebolo true (aby sa neposlal viackrát)
    const prevConfirmed = Boolean(state?.prevConfirmed);
    if (prevConfirmed) return;

    const username = result?.username || "zákazník";
    const email = result?.email;
    if (!email) return;

    await sendEmail({
      to: email,
      subject: "Email úspešne potvrdený",
      text: `${username}, Váš účet je úspešne aktivovaný.`,
      html: buildConfirmedHtml(username),
    });
  },
};