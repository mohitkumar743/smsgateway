import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { secureToken, tokenDigest } from "@/lib/crypto";
import { connectDb } from "@/lib/db";
import { apiError, routeError } from "@/lib/response";
import Admin from "@/models/Admin";
import Client from "@/models/Client";
import Device from "@/models/Device";
import OtpRequest from "@/models/OtpRequest";
import SmsLog from "@/models/SmsLog";

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("admin"),
    email: z.email(),
    password: z.string().min(8).max(128),
  }),
  z.object({
    kind: z.literal("device"),
    deviceName: z.string().trim().min(1).max(100),
    phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
    androidVersion: z.string().trim().max(30).default(""),
    appVersion: z.string().trim().max(30).default(""),
    fcmToken: z.string().trim().min(20).max(4096),
    dailyLimit: z.number().int().min(1).max(1_000_000).default(100),
    perMinuteLimit: z.number().int().min(1).max(10_000).default(5),
  }),
]);

const updateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("client"),
    id: z.string().min(1),
    status: z.enum(["active", "blocked"]),
  }),
  z.object({
    kind: z.literal("device"),
    id: z.string().min(1),
    status: z.enum(["active", "inactive", "blocked"]),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return apiError("UNAUTHORIZED", "Admin authentication required", 401);
    }

    await connectDb();
    const [admins, clients, devices, otpRequests, smsLogs] = await Promise.all([
      Admin.find().select("email createdAt updatedAt").sort({ createdAt: -1 }).lean(),
      Client.find()
        .select("name status dailyLimit sentToday allowedTemplates allowedIps createdAt updatedAt")
        .sort({ createdAt: -1 })
        .limit(250)
        .lean(),
      Device.find()
        .select(
          "deviceName phoneNumber androidVersion appVersion status lastSeen dailyLimit perMinuteLimit sentToday lastSentAt health createdAt updatedAt",
        )
        .sort({ createdAt: -1 })
        .limit(250)
        .lean(),
      OtpRequest.find()
        .select(
          "requestId clientId deviceId mobile status error expiresAt sentAt verifiedAt attempts createdAt updatedAt",
        )
        .populate("clientId", "name")
        .populate("deviceId", "deviceName")
        .sort({ createdAt: -1 })
        .limit(250)
        .lean(),
      SmsLog.find()
        .select("requestId clientId deviceId mobileMasked status error provider createdAt")
        .populate("clientId", "name")
        .populate("deviceId", "deviceName")
        .sort({ createdAt: -1 })
        .limit(250)
        .lean(),
    ]);

    const now = Date.now();
    const onlineThreshold = now - 10 * 60 * 1000;

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          admins: admins.length,
          clients: clients.length,
          activeClients: clients.filter((item) => item.status === "active").length,
          devices: devices.length,
          onlineDevices: devices.filter(
            (item) =>
              item.status === "active" &&
              new Date(item.lastSeen as Date).getTime() >= onlineThreshold,
          ).length,
          otpRequests: await OtpRequest.countDocuments(),
          sentOtps: await OtpRequest.countDocuments({
            status: { $in: ["sent", "delivered", "verified"] },
          }),
          failedOtps: await OtpRequest.countDocuments({ status: "failed" }),
        },
        admins,
        clients,
        devices,
        otpRequests,
        smsLogs,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return apiError("UNAUTHORIZED", "Admin authentication required", 401);
    }

    const input = createSchema.parse(await request.json());
    await connectDb();

    if (input.kind === "admin") {
      const email = input.email.toLowerCase();
      if (await Admin.exists({ email })) {
        return apiError("CONFLICT", "An admin with this email already exists", 409);
      }

      const admin = await Admin.create({
        email,
        passwordHash: await bcrypt.hash(input.password, 12),
      });
      return NextResponse.json(
        { success: true, data: { id: admin.id, email: admin.email } },
        { status: 201 },
      );
    }

    const plainDeviceToken = secureToken("dev");
    const device = await Device.create({
      deviceName: input.deviceName,
      phoneNumber: input.phoneNumber,
      androidVersion: input.androidVersion,
      appVersion: input.appVersion,
      fcmToken: input.fcmToken,
      dailyLimit: input.dailyLimit,
      perMinuteLimit: input.perMinuteLimit,
      deviceToken: tokenDigest(plainDeviceToken),
      status: "active",
      lastSeen: new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        data: { id: device.id, deviceToken: plainDeviceToken },
      },
      { status: 201 },
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) {
      return apiError("UNAUTHORIZED", "Admin authentication required", 401);
    }

    const input = updateSchema.parse(await request.json());
    await connectDb();
    const model = input.kind === "client" ? Client : Device;
    const updated = await model.findByIdAndUpdate(
      input.id,
      { status: input.status },
      { new: true, runValidators: true },
    );

    if (!updated) return apiError("NOT_FOUND", `${input.kind} not found`, 404);
    return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status } });
  } catch (error) {
    return routeError(error);
  }
}
