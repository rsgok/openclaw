/**
 * Task Lifecycle Management
 *
 * Handles TTL scanning, idle timeout detection, and automatic cleanup
 * for task-based multi-agent sessions.
 */

import { createInternalHookEvent, triggerInternalHook } from "../hooks/internal-hooks.js";
import { callGateway } from "./call.js";
import { getTaskRegistry, queryTaskSessions } from "./server-methods/task.js";

const SCAN_INTERVAL_MS = 60_000; // 1 minute
const DEFAULT_TTL_HOURS = 7 * 24; // 7 days
const DEFAULT_IDLE_TTL_MINUTES = 60 * 24; // 1 day

let scanIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Check if a task has expired based on TTL settings.
 */
function isTaskExpired(params: {
  createdAt: number;
  lastActivityAt: number;
  ttlHours: number;
  idleTtlMinutes: number;
}): { expired: boolean; reason: "ttl" | "idle" | null } {
  const now = Date.now();
  const { createdAt, lastActivityAt, ttlHours, idleTtlMinutes } = params;

  // Check total TTL
  const ttlMs = ttlHours * 60 * 60 * 1000;
  if (now - createdAt > ttlMs) {
    return { expired: true, reason: "ttl" };
  }

  // Check idle TTL
  const idleTtlMs = idleTtlMinutes * 60 * 1000;
  if (now - lastActivityAt > idleTtlMs) {
    return { expired: true, reason: "idle" };
  }

  return { expired: false, reason: null };
}

/**
 * Get TTL settings from session origin.
 */
function getTtlSettings(_taskId: string): {
  ttlHours: number;
  idleTtlMinutes: number;
  onIdle?: "archive" | "delete";
} {
  // Default settings
  return {
    ttlHours: DEFAULT_TTL_HOURS,
    idleTtlMinutes: DEFAULT_IDLE_TTL_MINUTES,
    onIdle: "delete",
  };
}

/**
 * Scan all tasks and cleanup expired ones.
 */
async function scanAndCleanupTasks(): Promise<{
  scanned: number;
  expired: number;
  cleaned: number;
  errors: string[];
}> {
  const registry = getTaskRegistry();
  const results = {
    scanned: registry.size,
    expired: 0,
    cleaned: 0,
    errors: [] as string[],
  };

  for (const [taskId, taskInfo] of registry.entries()) {
    try {
      // Query all sessions for this task
      const sessions = await queryTaskSessions(taskId);

      if (sessions.length === 0) {
        // No sessions found, cleanup registry entry
        results.expired++;
        await cleanupTask(taskId, "no_sessions", false);
        results.cleaned++;
        continue;
      }

      // Find last activity across all sessions
      const lastActivityAt = Math.max(
        ...sessions.map((s) => s.entry.updatedAt || taskInfo.createdAt),
      );

      // Get TTL settings
      const ttlSettings = getTtlSettings(taskId);

      // Check if expired
      const { expired, reason } = isTaskExpired({
        createdAt: taskInfo.createdAt,
        lastActivityAt,
        ttlHours: ttlSettings.ttlHours,
        idleTtlMinutes: ttlSettings.idleTtlMinutes,
      });

      if (expired && reason) {
        results.expired++;

        // Emit idle_timeout hook before cleanup
        if (reason === "idle") {
          const mainSessionKey = `agent:${taskInfo.mainAgentId}:main`;
          const idleTimeoutEvent = createInternalHookEvent("task", "idle_timeout", mainSessionKey, {
            taskId,
            idleMinutes: ttlSettings.idleTtlMinutes,
            action: ttlSettings.onIdle || "delete",
          });
          await triggerInternalHook(idleTimeoutEvent);
        }

        // Cleanup task
        const archiveTranscripts = ttlSettings.onIdle === "archive";
        await cleanupTask(taskId, reason, archiveTranscripts);
        results.cleaned++;
      }
    } catch (err) {
      results.errors.push(`Task ${taskId}: ${String(err)}`);
    }
  }

  return results;
}

/**
 * Cleanup a specific task.
 */
async function cleanupTask(
  taskId: string,
  reason: "ttl" | "idle" | "no_sessions",
  archiveTranscripts: boolean,
): Promise<void> {
  const taskInfo = getTaskRegistry().get(taskId);
  if (!taskInfo) {
    return;
  }

  try {
    // Call task.destroy to cleanup
    await callGateway({
      method: "task.destroy",
      params: {
        taskId,
        deleteFiles: true,
        archiveTranscripts,
      },
    });

    // Emit task_destroyed hook
    const mainSessionKey = `agent:${taskInfo.mainAgentId}:main`;
    const taskDestroyedEvent = createInternalHookEvent("task", "destroyed", mainSessionKey, {
      taskId,
      reason: reason === "ttl" ? "ttl_expired" : "idle_timeout",
      deletedAgents: {
        main: 1,
        subagents: taskInfo.subagentSessionKeys.length,
      },
      destroyedAt: Date.now(),
    });
    await triggerInternalHook(taskDestroyedEvent);
  } catch (err) {
    console.error(`Failed to cleanup task ${taskId}:`, err);
    throw err;
  }
}

/**
 * Start the task lifecycle scanner.
 */
export function startTaskLifecycleScanner(): void {
  if (scanIntervalId) {
    console.log("[TaskLifecycle] Scanner already running");
    return;
  }

  console.log("[TaskLifecycle] Starting scanner (interval: 1 minute)");

  scanIntervalId = setInterval(async () => {
    try {
      const results = await scanAndCleanupTasks();
      if (results.expired > 0) {
        console.log(
          `[TaskLifecycle] Scanned ${results.scanned} tasks, cleaned ${results.cleaned} expired`,
        );
      }
      if (results.errors.length > 0) {
        console.error("[TaskLifecycle] Errors during scan:", results.errors);
      }
    } catch (err) {
      console.error("[TaskLifecycle] Scan failed:", err);
    }
  }, SCAN_INTERVAL_MS);

  // Ensure the interval doesn't keep the process alive
  if (scanIntervalId.unref) {
    scanIntervalId.unref();
  }
}

/**
 * Stop the task lifecycle scanner.
 */
export function stopTaskLifecycleScanner(): void {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
    console.log("[TaskLifecycle] Scanner stopped");
  }
}

/**
 * Get scanner status.
 */
export function getTaskLifecycleScannerStatus(): {
  running: boolean;
  intervalMs: number;
} {
  return {
    running: scanIntervalId !== null,
    intervalMs: SCAN_INTERVAL_MS,
  };
}

/**
 * Manually trigger a scan (for testing/debugging).
 */
export async function triggerManualTaskScan(): Promise<{
  scanned: number;
  expired: number;
  cleaned: number;
  errors: string[];
}> {
  return scanAndCleanupTasks();
}
