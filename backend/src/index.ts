import cors from 'cors';
import express from 'express';
import { env } from './config.js';
import { errorHandler } from './middleware/error.js';
import { router } from './routes.js';

const app = express();

app.use(
  cors({
    origin: env.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(router);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`Sunprime API listening on :${env.port}`);
});
