import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDevice } from "@/lib/auth";
import { maskMobile } from "@/lib/crypto";
import { apiError, routeError } from "@/lib/response";
import OtpRequest from "@/models/OtpRequest";
import SmsLog from "@/models/SmsLog";

const schema = z.object({
  request_id: z.string().trim().min(1).max(150),
  status: z.enum([
    "sending",
    "sent",
    "delivered",
    "failed",
    "permission_denied",
    "invalid_payload",
    "duplicate_request",
    "sim_not_ready",
    "rate_limited",
  ]),
  error: z.string().max(1000).nullable().optional(),
  timestamp: z.union([
    z.string().regex(/^\d{13}$/),
    z.iso.datetime({ offset: true }),
  ]),
});

const directStatuses = new Set(["sending", "sent", "delivered", "failed"]);

export async function POST(request: NextRequest) {
  try {
    const device = await requireDevice(request);
    if (!device) return apiError("UNAUTHORIZED", "Invalid device token", 401);

    const input = schema.parse(await request.json());
    const otpRequest = await OtpRequest.findOne({
      requestId: input.request_id,
      deviceId: device._id,
    });
    if (!otpRequest) {
      return apiError("NOT_FOUND", "OTP request was not found", 404);
    }

    const normalizedStatus = directStatuses.has(input.status)
      ? input.status
      : "failed";
    const statusTime = /^\d{13}$/.test(input.timestamp)
      ? new Date(Number(input.timestamp))
      : new Date(input.timestamp);
    otpRequest.status = normalizedStatus;
    otpRequest.error =
      input.error ??
      (normalizedStatus === "failed" ? input.status : null);

    if (input.status === "sent" && !otpRequest.sentAt) {
      otpRequest.sentAt = statusTime;
      device.lastSentAt = otpRequest.sentAt;
      device.sentToday += 1;
    }

    device.lastSeen = new Date();
    await Promise.all([
      otpRequest.save(),
      device.save(),
      SmsLog.create({
        requestId: otpRequest.requestId,
        clientId: otpRequest.clientId,
        deviceId: device._id,
        mobileMasked: maskMobile(otpRequest.mobile),
        status: input.status,
        error: input.error ?? null,
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
