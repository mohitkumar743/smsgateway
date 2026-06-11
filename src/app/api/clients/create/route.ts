import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { secureToken, tokenDigest } from "@/lib/crypto";
import { connectDb } from "@/lib/db";
import { apiError, routeError } from "@/lib/response";
import Client from "@/models/Client";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  dailyLimit: z.number().int().min(1).max(1_000_000).default(100),
  allowedIps: z.array(z.string().trim().min(1).max(100)).default([]),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return apiError("UNAUTHORIZED", "Admin authentication required", 401);
    }

    const input = schema.parse(await request.json());
    await connectDb();
    const plainApiKey = secureToken("client");
    const client = await Client.create({
      ...input,
      apiKey: tokenDigest(plainApiKey),
    });

    return NextResponse.json(
      {
        success: true,
        client_id: client.id,
        api_key: plainApiKey,
      },
      { status: 201 },
    );
  } catch (error) {
    return routeError(error);
  }
}
