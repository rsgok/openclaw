/**
 * Tests for SessionOrigin extension (Task-based Multi-Agent)
 */

import { describe, it, expect } from "vitest";
import type { SessionOrigin } from "../../config/sessions/types.js";

describe("SessionOrigin (Task-based Multi-Agent extension)", () => {
  describe("type compatibility", () => {
    it("should accept taskId field", () => {
      const origin: SessionOrigin = {
        taskId: "test-task-001",
      };
      expect(origin.taskId).toBe("test-task-001");
    });

    it("should accept agentRole field", () => {
      const origin: SessionOrigin = {
        agentRole: "researcher",
      };
      expect(origin.agentRole).toBe("researcher");
    });

    it("should accept agentType field", () => {
      const originMain: SessionOrigin = {
        agentType: "main",
      };
      const originSub: SessionOrigin = {
        agentType: "subagent",
      };
      expect(originMain.agentType).toBe("main");
      expect(originSub.agentType).toBe("subagent");
    });

    it("should accept parentSessionKey field", () => {
      const origin: SessionOrigin = {
        parentSessionKey: "agent:main:main",
      };
      expect(origin.parentSessionKey).toBe("agent:main:main");
    });

    it("should accept all Task-based Multi-Agent fields together", () => {
      const origin: SessionOrigin = {
        taskId: "task-001",
        agentRole: "analyst",
        agentType: "subagent",
        parentSessionKey: "agent:main:main",
      };
      expect(origin.taskId).toBe("task-001");
      expect(origin.agentRole).toBe("analyst");
      expect(origin.agentType).toBe("subagent");
      expect(origin.parentSessionKey).toBe("agent:main:main");
    });

    it("should accept Task fields with existing fields", () => {
      const origin: SessionOrigin = {
        // Existing fields
        label: "test-label",
        provider: "discord",
        accountId: "account-123",
        threadId: "thread-456",
        // Task-based Multi-Agent fields
        taskId: "task-001",
        agentRole: "researcher",
        agentType: "subagent",
        parentSessionKey: "agent:main:main",
      };
      expect(origin.label).toBe("test-label");
      expect(origin.provider).toBe("discord");
      expect(origin.accountId).toBe("account-123");
      expect(origin.threadId).toBe("thread-456");
      expect(origin.taskId).toBe("task-001");
      expect(origin.agentRole).toBe("researcher");
      expect(origin.agentType).toBe("subagent");
      expect(origin.parentSessionKey).toBe("agent:main:main");
    });

    it("should allow partial Task fields", () => {
      const origin1: SessionOrigin = {
        taskId: "task-001",
      };

      const origin2: SessionOrigin = {
        agentRole: "writer",
        agentType: "subagent",
      };

      expect(origin1.taskId).toBe("task-001");
      expect(origin2.agentRole).toBe("writer");
      expect(origin2.agentType).toBe("subagent");
    });

    it("should allow empty origin (all fields optional)", () => {
      const origin: SessionOrigin = {};
      expect(origin).toEqual({});
    });
  });

  describe("agentType validation", () => {
    it("should accept 'main' as agentType", () => {
      const origin: SessionOrigin = {
        agentType: "main",
      };
      expect(origin.agentType).toBe("main");
    });

    it("should accept 'subagent' as agentType", () => {
      const origin: SessionOrigin = {
        agentType: "subagent",
      };
      expect(origin.agentType).toBe("subagent");
    });

    it("should not accept other values for agentType (type safety)", () => {
      // This test demonstrates type safety - TypeScript should flag invalid values
      // @ts-expect-error - Testing type safety
      const invalidOrigin: SessionOrigin = {
        agentType: "invalid",
      };
      expect(invalidOrigin).toBeDefined();
    });
  });

  describe("taskId validation", () => {
    it("should accept various taskId formats", () => {
      const formats = [
        "task-001",
        "research-task-2026",
        "task_with_underscores",
        "task.with.dots",
        "12345",
        "task-001-abc-xyz",
      ];

      formats.forEach((format) => {
        const origin: SessionOrigin = { taskId: format };
        expect(origin.taskId).toBe(format);
      });
    });

    it("should accept empty string as taskId", () => {
      const origin: SessionOrigin = {
        taskId: "",
      };
      expect(origin.taskId).toBe("");
    });
  });

  describe("agentRole validation", () => {
    it("should accept various role names", () => {
      const roles = [
        "researcher",
        "analyst",
        "writer",
        "reviewer",
        "coordinator",
        "main",
        "subagent",
        "custom-role-123",
      ];

      roles.forEach((role) => {
        const origin: SessionOrigin = { agentRole: role };
        expect(origin.agentRole).toBe(role);
      });
    });

    it("should accept empty string as agentRole", () => {
      const origin: SessionOrigin = {
        agentRole: "",
      };
      expect(origin.agentRole).toBe("");
    });
  });

  describe("parentSessionKey validation", () => {
    it("should accept various session key formats", () => {
      const formats = [
        "agent:main:main",
        "agent:subagent:uuid-123",
        "user:123:session:456",
        "discord:channel:789",
      ];

      formats.forEach((format) => {
        const origin: SessionOrigin = { parentSessionKey: format };
        expect(origin.parentSessionKey).toBe(format);
      });
    });

    it("should accept empty string as parentSessionKey", () => {
      const origin: SessionOrigin = {
        parentSessionKey: "",
      };
      expect(origin.parentSessionKey).toBe("");
    });
  });
});
