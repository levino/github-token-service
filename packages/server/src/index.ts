import { createApp } from './app.ts';
import { config } from './config.ts';

const app = createApp();

app.listen(config.port, () => {
  console.log(`GitHub Token Service listening on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`RP ID: ${config.rpId}`);
  console.log(`Admin credential: ${config.adminCredential ? 'configured' : 'NOT CONFIGURED'}`);
});
