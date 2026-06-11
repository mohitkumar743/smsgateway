import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/auth";
import { apiError, routeError } from "@/lib/response";
import OtpRequest from "@/models/OtpRequest";

type Context = {
  params: Promise<{ requestId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  try {
    const client = await requireClient(request);
    if (!client) return apiError("UNAUTHORIZED", "Invalid client API key", 401);
    if (client.status !== "active") {
      return apiError("CLIENT_BLOCKED", "Client is blocked", 403);
    }

    const { requestId } = await context.params;
    const messageRequest = await OtpRequest.findOne({
      requestId,
      requestType: "message",
      clientId: client._id,
    });
    if (!messageRequest) {
      return apiError("NOT_FOUND", "Message request was not found", 404);
    }

    return NextResponse.json({
      success: true,
      request_id: messageRequest.requestId,
      status: messageRequest.status,
      error: messageRequest.error,
      created_at: messageRequest.createdAt,
      sent_at: messageRequest.sentAt,
    });
  } catch (error) {
    return routeError(error);
  }
}
