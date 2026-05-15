# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Style rules

- Use tool calls sparingly — only when truly needed.
- Only comment complex or non-obvious code.
- When asked about a module or feature, search `docs/` for a matching file first and read it before answering. Never read all docs files — only the relevant one.

## Commands

```bash
# Initial setup (install deps + generate Prisma client + run migrations)
npm run setup

# Development server (with Turbopack)
npm run dev

# Build for production
npm run build

# Run all tests
npm test

# Run a single test file
npx vitest run src/components/chat/__tests__/ChatInterface.test.tsx

# Lint
npm run lint

# Reset database
npm run db:reset
```

> Do NOT run `npm audit fix` — dependencies are pinned to specific compatible versions.

## Environment

Copy `.env` and set your Anthropic API key. Without a real key the app falls back to `MockLanguageModel` in `src/lib/provider.ts`, which returns canned component responses. The mock is detected when `ANTHROPIC_API_KEY` is missing or equals `"your-api-key-here"`.

Auth uses JWT signed with `JWT_SECRET` (defaults to a dev string if unset). The database is SQLite at `prisma/dev.db`.

## Architecture

### High-level flow

1. User types a prompt in `ChatInterface` → sent to `/api/chat` via the Vercel AI SDK (`useChat` hook in `ChatProvider`)
2. The route handler (`src/app/api/chat/route.ts`) calls `streamText` with two tools: `str_replace_editor` and `file_manager`
3. Claude uses those tools to manipulate a **server-side** `VirtualFileSystem` instance
4. Tool calls are streamed back to the client; `FileSystemContext` applies them client-side to a **client-side** `VirtualFileSystem`
5. `PreviewFrame` compiles the virtual files with Babel standalone and renders them in an `<iframe>` using ES module import maps

### Virtual file system

`VirtualFileSystem` (`src/lib/file-system.ts`) is an in-memory tree (no disk I/O). It is serialized to JSON for the API request body and for persistence in the Prisma `Project.data` column. The server reconstructs it from the serialized form on every request.

### Preview rendering

`src/lib/transform/jsx-transformer.ts` does the browser-side compilation:
- Transpiles JSX/TSX with Babel standalone
- Builds an ES module import map (local files → blob URLs, third-party packages → `esm.sh`)
- Injects `<script type="importmap">` + a module bootstrap into an iframe srcdoc
- Tailwind is loaded via CDN in the preview iframe

### Context providers

`FileSystemProvider` (`src/lib/contexts/file-system-context.tsx`) owns the client-side VFS and exposes `handleToolCall`, which routes incoming AI tool calls to the appropriate VFS mutation.

`ChatProvider` (`src/lib/contexts/chat-context.tsx`) wraps the Vercel AI SDK's `useChat`, serializes the VFS on every message send, and tracks anonymous work in `localStorage` (`src/lib/anon-work-tracker.ts`).

### Auth & persistence

See `docs/auth-module.md` for full details.
- JWT sessions in an `httpOnly` cookie (`auth-token`), 7-day expiry
- Anonymous users can work locally; on sign-in their work is migrated to a project

### Routing

Two routes: `/` (home) and `/[projectId]`. The home page immediately redirects authenticated users to their most recent project (or creates one). Anonymous users see `MainContent` without a project.

### Database

See `prisma/schema.prisma` for the full schema. Prisma with SQLite. `User` has many `Project`s. `Project.messages` and `Project.data` are JSON stored as plain strings.

### Testing

Vitest + jsdom + React Testing Library. Tests live in `__tests__` directories co-located with source files. The vitest config (`vitest.config.mts`) uses `vite-tsconfig-paths` so `@/` path aliases resolve in tests.
