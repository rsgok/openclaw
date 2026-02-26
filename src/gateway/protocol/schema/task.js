import { Type } from "@sinclair/typebox";

// Task Create Parameters
export const TaskCreateParamsSchema = Type.Object({
  taskId: Type.Optional(Type.String({ minLength: 1 })),
  mainAgent: Type.Object({
    name: Type.String({ minLength: 1 }),
    model: Type.Optional(Type.String()),
    thinking: Type.Optional(Type.String()),
    label: Type.Optional(Type.String()),
    bootstrapFiles: Type.Optional(Type.Record(Type.String(), Type.String())),
    bootstrapFilesUrls: Type.Optional(Type.Record(Type.String(), Type.String())),
  }),
  subagents: Type.Optional(
    Type.Array(
      Type.Object({
        role: Type.String({ minLength: 1 }),
        name: Type.Optional(Type.String()),
        model: Type.Optional(Type.String()),
        thinking: Type.Optional(Type.String()),
        label: Type.Optional(Type.String()),
        bootstrapFiles: Type.Optional(Type.Record(Type.String(), Type.String())),
        bootstrapFilesUrls: Type.Optional(Type.Record(Type.String(), Type.String())),
      }),
    ),
  ),
  options: Type.Optional(
    Type.Object({
      ttlHours: Type.Optional(Type.Number({ minimum: 1 })),
      idleTtlMinutes: Type.Optional(Type.Number({ minimum: 1 })),
    }),
  ),
});

export const TaskCreateResultSchema = Type.Object({
  ok: Type.Literal(true),
  taskId: Type.String(),
  status: Type.Literal("ready"),
  agents: Type.Object({
    main: Type.Object({
      agentId: Type.String(),
      sessionKey: Type.String(),
    }),
    subagents: Type.Array(
      Type.Object({
        role: Type.String(),
        sessionKey: Type.String(),
        ready: Type.Boolean(),
      }),
    ),
  }),
});

// Task Destroy Parameters
export const TaskDestroyParamsSchema = Type.Object({
  taskId: Type.String({ minLength: 1 }),
  deleteFiles: Type.Optional(Type.Boolean()),
  archiveTranscripts: Type.Optional(Type.Boolean()),
});

export const TaskDestroyResultSchema = Type.Object({
  ok: Type.Literal(true),
  taskId: Type.String(),
  deletedAgents: Type.Object({
    main: Type.Number(),
    subagents: Type.Number(),
  }),
  archivedSessions: Type.Number(),
});

// Task Sessions Parameters
export const TaskSessionsParamsSchema = Type.Object({
  taskId: Type.String({ minLength: 1 }),
});

export const TaskSessionsResultSchema = Type.Object({
  ok: Type.Literal(true),
  taskId: Type.String(),
  sessions: Type.Array(
    Type.Object({
      sessionKey: Type.String(),
      agentId: Type.String(),
      agentType: Type.Union([Type.Literal("main"), Type.Literal("subagent")]),
      agentRole: Type.Optional(Type.String()),
      status: Type.Union([Type.Literal("active"), Type.Literal("stopped")]),
      createdAt: Type.Optional(Type.Number()),
    }),
  ),
});
