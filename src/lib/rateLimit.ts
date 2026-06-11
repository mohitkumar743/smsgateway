import OtpRequest from "@/models/OtpRequest";

function startOfUtcDay(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export async function clientLimitReached(clientId: unknown, dailyLimit: number) {
  const count = await OtpRequest.countDocuments({
    clientId,
    createdAt: { $gte: startOfUtcDay() },
  });
  return count >= dailyLimit;
}

export async function deviceLimitReached(
  deviceId: unknown,
  dailyLimit: number,
  perMinuteLimit: number,
) {
  const now = new Date();
  const [dailyCount, minuteCount] = await Promise.all([
    OtpRequest.countDocuments({
      deviceId,
      createdAt: { $gte: startOfUtcDay(now) },
    }),
    OtpRequest.countDocuments({
      deviceId,
      createdAt: { $gte: new Date(now.getTime() - 60_000) },
    }),
  ]);

  return dailyCount >= dailyLimit || minuteCount >= perMinuteLimit;
}
