# GitHub Token Service

## Project Overview

This service generates scoped GitHub App installation tokens for devpods without exposing the GitHub App private key. Devpods can only obtain tokens for repositories they were explicitly registered for.

## Tech Stack

- **Runtime**: Node.js 22+ with native TypeScript support (`--experimental-strip-types`)
- **Language**: TypeScript (ES modules)
- **No build step**: TypeScript runs directly via Node.js

## Commands

```bash
# Install dependencies
npm install

# Run the service
npm start

# Run in development mode (with watch)
npm run dev

# Type check without running
npm run typecheck
```

## Project Structure

```
src/
  index.ts       # Entry point
```

## Development Guidelines

- Use ES modules (`import`/`export`) exclusively
- Include `.ts` extension in relative imports (required for --strip-types)
- No enums or namespaces (not supported by strip-types)
- Use `import type` for type-only imports
- Keep dependencies minimal - prefer Node.js built-in modules

## Architecture

See `plan.md` for the full architecture and implementation plan.
