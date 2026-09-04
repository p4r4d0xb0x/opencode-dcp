import type { PluginConfig } from "../config"
import type { Logger } from "../logger"
import type { PromptStore } from "../prompts/store"
import type { CompressionBlock, CompressionMode, SessionState, WithParts } from "../state"

export interface ToolContext {
    client: any
    state: SessionState
    logger: Logger
    config: PluginConfig
    prompts: PromptStore
}

/**
 * Per-invocation context handed to a DCP tool by the host adapter.
 * Mirrors the OpenCode 1 tool context so the pipeline stays host-agnostic.
 */
export interface ToolRunContext {
    sessionID: string
    messageID: string
    callID?: string
    agent?: string
    ask(input: {
        permission: string
        patterns: string[]
        always: string[]
        metadata: Record<string, unknown>
    }): Promise<void>
    metadata(input: { title: string }): void
}

/** Minimal JSON Schema subset used to describe DCP tool inputs. */
export interface JsonSchemaObject {
    type: "object"
    properties: Record<string, JsonSchemaValue>
    required?: string[]
    additionalProperties?: boolean
}

export interface JsonSchemaValue {
    type: "string" | "number" | "boolean" | "array" | "object"
    description?: string
    items?: JsonSchemaValue | JsonSchemaObject
    properties?: Record<string, JsonSchemaValue>
    required?: string[]
    additionalProperties?: boolean
}

/** Host-agnostic tool definition produced by the compress tool factories. */
export interface DcpToolDefinition<Args = unknown> {
    name: string
    description: string
    input: JsonSchemaObject
    execute(args: Args, toolCtx: ToolRunContext): Promise<string>
}

export interface CompressRangeEntry {
    startId: string
    endId: string
    summary: string
}

export interface CompressRangeToolArgs {
    topic: string
    content: CompressRangeEntry[]
}

export interface CompressMessageEntry {
    messageId: string
    topic: string
    summary: string
}

export interface CompressMessageToolArgs {
    topic: string
    content: CompressMessageEntry[]
}

export interface BoundaryReference {
    kind: "message" | "compressed-block"
    rawIndex: number
    messageId?: string
    blockId?: number
    anchorMessageId?: string
}

export interface SearchContext {
    rawMessages: WithParts[]
    rawMessagesById: Map<string, WithParts>
    rawIndexById: Map<string, number>
    summaryByBlockId: Map<number, CompressionBlock>
}

export interface SelectionResolution {
    startReference: BoundaryReference
    endReference: BoundaryReference
    messageIds: string[]
    messageTokenById: Map<string, number>
    toolIds: string[]
    requiredBlockIds: number[]
}

export interface ResolvedMessageCompression {
    entry: CompressMessageEntry
    selection: SelectionResolution
    anchorMessageId: string
}

export interface ResolvedRangeCompression {
    index: number
    entry: CompressRangeEntry
    selection: SelectionResolution
    anchorMessageId: string
}

export interface ResolvedMessageCompressionsResult {
    plans: ResolvedMessageCompression[]
    skippedIssues: string[]
    skippedCount: number
}

export interface ParsedBlockPlaceholder {
    raw: string
    blockId: number
    startIndex: number
    endIndex: number
}

export interface InjectedSummaryResult {
    expandedSummary: string
    consumedBlockIds: number[]
}

export interface AppliedCompressionResult {
    compressedTokens: number
    messageIds: string[]
    newlyCompressedMessageIds: string[]
    newlyCompressedToolIds: string[]
}

export interface CompressionStateInput {
    topic: string
    batchTopic: string
    startId: string
    endId: string
    mode: CompressionMode
    runId: number
    compressMessageId: string
    compressCallId?: string
    summaryTokens: number
}
