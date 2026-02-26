/**
 * Task-based Multi-Agent HTTP API
 *
 * Exposes Task Gateway methods as HTTP endpoints for external services.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import type { ResolvedGatewayAuth } from "./auth.js";
import { callGateway } from "./call.js";
import { sendJson } from "./http-common.js";
import { handleGatewayPostJsonEndpoint } from "./http-endpoint-helpers.js";
import type { TaskCreateResult, TaskSessionsResult, TaskDestroyResult } from "./protocol/index.js";

type TaskHttpOptions = {
  auth: ResolvedGatewayAuth;
  maxBodyBytes?: number;
  trustedProxies?: string[];
  allowRealIpFallback?: boolean;
  rateLimiter?: AuthRateLimiter;
};

/**
 * Handle HTTP POST /v1/task/create
 */
export async function handleTaskCreateHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: TaskHttpOptions,
): Promise<boolean> {
  console.log("🔍 handleTaskCreateHttpRequest called");
  const handled = await handleGatewayPostJsonEndpoint(req, res, {
    pathname: "/v1/task/create",
    auth: opts.auth,
    trustedProxies: opts.trustedProxies,
    allowRealIpFallback: opts.allowRealIpFallback,
    rateLimiter: opts.rateLimiter,
    maxBodyBytes: opts.maxBodyBytes ?? 1024 * 1024,
  });

  if (handled === false) {
    return false;
  }
  if (!handled) {
    return true;
  }

  try {
    const payload = handled.body as Record<string, unknown>;
    console.log("🔍 HTTP task.create payload:", JSON.stringify(payload, null, 2));

    // Call Gateway task.create method
    const result = await callGateway<TaskCreateResult>({
      method: "task.create",
      params: payload,
    });
    console.log("🔍 HTTP task.create result:", JSON.stringify(result, null, 2));

    if (!result?.ok) {
      sendJson(res, 400, {
        ok: false,
        error: {
          message: "Failed to create task",
          type: "task_create_error",
        },
      });
    } else {
      sendJson(res, 200, result);
    }
  } catch (err) {
    console.error("❌ HTTP task.create error:", err);
    sendJson(res, 500, {
      ok: false,
      error: {
        message: String(err),
        type: "internal_error",
      },
    });
  }

  return true;
}

/**
 * Handle HTTP POST /v1/task/sessions
 */
export async function handleTaskSessionsHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: TaskHttpOptions,
): Promise<boolean> {
  const handled = await handleGatewayPostJsonEndpoint(req, res, {
    pathname: "/v1/task/sessions",
    auth: opts.auth,
    trustedProxies: opts.trustedProxies,
    allowRealIpFallback: opts.allowRealIpFallback,
    rateLimiter: opts.rateLimiter,
    maxBodyBytes: opts.maxBodyBytes ?? 1024 * 1024,
  });

  if (handled === false) {
    return false;
  }
  if (!handled) {
    return true;
  }

  try {
    const payload = handled.body as Record<string, unknown>;

    // Call Gateway task.sessions method
    const result = await callGateway<TaskSessionsResult>({
      method: "task.sessions",
      params: payload,
    });

    if (!result?.ok) {
      sendJson(res, 400, {
        ok: false,
        error: {
          message: "Failed to query sessions",
          type: "task_sessions_error",
        },
      });
    } else {
      sendJson(res, 200, result);
    }
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: {
        message: String(err),
        type: "internal_error",
      },
    });
  }

  return true;
}

/**
 * Handle HTTP POST /v1/task/destroy
 */
export async function handleTaskDestroyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: TaskHttpOptions,
): Promise<boolean> {
  const handled = await handleGatewayPostJsonEndpoint(req, res, {
    pathname: "/v1/task/destroy",
    auth: opts.auth,
    trustedProxies: opts.trustedProxies,
    allowRealIpFallback: opts.allowRealIpFallback,
    rateLimiter: opts.rateLimiter,
    maxBodyBytes: opts.maxBodyBytes ?? 1024 * 1024,
  });

  if (handled === false) {
    return false;
  }
  if (!handled) {
    return true;
  }

  try {
    const payload = handled.body as Record<string, unknown>;

    // Call Gateway task.destroy method
    const result = await callGateway<TaskDestroyResult>({
      method: "task.destroy",
      params: payload,
    });

    if (!result?.ok) {
      sendJson(res, 400, {
        ok: false,
        error: {
          message: "Failed to destroy task",
          type: "task_destroy_error",
        },
      });
    } else {
      sendJson(res, 200, result);
    }
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: {
        message: String(err),
        type: "internal_error",
      },
    });
  }

  return true;
}
