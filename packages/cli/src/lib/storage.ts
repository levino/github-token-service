import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface StoredConfig {
  serviceUrl?: string;
  registrationToken?: string;
  devpodName?: string;
  allowedRepos?: string[];
}

function getConfigDir(): string {
  return join(homedir(), '.config', 'github-token-cli');
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): StoredConfig {
  try {
    const content = readFileSync(getConfigPath(), 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export function saveConfig(config: StoredConfig): void {
  ensureConfigDir();
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

export function getServiceUrl(): string | undefined {
  return loadConfig().serviceUrl;
}

export function setServiceUrl(url: string): void {
  const config = loadConfig();
  config.serviceUrl = url;
  saveConfig(config);
}

export function getRegistrationToken(): string | undefined {
  return loadConfig().registrationToken;
}

export function saveRegistration(token: string, devpodName: string, repos: string[]): void {
  const config = loadConfig();
  config.registrationToken = token;
  config.devpodName = devpodName;
  config.allowedRepos = repos;
  saveConfig(config);
}

export function getStoredDevpodInfo(): { name: string; repos: string[] } | undefined {
  const config = loadConfig();
  if (config.devpodName && config.allowedRepos) {
    return { name: config.devpodName, repos: config.allowedRepos };
  }
  return undefined;
}
