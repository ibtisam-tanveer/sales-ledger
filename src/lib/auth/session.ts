import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "sl_auth";

function env(name: string): string {
  return process.env[name] ?? "";
}

export function authEnabled(): boolean {
  return Boolean(env("AUTH_PASSWORD").trim()) && Boolean(env("AUTH_SECRET").trim());
}

export function authCookieName(): string {
  return COOKIE_NAME;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env("AUTH_SECRET"));
}

export async function signAuthToken(): Promise<string> {
  // Minimal payload; presence + signature proves authentication.
  return new SignJWT({ v: 1 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifyAuthToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

