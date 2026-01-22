import { parseArgs } from 'node:util';
import { getGitHubToken } from '../lib/api.ts';
import { getRegistrationToken, getStoredDevpodInfo } from '../lib/storage.ts';

function parseOptions(): { format: 'text' | 'json' | 'export' } {
  const { values } = parseArgs({
    options: {
      'format': { type: 'string', default: 'text' },
      'help': { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage: github-token get-token [options]

Options:
  --format <format>  Output format: text (default), json, export
  -h, --help         Show this help message

Examples:
  github-token get-token
  github-token get-token --format json
  github-token get-token --format export  # Output as: export GH_TOKEN=xxx
`);
    process.exit(0);
  }

  const format = values.format as 'text' | 'json' | 'export';
  if (!['text', 'json', 'export'].includes(format)) {
    console.error(`Error: Invalid format "${format}". Use: text, json, or export`);
    process.exit(1);
  }

  return { format };
}

export async function getToken(): Promise<void> {
  const { format } = parseOptions();

  const registrationToken = getRegistrationToken();
  if (!registrationToken) {
    console.error('Error: Not registered');
    console.error('Run: github-token register --name <name> --repos <repos>');
    process.exit(1);
  }

  const tokenResponse = await getGitHubToken();
  const devpodInfo = getStoredDevpodInfo();

  switch (format) {
    case 'json':
      console.log(JSON.stringify({
        token: tokenResponse.token,
        expires_at: tokenResponse.expires_at,
        repos: tokenResponse.repos,
        devpod: devpodInfo?.name,
      }, null, 2));
      break;

    case 'export':
      console.log(`export GH_TOKEN=${tokenResponse.token}`);
      console.log(`export GITHUB_TOKEN=${tokenResponse.token}`);
      break;

    case 'text':
    default:
      console.log(`Token: ${tokenResponse.token}`);
      console.log(`Expires: ${tokenResponse.expires_at}`);
      console.log(`Repos: ${tokenResponse.repos.join(', ')}`);
      break;
  }
}
