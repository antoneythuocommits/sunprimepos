import cors from 'cors';
import express from 'express';
import { env } from './config.js';
import { errorHandler } from './middleware/error.js';
import { router } from './routes.js';

const app = express();

const configuredOrigins = env.corsOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (configuredOrigins.includes(origin)) return true;
  // Local POS (localhost:3000) still talks to this API when CORS_ORIGIN is the public site.
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '20mb' }));
app.use(router);
app.use(errorHandler);

const host = process.env.HOST ?? '0.0.0.0';
app.listen(env.port, host, () => {
  console.log(`Sunprime API listening on http://${host}:${env.port}`);
});
