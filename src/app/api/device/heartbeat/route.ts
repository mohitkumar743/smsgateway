import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDevice } from "@/lib/auth";
import { apiError, routeError } from "@/lib/response";

const schema = z.object({
  batteryOptimizationIgnored: z.boolean(),
  smsPermission: z.boolean(),
  simReady: z.boolean(),
  foregroundServiceRunning: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const device = await requireDevice(request);
    if (!device) return apiError("UNAUTHORIZED", "Invalid device token", 401);

    const health = schema.parse(await request.json());
    device.health = health;
    device.lastSeen = new Date();
    if (device.status === "inactive") device.status = "active";
    await device.save();

    return NextResponse.json({
      success: true,
      limits: {
        dailyLimit: device.dailyLimit,
        perMinuteLimit: device.perMinuteLimit,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
