import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDevice } from "@/lib/auth";
import { apiError, routeError } from "@/lib/response";

const schema = z.object({
  fcmToken: z.string().trim().min(20).max(4096),
});

export async function POST(request: NextRequest) {
  try {
    const device = await requireDevice(request);
    if (!device) return apiError("UNAUTHORIZED", "Invalid device token", 401);

    const { fcmToken } = schema.parse(await request.json());
    device.fcmToken = fcmToken;
    device.lastSeen = new Date();
    await device.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
