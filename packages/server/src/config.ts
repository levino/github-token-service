interface AdminCredential {
  credentialId: string;
  publicKey: string;
}

function parseAdminCredential(): AdminCredential | null {
  if (!process.env.ADMIN_CREDENTIAL) return null;
  try {
    return JSON.parse(Buffer.from(process.env.ADMIN_CREDENTIAL, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databasePath: process.env.DATABASE_PATH ?? './data/token-service.db',

  // WebAuthn
  rpId: process.env.RP_ID ?? 'localhost',
  rpName: process.env.RP_NAME ?? 'GitHub Token Service',
  origin: process.env.ORIGIN ?? 'http://localhost:3000',

  // Admin credential from env var (getter for dynamic reading in tests)
  get adminCredential(): AdminCredential | null {
    return parseAdminCredential();
  },

  // GitHub App
  githubAppId: process.env.GITHUB_APP_ID ?? '',
  githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY ?? '',
  githubInstallationId: process.env.GITHUB_INSTALLATION_ID ?? '',

  isDev: () => config.nodeEnv === 'development',
  isTest: () => config.nodeEnv === 'test',
  isProd: () => config.nodeEnv === 'production',
};
