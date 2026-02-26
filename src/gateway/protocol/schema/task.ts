import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

const BootstrapFilesSchema = Type.Object(
  {
    "AGENTS.md": Type.Optional(Type.String()),
    "SOUL.md": Type.Optional(Type.String()),
    "TOOLS.md": Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const PredefinedSubagentSchema = Type.Object(
  {
    role: NonEmptyString,
    label: Type.Optional(Type.String()),
    bootstrapFiles: Type.Optional(BootstrapFilesSchema),
    bootstrapFilesUrls: Type.Optional(BootstrapFilesSchema),
    model: Type.Optional(Type.String()),
    skills: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

const TaskOptionsSchema = Type.Object(
  {
    ttlHours: Type.Optional(Type.Number({ minimum: 1 })),
    idleTtlMinutes: Type.Optional(Type.Number({ minimum: 1 })),
    archiveTranscripts: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const TaskCreateParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    mainAgent: Type.Object(
      {
        name: NonEmptyString,
        bootstrapFiles: Type.Optional(BootstrapFilesSchema),
        bootstrapFilesUrls: Type.Optional(BootstrapFilesSchema),
        model: Type.Optional(Type.String()),
        predefinedSubagents: Type.Optional(Type.Array(PredefinedSubagentSchema)),
      },
      { additionalProperties: false },
    ),
    options: Type.Optional(TaskOptionsSchema),
  },
  { additionalProperties: false },
);

const SubagentInfoSchema = Type.Object(
  {
    role: NonEmptyString,
    sessionKey: Type.Optional(NonEmptyString),
    ready: Type.Boolean(),
    error: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const TaskCreateResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    taskId: NonEmptyString,
    mainAgent: Type.Object(
      {
        agentId: NonEmptyString,
        sessionKey: NonEmptyString,
      },
      { additionalProperties: false },
    ),
    predefinedSubagents: Type.Array(SubagentInfoSchema),
    status: Type.Literal("ready"),
  },
  { additionalProperties: false },
);

export const TaskDestroyParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    deleteFiles: Type.Optional(Type.Boolean()),
    archiveTranscripts: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const TaskDestroyResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    taskId: NonEmptyString,
    deletedAgents: Type.Object(
      {
        main: Type.Integer({ minimum: 0 }),
        subagents: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    archivedSessions: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const TaskSessionsParamsSchema = Type.Object(
  {
    taskId: NonEmptyString,
    includeInactive: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const TaskSessionInfoSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    agentId: NonEmptyString,
    agentType: Type.Union([Type.Literal("main"), Type.Literal("subagent")]),
    agentRole: Type.Optional(Type.String()),
    status: Type.Union([Type.Literal("active"), Type.Literal("stopped")]),
    createdAt: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
);

export const TaskSessionsResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    taskId: NonEmptyString,
    sessions: Type.Array(TaskSessionInfoSchema),
  },
  { additionalProperties: false },
);
