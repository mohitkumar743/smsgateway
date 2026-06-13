import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiLogging } from "@/lib/apiLogger";
import { secureToken, tokenDigest } from "@/lib/crypto";
import { connectDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { routeError } from "@/lib/response";
import Device from "@/models/Device";

const schema = z.object({
  deviceName: z.string().trim().min(1).max(100),
  phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  androidVersion: z.string().trim().max(30).default(""),
  appVersion: z.string().trim().max(30).default(""),
  fcmToken: z.string().trim().min(20).max(4096),
});

async function postHandler(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = schema.parse({
      deviceName: body.deviceName ?? body.device_name,
      phoneNumber: body.phoneNumber ?? body.phone_number,
      androidVersion: body.androidVersion ?? body.android_version,
      appVersion: body.appVersion ?? body.app_version,
      fcmToken: body.fcmToken ?? body.fcm_token,
    });
    await connectDb();

    const plainDeviceToken = secureToken("dev");
    const device = await Device.create({
      ...input,
      deviceToken: tokenDigest(plainDeviceToken),
      status: "active",
      lastSeen: new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        device_token: plainDeviceToken,
        device_id: device.id,
        hmac_secret: getEnv("DEVICE_HMAC_SECRET"),
        status: "registered",
      },
      { status: 201 },
    );
  } catch (error) {
    return routeError(error);
  }
}

export const POST = withApiLogging(postHandler);
