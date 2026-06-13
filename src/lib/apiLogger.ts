import type { NextRequest } from "next/server";
import { connectDb } from "@/lib/db";
import { routeError } from "@/lib/response";
import ApiLog from "@/models/ApiLog";

function prepareLogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => prepareLogValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([itemKey, item]) => [
        itemKey,
        prepareLogValue(item),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 5000) {
    return `${value.slice(0, 5000)}...[TRUNCATED]`;
  }
  return value;
}

async function readRequestData(request: NextRequest) {
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  let body: unknown = null;

  if (!["GET", "HEAD"].includes(request.method)) {
    try {
      const raw = await request.clone().text();
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
    } catch {
      body = "[UNAVAILABLE]";
    }
  }

  return prepareLogValue({
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.keys(query).length ? query : undefined,
    body,
  });
}

async function readResponseData(response: Response) {
  try {
    const raw = await response.clone().text();
    if (!raw) return null;
    try {
      return prepareLogValue(JSON.parse(raw));
    } catch {
      return prepareLogValue(raw);
    }
  } catch {
    return "[UNAVAILABLE]";
  }
}

function reportName(method: string, path: string) {
  return `${method} ${path.replace(/^\/api\//, "").replace(/\//g, " / ")}`;
}

type ApiHandler<Args extends unknown[]> = (
  request: NextRequest,
  ...args: Args
) => Promise<Response>;

export function withApiLogging<Args extends unknown[]>(handler: ApiHandler<Args>) {
  return async (request: NextRequest, ...args: Args): Promise<Response> => {
    const startedAt = Date.now();
    const requestData = await readRequestData(request);
    let response: Response;

    try {
      response = await handler(request, ...args);
    } catch (error) {
      response = routeError(error);
    }

    const responseData = await readResponseData(response);
    const responseObject =
      responseData && typeof responseData === "object"
        ? (responseData as Record<string, any>)
        : null;

    try {
      await connectDb();
      await ApiLog.create({
        reportName: reportName(request.method, request.nextUrl.pathname),
        method: request.method,
        path: request.nextUrl.pathname,
        statusCode: response.status,
        success: response.ok,
        durationMs: Date.now() - startedAt,
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        userAgent: request.headers.get("user-agent") || "",
        requestData,
        responseData,
        errorCode: String(responseObject?.error?.code || ""),
      });
    } catch (logError) {
      console.error("Could not persist API log", logError);
    }

    return response;
  };
}
