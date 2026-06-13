import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "CLIENT_BLOCKED"
  | "KEY_NOT_STORED"
  | "DEVICE_NOT_FOUND"
  | "DEVICE_OFFLINE"
  | "RATE_LIMITED"
  | "OTP_EXPIRED"
  | "OTP_INVALID"
  | "OTP_ATTEMPTS_EXCEEDED"
  | "FCM_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVER_ERROR";

export function success<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(code: ErrorCode, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export function routeError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.issues,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof mongoose.Error.CastError) {
    return apiError("VALIDATION_ERROR", `Invalid ${error.path}`, 400);
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Database validation failed",
          details: Object.values(error.errors).map((item) => ({
            path: item.path,
            message: item.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  console.error("Unhandled API error", error);
  return apiError("SERVER_ERROR", "An internal server error occurred", 500);
}
