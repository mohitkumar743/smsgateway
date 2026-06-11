import { Schema, model, models } from "mongoose";

const ClientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    apiKey: { type: String, required: true, unique: true, select: false },
    status: {
      type: String,
      enum: ["active", "blocked"],
      default: "active",
      index: true,
    },
    dailyLimit: { type: Number, default: 100, min: 1 },
    sentToday: { type: Number, default: 0 },
    allowedIps: [{ type: String }],
  },
  { timestamps: true },
);

export default models.Client || model("Client", ClientSchema);
