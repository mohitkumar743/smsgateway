import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { compareOtp } from "@/lib/otp";
import { apiError, routeError } from "@/lib/response";
import OtpRequest from "@/models/OtpRequest";

const schema = z.object({
  request_id: z.string().trim().min(1).max(150),
  otp: z.string().regex(/^\d{4,8}$/),
});

export async function POST(request: NextRequest) {
  try {
    const client = await requireClient(request);
    if (!client) return apiError("UNAUTHORIZED", "Invalid client API key", 401);
    if (client.status !== "active") {
      return apiError("CLIENT_BLOCKED", "Client is blocked", 403);
    }

    const input = schema.parse(await request.json());
    const otpRequest = await OtpRequest.findOne({
      requestId: input.request_id,
      clientId: client._id,
    }).select("+otpHash");
    if (!otpRequest) {
      return apiError("OTP_INVALID", "OTP request was not found", 404);
    }
    if (otpRequest.status === "verified") {
      return NextResponse.json({ success: true, verified: true });
    }
    if (otpRequest.expiresAt <= new Date()) {
      otpRequest.status = "expired";
      await otpRequest.save();
      return apiError("OTP_EXPIRED", "OTP has expired", 410);
    }
    if (otpRequest.attempts >= 3) {
      return apiError(
        "OTP_ATTEMPTS_EXCEEDED",
        "Maximum verification attempts exceeded",
        429,
      );
    }

    if (await compareOtp(input.otp, otpRequest.otpHash)) {
      otpRequest.status = "verified";
      otpRequest.verifiedAt = new Date();
      await otpRequest.save();
      return NextResponse.json({ success: true, verified: true });
    }

    otpRequest.attempts += 1;
    await otpRequest.save();
    if (otpRequest.attempts >= 3) {
      return apiError(
        "OTP_ATTEMPTS_EXCEEDED",
        "Maximum verification attempts exceeded",
        429,
      );
    }
    return apiError("OTP_INVALID", "OTP is invalid", 400);
  } catch (error) {
    return routeError(error);
  }
}
