import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestIp, requireClient } from "@/lib/auth";
import { maskMobile, secureToken } from "@/lib/crypto";
import { fcmFailure, messaging } from "@/lib/firebase";
import { createSmsSignature } from "@/lib/hmac";
import { clientLimitReached, deviceLimitReached } from "@/lib/rateLimit";
import { apiError, routeError } from "@/lib/response";
import Device from "@/models/Device";
import OtpRequest from "@/models/OtpRequest";
import SmsLog from "@/models/SmsLog";

const schema = z.object({
  mobile: z.string().regex(/^\+[1-9]\d{7,14}$/),
  message: z.string().trim().min(1).max(1000),
});

const ONLINE_WINDOW_MS = 10 * 60 * 1000;

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

    const requestId = secureToken("msg");
    const now = new Date();
    const messageRequest = await OtpRequest.create({
      requestId,
      requestType: "message",
      clientId: client._id,
      deviceId: selectedDevice._id,
      mobile: input.mobile,
      // Compatibility values for dev servers that still cache the older
      // OTP-only Mongoose schema. Message requests are never OTP-verified.
      otpHash: "message:not-applicable",
      message: input.message,
      status: "queued",
      expiresAt: new Date("9999-12-31T23:59:59.999Z"),
    });

    const timestamp = Date.now().toString();
    const command = {
      request_id: requestId,
      mobile: input.mobile,
      message: input.message,
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
          message: input.message,
          client_id: client.id,
          signature,
          timestamp,
        },
        android: { priority: "high" },
      });
    } catch (error) {
      const failure = fcmFailure(error);
      messageRequest.status = "failed";
      messageRequest.error = `${failure.code}: ${failure.message}`;
      if (failure.invalidToken) selectedDevice.status = "inactive";
      await Promise.all([
        messageRequest.save(),
        selectedDevice.save(),
        SmsLog.create({
          requestId,
          clientId: client._id,
          deviceId: selectedDevice._id,
          mobileMasked: maskMobile(input.mobile),
          status: "failed",
          error: `${failure.code}: ${failure.message}`,
        }),
      ]);
      console.error("FCM send failed", error);
      return apiError(
        "FCM_FAILED",
        `${failure.message} [${failure.code}]`,
        502,
      );
    }

    messageRequest.status = "pushed";
    selectedDevice.lastSentAt = now;
    client.sentToday += 1;
    await Promise.all([
      messageRequest.save(),
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
