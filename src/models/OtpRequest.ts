import { Schema, model, models } from "mongoose";

const OtpRequestSchema = new Schema(
  {
    requestId: { type: String, required: true, unique: true, index: true },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    deviceId: {
      type: Schema.Types.ObjectId,
      ref: "Device",
      required: true,
      index: true,
    },
    mobile: { type: String, required: true },
    otpHash: { type: String, required: true, select: false },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: [
        "queued",
        "pushed",
        "sending",
        "sent",
        "delivered",
        "failed",
        "verified",
        "expired",
      ],
      default: "queued",
      index: true,
    },
    error: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
    sentAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

OtpRequestSchema.index({ clientId: 1, createdAt: -1 });
OtpRequestSchema.index({ deviceId: 1, createdAt: -1 });

export default models.OtpRequest || model("OtpRequest", OtpRequestSchema);
