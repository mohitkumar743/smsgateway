import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

export function generateOtp(length: number): string {
  let otp = "";
  for (let index = 0; index < length; index += 1) {
    otp += randomInt(0, 10).toString();
  }
  return otp;
}

export function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 12);
}

export function compareOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}
