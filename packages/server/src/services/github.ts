import { createSign } from 'node:crypto';
import { config } from '../config.ts';

interface InstallationToken {
  token: string;
  expiresAt: string;
}

function createJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds ago (clock skew)
    exp: now + 10 * 60, // Expires in 10 minutes
    iss: config.githubAppId,
  };

  const header = { alg: 'RS256', typ: 'JWT' };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const sign = createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(config.githubAppPrivateKey, 'base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function createInstallationToken(repos: string[]): Promise<InstallationToken> {
  if (!config.githubAppId || !config.githubAppPrivateKey || !config.githubInstallationId) {
    throw new Error('GitHub App not configured');
  }

  const jwt = createJwt();

  // Request installation token
  const response = await fetch(
    `https://api.github.com/app/installations/${config.githubInstallationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${jwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        repositories: repos.map((r) => r.split('/')[1]), // Extract repo name from "owner/repo"
        permissions: {
          contents: 'read',
          metadata: 'read',
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { token: string; expires_at: string };

  return {
    token: data.token,
    expiresAt: data.expires_at,
  };
}
