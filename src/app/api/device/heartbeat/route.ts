import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDevice } from "@/lib/auth";
import { apiError, routeError } from "@/lib/response";

const schema = z.object({
  batteryOptimizationIgnored: z.boolean().optional(),
  smsPermission: z.boolean().optional(),
  simReady: z.boolean().optional(),
  foregroundServiceRunning: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const device = await requireDevice(request);
    if (!device) return apiError("UNAUTHORIZED", "Invalid device token", 401);

    const body = (await request.json()) as Record<string, unknown>;
    const health = schema.parse({
      batteryOptimizationIgnored:
        body.batteryOptimizationIgnored ??
        body.battery_optimization_ignored,
      smsPermission: body.smsPermission ?? body.sms_permission,
      simReady: body.simReady ?? body.sim_ready,
      foregroundServiceRunning:
        body.foregroundServiceRunning ??
        body.foreground_service_running,
    });
    device.health = {
      batteryOptimizationIgnored:
        health.batteryOptimizationIgnored ??
        device.health?.batteryOptimizationIgnored ??
        false,
      smsPermission:
        health.smsPermission ?? device.health?.smsPermission ?? false,
      simReady: health.simReady ?? device.health?.simReady ?? false,
      foregroundServiceRunning:
        health.foregroundServiceRunning ??
        device.health?.foregroundServiceRunning ??
        false,
    };
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
