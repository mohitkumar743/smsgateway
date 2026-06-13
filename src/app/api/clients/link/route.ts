import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiLogging } from "@/lib/apiLogger";
import { requireAdmin } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { connectDb } from "@/lib/db";
import { apiError, routeError } from "@/lib/response";
import Client from "@/models/Client";

const schema = z.object({
  clientId: z.string().min(1),
});

async function postHandler(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return apiError("UNAUTHORIZED", "Admin authentication required", 401);
    }

    const input = schema.parse(await request.json());
    await connectDb();
    const client = await Client.findById(input.clientId).select("name status +apiKeyEncrypted");

    if (!client) return apiError("NOT_FOUND", "Client not found", 404);
    if (client.status !== "active") return apiError("CLIENT_BLOCKED", "Client is blocked", 403);
    if (!client.apiKeyEncrypted) {
      return apiError(
        "KEY_NOT_STORED",
        "Rotate this client's API key once before linking a device",
        409,
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        clientId: client.id,
        clientName: client.name,
        apiKey: decryptSecret(client.apiKeyEncrypted),
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

export const POST = withApiLogging(postHandler);
