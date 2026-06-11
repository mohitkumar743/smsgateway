import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

export type SmsCommand = {
  request_id: string;
  mobile: string;
  message: string;
  client_id: string;
  timestamp: string;
};

export function createSmsSignature(command: SmsCommand): string {
  const messageToSign = [
    command.request_id,
    command.mobile,
    command.message,
    command.client_id,
    command.timestamp,
  ].join("|");

  return createHmac("sha256", getEnv("DEVICE_HMAC_SECRET"))
    .update(messageToSign, "utf8")
    .digest("hex");
}

export function verifySmsSignature(
  command: SmsCommand,
  signature: string,
): boolean {
  const expected = Buffer.from(createSmsSignature(command), "hex");
  const received = Buffer.from(signature, "hex");
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
