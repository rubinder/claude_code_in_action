# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UIGen is an AI-powered React component generator with live preview. Users describe components in a chat interface, and an LLM (Claude) generates React code that renders in a live preview panel. The app works without an API key using a mock provider that returns static components.

## Commands

- `npm run setup` — Install deps, generate Prisma client, run migrations (first-time setup)
- `npm run dev` — Start dev server with Turbopack (requires `--require ./node-compat.cjs`)
- `npm run build` — Production build
- `npm run lint` — ESLint
- `npm test` — Run all tests (vitest, jsdom environment)
- `npm test -- --run src/path/to/test.test.ts` — Run a single test file
- `npm run db:reset` — Reset SQLite database

## Architecture

### AI Chat Flow

1. User sends a message via `ChatInterface` → `ChatProvider` (wraps `@ai-sdk/react` `useChat`)
2. Request hits `POST /api/chat/route.ts` with messages + serialized virtual file system
3. The route uses Vercel AI SDK's `streamText` with two tools the LLM can call:
   - **`str_replace_editor`** (`src/lib/tools/str-replace.ts`) — view, create, str_replace, insert operations on virtual files
   - **`file_manager`** (`src/lib/tools/file-manager.ts`) — rename, delete operations
4. Tool calls modify a server-side `VirtualFileSystem` instance; results stream back
5. Client-side `FileSystemProvider` processes tool calls via `onToolCall` callback to mirror changes in the client VFS

### Virtual File System

`VirtualFileSystem` (`src/lib/file-system.ts`) is an in-memory file system (no disk writes). It's used both server-side (in the chat API route) and client-side (via React context). Files are serialized as `Record<string, FileNode>` for transport between client/server and for database persistence.

### Live Preview Pipeline

`PreviewFrame` renders generated components in an iframe:
1. `jsx-transformer.ts` uses `@babel/standalone` to transform JSX/TSX files in the browser
2. `createImportMap()` builds an ES module import map — local files become blob URLs, third-party packages resolve via `esm.sh`
3. `createPreviewHTML()` assembles a standalone HTML document with the import map, Tailwind CDN, and a React entry point

### Provider System

`src/lib/provider.ts` — If `ANTHROPIC_API_KEY` is set, uses `@ai-sdk/anthropic` with `claude-haiku-4-5`. Otherwise, uses `MockLanguageModel` which returns deterministic static components (counter, form, or card based on prompt keywords).

### Data Persistence

- **SQLite via Prisma** — `User` and `Project` models. Projects store `messages` (JSON stringified chat history) and `data` (serialized VFS state).
- **Auth** — JWT-based session via `jose`, passwords hashed with `bcrypt`. Middleware in `src/middleware.ts`.
- **Anonymous users** — Can use the app without auth; work tracked via `anon-work-tracker.ts` for potential migration on sign-up.

### Client Layout

Two-panel resizable layout (`MainContent`):
- **Left panel**: Chat interface (message list + input)
- **Right panel**: Tabs for Preview (iframe) or Code (file tree + Monaco editor)

Context providers nest as: `FileSystemProvider` → `ChatProvider` → UI components.

### Routing

- `/` — Anonymous users see main content; authenticated users redirect to most recent project (or create one)
- `/[projectId]` — Project-specific view, loads saved messages and file system state

## Tech Details

- Next.js 15 App Router with Turbopack, React 19, TypeScript
- Tailwind CSS v4 with `@tailwindcss/postcss`
- UI components from shadcn/ui (Radix primitives) in `src/components/ui/`
- Prisma client generated to `src/generated/prisma` (non-standard output path)
- `node-compat.cjs` patches `globalThis.File` for Node.js compatibility
- Tests use vitest + jsdom + React Testing Library with `vite-tsconfig-paths` for path alias resolution

# Use comments sparingly. Only comment complex code.
The database schema is defined in the @prisma/schema.prisma file. Reference it anytime you need to understand the structure of data stored in the database.

