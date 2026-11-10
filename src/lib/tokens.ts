import { createHash, randomBytes } from "node:crypto";

/** Tilfældigt, URL-sikkert token. Kun hashen gemmes i databasen. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
