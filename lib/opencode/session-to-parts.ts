/**
 * Pure conversion: OpenCode 2 session history → DCP `WithParts[]`.
 *
 * Used wherever DCP needs the full stored history (compress tool, `/dcp`
 * commands, TUI panel). No I/O.
 */
import type {
    AssistantMessage,
    MessageTokens,
    ModelSelection,
    Part,
    ToolPart,
    ToolState,
    UserMessage,
} from "../session-types"
import type { WithParts } from "../state"
import {
    type HostAssistantMessage,
    type HostAssistantTool,
    type HostCompactionMessage,
    type HostSessionMessage,
    type HostShellMessage,
    type HostTokens,
    toMillis,
    toolContentToText,
} from "./host-types"

export interface SessionConversionOptions {
    sessionID: string
    /** Agent applied to user messages (V2 user messages carry no agent). */
    agent?: string
    /** Model applied to user messages (V2 user messages carry no model). */
    model?: ModelSelection
}

const UNKNOWN_AGENT = "unknown"
const UNKNOWN_MODEL: ModelSelection = { providerID: "unknown", modelID: "unknown" }

/** Metadata marker DCP attaches to its own in-chat notifications. */
export const DCP_NOTIFICATION_METADATA = { dcp: { kind: "notification" } } as const

export function isDcpNotificationMetadata(metadata: Record<string, unknown> | undefined): boolean {
    const dcp = metadata?.dcp
    return !!dcp && typeof dcp === "object" && (dcp as { kind?: unknown }).kind === "notification"
}

export function convertSessionMessages(
    messages: readonly HostSessionMessage[],
    options: SessionConversionOptions,
): WithParts[] {
    const result: WithParts[] = []
    let lastAgent = options.agent ?? UNKNOWN_AGENT
    let lastModel = options.model ?? UNKNOWN_MODEL
    let lastCreated = 0

    for (const message of messages) {
        if (!message || typeof message !== "object" || typeof message.id !== "string") continue
        const created = toMillis(message.time?.created) ?? lastCreated
        lastCreated = created

        switch (message.type) {
            case "user":
                result.push(
                    buildUserMessage(message.id, options.sessionID, created, lastAgent, lastModel, [
                        textPart(message.id, 0, message.text ?? ""),
                        ...filePartsFor(message.id, options.sessionID, message.files),
                    ]),
                )
                break
            case "synthetic":
                result.push(
                    buildUserMessage(message.id, options.sessionID, created, lastAgent, lastModel, [
                        {
                            ...textPart(message.id, 0, message.text ?? ""),
                            synthetic: true,
                            ...(isDcpNotificationMetadata(message.metadata)
                                ? { ignored: true }
                                : {}),
                        },
                    ]),
                )
                break
            case "skill":
                result.push(
                    buildUserMessage(message.id, options.sessionID, created, lastAgent, lastModel, [
                        { ...textPart(message.id, 0, message.text ?? ""), synthetic: true },
                    ]),
                )
                break
            case "shell":
                result.push(
                    buildUserMessage(message.id, options.sessionID, created, lastAgent, lastModel, [
                        { ...textPart(message.id, 0, shellText(message)), synthetic: true },
                    ]),
                )
                break
            case "assistant": {
                lastAgent = message.agent || lastAgent
                lastModel = {
                    providerID: message.model?.providerID ?? lastModel.providerID,
                    modelID: message.model?.id ?? lastModel.modelID,
                    variant: message.model?.variant,
                }
                result.push(convertAssistant(message, options.sessionID, created))
                break
            }
            case "compaction":
                if (message.status === "completed") {
                    result.push(
                        convertCompaction(
                            message,
                            options.sessionID,
                            created,
                            lastAgent,
                            lastModel,
                        ),
                    )
                }
                break
            default:
                // system notices and agent/model/location switches carry no compressible content
                break
        }
    }

    return result
}

function buildUserMessage(
    id: string,
    sessionID: string,
    created: number,
    agent: string,
    model: ModelSelection,
    parts: Part[],
): WithParts {
    const info: UserMessage = {
        id,
        sessionID,
        role: "user",
        time: { created },
        agent,
        model,
    }
    return { info, parts: parts.map((part) => ({ ...part, sessionID })) }
}

function textPart(messageID: string, index: number, text: string) {
    return {
        id: `${messageID}:text:${index}`,
        sessionID: "",
        messageID,
        type: "text" as const,
        text,
    }
}

function filePartsFor(
    messageID: string,
    sessionID: string,
    files: readonly { mime: string; name?: string }[] | undefined,
): Part[] {
    if (!Array.isArray(files)) return []
    return files.map((file, index) => ({
        id: `${messageID}:file:${index}`,
        sessionID,
        messageID,
        type: "file" as const,
        mime: file.mime,
        filename: file.name,
    }))
}

function shellText(message: HostShellMessage): string {
    const output = message.output
    const body =
        typeof output === "string"
            ? output
            : [output?.stdout, output?.stderr].filter((chunk) => !!chunk).join("\n")
    return body ? `$ ${message.command}\n${body}` : `$ ${message.command}`
}

export function normalizeTokens(tokens: HostTokens | undefined): MessageTokens {
    return {
        input: tokens?.input ?? 0,
        output: tokens?.output ?? 0,
        reasoning: tokens?.reasoning ?? 0,
        cache: {
            read: tokens?.cache?.read ?? 0,
            write: tokens?.cache?.write ?? 0,
        },
    }
}

function convertAssistant(
    message: HostAssistantMessage,
    sessionID: string,
    created: number,
): WithParts {
    const info: AssistantMessage = {
        id: message.id,
        sessionID,
        role: "assistant",
        time: {
            created,
            completed: toMillis(message.time?.completed),
        },
        agent: message.agent ?? UNKNOWN_AGENT,
        modelID: message.model?.id ?? UNKNOWN_MODEL.modelID,
        providerID: message.model?.providerID ?? UNKNOWN_MODEL.providerID,
        variant: message.model?.variant,
        cost: message.cost,
        tokens: normalizeTokens(message.tokens),
        finish: message.finish,
        summary: false,
        error: message.error,
    }

    const parts: Part[] = [
        { id: `${message.id}:step-start`, sessionID, messageID: message.id, type: "step-start" },
    ]

    const content = Array.isArray(message.content) ? message.content : []
    content.forEach((item, index) => {
        if (!item || typeof item !== "object") return
        if (item.type === "text") {
            parts.push({ ...textPart(message.id, index, item.text ?? ""), sessionID })
            return
        }
        if (item.type === "reasoning") {
            parts.push({
                id: `${message.id}:reasoning:${index}`,
                sessionID,
                messageID: message.id,
                type: "reasoning",
                text: item.text ?? "",
            })
            return
        }
        if (item.type === "tool") {
            parts.push(convertToolPart(item, sessionID, message.id))
        }
    })

    return { info, parts }
}

export function convertToolState(tool: HostAssistantTool): ToolState {
    const state = tool.state
    const start = toMillis(tool.time?.ran) ?? toMillis(tool.time?.created) ?? 0
    const end = toMillis(tool.time?.completed) ?? start
    switch (state?.status) {
        case "completed": {
            const metadata = state.metadata ?? {}
            const title = typeof metadata.title === "string" ? metadata.title : undefined
            return {
                status: "completed",
                input: state.input ?? {},
                output: toolContentToText(state.content),
                title,
                metadata,
                time: { start, end },
            }
        }
        case "error":
            return {
                status: "error",
                input: state.input ?? {},
                error: state.error?.message ?? "Tool execution failed",
                metadata: state.metadata,
                time: { start, end },
            }
        case "running":
            return {
                status: "running",
                input: state.input ?? {},
                metadata: state.metadata,
                time: { start },
            }
        default:
            return { status: "pending", input: {}, raw: state?.input ?? "" }
    }
}

export function convertToolPart(
    tool: HostAssistantTool,
    sessionID: string,
    messageID: string,
): ToolPart {
    return {
        id: `${messageID}:tool:${tool.id}`,
        sessionID,
        messageID,
        type: "tool",
        callID: tool.id,
        tool: tool.name,
        state: convertToolState(tool),
    }
}

function convertCompaction(
    message: HostCompactionMessage,
    sessionID: string,
    created: number,
    agent: string,
    model: ModelSelection,
): WithParts {
    const info: AssistantMessage = {
        id: message.id,
        sessionID,
        role: "assistant",
        time: { created },
        agent,
        modelID: model.modelID,
        providerID: model.providerID,
        variant: model.variant,
        tokens: normalizeTokens(undefined),
        summary: true,
    }
    return {
        info,
        parts: [{ ...textPart(message.id, 0, message.summary ?? ""), sessionID }],
    }
}
