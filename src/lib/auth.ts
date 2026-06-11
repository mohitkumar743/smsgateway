import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { tokenDigest } from "@/lib/crypto";
import { connectDb } from "@/lib/db";
import Client from "@/models/Client";
import Device from "@/models/Device";

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function jwtKey() {
  return new TextEncoder().encode(getEnv("JWT_SECRET"));
}

export async function createAdminJwt(adminId: string, email: string) {
  return new SignJWT({ email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(jwtKey());
}

export async function requireAdmin(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtKey());
    return payload.role === "admin" ? payload : null;
  } catch {
    return null;
  }
}

export async function requireDevice(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return null;
  await connectDb();
  return Device.findOne({
    deviceToken: tokenDigest(token),
    status: { $ne: "blocked" },
  });
}

export async function requireClient(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return null;
  await connectDb();
  return Client.findOne({ apiKey: tokenDigest(token) });
}

export function getRequestIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
