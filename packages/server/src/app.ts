import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.ts';
import { apiRouter } from './routes/api.ts';
import { webRouter } from './routes/web.ts';

export function createApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static('public'));

  // Dev bypass auth
  if (config.isDev()) {
    app.use((req, _res, next) => {
      if (req.headers['x-dev-auth'] === '1') {
        (req as express.Request & { isDevAuth: boolean }).isDevAuth = true;
      }
      next();
    });
  }

  // Routes
  app.use('/api', apiRouter);
  app.use('/', webRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
