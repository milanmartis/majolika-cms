import type { Context } from 'koa';

const html = (apiKey: string, returnUrl: string) => `<!doctype html>
<html lang="sk">
<head>
  <meta charset="utf-8" />
  <title>Vybrať Packeta</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <script src="https://widget.packeta.com/v6/www/js/library.js"></script>
  <style>html,body{height:100%;margin:0}</style>
</head>
<body>
<script>
  // hodnoty zo servera
  const apiKey = ${JSON.stringify(apiKey)};
  const ret = ${JSON.stringify(returnUrl)};

  function finish(point){
    try {
      // Primárne: vráť späť cez postMessage do okna checkoutu (popup scenár)
      if (window.opener && ret) {
        const origin = new URL(ret).origin;
        window.opener.postMessage({ source: 'packeta', point }, origin);
        window.close();
        return;
      }
    } catch (e) {}

    // Fallback: redirect späť s parametrami (ak nie je opener)
    try {
      const u = new URL(ret);
      if (point) {
        u.searchParams.set('packetaId', point.id || '');
        u.searchParams.set('carrierId', point.carrierId || '');
        u.searchParams.set('carrierPickupPointId', point.carrierPickupPointId || '');
        u.searchParams.set('packetaName', point.name || '');
        u.searchParams.set('packetaCity', point.city || '');
        u.searchParams.set('packetaStreet', point.street || '');
        u.searchParams.set('packetaZip', point.zip || '');
        u.searchParams.set('packetaCountry', point.country || '');
        u.searchParams.set('packetaFormatted', point.formatedValue || '');
      }
      window.location.replace(u.toString());
    } catch (e) {
      // posledná záchrana: zatvor okno
      window.close();
    }
  }

  const options = {
    language: 'sk',
    view: 'modal',
    vendors: [
      { country: 'sk' },
      { country: 'sk', group: 'zbox' }
    ],
    valueFormat: '"Packeta",id,carrierId,carrierPickupPointId,name,city,street'
  };

  // Spusti widget
  Packeta.Widget.pick(apiKey, finish, options);
</script>
</body>
</html>`;

export default {
  async select(ctx: Context) {
    const returnUrl = ctx.query.return as string | undefined;
    if (!returnUrl) {
      ctx.throw(400, 'Missing ?return=');
      return;
    }

    // validácia return URL + povolené originy
    let ret: URL;
    try {
      ret = new URL(returnUrl);
    } catch {
      ctx.throw(400, 'Invalid return URL');
      return;
    }

    const allowed = (process.env.PACKETTA_ALLOWED_RETURN_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (allowed.length && !allowed.includes(ret.origin)) {
      ctx.throw(400, `Return origin not allowed: ${ret.origin}`);
      return;
    }

    const API_KEY = process.env.PACKETA_WIDGET_KEY;
    if (!API_KEY) {
      ctx.throw(500, 'Missing PACKETA_WIDGET_KEY');
      return;
    }

    ctx.type = 'text/html';
    ctx.body = html(API_KEY, ret.toString());
  },
};
