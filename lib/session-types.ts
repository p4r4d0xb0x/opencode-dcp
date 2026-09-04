/**
 * DCP's internal session data model.
 *
 * These shapes mirror the OpenCode 1 session message/part contract that the
 * pruning core was written against. They are owned by DCP so the core no
 * longer depends on `@opencode-ai/sdk`; the OpenCode 2 adapter under
 * `lib/opencode/` converts host messages into this model and back.
 */

export interface MessageTokens {
    total?: number
    input: number
    output: number
    reasoning: number
    cache: {
        read: number
        write: number
    }
}

export interface ModelSelection {
    providerID: string
    modelID: string
    variant?: string
}

export interface UserMessage {
    id: string
    sessionID: string
    role: "user"
    time: {
        created: number
    }
    agent: string
    model: ModelSelection
    summary?: unknown
    system?: string
}

export interface AssistantMessage {
    id: string
    sessionID: string
    role: "assistant"
    time: {
        created: number
        completed?: number
    }
    parentID?: string
    modelID: string
    providerID: string
    mode?: string
    agent: string
    summary?: boolean
    cost?: number
    tokens: MessageTokens
    variant?: string
    finish?: string
    error?: unknown
}

export type Message = UserMessage | AssistantMessage

interface PartBase {
    id: string
    sessionID: string
    messageID: string
}

export interface TextPart extends PartBase {
    type: "text"
    text: string
    synthetic?: boolean
    ignored?: boolean
    time?: {
        start: number
        end?: number
    }
    metadata?: Record<string, unknown>
}

export interface ReasoningPart extends PartBase {
    type: "reasoning"
    text: string
    metadata?: Record<string, unknown>
    time?: {
        start: number
        end?: number
    }
}

export interface ToolStatePending {
    status: "pending"
    input: Record<string, unknown>
    raw?: string
}

export interface ToolStateRunning {
    status: "running"
    input: Record<string, unknown>
    title?: string
    metadata?: Record<string, unknown>
    time?: {
        start: number
    }
}

export interface ToolStateCompleted {
    status: "completed"
    input: Record<string, unknown>
    output: string
    title?: string
    metadata?: Record<string, unknown>
    time?: {
        start: number
        end: number
        compacted?: number
    }
}

export interface ToolStateError {
    status: "error"
    input: Record<string, unknown>
    error: string
    metadata?: Record<string, unknown>
    time?: {
        start: number
        end: number
    }
}

export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError

export interface ToolPart extends PartBase {
    type: "tool"
    callID: string
    tool: string
    state: ToolState
    metadata?: Record<string, unknown>
}

export interface StepStartPart extends PartBase {
    type: "step-start"
    snapshot?: string
}

export interface StepFinishPart extends PartBase {
    type: "step-finish"
    reason?: string
    snapshot?: string
    cost?: number
    tokens?: MessageTokens
}

/** Any other part kind the host may emit; DCP passes these through untouched. */
export interface OtherPart extends PartBase {
    type: "subtask" | "file" | "snapshot" | "patch" | "agent" | "retry" | "compaction"
    [key: string]: unknown
}

export type Part = TextPart | ReasoningPart | ToolPart | StepStartPart | StepFinishPart | OtherPart
