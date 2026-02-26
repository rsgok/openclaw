/**
 * Tests for task.create and task.destroy Gateway methods
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all dependencies before importing task.ts
vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentWorkspaceDir: vi.fn(() => "/tmp/test-workspace"),
}));

vi.mock("../call.js", () => ({
  callGateway: vi.fn(),
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn(() => ({
    session: { store: "~/.openclaw/sessions" },
  })),
}));

vi.mock("../../config/sessions.js", () => ({
  loadSessionStore: vi.fn(() => ({})),
  resolveStorePath: vi.fn(() => "~/.openclaw/sessions"),
}));

vi.mock("../../hooks/internal-hooks.js", () => ({
  createInternalHookEvent: vi.fn((type, payload) => ({ type, ...payload })),
  triggerInternalHook: vi.fn(),
}));

vi.mock("../../routing/session-key.js", () => ({
  isSubagentSessionKey: vi.fn(() => false),
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
  ErrorCodes: {
    INVALID_REQUEST: "INVALID_REQUEST",
    UNAVAILABLE: "UNAVAILABLE",
  },
  errorShape: vi.fn((code, message) => ({ code, message })),
  formatValidationErrors: vi.fn((errors) => JSON.stringify(errors)),
  validateTaskCreateParams: vi.fn(() => true),
  validateTaskDestroyParams: vi.fn(() => true),
  validateTaskSessionsParams: vi.fn(() => true),
}));

import { taskHandlers } from "./task.js";
import type { TaskCreateParams, TaskDestroyParams } from "../protocol/index.js";
import { callGateway } from "../call.js";
import { downloadFromHttpUrl } from "../../utils/http-download.js";

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
    describe("basic creation", () => {
      it("should create task with main agent only", async () => {
        const params: TaskCreateParams = {
          taskId: "test-task-001",
          mainAgent: {
            name: "Test Assistant",
          },
        };

        (callGateway as any).mockResolvedValueOnce({
          ok: true,
          agentId: "test-agent-001",
          name: "Test Assistant",
          workspace: "/tmp/test-workspace",
        });

        await taskHandlers["task.create"]({
          params,
          respond: mockRespond,
          context: {} as any,
        });

        expect(mockRespond).toHaveBeenCalledWith(
          true,
          expect.objectContaining({
            ok: true,
            taskId: "test-task-001",
            mainAgent: expect.objectContaining({
              agentId: "test-agent-001",
              sessionKey: expect.any(String),
            }),
            status: "ready",
          }),
        );
      });

      it("should reject duplicate task creation", async () => {
        const params: TaskCreateParams = {
          taskId: "duplicate-task",
          mainAgent: {
            name: "Test Assistant",
          },
        };

        (callGateway as any).mockResolvedValueOnce({
          ok: true,
          agentId: "test-agent-003",
          name: "Test Assistant",
          workspace: "/tmp/test-workspace",
        });

        await taskHandlers["task.create"]({
          params,
          respond: mockRespond,
          context: {} as any,
        });

        expect(mockRespond).toHaveBeenCalledWith(true, expect.anything());

        mockRespond.mockClear();

        await taskHandlers["task.create"]({
          params,
          respond: mockRespond,
          context: {} as any,
        });

        expect(mockRespond).toHaveBeenCalledWith(
          false,
          undefined,
          expect.objectContaining({
            error: expect.stringContaining("already exists"),
          }),
        );
      });
    });

    describe("bootstrap files", () => {
      it("should handle inline bootstrapFiles", async () => {
        const params: TaskCreateParams = {
          taskId: "test-task-bootstrap",
          mainAgent: {
            name: "Assistant with Bootstrap",
            bootstrapFiles: {
              "AGENTS.md": "# Test Agents File",
            },
          },
        };

        (callGateway as any).mockResolvedValueOnce({
          ok: true,
          agentId: "test-agent-004",
          name: "Assistant with Bootstrap",
          workspace: "/tmp/test-workspace",
        });

        await taskHandlers["task.create"]({
          params,
          respond: mockRespond,
          context: {} as any,
        });

        expect(mockRespond).toHaveBeenCalledWith(
          true,
          expect.objectContaining({
            ok: true,
            taskId: "test-task-bootstrap",
          }),
        );
      });

      it("should handle bootstrapFilesUrls by downloading content", async () => {
        const params: TaskCreateParams = {
          taskId: "test-task-url",
          mainAgent: {
            name: "Assistant with URL Bootstrap",
            bootstrapFilesUrls: {
              "AGENTS.md": "http://example.com/agents.md",
            },
          },
        };

        (callGateway as any).mockResolvedValueOnce({
          ok: true,
          agentId: "test-agent-005",
          name: "Assistant with URL Bootstrap",
          workspace: "/tmp/test-workspace",
        });

        (downloadFromHttpUrl as any).mockResolvedValueOnce({
          ok: true,
          content: "# Downloaded Agents File",
          bytes: 100,
        });

        await taskHandlers["task.create"]({
          params,
          respond: mockRespond,
          context: {} as any,
        });

        expect(downloadFromHttpUrl).toHaveBeenCalledWith(
          "http://example.com/agents.md",
          expect.anything(),
        );

        expect(mockRespond).toHaveBeenCalledWith(
          true,
          expect.objectContaining({
            ok: true,
            taskId: "test-task-url",
          }),
        );
      });
    });

    describe("predefined subagents", () => {
      it("should create task with predefined subagents", async () => {
        const params: TaskCreateParams = {
          taskId: "test-task-subagents",
          mainAgent: {
            name: "Research Assistant",
            predefinedSubagents: [
              { role: "researcher" },
              { role: "analyst" },
            ],
          },
        };

        (callGateway as any)
          .mockResolvedValueOnce({
            ok: true,
            agentId: "main-agent-006",
            name: "Research Assistant",
            workspace: "/tmp/test-workspace",
          })
          .mockResolvedValueOnce({
            status: "accepted",
            childSessionKey: "agent:sub1:main",
          })
          .mockResolvedValueOnce({
            status: "accepted",
            childSessionKey: "agent:sub2:main",
          });

        await taskHandlers["task.create"]({
          params,
          respond: mockRespond,
          context: {} as any,
        });

        expect(mockRespond).toHaveBeenCalledWith(
          true,
          expect.objectContaining({
            ok: true,
            taskId: "test-task-subagents",
            predefinedSubagents: expect.arrayContaining([
              expect.objectContaining({ role: "researcher", ready: true }),
              expect.objectContaining({ role: "analyst", ready: true }),
            ]),
          }),
        );
      });
    });
  });

  describe("task.destroy", () => {
    it("should handle non-existent task", async () => {
      const params: TaskDestroyParams = {
        taskId: "non-existent-task",
        deleteFiles: true,
      };

      await taskHandlers["task.destroy"]({
        params,
        respond: mockRespond,
        context: {} as any,
      });

      expect(mockRespond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          error: expect.stringContaining("not found"),
        }),
      );
    });
  });
});
