// config/bootstrap.ts
import * as dotenv from 'dotenv';
import * as path from 'path';

export default async () => {
  const envPath = path.resolve('/home/ec2-user/majolika-cms/.env');
  dotenv.config({ path: envPath });

  console.log('✅ .env načítaný z:', envPath);
  console.log('🔑 process.env.STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY);
  console.log('🌐 process.env.FRONTEND_URL:', process.env.FRONTEND_URL);
};