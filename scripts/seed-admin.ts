import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";
import { z } from "zod";

async function main() {
  loadEnvConfig(process.cwd());

  const env = z
    .object({
      MONGODB_URI: z.string().min(1),
      ADMIN_EMAIL: z.string().email(),
      ADMIN_PASSWORD: z.string().min(12),
    })
    .parse(process.env);

  const [{ connectDb }, { default: Admin }] = await Promise.all([
    import("../src/lib/db"),
    import("../src/models/Admin"),
  ]);

  await connectDb();
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  const admin = await Admin.findOneAndUpdate(
    { email: env.ADMIN_EMAIL.toLowerCase() },
    { $set: { passwordHash } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  console.log(`Admin ready: ${admin.email}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Admin seed failed", error);
  process.exit(1);
});
