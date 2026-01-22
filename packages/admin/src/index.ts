#!/usr/bin/env node --experimental-strip-types

import { createPasskey } from './commands/create-passkey.ts';

const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case 'create-passkey':
      await createPasskey();
      break;
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run with --help for usage information');
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
github-token-admin - Admin CLI for GitHub Token Service

Commands:
  create-passkey    Create a passkey for admin authentication

Options:
  -h, --help        Show this help message

Examples:
  # Production: Use real YubiKey
  github-token-admin create-passkey --rp-id token-service.example.com

  # Development: Use software authenticator
  github-token-admin create-passkey --rp-id localhost --software
`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
