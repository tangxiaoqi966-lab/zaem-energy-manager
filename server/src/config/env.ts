import 'dotenv/config';

const env = {
  DATABASE_URL: process.env.DATABASE_URL as string,
  REDIS_URL: process.env.REDIS_URL as string,
  JWT_SECRET: (process.env.JWT_SECRET ?? 'dev_secret') as string,
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? '*') as string,
  NODE_ENV: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
  XIAOMI_USERNAME: process.env.XIAOMI_USERNAME as string | undefined,
  XIAOMI_PASSWORD: process.env.XIAOMI_PASSWORD as string | undefined,
};

export const CORS_ORIGINS =
  env.CORS_ORIGIN === '*'
    ? ['*']
    : env.CORS_ORIGIN
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

export default env;
export const {
  DATABASE_URL,
  REDIS_URL,
  JWT_SECRET,
  PORT,
  CORS_ORIGIN,
  NODE_ENV,
  XIAOMI_USERNAME,
  XIAOMI_PASSWORD,
} = env;
