import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getEnv } from "@/lib/env";

function firebaseApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  return initializeApp({
    credential: cert({
      projectId: getEnv("FIREBASE_PROJECT_ID"),
      clientEmail: getEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: getEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

export const messaging = () => getMessaging(firebaseApp());

export function fcmFailure(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "messaging/unknown-error";

  const failures: Record<string, { message: string; invalidToken?: boolean }> = {
    "messaging/registration-token-not-registered": {
      message:
        "The device FCM token is expired or no longer registered. Open the Android app and sync a fresh FCM token.",
      invalidToken: true,
    },
    "messaging/invalid-registration-token": {
      message:
        "The stored device FCM token is invalid. Open the Android app and sync a real Firebase token.",
      invalidToken: true,
    },
    "messaging/invalid-argument": {
      message:
        "Firebase rejected the device token or message payload. Refresh the device FCM token and verify Firebase configuration.",
    },
    "messaging/mismatched-credential": {
      message:
        "The Android FCM token belongs to a different Firebase project than the Vercel service account.",
    },
    "messaging/authentication-error": {
      message:
        "Firebase authentication failed. Verify the Vercel Firebase service-account environment variables.",
    },
    "app/invalid-credential": {
      message:
        "Firebase credentials are invalid. Verify FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in Vercel.",
    },
  };

  return {
    code,
    ...(failures[code] ?? {
      message: `Firebase rejected the push request (${code}). Check the Vercel function logs for details.`,
    }),
  };
}
