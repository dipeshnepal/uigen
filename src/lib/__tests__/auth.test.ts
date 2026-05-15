// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(cookieStore)),
}));

const { createSession, getSession, deleteSession, verifySession } = await import("@/lib/auth");

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

beforeEach(() => {
  vi.clearAllMocks();
});

test("createSession sets an httpOnly cookie", async () => {
  await createSession("user-123", "test@example.com");

  expect(cookieStore.set).toHaveBeenCalledWith(
    "auth-token",
    expect.any(String),
    expect.objectContaining({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    })
  );
});

test("createSession JWT contains userId and email", async () => {
  await createSession("user-123", "test@example.com");

  const token = cookieStore.set.mock.calls[0][1];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.userId).toBe("user-123");
  expect(payload.email).toBe("test@example.com");
});

test("createSession sets a 7-day expiry on the cookie", async () => {
  const before = Date.now();
  await createSession("user-123", "test@example.com");
  const after = Date.now();

  const { expires } = cookieStore.set.mock.calls[0][2];
  const expiresMs = expires.getTime();

  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDays - 1000);
  expect(expiresMs).toBeLessThanOrEqual(after + sevenDays + 1000);
});

// getSession

test("getSession returns null when no cookie is present", async () => {
  cookieStore.get.mockReturnValue(undefined);

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns null for an invalid token", async () => {
  cookieStore.get.mockReturnValue({ value: "not-a-valid-jwt" });

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns null for an expired token", async () => {
  const token = await new SignJWT({ userId: "user-123", email: "test@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("0s")
    .sign(JWT_SECRET);

  cookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns session payload for a valid token", async () => {
  const token = await new SignJWT({ userId: "user-123", email: "test@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  cookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();
  expect(session?.userId).toBe("user-123");
  expect(session?.email).toBe("test@example.com");
});

// deleteSession

test("deleteSession deletes the auth-token cookie", async () => {
  await deleteSession();

  expect(cookieStore.delete).toHaveBeenCalledWith("auth-token");
});

// verifySession

test("verifySession returns null when no cookie is present", async () => {
  const request = new NextRequest("http://localhost");

  const session = await verifySession(request);
  expect(session).toBeNull();
});

test("verifySession returns null for an invalid token", async () => {
  const request = new NextRequest("http://localhost", {
    headers: { cookie: "auth-token=not-a-valid-jwt" },
  });

  const session = await verifySession(request);
  expect(session).toBeNull();
});

test("verifySession returns null for an expired token", async () => {
  const token = await new SignJWT({ userId: "user-123", email: "test@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("0s")
    .sign(JWT_SECRET);

  const request = new NextRequest("http://localhost", {
    headers: { cookie: `auth-token=${token}` },
  });

  const session = await verifySession(request);
  expect(session).toBeNull();
});

test("verifySession returns session payload for a valid token", async () => {
  const token = await new SignJWT({ userId: "user-123", email: "test@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  const request = new NextRequest("http://localhost", {
    headers: { cookie: `auth-token=${token}` },
  });

  const session = await verifySession(request);
  expect(session?.userId).toBe("user-123");
  expect(session?.email).toBe("test@example.com");
});
