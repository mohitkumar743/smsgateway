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
    const otpRequest = await OtpRequest.findOne({
      requestId,
      clientId: client._id,
    });
    if (!otpRequest) {
      return apiError("NOT_FOUND", "OTP request was not found", 404);
    }

    if (
      otpRequest.status !== "verified" &&
      otpRequest.expiresAt <= new Date()
    ) {
      otpRequest.status = "expired";
      await otpRequest.save();
    }

    return NextResponse.json({
      success: true,
      request_id: otpRequest.requestId,
      status: otpRequest.status,
      error: otpRequest.error,
      created_at: otpRequest.createdAt,
      sent_at: otpRequest.sentAt,
    });
  } catch (error) {
    return routeError(error);
  }
}
