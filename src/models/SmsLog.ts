import { Schema, model, models } from "mongoose";

const SmsLogSchema = new Schema(
  {
    requestId: { type: String, required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true },
    mobileMasked: { type: String, required: true },
    status: { type: String, required: true },
    error: { type: String, default: null },
    provider: {
      type: String,
      enum: ["android_phone"],
      default: "android_phone",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export default models.SmsLog || model("SmsLog", SmsLogSchema);
