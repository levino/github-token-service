import { parseArgs } from 'node:util';
import { createSoftwareAuthenticator } from '../lib/software-authenticator.ts';

interface CreatePasskeyOptions {
  rpId: string;
  rpName: string;
  software: boolean;
}

function parseOptions(): CreatePasskeyOptions {
  const { values } = parseArgs({
    options: {
      'rp-id': { type: 'string' },
      'rp-name': { type: 'string', default: 'GitHub Token Service' },
      'software': { type: 'boolean', default: false },
      'help': { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
Usage: github-token-admin create-passkey [options]

Options:
  --rp-id <id>       Relying party ID (e.g., token-service.example.com) [required]
  --rp-name <name>   Relying party name (default: "GitHub Token Service")
  --software         Use software authenticator instead of hardware YubiKey
  -h, --help         Show this help message

Examples:
  # Production: Use real YubiKey
  github-token-admin create-passkey --rp-id token-service.example.com

  # Development: Use software authenticator
  github-token-admin create-passkey --rp-id localhost --software
`);
    process.exit(0);
  }

  if (!values['rp-id']) {
    console.error('Error: --rp-id is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  return {
    rpId: values['rp-id'],
    rpName: values['rp-name'] ?? 'GitHub Token Service',
    software: values.software ?? false,
  };
}

async function createWithSoftwareAuthenticator(options: CreatePasskeyOptions): Promise<void> {
  console.log('Using software authenticator...\n');

  const authenticator = createSoftwareAuthenticator();
  const credential = await authenticator.createCredential(options.rpId);

  // For software authenticator, include private key so tests can sign
  const credentialData = {
    credentialId: credential.credentialId,
    publicKey: credential.publicKey,
    privateKey: credential.privateKey,
  };

  const encoded = Buffer.from(JSON.stringify(credentialData)).toString('base64');

  outputCredential(encoded);
}

async function createWithHardwareAuthenticator(options: CreatePasskeyOptions): Promise<void> {
  // For hardware authenticator, we need to use @simplewebauthn/server
  // This requires a browser environment to interact with the YubiKey
  // For CLI, we'll use the native FIDO2 libraries

  console.log(`\nCreating passkey for RP: ${options.rpName} (${options.rpId})`);
  console.log('\nTouch your YubiKey to create passkey...\n');

  try {
    // Dynamic import to avoid loading heavy deps for software mode
    const { generateRegistrationOptions, verifyRegistrationResponse } = await import('@simplewebauthn/server');

    // Generate registration options
    const registrationOptions = await generateRegistrationOptions({
      rpName: options.rpName,
      rpID: options.rpId,
      userName: 'admin',
      userDisplayName: 'Admin',
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'cross-platform',
        userVerification: 'preferred',
        residentKey: 'discouraged',
      },
    });

    console.log('Hardware YubiKey registration requires a browser environment.');
    console.log('For CLI-based registration, please use one of these options:\n');
    console.log('1. Use --software flag for development/testing');
    console.log('2. Use the browser-based registration flow');
    console.log('3. Use a FIDO2 library that supports direct USB communication\n');
    console.log('Registration options generated (for browser use):');
    console.log(JSON.stringify(registrationOptions, null, 2));
    console.log('\nTo complete hardware registration:');
    console.log('1. Open a browser to a local web page');
    console.log('2. Call navigator.credentials.create() with these options');
    console.log('3. Extract the credential and run this tool with the result\n');

    // For now, exit with instructions
    // In a future version, we could:
    // - Start a local HTTPS server
    // - Open browser for registration
    // - Receive callback with credential
    process.exit(1);
  } catch (error) {
    console.error('Error creating passkey:', error);
    process.exit(1);
  }
}

function outputCredential(encoded: string): void {
  console.log('Success! Add this environment variable to your service:\n');
  console.log(`ADMIN_CREDENTIAL=${encoded}\n`);
  console.log('Then redeploy the service.\n');
}

export async function createPasskey(): Promise<void> {
  const options = parseOptions();

  if (options.software) {
    await createWithSoftwareAuthenticator(options);
  } else {
    await createWithHardwareAuthenticator(options);
  }
}
