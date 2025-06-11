// scripts/handler.js

require('dotenv').config();

const {
  S3Client,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const {
  LambdaClient,
  InvokeCommand,
} = require('@aws-sdk/client-lambda');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

// S3 klient s väčším poolom socketov
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  requestHandler: new NodeHttpHandler({
    maxSockets: 200,
    socketAcquisitionTimeout: 30000,
  }),
});
const BUCKET = process.env.AWS_S3_BUCKET;

// Lambda klient
const lambda = new LambdaClient({ region: process.env.AWS_REGION });
const LAMBDA_FN = process.env.LAMBDA_FUNCTION_NAME || 's3-image-processor';

// Rozdelí pole na batch-e danej veľkosti
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Pre každý S3 kľúč pošle asynchrónne "Event" invoke do tvojej Lambda
async function invokeForKey(key) {
  const payload = JSON.stringify({ bucket: BUCKET, key });
  await lambda.send(new InvokeCommand({
    FunctionName: LAMBDA_FN,
    InvocationType: 'Event',       // asynchrónne
    Payload: Buffer.from(payload),
  }));
  console.log(`Invoked ${LAMBDA_FN} for key: ${key}`);
}

exports.handler = async () => {
  let ContinuationToken;
  let totalInvoked = 0;

  do {
    // stránkovaný zoznam S3 objektov
    const listResp = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken,
    }));

    // filtrovanie iba obrázkov podľa prípony
    const keys = (listResp.Contents || [])
      .map(o => o.Key)
      .filter(k => /\.(jpe?g|png|gif|webp)$/i.test(k));

    // rozdeli na dávky po 20
    const batches = chunkArray(keys, 20);
    for (const batch of batches) {
      // invoke Lambda paralelne pre každý kľúč v batch-e
      await Promise.all(batch.map(invokeForKey));
      totalInvoked += batch.length;
    }

    ContinuationToken = listResp.IsTruncated
      ? listResp.NextContinuationToken
      : undefined;
  } while (ContinuationToken);

  return {
    statusCode: 200,
    body: `Done, invoked ${LAMBDA_FN} for ${totalInvoked} images.`,
  };
};

// Ak spúšťaš lokálne `node scripts/handler.js`, rovno to zavolá handler:
if (require.main === module) {
  exports.handler()
    .then(res => console.log(res))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
