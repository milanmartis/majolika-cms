/**
 * Doplní Cache-Control na existujúce S3 objekty pod prefixom `products/`.
 * (Nové uploady už majú Cache-Control z Strapi upload configu.)
 *
 *   node scripts/backfill-s3-cache-control.cjs                 # DRY-RUN (nič nezmení, len vypíše počet)
 *   node scripts/backfill-s3-cache-control.cjs --apply --limit=50   # test na 50 objektoch
 *   node scripts/backfill-s3-cache-control.cjs --apply              # všetky
 *
 * Používa CopyObject (server-side, obsah sa nemení) s MetadataDirective=REPLACE,
 * pričom zachová ContentType a nastaví CacheControl. Preskočí objekty, ktoré už správny CC majú.
 *
 * Pozn.: po backfille treba v CloudFronte spraviť invalidáciu /products/* (CDN má v cache starú
 * odpoveď bez hlavičky). Alebo rovno použi CloudFront Response headers policy (viď odporúčanie).
 */
'use strict';
require('dotenv').config();
const {
  S3Client, ListObjectsV2Command, HeadObjectCommand, CopyObjectCommand,
} = require('@aws-sdk/client-s3');

const CACHE_CONTROL = process.env.S3_CACHE_CONTROL || 'public, max-age=31536000, immutable';
const PREFIX = process.env.S3_BACKFILL_PREFIX || 'products/';
const BUCKET = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION;

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null;

if (!BUCKET) { console.error('❌ Chýba AWS_S3_BUCKET v env.'); process.exit(1); }

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_ACCESS_SECRET,
  },
});

async function* listAll() {
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token }));
    for (const o of res.Contents || []) yield o;
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

async function main() {
  console.log(`\n${APPLY ? '✍️  BACKFILL' : '🔎 DRY-RUN'}  bucket=${BUCKET} prefix="${PREFIX}"${LIMIT ? ` [limit ${LIMIT}]` : ''}`);
  console.log(`Cache-Control: ${CACHE_CONTROL}\n`);

  let seen = 0, updated = 0, skipped = 0, failed = 0;
  for await (const obj of listAll()) {
    const Key = obj.Key;
    if (!Key || Key.endsWith('/')) continue;
    seen++;
    if (LIMIT && seen > LIMIT) { seen--; break; }

    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key }));
      if (head.CacheControl === CACHE_CONTROL) { skipped++; continue; }

      if (!APPLY) {
        if (updated < 3) console.log(`  (dry) ${Key}  CC: ${head.CacheControl || '(none)'} → ${CACHE_CONTROL}`);
        updated++;
        continue;
      }

      await s3.send(new CopyObjectCommand({
        Bucket: BUCKET,
        Key,
        CopySource: `/${BUCKET}/${encodeURIComponent(Key).replace(/%2F/g, '/')}`,
        MetadataDirective: 'REPLACE',
        CacheControl: CACHE_CONTROL,
        ContentType: head.ContentType || undefined,
        ...(head.ContentDisposition ? { ContentDisposition: head.ContentDisposition } : {}),
        Metadata: head.Metadata || {},
      }));
      updated++;
      if (updated % 200 === 0) console.log(`  … ${updated} upravených`);
    } catch (e) {
      failed++;
      console.log(`  ❌ ${Key}: ${e.name || ''} ${e.message || e}`);
    }
  }

  console.log(`\nHotovo: objektov ${seen} | ${APPLY ? 'upravených' : 'na úpravu'} ${updated} | už OK ${skipped} | chýb ${failed}`);
  if (!APPLY) console.log(`Pre reálny beh pridaj --apply (odporúčam najprv --limit=50).`);
  else console.log(`⚠️ Nezabudni na CloudFront invalidáciu: aws cloudfront create-invalidation --distribution-id <ID> --paths "/products/*"`);
  console.log('');
}

main().catch((e) => { console.error('Chyba:', e); process.exit(1); });
