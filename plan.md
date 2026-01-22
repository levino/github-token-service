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

#### API Endpoints (for devpod CLI)

- `POST /api/device/code` — Start device authorization flow, returns device_code + user_code
- `POST /api/device/poll` — Poll for authorization completion (returns registration token when approved)
- `POST /api/token` — Exchange registration token for GitHub installation token

#### Web UI Routes (for admin)

- `GET /` — Login page (passkey authentication)
- `GET /dashboard` — List of registered devpods
- `GET /device` — Device authorization page (enter user_code)
- `POST /device/authorize` — Approve or deny a device authorization
- `POST /registrations/:id/revoke` — Revoke a devpod registration

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

Shows list of registered devpods:
- Devpod name
- Allowed repositories
- Created date
- Last token request
- Revoke button

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
  id: string;                 // Unique identifier
  devpod_name: string;        // Human-readable name
  registration_token_hash: string;  // Hashed token for verification
  allowed_repos: string[];    // Repositories this devpod can access
  created_at: Date;
  last_token_request: Date | null;
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

## Implementation Tasks

### Phase 1: Core Infrastructure
- [ ] Set up HTTP server with static file serving
- [ ] Define TypeScript interfaces for all data structures
- [ ] Implement SQLite storage for registrations and credentials
- [ ] Add configuration loading (env vars for GitHub App credentials)
- [ ] Set up basic HTML/CSS for web UI

### Phase 2: WebAuthn Authentication
- [ ] Implement WebAuthn registration flow (initial admin setup)
- [ ] Implement WebAuthn authentication flow (login)
- [ ] Add session management (secure cookies)
- [ ] Protect admin routes with auth middleware

### Phase 3: Device Authorization Flow
- [ ] Implement `POST /api/device/code` endpoint
- [ ] Generate secure device_code and user-friendly user_code
- [ ] Implement `POST /api/device/poll` endpoint with proper status responses
- [ ] Build device authorization web page
- [ ] Implement approve/deny functionality
- [ ] Generate and return registration tokens

### Phase 4: Token Generation
- [ ] Implement GitHub App JWT generation
- [ ] Implement installation token request to GitHub API
- [ ] Add repository scoping for tokens
- [ ] Implement `POST /api/token` endpoint
- [ ] Verify registration token on requests

### Phase 5: Admin Dashboard
- [ ] Build dashboard page listing all registrations
- [ ] Show registration details and last activity
- [ ] Implement revocation functionality
- [ ] Add confirmation dialogs for destructive actions

### Phase 6: Production Readiness
- [ ] Add request logging
- [ ] Add health check endpoint
- [ ] Create Dockerfile
- [ ] Add rate limiting
- [ ] Add HTTPS support / reverse proxy configuration
- [ ] Document deployment process

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
