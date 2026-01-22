import { parseArgs } from 'node:util';
import { requestDeviceCode, pollForAuthorization } from '../lib/api.ts';
import { saveRegistration, getServiceUrl } from '../lib/storage.ts';

interface RegisterOptions {
  name: string;
  repos: string[];
}

function parseOptions(): RegisterOptions {
  const { values } = parseArgs({
    options: {
      'name': { type: 'string' },
      'repos': { type: 'string' },
      'help': { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage: github-token register [options]

Options:
  --name <name>     Devpod name (required)
  --repos <repos>   Comma-separated list of repos (e.g., org/repo-a,org/repo-b) (required)
  -h, --help        Show this help message

Example:
  github-token register --name my-devpod --repos org/repo-a,org/repo-b
`);
    process.exit(0);
  }

  if (!values.name) {
    console.error('Error: --name is required');
    process.exit(1);
  }

  if (!values.repos) {
    console.error('Error: --repos is required');
    process.exit(1);
  }

  return {
    name: values.name,
    repos: values.repos.split(',').map(r => r.trim()),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function register(): Promise<void> {
  const options = parseOptions();

  const serviceUrl = getServiceUrl();
  if (!serviceUrl) {
    console.error('Error: Service URL not configured');
    console.error('Run: github-token config set service-url <url>');
    process.exit(1);
  }

  console.log(`Registering devpod: ${options.name}`);
  console.log(`Requested repos: ${options.repos.join(', ')}`);
  console.log('');

  // Start device authorization flow
  const deviceResponse = await requestDeviceCode(options.name, options.repos);

  console.log('To authorize this devpod, visit:');
  console.log(`  ${deviceResponse.verification_uri}`);
  console.log('');
  console.log(`Enter code: ${deviceResponse.user_code}`);
  console.log('');
  console.log('Waiting for authorization...');

  // Poll for authorization
  const pollInterval = (deviceResponse.interval || 5) * 1000;
  const expiresAt = Date.now() + deviceResponse.expires_in * 1000;

  while (Date.now() < expiresAt) {
    await sleep(pollInterval);

    const pollResponse = await pollForAuthorization(deviceResponse.device_code);

    if (pollResponse.registration_token) {
      // Save registration token
      saveRegistration(pollResponse.registration_token, options.name, options.repos);

      console.log('');
      console.log('Authorization successful!');
      console.log('');
      console.log('You can now get GitHub tokens with:');
      console.log('  github-token get-token');
      return;
    }

    if (pollResponse.error === 'access_denied') {
      console.error('');
      console.error('Authorization denied by admin');
      process.exit(1);
    }

    if (pollResponse.error === 'expired_token') {
      console.error('');
      console.error('Authorization request expired');
      process.exit(1);
    }

    if (pollResponse.error === 'slow_down') {
      // Increase poll interval
      await sleep(pollInterval);
    }

    // authorization_pending - continue polling
    process.stdout.write('.');
  }

  console.error('');
  console.error('Authorization request expired');
  process.exit(1);
}
