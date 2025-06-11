// scripts/download-images.js
require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

const STRAPI_URL = process.env.STRAPI_URL || 'http://127.0.0.1:1337';
const TOKEN      = process.env.STRAPI_TOKEN;
console.log('Using STRAPI_URL=', STRAPI_URL);
console.log('Using STRAPI_TOKEN=', !!TOKEN);
if (!TOKEN) {
  console.error('❌ Error: STRAPI_TOKEN nie je nastavený v .env');
  process.exit(1);
}

const downloadDir = path.resolve(__dirname, 'product-images');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

(async () => {
  let urls;
  try {
    const resp = await axios.get(
      `${STRAPI_URL}/api/products/picture-urls`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    urls = resp.data.urls;
    console.log(`➡️  Našiel som ${urls.length} URL.`);
  } catch (err) {
    console.error('❌ Chyba pri získavaní JSONu z Strapi:');
    console.error(err.response?.status, err.response?.data || err.message);
    process.exit(1);
  }

  for (const url of urls) {
    const fileName = path.basename(url);
    const filePath = path.join(downloadDir, fileName);
    try {
      console.log(`→ sťahujem ${url}`);
      const res = await axios.get(url, { responseType: 'stream' });
      await new Promise((resolve, reject) => {
        res.data
          .pipe(fs.createWriteStream(filePath))
          .on('finish', resolve)
          .on('error', reject);
      });
      console.log(`✔️  uložené ako ${fileName}`);
    } catch (err) {
      console.error(`❌ Nepodarilo sa stiahnuť ${url}:`);
      console.error(err.response?.status, err.response?.data || err.message);
    }
  }

  console.log('🎉 Hotovo! Obrázky v:', downloadDir);
})();
