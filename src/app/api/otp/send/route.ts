import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIp, requireClient } from "@/lib/auth";
import { secureToken } from "@/lib/crypto";
import { createSmsSignature } from "@/lib/hmac";
import { generateOtp, hashOtp } from "@/lib/otp";
import { clientLimitReached, deviceLimitReached } from "@/lib/rateLimit";
import { apiError, routeError } from "@/lib/response";
import { messaging } from "@/lib/firebase";
import Device from "@/models/Device";
import OtpRequest from "@/models/OtpRequest";
import SmsLog from "@/models/SmsLog";
import { maskMobile } from "@/lib/crypto";

const schema = z.object({
  mobile: z.string().regex(/^\+[1-9]\d{7,14}$/),
  template: z.string().min(1).max(1000),
  length: z.number().int().min(4).max(8).default(6),
});

const ONLINE_WINDOW_MS = 10 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const client = await requireClient(request);
    if (!client) return apiError("UNAUTHORIZED", "Invalid client API key", 401);
    if (client.status !== "active") {
      return apiError("CLIENT_BLOCKED", "Client is blocked", 403);
    }

    const input = schema.parse(await request.json());
    const requestIp = getRequestIp(request);
    if (
      client.allowedIps.length > 0 &&
      !client.allowedIps.includes(requestIp)
    ) {
      return apiError("UNAUTHORIZED", "Source IP is not allowed", 403);
    }
    if (!client.allowedTemplates.includes(input.template)) {
      return apiError(
        "TEMPLATE_NOT_ALLOWED",
        "The requested template is not allowed",
        403,
      );
    }
    if (await clientLimitReached(client._id, client.dailyLimit)) {
      return apiError("RATE_LIMITED", "Client daily limit reached", 429);
    }

    const allActiveDevices = await Device.find({ status: "active" }).sort({
      lastSentAt: 1,
      lastSeen: -1,
    });
    if (allActiveDevices.length === 0) {
      return apiError("DEVICE_NOT_FOUND", "No active SMS device exists", 503);
    }

    const onlineCutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
    const onlineDevices = allActiveDevices.filter(
      (device) =>
        device.lastSeen >= onlineCutoff &&
        device.health?.smsPermission &&
        device.health?.simReady,
    );
    if (onlineDevices.length === 0) {
      return apiError("DEVICE_OFFLINE", "No SMS device is currently ready", 503);
    }

    let selectedDevice = null;
    for (const device of onlineDevices) {
      if (
        !(await deviceLimitReached(
          device._id,
          device.dailyLimit,
          device.perMinuteLimit,
        ))
      ) {
        selectedDevice = device;
        break;
      }
    }
    if (!selectedDevice) {
      return apiError("RATE_LIMITED", "All devices are rate limited", 429);
    }

    const otp = generateOtp(input.length);
    const requestId = secureToken("otp");
    const message = input.template.replaceAll("{otp}", otp);
    const now = new Date();
    const otpRequest = await OtpRequest.create({
      requestId,
      clientId: client._id,
      deviceId: selectedDevice._id,
      mobile: input.mobile,
      otpHash: await hashOtp(otp),
      message,
      status: "queued",
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    });

    const timestamp = Date.now().toString();
    const command = {
      request_id: requestId,
      mobile: input.mobile,
      message,
      client_id: client.id,
      timestamp,
    };
    const signature = createSmsSignature(command);

    try {
      await messaging().send({
        token: selectedDevice.fcmToken,
        data: {
          type: "SEND_SMS",
          request_id: requestId,
          mobile: input.mobile,
          message,
          client_id: client.id,
          signature,
          timestamp,
        },
        android: { priority: "high" },
      });
    } catch (error) {
      otpRequest.status = "failed";
      otpRequest.error = "FCM push failed";
      await Promise.all([
        otpRequest.save(),
        SmsLog.create({
          requestId,
          clientId: client._id,
          deviceId: selectedDevice._id,
          mobileMasked: maskMobile(input.mobile),
          status: "failed",
          error: "FCM push failed",
        }),
      ]);
      console.error("FCM send failed", error);
      return apiError("FCM_FAILED", "Unable to push command to device", 502);
    }

    otpRequest.status = "pushed";
    selectedDevice.lastSentAt = now;
    client.sentToday += 1;
    await Promise.all([
      otpRequest.save(),
      selectedDevice.save(),
      client.save(),
    ]);

    return NextResponse.json(
      { success: true, request_id: requestId, status: "queued" },
      { status: 202 },
    );
  } catch (error) {
    return routeError(error);
  }
}
