import { getServiceUrl, getRegistrationToken } from './storage.ts';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface PollResponse {
  registration_token?: string;
  error?: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied';
}

interface TokenResponse {
  token: string;
  expires_at: string;
  repos: string[];
}

function getBaseUrl(): string {
  const url = getServiceUrl();
  if (!url) {
    throw new Error('Service URL not configured. Run: github-token config set service-url <url>');
  }
  return url.replace(/\/$/, '');
}

async function fetchJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let message: string;
    try {
      const json = JSON.parse(body);
      message = json.error || json.message || body;
    } catch {
      message = body;
    }
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return response.json();
}

export async function requestDeviceCode(devpodName: string, repos: string[]): Promise<DeviceCodeResponse> {
  return fetchJson<DeviceCodeResponse>('/api/device/code', {
    method: 'POST',
    body: JSON.stringify({ devpod_name: devpodName, repos }),
  });
}

export async function pollForAuthorization(deviceCode: string): Promise<PollResponse> {
  return fetchJson<PollResponse>('/api/device/poll', {
    method: 'POST',
    body: JSON.stringify({ device_code: deviceCode }),
  });
}

export async function getGitHubToken(): Promise<TokenResponse> {
  const registrationToken = getRegistrationToken();
  if (!registrationToken) {
    throw new Error('Not registered. Run: github-token register --name <name> --repos <repos>');
  }

  return fetchJson<TokenResponse>('/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${registrationToken}`,
    },
  });
}
