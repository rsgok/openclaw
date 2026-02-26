/**
 * Tests for task.create and task.destroy Gateway methods
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentWorkspaceDir: vi.fn(() => "/tmp/test-workspace"),
}));

vi.mock("../call.js", () => ({
  callGateway: vi.fn(),
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn(() => ({ session: { store: "~/.openclaw/sessions" } })),
}));

vi.mock("../../hooks/internal-hooks.js", () => ({
  createInternalHookEvent: vi.fn((type, payload) => ({ type, ...payload })),
  triggerInternalHook: vi.fn(),
}));

vi.mock("../../routing/session-key.js", () => ({
  normalizeAgentId: vi.fn((id) => id || "default"),
  parseAgentSessionKey: vi.fn(() => ({ agentId: "test-agent" })),
}));

vi.mock("../../utils/http-download.js", () => ({
  downloadFromHttpUrl: vi.fn(),
}));

vi.mock("../session-utils.js", () => ({
  loadCombinedSessionStoreForGateway: vi.fn(() => ({})),
}));

vi.mock("../protocol/index.js", () => ({
  ErrorCodes: { INVALID_REQUEST: "INVALID_REQUEST", UNAVAILABLE: "UNAVAILABLE" },
  errorShape: vi.fn((code, message) => ({ code, message })),
  formatValidationErrors: vi.fn((errors) => JSON.stringify(errors)),
  validateTaskCreateParams: vi.fn(() => true),
  validateTaskDestroyParams: vi.fn(() => true),
}));

import { callGateway } from "../call.js";
import type { TaskCreateParams, TaskDestroyParams } from "../protocol/index.js";
import { taskHandlers } from "./task.js";

describe("task Gateway methods", () => {
  const mockRespond = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRespond.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("task.create", () => {
    it("should create task with main agent only", async () => {
      const params: TaskCreateParams = {
        taskId: "test-task-001",
        mainAgent: { name: "Test Assistant" },
      };

      (callGateway as unknown as any).mockResolvedValueOnce({
        ok: true,
        agentId: "test-agent-001",
        name: "Test Assistant",
        workspace: "/tmp/test-workspace",
      });

      await taskHandlers["task.create"]({
        req: {} as unknown as any,
        params,
        client: null,
        isWebchatConnect: () => false,
        respond: mockRespond,
        context: {} as unknown as any,
      });

      expect(mockRespond.mock.calls[0][0]).toBe(true);
      const result = mockRespond.mock.calls[0][1];
      expect(result.ok).toBe(true);
      expect(result.taskId).toBe("test-task-001");
      expect(result.status).toBe("ready");
    });

    it("should handle main agent creation failure", async () => {
      const params: TaskCreateParams = {
        taskId: "test-task-error",
        mainAgent: { name: "Test Assistant" },
      };

      (callGateway as unknown as any).mockResolvedValueOnce({
        ok: false,
        error: "Failed to create agent",
      });

      await taskHandlers["task.create"]({
        req: {} as unknown as any,
        params,
        client: null,
        isWebchatConnect: () => false,
        respond: mockRespond,
        context: {} as unknown as any,
      });

      expect(mockRespond.mock.calls[0][0]).toBe(false);
    });
  });

  describe("task.destroy", () => {
    it("should handle non-existent task", async () => {
      const params: TaskDestroyParams = {
        taskId: "non-existent-task",
        deleteFiles: true,
      };

      await taskHandlers["task.destroy"]({
        req: {} as unknown as any,
        params,
        client: null,
        isWebchatConnect: () => false,
        respond: mockRespond,
        context: {} as unknown as any,
      });

      expect(mockRespond.mock.calls[0][0]).toBe(false);
    });
  });
});
