# Auth Module

## Overview

Authentication is JWT-based with sessions stored in an `httpOnly` cookie. The system is split across four layers: UI, client hook, server actions, and session management.

---

## File Map

| File | Role |
|------|------|
| `src/components/auth/AuthDialog.tsx` | Modal with sign-in / sign-up forms |
| `src/hooks/use-auth.ts` | Client orchestrator; handles post-login routing |
| `src/actions/index.ts` | Server Actions: `signIn`, `signUp`, `signOut`, `getUser` |
| `src/lib/auth.ts` | JWT creation, verification, and cookie management (server-only) |

---

## Flow

```
User submits form
  → SignInForm / SignUpForm calls useAuth.signIn / signUp
  → Server Action validates input + bcrypt compares/hashes password
  → createSession() mints a JWT and sets an httpOnly cookie
  → handlePostSignIn() rescues anonymous work → router.push to project
```

---

## Layers

### 1. UI — `AuthDialog.tsx`

A Dialog modal with two modes (`signin` / `signup`) controlled by local state. The `defaultMode` prop lets callers choose the initial form. On success the dialog closes itself.

### 2. Client Hook — `use-auth.ts`

`useAuth` wraps the server actions and runs `handlePostSignIn` after a successful auth:

1. Checks `localStorage` for anonymous work (prompts typed before logging in).
2. If found → saves it as a new project and navigates to it.
3. If not → navigates to the user's most recent project.
4. If no projects exist → creates a blank one and navigates there.

This is how anonymous work is preserved into the user's account on first login.

### 3. Server Actions — `src/actions/index.ts`

Next.js Server Actions (`"use server"`):

- **`signUp`** — validates input, hashes the password with `bcrypt` (cost 10), creates the `User` row via Prisma, calls `createSession`.
- **`signIn`** — looks up the user, runs `bcrypt.compare`, calls `createSession`.
- **`signOut`** — calls `deleteSession` and redirects to `/`.
- **`getUser`** — reads the current session and returns the matching Prisma user (no password field).

All actions return `{ success: boolean, error?: string }` and never throw to the client.

### 4. Session Layer — `src/lib/auth.ts`

Marked `server-only` so it can never be bundled to the client.

| Function | Description |
|----------|-------------|
| `createSession(userId, email)` | Signs a 7-day HS256 JWT and sets it as an `httpOnly`, `SameSite: lax` cookie named `auth-token` |
| `getSession()` | Reads and verifies the cookie; returns `SessionPayload` or `null` |
| `verifySession(request)` | Same as `getSession` but accepts a `NextRequest` (for middleware / route handlers) |
| `deleteSession()` | Deletes the `auth-token` cookie |

`JWT_SECRET` defaults to `"development-secret-key"` when the env var is unset.

---

## Security Properties

- Passwords are never stored in plain text — bcrypt with cost factor 10.
- The session JWT is inaccessible to JavaScript — `httpOnly` cookie.
- Auth utilities cannot be accidentally imported on the client — `import "server-only"`.
- Invalid or expired tokens return `null` silently; they never throw to callers.
