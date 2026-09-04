/**
 * Structural views of the OpenCode 2 data DCP reads.
 *
 * These are deliberately loose (optional fields, `unknown` payloads) so the
 * converters stay tolerant of beta schema drift and remain unit-testable
 * without the host packages. Only the fields DCP actually consumes are named.
 */

export type HostTime = number | string | Date | undefined

export interface HostToolContentText {
    type: "text"
    text: string
}

export interface HostToolContentFile {
    type: "file"
    uri: string
    mime: string
    name?: string
}

export type HostToolContent = HostToolContentText | HostToolContentFile

export interface HostToolStateStreaming {
    status: "streaming"
    input: string
}

export interface HostToolStateRunning {
    status: "running"
    input: Record<string, unknown>
    metadata?: Record<string, unknown>
}

export interface HostToolStateCompleted {
    status: "completed"
    input: Record<string, unknown>
    content: readonly HostToolContent[]
    metadata?: Record<string, unknown>
}

export interface HostToolStateError {
    status: "error"
    input: Record<string, unknown>
    error: { type: string; message: string; status?: number }
    content?: readonly HostToolContent[]
    metadata?: Record<string, unknown>
}

export type HostToolState =
    | HostToolStateStreaming
    | HostToolStateRunning
    | HostToolStateCompleted
    | HostToolStateError

export interface HostAssistantTool {
    type: "tool"
    id: string
    name: string
    state: HostToolState
    time?: { created?: HostTime; ran?: HostTime; completed?: HostTime }
}

export interface HostAssistantText {
    type: "text"
    text: string
}

export interface HostAssistantReasoning {
    type: "reasoning"
    text: string
}

export type HostAssistantContent = HostAssistantText | HostAssistantReasoning | HostAssistantTool

export interface HostTokens {
    input?: number
    output?: number
    reasoning?: number
    cache?: { read?: number; write?: number }
}

interface HostSessionMessageBase {
    id: string
    time: { created?: HostTime; completed?: HostTime }
    metadata?: Record<string, unknown>
}

export interface HostUserMessage extends HostSessionMessageBase {
    type: "user"
    text: string
    files?: readonly { data?: string; mime: string; name?: string }[]
}

export interface HostSyntheticMessage extends HostSessionMessageBase {
    type: "synthetic"
    text: string
    description?: string
}

export interface HostSystemMessage extends HostSessionMessageBase {
    type: "system"
    text: string
    description?: string
}

export interface HostSkillMessage extends HostSessionMessageBase {
    type: "skill"
    skill: string
    name: string
    text: string
}

export interface HostShellMessage extends HostSessionMessageBase {
    type: "shell"
    command: string
    status: string
    exit?: number
    output?: { stdout?: string; stderr?: string } | string
}

export interface HostAssistantMessage extends HostSessionMessageBase {
    type: "assistant"
    agent: string
    model: { id: string; providerID: string; variant?: string }
    content: readonly HostAssistantContent[]
    finish?: string
    cost?: number
    tokens?: HostTokens
    error?: { type: string; message: string }
}

export interface HostCompactionMessage extends HostSessionMessageBase {
    type: "compaction"
    status: "running" | "completed" | "failed"
    reason?: string
    summary?: string
}

export interface HostOtherMessage extends HostSessionMessageBase {
    type: "agent-switched" | "model-switched" | "location-switched"
}

export type HostSessionMessage =
    | HostUserMessage
    | HostSyntheticMessage
    | HostSystemMessage
    | HostSkillMessage
    | HostShellMessage
    | HostAssistantMessage
    | HostCompactionMessage
    | HostOtherMessage

/** Model-request message as delivered to the `context` session hook. */
export interface HostModelTextPart {
    type: "text"
    text: string
    [key: string]: unknown
}

export interface HostModelToolCallPart {
    type: "tool-call"
    id: string
    name: string
    input: unknown
    [key: string]: unknown
}

export type HostToolResultValue =
    | { type: "json"; value: unknown }
    | { type: "text"; value: unknown }
    | { type: "error"; value: unknown }
    | { type: "content"; value: readonly HostToolContent[] }

export interface HostModelToolResultPart {
    type: "tool-result"
    id: string
    name: string
    result: HostToolResultValue
    [key: string]: unknown
}

export interface HostModelReasoningPart {
    type: "reasoning"
    text: string
    [key: string]: unknown
}

export interface HostModelOtherPart {
    type: "media" | "compaction" | (string & {})
    [key: string]: unknown
}

export type HostModelPart =
    | HostModelTextPart
    | HostModelToolCallPart
    | HostModelToolResultPart
    | HostModelReasoningPart
    | HostModelOtherPart

export interface HostModelMessage {
    id?: string
    role: "system" | "user" | "assistant" | "tool"
    content: HostModelPart[]
    metadata?: Record<string, unknown>
    [key: string]: unknown
}

export interface HostModelRef {
    providerID: string
    id: string
    variant?: string
}

export function toMillis(value: HostTime): number | undefined {
    if (value === undefined || value === null) return undefined
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined
    if (value instanceof Date) return value.getTime()
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

export function toolContentToText(content: readonly HostToolContent[] | undefined): string {
    if (!Array.isArray(content)) return ""
    const chunks: string[] = []
    for (const item of content) {
        if (!item || typeof item !== "object") continue
        if (item.type === "text" && typeof item.text === "string") {
            chunks.push(item.text)
        } else if (item.type === "file") {
            const label = item.name ? `${item.name} (${item.mime})` : item.mime
            chunks.push(`[file: ${label}] ${item.uri}`)
        }
    }
    return chunks.join("\n")
}

export function toolResultToText(result: HostToolResultValue | undefined): string {
    if (!result || typeof result !== "object") return ""
    switch (result.type) {
        case "text":
        case "error":
            return typeof result.value === "string" ? result.value : safeStringify(result.value)
        case "json":
            return safeStringify(result.value)
        case "content":
            return toolContentToText(result.value)
        default:
            return safeStringify((result as { value?: unknown }).value)
    }
}

export function safeStringify(value: unknown): string {
    if (value === undefined) return ""
    if (typeof value === "string") return value
    try {
        return JSON.stringify(value) ?? ""
    } catch {
        return String(value)
    }
}
