// index.js
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

const s3 = new S3Client({});

// Helper to turn a ReadableStream into a Buffer
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  const { bucket: { name: bucket }, object: { key: rawKey } } = event.Records[0].s3;
  const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
  console.log(`Processing s3://${bucket}/${key}`);

  if (
    !key.startsWith('products/') ||
    key.toLowerCase().endsWith('.webp') ||
    key.includes('/optimized/') ||
    (!key.toLowerCase().endsWith('.jpg') && !key.toLowerCase().endsWith('.png'))
  ) {
    console.log('Skipping:', key);
    return { status: 'skipped', processed: key };
  }

  // 1) Download
  const get = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const buffer = await streamToBuffer(get.Body);

  // 2) Resize & upload
  const base = key.split('/').pop().replace(/\.(jpe?g|png)$/i, '');
  const sizes = [200, 400, 800];

  await Promise.all(sizes.map(async width => {
    console.log(` - resizing to ${width}px`);
    const webp = await sharp(buffer)
      .resize({ width })
      .toFormat('webp')
      .toBuffer();

    const newKey = `products/optimized/${base}-${width}.webp`;
    console.log(` - uploading ${newKey}`);
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: newKey,
      Body: webp,
      ContentType: 'image/webp',
      ACL: 'public-read',
    }));
  }));

  console.log(`Done: ${key}`);
  return { status: 'done', processed: key };
};
