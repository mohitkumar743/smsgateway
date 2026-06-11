import { Schema, model, models } from "mongoose";

const DeviceSchema = new Schema(
  {
    deviceName: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    androidVersion: { type: String, default: "" },
    appVersion: { type: String, default: "" },
    fcmToken: { type: String, required: true },
    deviceToken: { type: String, required: true, unique: true, select: false },
    status: {
      type: String,
      enum: ["active", "inactive", "blocked"],
      default: "active",
      index: true,
    },
    lastSeen: { type: Date, default: Date.now, index: true },
    dailyLimit: { type: Number, default: 100, min: 1 },
    perMinuteLimit: { type: Number, default: 5, min: 1 },
    sentToday: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    health: {
      batteryOptimizationIgnored: { type: Boolean, default: false },
      smsPermission: { type: Boolean, default: false },
      simReady: { type: Boolean, default: false },
      foregroundServiceRunning: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

DeviceSchema.index({ fcmToken: 1 });

export default models.Device || model("Device", DeviceSchema);
