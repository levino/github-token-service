# GitHub App Token Service - Implementation Plan

## Purpose

Generate scoped GitHub App installation tokens for devpods without exposing the GitHub App private key. Devpods can only obtain tokens for repositories they were explicitly registered for. Registration requires admin approval through a web interface secured with passkey authentication.

## Definitions

- **Token Service**: Web service with API and admin UI, running on dev server
- **Devpod**: Containerized development environment that needs GitHub API access
- **Admin**: Human developer who approves registrations via web UI (authenticated with passkey/YubiKey)
- **Device Code**: Short code (e.g., "ABCD-1234") displayed on both CLI and web UI to link the authorization
- **Registration Token**: Long-lived token issued to devpod after approval, used to request GitHub tokens
- **Installation Token**: GitHub App token scoped to specific repositories, expires after 1 hour

## Components

### Token Service (Web Application)

Location: Docker container on dev server

Stores:
- GitHub App ID and private key
- Admin passkey credentials (WebAuthn)
- Registry of devpod registrations
- Pending authorization requests
- Usage statistics

#### API Endpoints (for devpod CLI)

- `POST /api/device/code` — Start device authorization flow, returns device_code + user_code
- `POST /api/device/poll` — Poll for authorization completion (returns registration token when approved)
- `POST /api/token` — Exchange registration token for GitHub installation token

#### Web UI Routes (for admin)

- `GET /` — Login page (passkey authentication)
- `GET /dashboard` — List of registered devpods with stats
- `GET /device` — Device authorization page (enter user_code)
- `POST /device/authorize` — Approve or deny a device authorization
- `POST /registrations/:id/revoke` — Revoke a devpod registration

#### Internal API (for web UI, requires auth)

- `GET /api/registrations` — List all registrations with stats
- `GET /api/registrations/:id` — Get single registration details
- `DELETE /api/registrations/:id` — Revoke a registration
- `GET /api/pending` — List pending authorizations

### Devpod Client (CLI)

Location: Inside each devpod container

Stores:
- Registration token (after first approval)

## Device Authorization Flow (Registration)

This follows the OAuth 2.0 Device Authorization Grant (RFC 8628) pattern, similar to GitHub CLI's `gh auth login`.

```
┌─────────────┐                              ┌───────────────┐                              ┌─────────┐
│  Devpod CLI │                              │ Token Service │                              │  Admin  │
└──────┬──────┘                              └───────┬───────┘                              └────┬────┘
       │                                             │                                          │
       │ 1. POST /api/device/code                    │                                          │
       │    {devpod_name, repos}                     │                                          │
       │────────────────────────────────────────────>│                                          │
       │                                             │                                          │
       │ 2. Returns {device_code, user_code,         │                                          │
       │    verification_uri, expires_in}            │                                          │
       │<────────────────────────────────────────────│                                          │
       │                                             │                                          │
       │ 3. Display to user:                         │                                          │
       │    "Visit https://server/device             │                                          │
       │     Enter code: ABCD-1234"                  │                                          │
       │                                             │                                          │
       │                                             │  4. Admin visits /device                 │
       │                                             │<─────────────────────────────────────────│
       │                                             │                                          │
       │                                             │  5. Admin enters user_code: ABCD-1234    │
       │                                             │<─────────────────────────────────────────│
       │                                             │                                          │
       │                                             │  6. Shows: "Authorize devpod 'my-dev'    │
       │                                             │     for repos: org/repo-a, org/repo-b?"  │
       │                                             │─────────────────────────────────────────>│
       │                                             │                                          │
       │                                             │  7. Admin clicks Approve                 │
       │                                             │<─────────────────────────────────────────│
       │                                             │                                          │
       │ 8. Poll: POST /api/device/poll              │                                          │
       │    {device_code}                            │                                          │
       │────────────────────────────────────────────>│                                          │
       │                                             │                                          │
       │ 9. Returns {registration_token}             │                                          │
       │<────────────────────────────────────────────│                                          │
       │                                             │                                          │
       │ 10. Store registration_token locally        │                                          │
       │                                             │                                          │
```

### Why the User Code?

The user code (e.g., "ABCD-1234") prevents authorization hijacking:
- Without it, an attacker could start an auth flow on their machine and trick the admin into approving it
- The admin verifies the code matches what the CLI displays, confirming they're approving the right device
- This is the same pattern used by GitHub, Google, Microsoft for device authorization

## Token Request Flow

After registration, the devpod can request GitHub tokens autonomously:

```
┌─────────────┐                              ┌───────────────┐                    ┌────────┐
│  Devpod CLI │                              │ Token Service │                    │ GitHub │
└──────┬──────┘                              └───────┬───────┘                    └───┬────┘
       │                                             │                                │
       │ 1. POST /api/token                          │                                │
       │    Authorization: Bearer {registration_token}                                │
       │────────────────────────────────────────────>│                                │
       │                                             │                                │
       │                                             │ 2. Generate JWT, request       │
       │                                             │    installation token          │
       │                                             │───────────────────────────────>│
       │                                             │                                │
       │                                             │ 3. Scoped installation token   │
       │                                             │<───────────────────────────────│
       │                                             │                                │
       │ 4. Returns {token, expires_at, repos}       │                                │
       │<────────────────────────────────────────────│                                │
       │                                             │                                │
```

No user interaction required - the registration token authenticates the devpod.

## Admin Web UI

### Login Page (`/`)

- Passkey/WebAuthn authentication only (no passwords)
- Initial setup flow to register first passkey
- YubiKey or platform authenticator support

### Dashboard (`/dashboard`)

Shows list of registered devpods with:
- **Devpod name** — Human-readable identifier
- **Allowed repositories** — List of repos this devpod can access
- **Created date** — When the registration was approved
- **Last seen** — Last time a token was requested
- **Token requests** — Total number of tokens issued
- **Status** — Active or revoked
- **Actions** — Revoke button with confirmation

### Device Authorization Page (`/device`)

- Input field for user code
- After entering valid code, shows:
  - Devpod name requesting access
  - List of repositories requested
  - Approve / Deny buttons

## Security Properties

1. **GitHub App private key never leaves Token Service**
2. **Admin authentication requires physical presence** (passkey/YubiKey)
3. **Device code prevents authorization hijacking** (admin verifies code matches CLI)
4. **Devpod compromise only exposes pre-registered repositories**
5. **Registration tokens can be revoked** via admin dashboard
6. **Installation tokens are short-lived** (1 hour)
7. **No secrets transmitted to devpod** during registration (just displays a code)

## Data Structures

### Pending Device Authorization

```typescript
interface PendingAuthorization {
  device_code: string;        // Secret, used by CLI to poll
  user_code: string;          // Short code shown to user (e.g., "ABCD-1234")
  devpod_name: string;        // Human-readable name for the devpod
  requested_repos: string[];  // Repositories being requested
  expires_at: Date;           // Authorization expires if not completed
  status: 'pending' | 'approved' | 'denied';
}
```

### Registration Entry

```typescript
interface Registration {
  id: string;                       // Unique identifier
  devpod_name: string;              // Human-readable name
  registration_token_hash: string;  // Hashed token for verification
  allowed_repos: string[];          // Repositories this devpod can access
  created_at: Date;
  revoked_at: Date | null;          // Null if active
  last_token_request: Date | null;  // Last time a token was issued
  token_request_count: number;      // Total tokens issued
}
```

### Admin Credential (WebAuthn)

```typescript
interface AdminCredential {
  credential_id: string;      // WebAuthn credential ID
  public_key: string;         // WebAuthn public key
  created_at: Date;
}
```

### Admin Session

```typescript
interface AdminSession {
  session_id: string;         // Secure random token
  created_at: Date;
  expires_at: Date;
}
```

## Database

### SQLite Schema

```sql
CREATE TABLE admin_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE TABLE pending_authorizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_code TEXT UNIQUE NOT NULL,
  user_code TEXT UNIQUE NOT NULL,
  devpod_name TEXT NOT NULL,
  requested_repos TEXT NOT NULL,  -- JSON array
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  devpod_name TEXT NOT NULL,
  registration_token_hash TEXT UNIQUE NOT NULL,
  allowed_repos TEXT NOT NULL,  -- JSON array
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  last_token_request TEXT,
  token_request_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_pending_user_code ON pending_authorizations(user_code);
CREATE INDEX idx_pending_status ON pending_authorizations(status);
CREATE INDEX idx_registrations_active ON registrations(revoked_at) WHERE revoked_at IS NULL;
```

### Storage Location

- **Development**: SQLite file in Docker volume, isolated from host
- **Testing**: SQLite file in Docker volume, reset between test runs
- **Production (Coolify)**: SQLite file in persistent Docker volume (`/data/token-service.db`)

## Docker Configuration

### Project Structure

```
/
├── src/
│   ├── index.ts              # Entry point
│   ├── app.ts                # Express app setup
│   ├── db.ts                 # Database initialization
│   ├── routes/
│   │   ├── api.ts            # API routes
│   │   └── web.ts            # Web UI routes
│   ├── services/
│   │   ├── auth.ts           # WebAuthn service
│   │   ├── device.ts         # Device authorization
│   │   ├── github.ts         # GitHub API integration
│   │   └── registration.ts   # Registration management
│   └── lib/
│       ├── db.ts             # Database client
│       └── crypto.ts         # Crypto utilities
├── public/
│   └── ...                   # Static assets
├── tests/
│   ├── setup.ts              # Test setup (DB reset, auth helpers)
│   └── integration/
│       ├── auth.integration.test.ts
│       ├── device.integration.test.ts
│       ├── registration.integration.test.ts
│       └── token.integration.test.ts
├── docker-compose.dev.yaml
├── docker-compose.test.yaml
├── docker-compose.coolify.yaml
├── Dockerfile
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### docker-compose.dev.yaml

For local development - keeps SQLite data in volume, not on host.

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - node_modules:/app/node_modules
      - dev_data:/data
    environment:
      - NODE_ENV=development
      - DATABASE_PATH=/data/token-service.db
      - PORT=3000
      - GITHUB_APP_ID=${GITHUB_APP_ID}
      - GITHUB_APP_PRIVATE_KEY=${GITHUB_APP_PRIVATE_KEY}
      - GITHUB_INSTALLATION_ID=${GITHUB_INSTALLATION_ID}
      - RP_ID=localhost
      - RP_NAME=GitHub Token Service (Dev)
      - ORIGIN=http://localhost:3000
    command: npm run dev

volumes:
  node_modules:
  dev_data:
```

### docker-compose.test.yaml

For running integration tests - database is reset between test runs.

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    volumes:
      - .:/app
      - node_modules_test:/app/node_modules
      - test_data:/data
    environment:
      - NODE_ENV=test
      - DATABASE_PATH=/data/token-service.db
      - PORT=3000
      - GITHUB_APP_ID=test-app-id
      - GITHUB_APP_PRIVATE_KEY=test-private-key
      - GITHUB_INSTALLATION_ID=test-installation-id
      - RP_ID=localhost
      - RP_NAME=GitHub Token Service (Test)
      - ORIGIN=http://localhost:3000
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
      interval: 5s
      timeout: 3s
      retries: 10

  runner:
    image: node:22
    working_dir: /app
    volumes:
      - .:/app
      - node_modules_test:/app/node_modules
    environment:
      - NODE_ENV=test
      - API_URL=http://app:3000
      - DATABASE_PATH=/data/token-service.db
    depends_on:
      app:
        condition: service_healthy
    command: npm test

volumes:
  node_modules_test:
  test_data:
```

### docker-compose.coolify.yaml

For production deployment on Coolify.

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "3000:3000"
    volumes:
      - app_data:/data
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/data/token-service.db
      - PORT=3000
      - GITHUB_APP_ID=${GITHUB_APP_ID}
      - GITHUB_APP_PRIVATE_KEY=${GITHUB_APP_PRIVATE_KEY}
      - GITHUB_INSTALLATION_ID=${GITHUB_INSTALLATION_ID}
      - RP_ID=${RP_ID}
      - RP_NAME=${RP_NAME}
      - ORIGIN=${ORIGIN}
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  app_data:
```

### Dockerfile

Multi-stage build for development and production.

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS development
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]

FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run typecheck

FROM base AS production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
USER node
CMD ["npm", "start"]
```

## Testing Strategy

### Principles

1. **No mocking** — All tests run against real SQLite database and real Express app
2. **Real WebAuthn** — Use software authenticator for FIDO testing
3. **Isolated tests** — Database reset before each test file
4. **Sequential execution** — Tests share database, run one at a time

### Test Stack

- **Vitest** — Test runner with TypeScript support
- **Supertest** — HTTP assertions against Express app
- **@simplewebauthn/server** — WebAuthn implementation
- **Software authenticator** — For testing WebAuthn flows without hardware

### WebAuthn Testing Approach

For integration tests, we use a software-based FIDO authenticator that implements the WebAuthn protocol. This allows us to:
1. Register passkeys programmatically
2. Authenticate without hardware
3. Test the full auth flow end-to-end

```typescript
// tests/lib/authenticator.ts
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import * as crypto from 'crypto';

export class SoftwareAuthenticator {
  private credentials: Map<string, { privateKey: CryptoKey; publicKey: Uint8Array }> = new Map();

  async createCredential(challenge: Uint8Array, rpId: string): Promise<RegistrationCredential> {
    // Generate key pair
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );

    const credentialId = crypto.randomBytes(32);
    // ... create attestation response

    this.credentials.set(credentialId.toString('base64url'), {
      privateKey: keyPair.privateKey,
      publicKey: /* encoded public key */
    });

    return /* credential response */;
  }

  async getAssertion(challenge: Uint8Array, rpId: string, credentialId: string): Promise<AuthenticationCredential> {
    const cred = this.credentials.get(credentialId);
    // ... create assertion with signature
    return /* assertion response */;
  }
}
```

### Test Setup

```typescript
// tests/setup.ts
import { beforeEach, afterAll } from 'vitest';
import { app } from '../src/app.ts';
import { db } from '../src/lib/db.ts';
import { SoftwareAuthenticator } from './lib/authenticator.ts';

export const authenticator = new SoftwareAuthenticator();
export { app };

// Reset database before each test file
beforeEach(async () => {
  await db.exec(`
    DELETE FROM registrations;
    DELETE FROM pending_authorizations;
    DELETE FROM admin_sessions;
    DELETE FROM admin_credentials;
  `);
});

afterAll(async () => {
  await db.close();
});

// Helper to create authenticated session for tests
export async function createAuthenticatedSession(): Promise<string> {
  // 1. Start WebAuthn registration
  const regOptions = await request(app)
    .post('/api/auth/register/options')
    .expect(200);

  // 2. Create credential with software authenticator
  const credential = await authenticator.createCredential(
    regOptions.body.challenge,
    'localhost'
  );

  // 3. Complete registration
  await request(app)
    .post('/api/auth/register/verify')
    .send(credential)
    .expect(200);

  // 4. Authenticate
  const authOptions = await request(app)
    .post('/api/auth/login/options')
    .expect(200);

  const assertion = await authenticator.getAssertion(
    authOptions.body.challenge,
    'localhost',
    credential.id
  );

  const authResponse = await request(app)
    .post('/api/auth/login/verify')
    .send(assertion)
    .expect(200);

  return authResponse.headers['set-cookie'][0]; // Session cookie
}
```

### Example Integration Test

```typescript
// tests/integration/device.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app, createAuthenticatedSession } from '../setup.ts';

describe('Device Authorization Flow', () => {
  let sessionCookie: string;

  beforeEach(async () => {
    sessionCookie = await createAuthenticatedSession();
  });

  it('should complete full device authorization flow', async () => {
    // 1. Devpod requests device code
    const codeResponse = await request(app)
      .post('/api/device/code')
      .send({
        devpod_name: 'my-devpod',
        repos: ['org/repo-a', 'org/repo-b']
      })
      .expect(200);

    expect(codeResponse.body).toMatchObject({
      device_code: expect.any(String),
      user_code: expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
      verification_uri: expect.stringContaining('/device'),
      expires_in: 900
    });

    const { device_code, user_code } = codeResponse.body;

    // 2. Admin looks up the authorization
    const pendingResponse = await request(app)
      .get(`/api/device/pending/${user_code}`)
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(pendingResponse.body).toMatchObject({
      devpod_name: 'my-devpod',
      requested_repos: ['org/repo-a', 'org/repo-b']
    });

    // 3. Admin approves
    await request(app)
      .post('/api/device/authorize')
      .set('Cookie', sessionCookie)
      .send({ user_code, action: 'approve' })
      .expect(200);

    // 4. Devpod polls and receives token
    const pollResponse = await request(app)
      .post('/api/device/poll')
      .send({ device_code })
      .expect(200);

    expect(pollResponse.body).toMatchObject({
      registration_token: expect.any(String)
    });

    // 5. Verify registration was created
    const registrations = await request(app)
      .get('/api/registrations')
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(registrations.body).toHaveLength(1);
    expect(registrations.body[0]).toMatchObject({
      devpod_name: 'my-devpod',
      allowed_repos: ['org/repo-a', 'org/repo-b'],
      token_request_count: 0
    });
  });

  it('should return authorization_pending while waiting', async () => {
    const codeResponse = await request(app)
      .post('/api/device/code')
      .send({ devpod_name: 'waiting-devpod', repos: ['org/repo'] })
      .expect(200);

    // Poll without approval
    const pollResponse = await request(app)
      .post('/api/device/poll')
      .send({ device_code: codeResponse.body.device_code })
      .expect(200);

    expect(pollResponse.body).toMatchObject({
      error: 'authorization_pending'
    });
  });

  it('should return access_denied when rejected', async () => {
    const codeResponse = await request(app)
      .post('/api/device/code')
      .send({ devpod_name: 'rejected-devpod', repos: ['org/repo'] })
      .expect(200);

    // Admin denies
    await request(app)
      .post('/api/device/authorize')
      .set('Cookie', sessionCookie)
      .send({ user_code: codeResponse.body.user_code, action: 'deny' })
      .expect(200);

    // Poll returns denied
    const pollResponse = await request(app)
      .post('/api/device/poll')
      .send({ device_code: codeResponse.body.device_code })
      .expect(200);

    expect(pollResponse.body).toMatchObject({
      error: 'access_denied'
    });
  });
});
```

### Running Tests

```bash
# Run tests in Docker (recommended - uses isolated database)
npm run docker:test

# Reset test database
npm run docker:reset-test-db

# Run specific test file
npm run docker:test -- tests/integration/device.integration.test.ts
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.integration.test.ts'],
    globals: true,
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,  // Run sequentially - tests share database
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
```

### Package Scripts

```json
{
  "scripts": {
    "start": "node --experimental-strip-types src/index.ts",
    "dev": "node --experimental-strip-types --watch src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "docker:dev": "docker compose -f docker-compose.dev.yaml up",
    "docker:test": "docker compose -f docker-compose.test.yaml run --rm runner",
    "docker:reset-test-db": "docker compose -f docker-compose.test.yaml down -v && docker compose -f docker-compose.test.yaml up -d app"
  }
}
```

## Implementation Tasks

### Phase 1: Core Infrastructure
- [ ] Set up Express server with TypeScript
- [ ] Define TypeScript interfaces for all data structures
- [ ] Implement SQLite database initialization and migrations
- [ ] Add configuration loading (env vars)
- [ ] Set up Docker Compose for development
- [ ] Create health check endpoint

### Phase 2: WebAuthn Authentication
- [ ] Implement WebAuthn registration flow (initial admin setup)
- [ ] Implement WebAuthn authentication flow (login)
- [ ] Add session management (secure cookies)
- [ ] Create auth middleware for protected routes
- [ ] Build software authenticator for testing
- [ ] Write auth integration tests

### Phase 3: Device Authorization Flow
- [ ] Implement `POST /api/device/code` endpoint
- [ ] Generate secure device_code and user-friendly user_code
- [ ] Implement `POST /api/device/poll` endpoint with RFC 8628 responses
- [ ] Implement `GET /api/device/pending/:code` for admin lookup
- [ ] Implement `POST /api/device/authorize` for approve/deny
- [ ] Generate and hash registration tokens
- [ ] Write device flow integration tests

### Phase 4: Token Generation
- [ ] Implement GitHub App JWT generation
- [ ] Implement installation token request to GitHub API
- [ ] Add repository scoping for tokens
- [ ] Implement `POST /api/token` endpoint
- [ ] Verify registration token on requests
- [ ] Update usage statistics on token request
- [ ] Write token generation integration tests

### Phase 5: Admin Dashboard
- [ ] Set up static file serving for web UI
- [ ] Build login page with WebAuthn
- [ ] Build dashboard listing registrations with stats
- [ ] Build device authorization page
- [ ] Implement revocation with confirmation
- [ ] Add basic styling

### Phase 6: Production Readiness
- [ ] Create production Dockerfile
- [ ] Set up docker-compose.coolify.yaml
- [ ] Add request logging
- [ ] Add rate limiting
- [ ] Document deployment process
- [ ] Set up docker-compose.test.yaml and test runner

## Tech Decisions

### Why WebAuthn/Passkeys?
- Phishing-resistant authentication
- Works with YubiKey and built-in platform authenticators
- No passwords to manage or leak
- Physical presence required for each login

### Why Device Authorization Flow?
- Works well for CLI applications
- User doesn't need to copy/paste long tokens into terminal
- Clear confirmation of what's being authorized
- Standard pattern users recognize from GitHub, Google, etc.

### Why SQLite?
- Zero configuration, single file
- Perfect for single-admin service
- Easy backup (just copy the file)
- No separate database server needed
- Works well with Docker volumes

### Why Supertest + Real Database?
- Tests actual behavior, not mocked assumptions
- Catches integration issues early
- Database is fast (SQLite in-memory or file)
- Following patterns from todo-app reference implementation

### Why Software Authenticator for Tests?
- Enables full WebAuthn testing without hardware
- Tests complete auth flows end-to-end
- No mocking of security-critical code
- Validates actual cryptographic operations
