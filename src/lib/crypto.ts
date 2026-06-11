import { createHash, randomBytes } from "node:crypto";

export function secureToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function maskMobile(mobile: string): string {
  if (mobile.length <= 4) return "*".repeat(mobile.length);
  return `${mobile.slice(0, 3)}${"*".repeat(mobile.length - 7)}${mobile.slice(-4)}`;
}
