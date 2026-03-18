// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

import {
  createSession,
  getSession,
  deleteSession,
  verifySession,
} from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
});

test("createSession sets an httpOnly cookie with a valid JWT", async () => {
  await createSession("user-123", "test@example.com");

  expect(mockCookieStore.set).toHaveBeenCalledOnce();
  const [name, token, options] = mockCookieStore.set.mock.calls[0];

  expect(name).toBe("auth-token");
  expect(typeof token).toBe("string");
  expect(options.httpOnly).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");

  const { payload } = await jwtVerify(token, JWT_SECRET);
  expect(payload.userId).toBe("user-123");
  expect(payload.email).toBe("test@example.com");
});

test("createSession sets secure flag based on NODE_ENV", async () => {
  const originalEnv = process.env.NODE_ENV;

  process.env.NODE_ENV = "production";
  await createSession("user-1", "a@b.com");
  expect(mockCookieStore.set.mock.calls[0][2].secure).toBe(true);

  process.env.NODE_ENV = "development";
  await createSession("user-1", "a@b.com");
  expect(mockCookieStore.set.mock.calls[1][2].secure).toBe(false);

  process.env.NODE_ENV = originalEnv;
});

test("createSession sets expiry ~7 days from now", async () => {
  const before = Date.now();
  await createSession("user-1", "a@b.com");
  const after = Date.now();

  const expires = mockCookieStore.set.mock.calls[0][2].expires as Date;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs);
  expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs);
});

test("createSession JWT contains iat and exp claims", async () => {
  const before = Math.floor(Date.now() / 1000);
  await createSession("user-1", "a@b.com");
  const after = Math.floor(Date.now() / 1000);

  const token = mockCookieStore.set.mock.calls[0][1];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.iat).toBeGreaterThanOrEqual(before);
  expect(payload.iat).toBeLessThanOrEqual(after);
  expect(payload.exp).toBeGreaterThan(payload.iat!);
});

test("createSession embeds expiresAt in JWT payload", async () => {
  await createSession("user-1", "a@b.com");

  const token = mockCookieStore.set.mock.calls[0][1];
  const { payload } = await jwtVerify(token, JWT_SECRET);

  expect(payload.expiresAt).toBeDefined();
  const expiresAt = new Date(payload.expiresAt as string);
  expect(expiresAt.getTime()).not.toBeNaN();
});

test("createSession token is readable by getSession", async () => {
  await createSession("user-42", "roundtrip@test.com");

  const token = mockCookieStore.set.mock.calls[0][1];
  mockCookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();
  expect(session).not.toBeNull();
  expect(session!.userId).toBe("user-42");
  expect(session!.email).toBe("roundtrip@test.com");
});

test("createSession uses HS256 algorithm", async () => {
  await createSession("user-1", "a@b.com");

  const token = mockCookieStore.set.mock.calls[0][1] as string;
  const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
  expect(header.alg).toBe("HS256");
});

test("getSession returns payload when a valid token exists", async () => {
  const token = await new SignJWT({
    userId: "user-456",
    email: "user@test.com",
    expiresAt: new Date().toISOString(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(JWT_SECRET);

  mockCookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();
  expect(session).not.toBeNull();
  expect(session!.userId).toBe("user-456");
  expect(session!.email).toBe("user@test.com");
});

test("getSession returns null when no cookie exists", async () => {
  mockCookieStore.get.mockReturnValue(undefined);

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns null for an invalid token", async () => {
  mockCookieStore.get.mockReturnValue({ value: "not-a-valid-jwt" });

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns null for a token signed with wrong secret", async () => {
  const wrongSecret = new TextEncoder().encode("wrong-secret");
  const token = await new SignJWT({ userId: "user-1", email: "a@b.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(wrongSecret);

  mockCookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();
  expect(session).toBeNull();
});

test("deleteSession deletes the auth-token cookie", async () => {
  await deleteSession();

  expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
});

test("verifySession returns payload from request cookies", async () => {
  const token = await new SignJWT({
    userId: "user-789",
    email: "req@test.com",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(JWT_SECRET);

  const request = new NextRequest("http://localhost:3000/", {
    headers: { cookie: `auth-token=${token}` },
  });

  const session = await verifySession(request);
  expect(session).not.toBeNull();
  expect(session!.userId).toBe("user-789");
  expect(session!.email).toBe("req@test.com");
});

test("verifySession returns null when request has no auth cookie", async () => {
  const request = new NextRequest("http://localhost:3000/");

  const session = await verifySession(request);
  expect(session).toBeNull();
});

test("verifySession returns null for an invalid token in request", async () => {
  const request = new NextRequest("http://localhost:3000/", {
    headers: { cookie: "auth-token=garbage" },
  });

  const session = await verifySession(request);
  expect(session).toBeNull();
});
