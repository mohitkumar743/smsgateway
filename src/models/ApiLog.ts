import { Schema, model, models } from "mongoose";

const ApiLogSchema = new Schema(
  {
    reportName: { type: String, required: true, index: true },
    method: { type: String, required: true, index: true },
    path: { type: String, required: true, index: true },
    statusCode: { type: Number, required: true, index: true },
    success: { type: Boolean, required: true, index: true },
    durationMs: { type: Number, required: true },
    ip: { type: String, default: "unknown" },
    userAgent: { type: String, default: "" },
    requestData: { type: Schema.Types.Mixed, default: null },
    responseData: { type: Schema.Types.Mixed, default: null },
    errorCode: { type: String, default: "" },
  },
  { timestamps: true },
);

ApiLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default models.ApiLog || model("ApiLog", ApiLogSchema);
