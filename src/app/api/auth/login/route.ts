import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminJwt } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { apiError, routeError } from "@/lib/response";
import Admin from "@/models/Admin";

const schema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    await connectDb();

    const admin = await Admin.findOne({ email: input.email.toLowerCase() });
    if (!admin || !(await bcrypt.compare(input.password, admin.passwordHash))) {
      return apiError("UNAUTHORIZED", "Invalid email or password", 401);
    }

    const token = await createAdminJwt(admin.id, admin.email);
    return NextResponse.json({ success: true, token, expires_in: "12h" });
  } catch (error) {
    return routeError(error);
  }
}
