import { loadConfig, saveConfig, setServiceUrl } from '../lib/storage.ts';

function printHelp(): void {
  console.log(`
Usage: github-token config <command> [options]

Commands:
  set <key> <value>   Set a configuration value
  get <key>           Get a configuration value
  list                List all configuration values
  clear               Clear all configuration

Keys:
  service-url         URL of the token service

Examples:
  github-token config set service-url https://token-service.example.com
  github-token config get service-url
  github-token config list
`);
}

export function config(): void {
  const args = process.argv.slice(3); // Skip 'node', script, 'config'

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const subCommand = args[0];

  switch (subCommand) {
    case 'set':
      configSet(args.slice(1));
      break;
    case 'get':
      configGet(args.slice(1));
      break;
    case 'list':
      configList();
      break;
    case 'clear':
      configClear();
      break;
    default:
      console.error(`Unknown config command: ${subCommand}`);
      printHelp();
      process.exit(1);
  }
}

function configSet(args: string[]): void {
  if (args.length < 2) {
    console.error('Usage: github-token config set <key> <value>');
    process.exit(1);
  }

  const [key, value] = args;

  switch (key) {
    case 'service-url':
      setServiceUrl(value);
      console.log(`Set service-url to: ${value}`);
      break;
    default:
      console.error(`Unknown config key: ${key}`);
      console.error('Available keys: service-url');
      process.exit(1);
  }
}

function configGet(args: string[]): void {
  if (args.length < 1) {
    console.error('Usage: github-token config get <key>');
    process.exit(1);
  }

  const key = args[0];
  const currentConfig = loadConfig();

  switch (key) {
    case 'service-url':
      console.log(currentConfig.serviceUrl ?? '(not set)');
      break;
    default:
      console.error(`Unknown config key: ${key}`);
      console.error('Available keys: service-url');
      process.exit(1);
  }
}

function configList(): void {
  const currentConfig = loadConfig();

  console.log('Configuration:');
  console.log(`  service-url: ${currentConfig.serviceUrl ?? '(not set)'}`);
  console.log(`  devpod-name: ${currentConfig.devpodName ?? '(not registered)'}`);
  console.log(`  allowed-repos: ${currentConfig.allowedRepos?.join(', ') ?? '(not registered)'}`);
  console.log(`  registered: ${currentConfig.registrationToken ? 'yes' : 'no'}`);
}

function configClear(): void {
  saveConfig({});
  console.log('Configuration cleared');
}
