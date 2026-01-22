#!/usr/bin/env node --experimental-strip-types

import { config } from './commands/config.ts';
import { getToken } from './commands/get-token.ts';
import { register } from './commands/register.ts';

const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case 'register':
      await register();
      break;
    case 'get-token':
      await getToken();
      break;
    case 'config':
      config();
      break;
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    case '--version':
    case '-v':
      console.log('0.1.0');
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run with --help for usage information');
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
github-token - CLI for GitHub Token Service

Commands:
  register      Register this devpod with the token service
  get-token     Get a GitHub installation token
  config        Configure CLI settings

Options:
  -h, --help    Show this help message
  -v, --version Show version number

Examples:
  # Configure the service URL
  github-token config set service-url https://token-service.example.com

  # Register this devpod
  github-token register --name my-devpod --repos org/repo-a,org/repo-b

  # Get a GitHub token
  github-token get-token

  # Get token in export format (for sourcing)
  eval $(github-token get-token --format export)
`);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
