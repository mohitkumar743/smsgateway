import { Schema, model, models } from "mongoose";

const ClientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    apiKey: { type: String, required: true, unique: true, select: false },
    apiKeyEncrypted: { type: String, default: "", select: false },
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

const Client = models.Client || model("Client", ClientSchema);

// Next.js keeps compiled Mongoose models during development hot reloads.
// Add newly introduced paths to the cached model so writes are not stripped.
if (!Client.schema.path("apiKeyEncrypted")) {
  Client.schema.add({
    apiKeyEncrypted: { type: String, default: "", select: false },
  });
}

export default Client;
