import cookieParser from 'cookie-parser';
import express from 'express';
import { config } from './config.ts';
import { apiRouter } from './routes/api.ts';

export function createApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(cookieParser());

  // Dev bypass auth
  if (config.isDev()) {
    app.use((req, _res, next) => {
      if (req.headers['x-dev-auth'] === '1') {
        (req as express.Request & { isDevAuth: boolean }).isDevAuth = true;
      }
      next();
    });
  }

  // Health check (before other routes)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // API Routes
  app.use('/api', apiRouter);

  // Redirect root to /admin
  app.get('/', (_req, res) => {
    res.redirect('/admin');
  });

  return app;
}

// Create app with Astro middleware for production/development
export async function createAppWithAstro() {
  const app = createApp();

  try {
    // Dynamic import of Astro middleware
    const { handler } = await import('@levino/github-token-admin-ui/dist/server/entry.mjs');
    app.use(handler);
  } catch (error) {
    console.warn('Astro UI not found, skipping middleware:', error);
    // Fallback: serve a simple message
    app.get('/admin', (_req, res) => {
      res.send('Admin UI not built. Run: npm run build --workspace=packages/admin-ui');
    });
    app.get('/admin/*', (_req, res) => {
      res.redirect('/admin');
    });
  }

  return app;
}
