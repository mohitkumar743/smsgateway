const requiredVariables = [
  "MONGODB_URI",
  "JWT_SECRET",
  "DEVICE_HMAC_SECRET",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const;

export function validateServerEnv() {
  const missing = requiredVariables.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

export function getEnv(name: (typeof requiredVariables)[number]): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
