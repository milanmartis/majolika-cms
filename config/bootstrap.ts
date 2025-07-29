import * as dotenv from 'dotenv';

import * as path from 'path';

export default async () => {
  dotenv.config({ path: path.resolve('/home/ec2-user/majolika-cms/.env') });
};