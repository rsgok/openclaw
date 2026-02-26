/**
 * Task-based Multi-Agent Collaboration - Gateway Handlers
 *
 * Implements task.create, task.destroy, and task.sessions methods
 * for managing multi-agent tasks with main agent + sub-agents pattern.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Value } from "@sinclair/typebox/value";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { spawnSubagentDirect } from "../../agents/subagent-spawn.js";
import { loadConfig } from "../../config/config.js";
import { type SessionEntry } from "../../config/sessions.js";
import { createInternalHookEvent, triggerInternalHook } from "../../hooks/internal-hooks.js";
import { normalizeAgentId, parseAgentSessionKey } from "../../routing/session-key.js";
import { downloadFromHttpUrl } from "../../utils/http-download.js";
import { callGateway } from "../call.js";
import {
  ErrorCodes,
  errorShape,
  TaskCreateParamsSchema,
  TaskDestroyParamsSchema,
  TaskSessionsParamsSchema,
  type TaskCreateParams,
} from "../protocol/index.js";
import { loadCombinedSessionStoreForGateway } from "../session-utils.js";
import type { GatewayRequestHandlers } from "./types.js";

const TASK_TTL_HOURS_DEFAULT = 7 * 24; // 7 days
const TASK_IDLE_TTL_MINUTES_DEFAULT = 60 * 24; // 1 day idle

// In-memory task registry for tracking created tasks
const taskRegistry = new Map<
  string,
  {
    mainAgentId: string;
    subagentSessionKeys: string[];
    createdAt: number;
  }
>();

/**
 * Download bootstrap files from URLs and merge with inline content.
 * Inline content takes precedence.
 */
async function resolveBootstrapFiles(params: {
  inline?: Record<string, string>;
  urls?: Record<string, string>;
}): Promise<{ ok: true; files: Record<string, string> } | { ok: false; error: string }> {
  const files: Record<string, string> = {};

  // Download URLs first
  if (params.urls) {
    for (const [filename, url] of Object.entries(params.urls)) {
      if (!url?.trim()) {
        continue;
      }
      const result = await downloadFromHttpUrl(url, { timeoutMs: 30_000 });
      if (!result.ok) {
        return { ok: false, error: `Failed to download ${filename}: ${result.error}` };
      }
      files[filename] = result.content;
    }
  }

  // Inline content takes precedence
  if (params.inline) {
    for (const [filename, content] of Object.entries(params.inline)) {
      if (content?.trim()) {
        files[filename] = content;
      }
    }
  }

  return { ok: true, files };
}

/**
 * Write bootstrap files to agent workspace.
 */
async function writeBootstrapFiles(params: {
  agentId: string;
  files: Record<string, string>;
}): Promise<void> {
  const workspaceDir = resolveAgentWorkspaceDir(loadConfig(), params.agentId);

  for (const [filename, content] of Object.entries(params.files)) {
    const filePath = path.join(workspaceDir, filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }
}

/**
 * Rollback task creation on failure.
 */
async function rollbackTaskCreation(params: {
  taskId: string;
  mainAgentId?: string;
  subagentSessionKeys?: string[];
}): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Delete main agent if created
    if (params.mainAgentId) {
      try {
        await callGateway({
          method: "agents.delete",
          params: { agentId: params.mainAgentId, deleteFiles: true },
        });
      } catch (err) {
        errors.push(`Failed to delete main agent: ${String(err)}`);
      }
    }

    // Delete subagent sessions if created
    if (params.subagentSessionKeys) {
      for (const sessionKey of params.subagentSessionKeys) {
        try {
          await callGateway({
            method: "sessions.delete",
            params: { key: sessionKey, deleteTranscript: true },
          });
        } catch (err) {
          errors.push(`Failed to delete subagent ${sessionKey}: ${String(err)}`);
        }
      }
    }

    // Cleanup task workspace
    try {
      const taskWorkspace = path.join(
        resolveAgentWorkspaceDir(loadConfig(), "_tasks"),
        params.taskId,
      );
      await fs.rm(taskWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Remove from registry
    taskRegistry.delete(params.taskId);

    return { success: errors.length === 0, errors };
  } catch (err) {
    errors.push(`Rollback failed: ${String(err)}`);
    return { success: false, errors };
  }
}

async function createPredefinedSubagents(params: {
  taskId: string;
  parentSessionKey: string;
  subagents: TaskCreateParams["mainAgent"]["predefinedSubagents"];
}): Promise<
  | { ok: true; subagents: Array<{ role: string; sessionKey: string; ready: boolean }> }
  | { ok: false; error: string; sessionKeys: string[] }
> {
  const createdSessionKeys: string[] = [];

  try {
    const results = [];
    console.log(`🔍 Creating ${params.subagents?.length || 0} subagents for task ${params.taskId}`);

    for (const subagent of params.subagents ?? []) {
      console.log(`🔍 Creating subagent: ${subagent.role}`);

      // Resolve bootstrap files
      const bootstrapResult = await resolveBootstrapFiles({
        inline: subagent.bootstrapFiles,
        urls: subagent.bootstrapFilesUrls,
      });

      if (!bootstrapResult.ok) {
        console.error(`❌ Bootstrap failed for ${subagent.role}: ${bootstrapResult.error}`);
        return { ok: false, error: bootstrapResult.error, sessionKeys: createdSessionKeys };
      }

      // Use spawnSubagentDirect to create subagent
      const spawnResult = await spawnSubagentDirect(
        {
          task: `Initialize as ${subagent.role}. Your role is: ${subagent.role}`,
          label: subagent.role,
          predefinedRole: subagent.role,
          bootstrapFiles: bootstrapResult.files,
          taskId: params.taskId,
          agentRole: subagent.role,
          mode: "run", // Use "run" mode for predefined subagents
        },
        {
          agentSessionKey: params.parentSessionKey,
          requesterAgentIdOverride: undefined,
          agentChannel: undefined,
          agentAccountId: undefined,
          agentTo: undefined,
          agentThreadId: undefined,
          agentGroupId: undefined,
          agentGroupChannel: undefined,
          agentGroupSpace: undefined,
        },
      );

      console.log(`🔍 Subagent spawn result:`, JSON.stringify(spawnResult, null, 2));

      if (spawnResult.status !== "accepted") {
        const errorMsg = spawnResult.error || `Failed to spawn subagent for role ${subagent.role}`;
        console.error(`❌ Spawn failed: ${errorMsg}`);
        return {
          ok: false,
          error: errorMsg,
          sessionKeys: createdSessionKeys,
        };
      }

      const sessionKey = spawnResult.childSessionKey;
      if (sessionKey) {
        createdSessionKeys.push(sessionKey);

        // Patch session with Task metadata (redundant but safe)
        await callGateway({
          method: "sessions.patch",
          params: {
            key: sessionKey,
            taskId: params.taskId,
            agentRole: subagent.role,
            agentType: "subagent",
            parentSessionKey: params.parentSessionKey,
          },
        });

        results.push({
          role: subagent.role,
          sessionKey,
          ready: true,
        });
        console.log(`✅ Subagent created: ${subagent.role} -> ${sessionKey}`);
      }
    }

    console.log(`✅ All ${results.length} subagents created successfully`);
    return { ok: true, subagents: results };
  } catch (err) {
    console.error(`❌ Subagents creation failed: ${String(err)}`);
    return {
      ok: false,
      error: String(err),
      sessionKeys: createdSessionKeys,
    };
  }
}

export const taskHandlers: GatewayRequestHandlers = {
  "task.create": async ({ params, respond }) => {
    console.log("🔍 task.create params:", JSON.stringify(params, null, 2));

    if (!Value.Check(TaskCreateParamsSchema, params)) {
      console.log("❌ Validation failed:", Value.Errors(TaskCreateParamsSchema, params));
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid task.create params"),
      );
      return;
    }

    const p = params;
    const taskId = p.taskId || randomUUID();

    // Check if task already exists
    if (taskRegistry.has(taskId)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `task ${taskId} already exists`),
      );
      return;
    }

    const rollbackInfo: {
      mainAgentId?: string;
      subagentSessionKeys: string[];
    } = {
      subagentSessionKeys: [],
    };

    try {
      const results: {
        main: { agentId: string; sessionKey: string };
        subagents: Array<{ role: string; sessionKey: string; ready: boolean }>;
      } = {
        main: { agentId: "", sessionKey: "" },
        subagents: [],
      };

      // 1. Create main agent
      const mainAgentResult = await callGateway<{
        ok: boolean;
        agentId: string;
        workspace: string;
      }>({
        method: "agents.create",
        params: {
          name: p.mainAgent.name,
          workspace: path.join("_tasks", taskId, "main"),
        },
      });

      if (!mainAgentResult.ok) {
        throw new Error(`Failed to create main agent: ${JSON.stringify(mainAgentResult)}`);
      }

      console.log("✅ Main agent created:", mainAgentResult);

      rollbackInfo.mainAgentId = mainAgentResult.agentId;

      results.main = {
        agentId: mainAgentResult.agentId,
        sessionKey: `agent:${mainAgentResult.agentId}:main`,
      };

      // 2. Inject main agent bootstrap files
      const mainBootstrapResult = await resolveBootstrapFiles({
        inline: p.mainAgent.bootstrapFiles,
        urls: p.mainAgent.bootstrapFilesUrls,
      });

      if (!mainBootstrapResult.ok) {
        throw new Error(mainBootstrapResult.error);
      }

      if (Object.keys(mainBootstrapResult.files).length > 0) {
        await writeBootstrapFiles({
          agentId: mainAgentResult.agentId,
          files: mainBootstrapResult.files,
        });
      }

      // 3. Get main agent session key
      const mainSessionKey = `agent:${mainAgentResult.agentId}:main`;

      // Patch main session with Task metadata
      const ttlHours = p.options?.ttlHours ?? TASK_TTL_HOURS_DEFAULT;
      const idleTtlMinutes = p.options?.idleTtlMinutes ?? TASK_IDLE_TTL_MINUTES_DEFAULT;

      await callGateway({
        method: "sessions.patch",
        params: {
          key: mainSessionKey,
          taskId,
          agentRole: "main",
          agentType: "main",
          label: p.mainAgent.name,
        },
      });

      // 4. Create predefined subagents
      const subagentResult = await createPredefinedSubagents({
        taskId,
        parentSessionKey: mainSessionKey,
        subagents: p.mainAgent.predefinedSubagents,
      });

      if (!subagentResult.ok) {
        rollbackInfo.subagentSessionKeys = subagentResult.sessionKeys;
        throw new Error(subagentResult.error);
      }

      rollbackInfo.subagentSessionKeys = subagentResult.subagents.map((s) => s.sessionKey);

      // 5. Register task
      taskRegistry.set(taskId, {
        mainAgentId: mainAgentResult.agentId,
        subagentSessionKeys: subagentResult.subagents.map((s) => s.sessionKey),
        createdAt: Date.now(),
      });

      // 6. Emit task_created hook
      const taskCreatedEvent = createInternalHookEvent("task", "created", mainSessionKey, {
        taskId,
        mainAgentId: mainAgentResult.agentId,
        subagents: subagentResult.subagents.map((s) => ({
          role: s.role,
          sessionKey: s.sessionKey,
        })),
        createdAt: Date.now(),
        ttlHours,
        idleTtlMinutes,
      });
      await triggerInternalHook(taskCreatedEvent);

      // 7. Return success response
      const result = {
        ok: true,
        taskId,
        status: "ready",
        agents: {
          main: {
            agentId: mainAgentResult.agentId,
            sessionKey: mainSessionKey,
          },
          subagents: subagentResult.subagents,
        },
      };

      respond(true, result);
    } catch (err) {
      // Rollback on failure
      const rollbackResult = await rollbackTaskCreation({
        taskId,
        mainAgentId: rollbackInfo.mainAgentId,
        subagentSessionKeys: rollbackInfo.subagentSessionKeys,
      });

      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to create task: ${String(err)}. Rollback ${rollbackResult.success ? "completed" : "failed with errors: " + rollbackResult.errors.join(", ")}`,
        ),
      );
    }
  },

  "task.destroy": async ({ params, respond }) => {
    if (!Value.Check(TaskDestroyParamsSchema, params)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid task.destroy params"),
      );
      return;
    }

    const p = params;
    const taskInfo = taskRegistry.get(p.taskId);

    if (!taskInfo) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `task ${p.taskId} not found`),
      );
      return;
    }

    const deletedAgents = { main: 0, subagents: 0 };
    const archivedSessions: string[] = [];
    const errors: string[] = [];

    try {
      // 1. Archive transcripts if requested
      if (p.archiveTranscripts) {
        const { store: allSessions } = loadCombinedSessionStoreForGateway(loadConfig());

        for (const [key, entry] of Object.entries(allSessions)) {
          if (entry.origin?.taskId === p.taskId) {
            // Archive logic would go here
            archivedSessions.push(key);
          }
        }
      }

      // 2. Delete subagents first
      for (const sessionKey of taskInfo.subagentSessionKeys) {
        try {
          await callGateway({
            method: "sessions.delete",
            params: {
              key: sessionKey,
              deleteTranscript: p.deleteFiles,
            },
          });
          deletedAgents.subagents++;
        } catch (err) {
          errors.push(`Failed to delete subagent ${sessionKey}: ${String(err)}`);
        }
      }

      // 3. Delete main agent
      try {
        await callGateway({
          method: "agents.delete",
          params: {
            agentId: taskInfo.mainAgentId,
            deleteFiles: p.deleteFiles,
          },
        });
        deletedAgents.main++;
      } catch (err) {
        errors.push(`Failed to delete main agent: ${String(err)}`);
      }

      // 4. Cleanup workspace
      if (p.deleteFiles) {
        try {
          const taskWorkspace = path.join(
            resolveAgentWorkspaceDir(loadConfig(), "_tasks"),
            p.taskId,
          );
          await fs.rm(taskWorkspace, { recursive: true, force: true });
        } catch (err) {
          errors.push(`Failed to cleanup workspace: ${String(err)}`);
        }
      }

      // 5. Remove from registry
      taskRegistry.delete(p.taskId);

      // 6. Emit task_destroyed hook
      const mainSessionKey = `agent:${taskInfo.mainAgentId}:main`;
      const taskDestroyedEvent = createInternalHookEvent("task", "destroyed", mainSessionKey, {
        taskId: p.taskId,
        reason: "user_requested",
        deletedAgents,
        destroyedAt: Date.now(),
        errors: errors.length > 0 ? errors : undefined,
      });
      await triggerInternalHook(taskDestroyedEvent);

      // 7. Return result
      const result = {
        ok: true,
        taskId: p.taskId,
        deletedAgents,
        archivedSessions: archivedSessions.length,
      };

      respond(true, result);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to destroy task: ${String(err)}`),
      );
    }
  },

  "task.sessions": async ({ params, respond }) => {
    if (!Value.Check(TaskSessionsParamsSchema, params)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid task.sessions params"),
      );
      return;
    }

    const p = params;

    try {
      // Load all sessions and filter by taskId
      const { store: allSessions } = loadCombinedSessionStoreForGateway(loadConfig());
      const taskSessions: Array<{
        sessionKey: string;
        agentId: string;
        agentType: "main" | "subagent";
        agentRole?: string;
        status: "active" | "stopped";
        createdAt: number;
        lastActivityAt: number;
      }> = [];

      for (const [key, entry] of Object.entries(allSessions)) {
        if (entry.origin?.taskId === p.taskId) {
          const parsed = parseAgentSessionKey(key);
          const isAborted = entry.abortedLastRun === true;

          // Skip inactive if not requested
          if (!p.includeInactive && isAborted) {
            continue;
          }

          taskSessions.push({
            sessionKey: key,
            agentId: parsed?.agentId || normalizeAgentId(undefined),
            agentType: entry.origin?.agentType || "subagent",
            agentRole: entry.origin?.agentRole,
            status: isAborted ? "stopped" : "active",
            createdAt: entry.updatedAt || Date.now(),
            lastActivityAt: entry.updatedAt || Date.now(),
          });
        }
      }

      const result = {
        ok: true,
        taskId: p.taskId,
        sessions: taskSessions,
      };

      respond(true, result);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list task sessions: ${String(err)}`),
      );
    }
  },
};

/**
 * Query sessions by task ID (exported for task lifecycle management)
 */
export async function queryTaskSessions(
  taskId: string,
): Promise<Array<{ sessionKey: string; entry: SessionEntry }>> {
  const { store: allSessions } = loadCombinedSessionStoreForGateway(loadConfig());
  const results: Array<{ sessionKey: string; entry: SessionEntry }> = [];

  for (const [key, entry] of Object.entries(allSessions)) {
    if (entry.origin?.taskId === taskId) {
      results.push({ sessionKey: key, entry: entry });
    }
  }

  return results;
}

/**
 * Get task registry (exported for lifecycle management)
 */
export function getTaskRegistry(): ReadonlyMap<
  string,
  {
    mainAgentId: string;
    subagentSessionKeys: string[];
    createdAt: number;
  }
> {
  return taskRegistry;
}

/**
 * Check if a task exists
 */
export function hasTask(taskId: string): boolean {
  return taskRegistry.has(taskId);
}
