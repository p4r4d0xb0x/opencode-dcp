/**
 * Pure bidirectional view between the OpenCode 2 `context` hook payload
 * (`event.messages`, model-request shaped) and DCP's `WithParts[]`.
 *
 * `createContextView` builds the DCP-facing array; after the pruning core has
 * mutated it, `apply()` rebuilds the model messages while reusing every host
 * object DCP did not touch (keeps provider metadata and prompt caches stable).
 * No I/O.
 */
import type { AssistantMessage, Part, TextPart, ToolPart, UserMessage } from "../session-types"
import type { WithParts } from "../state"
import { isIgnoredUserMessage } from "../messages/query"
import {
    type HostModelMessage,
    type HostModelPart,
    type HostModelRef,
    type HostModelToolResultPart,
    type HostSessionMessage,
    safeStringify,
    toolResultToText,
} from "./host-types"
import { convertSessionMessages, normalizeTokens } from "./session-to-parts"

export interface ContextViewInput {
    sessionID: string
    agent: string
    model: HostModelRef
    modelMessages: readonly HostModelMessage[]
    sessionMessages: readonly HostSessionMessage[]
}

export interface ContextView {
    /** DCP-facing messages. The pruning core mutates this array in place. */
    readonly messages: WithParts[]
    /** Rebuild the host model messages from the (possibly mutated) view. */
    apply(): HostModelMessage[]
}

interface PartOrigin {
    part: HostModelPart
    text?: string
    inputJson?: string
    result?: HostModelToolResultPart
    resultText?: string
    resultStatus?: "completed" | "error"
}

interface ToolGroup {
    index: number
    message: HostModelMessage
    callIds: string[]
    orphans: HostModelPart[]
}

interface MessageOrigin {
    index: number
    message: HostModelMessage
    toolGroups: ToolGroup[]
}

interface Passthrough {
    index: number
    message: HostModelMessage
}

export function createContextView(input: ContextViewInput): ContextView {
    const model = {
        providerID: input.model.providerID,
        modelID: input.model.id,
        variant: input.model.variant,
    }
    const sessionById = new Map<string, WithParts>()
    for (const message of convertSessionMessages(input.sessionMessages, {
        sessionID: input.sessionID,
        agent: input.agent,
        model,
    })) {
        sessionById.set(message.info.id, message)
    }

    const messages: WithParts[] = []
    const originByMessageId = new Map<string, MessageOrigin>()
    const originByPartId = new Map<string, PartOrigin>()
    const passthroughs: Passthrough[] = []
    let lastAssistant: { withParts: WithParts; origin: MessageOrigin } | undefined
    let lastCreated = 0

    input.modelMessages.forEach((hostMessage, index) => {
        if (!hostMessage || typeof hostMessage !== "object") return

        if (hostMessage.role === "tool") {
            if (!lastAssistant) {
                passthroughs.push({ index, message: hostMessage })
                return
            }
            attachToolResults(hostMessage, index, lastAssistant, originByPartId)
            return
        }

        if (hostMessage.role === "system" || typeof hostMessage.id !== "string") {
            passthroughs.push({ index, message: hostMessage })
            return
        }

        const sessionView = sessionById.get(hostMessage.id)
        const created = sessionView?.info.time.created ?? lastCreated
        lastCreated = created
        const origin: MessageOrigin = { index, message: hostMessage, toolGroups: [] }
        originByMessageId.set(hostMessage.id, origin)

        if (hostMessage.role === "user") {
            const withParts = buildUserView(
                hostMessage,
                sessionView,
                created,
                input,
                model,
                originByPartId,
            )
            messages.push(withParts)
            lastAssistant = undefined
            return
        }

        const withParts = buildAssistantView(
            hostMessage,
            sessionView,
            created,
            input,
            model,
            originByPartId,
        )
        messages.push(withParts)
        lastAssistant = { withParts, origin }
    })

    return {
        messages,
        apply: () =>
            enforceTerminalRole(
                input.modelMessages,
                rebuildModelMessages(messages, originByMessageId, originByPartId, passthroughs),
            ),
    }
}

/** Neutral user turn appended when a request would otherwise end with an assistant message. */
export const CONTINUATION_TEXT = "Continue."

/**
 * Guarantee the outgoing request ends with a user or tool message.
 *
 * Models without assistant prefill support (Anthropic Claude Opus and newer)
 * reject requests whose final message is an assistant turn:
 * "This model does not support assistant message prefill. The conversation
 * must end with a user message." OpenCode 2 never prefills on purpose, so a
 * trailing assistant message is always accidental — either DCP dropped the
 * host's final user/tool message, or the host handed over an interrupted turn.
 *
 * 1. Restore the host's trailing non-assistant messages that DCP removed
 *    (tool results only when their assistant is still the final message).
 * 2. Otherwise append a neutral continuation user message.
 */
export function enforceTerminalRole(
    original: readonly HostModelMessage[],
    rebuilt: HostModelMessage[],
): HostModelMessage[] {
    if (rebuilt.length === 0 || !endsWithAssistant(rebuilt)) return rebuilt

    const lastAssistantIndex = findLastIndex(original, (message) => message.role === "assistant")
    const lastAssistant = lastAssistantIndex >= 0 ? original[lastAssistantIndex] : undefined
    const tail = lastAssistantIndex >= 0 ? original.slice(lastAssistantIndex + 1) : [...original]
    const present = new Set(rebuilt)
    const finalMessage = rebuilt[rebuilt.length - 1]
    const restored = tail.filter((message) => {
        if (present.has(message)) return false
        if (message.role === "assistant") return false
        if (message.role === "tool") {
            // never re-attach tool results whose tool calls are gone
            return lastAssistant !== undefined && sameMessage(finalMessage, lastAssistant)
        }
        return true
    })

    if (restored.length > 0 && !endsWithAssistant(restored)) {
        return [...rebuilt, ...restored]
    }

    return [...rebuilt, { role: "user", content: [{ type: "text", text: CONTINUATION_TEXT }] }]
}

function endsWithAssistant(messages: readonly HostModelMessage[]): boolean {
    const last = messages[messages.length - 1]
    return last?.role === "assistant"
}

function sameMessage(a: HostModelMessage, b: HostModelMessage): boolean {
    if (a === b) return true
    return typeof a.id === "string" && a.id === b.id
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
    for (let index = items.length - 1; index >= 0; index--) {
        if (predicate(items[index])) return index
    }
    return -1
}

function buildUserView(
    hostMessage: HostModelMessage,
    sessionView: WithParts | undefined,
    created: number,
    input: ContextViewInput,
    model: UserMessage["model"],
    originByPartId: Map<string, PartOrigin>,
): WithParts {
    const id = hostMessage.id as string
    const sessionInfo = sessionView?.info.role === "user" ? sessionView.info : undefined
    const info: UserMessage = {
        id,
        sessionID: input.sessionID,
        role: "user",
        time: { created },
        agent: sessionInfo?.agent ?? input.agent,
        model: sessionInfo?.model ?? model,
    }

    const flags = sessionTextFlags(sessionView)
    const parts: Part[] = []
    hostMessage.content.forEach((hostPart, index) => {
        if (hostPart.type === "text") {
            const part: TextPart = {
                id: `${id}:text:${index}`,
                sessionID: input.sessionID,
                messageID: id,
                type: "text",
                text: typeof hostPart.text === "string" ? hostPart.text : "",
                ...(flags.synthetic ? { synthetic: true } : {}),
                ...(flags.ignored ? { ignored: true } : {}),
            }
            originByPartId.set(part.id, { part: hostPart, text: part.text })
            parts.push(part)
            return
        }
        const part: Part = {
            id: `${id}:part:${index}`,
            sessionID: input.sessionID,
            messageID: id,
            type: "file",
            ...(flags.ignored ? { ignored: true } : {}),
        }
        originByPartId.set(part.id, { part: hostPart })
        parts.push(part)
    })

    return { info, parts }
}

function sessionTextFlags(sessionView: WithParts | undefined): {
    synthetic: boolean
    ignored: boolean
} {
    if (!sessionView || sessionView.info.role !== "user") {
        return { synthetic: false, ignored: false }
    }
    const textParts = sessionView.parts.filter((part): part is TextPart => part.type === "text")
    return {
        synthetic: textParts.length > 0 && textParts.every((part) => part.synthetic === true),
        ignored: textParts.length > 0 && textParts.every((part) => part.ignored === true),
    }
}

function buildAssistantView(
    hostMessage: HostModelMessage,
    sessionView: WithParts | undefined,
    created: number,
    input: ContextViewInput,
    model: UserMessage["model"],
    originByPartId: Map<string, PartOrigin>,
): WithParts {
    const id = hostMessage.id as string
    const sessionInfo = sessionView?.info.role === "assistant" ? sessionView.info : undefined
    const info: AssistantMessage = sessionInfo
        ? { ...sessionInfo }
        : {
              id,
              sessionID: input.sessionID,
              role: "assistant",
              time: { created },
              agent: input.agent,
              modelID: model.modelID,
              providerID: model.providerID,
              variant: model.variant,
              tokens: normalizeTokens(undefined),
              summary: false,
          }

    const sessionToolsByCallId = new Map<string, ToolPart>()
    for (const part of sessionView?.parts ?? []) {
        if (part.type === "tool") sessionToolsByCallId.set(part.callID, part)
    }

    const parts: Part[] = [
        { id: `${id}:step-start`, sessionID: input.sessionID, messageID: id, type: "step-start" },
    ]

    hostMessage.content.forEach((hostPart, index) => {
        if (hostPart.type === "text") {
            const part: TextPart = {
                id: `${id}:text:${index}`,
                sessionID: input.sessionID,
                messageID: id,
                type: "text",
                text: typeof hostPart.text === "string" ? hostPart.text : "",
            }
            originByPartId.set(part.id, { part: hostPart, text: part.text })
            parts.push(part)
            return
        }
        if (hostPart.type === "reasoning") {
            const part: Part = {
                id: `${id}:reasoning:${index}`,
                sessionID: input.sessionID,
                messageID: id,
                type: "reasoning",
                text: typeof hostPart.text === "string" ? hostPart.text : "",
            }
            originByPartId.set(part.id, { part: hostPart })
            parts.push(part)
            return
        }
        if (hostPart.type === "tool-call") {
            const callID = String(hostPart.id)
            const sessionTool = sessionToolsByCallId.get(callID)
            const inputValue = normalizeToolInput(hostPart.input)
            const part: ToolPart = {
                id: `${id}:tool:${callID}`,
                sessionID: input.sessionID,
                messageID: id,
                type: "tool",
                callID,
                tool: String(hostPart.name),
                state: sessionTool
                    ? { ...sessionTool.state, input: inputValue }
                    : { status: "running", input: inputValue },
            }
            originByPartId.set(part.id, { part: hostPart, inputJson: safeStringify(inputValue) })
            parts.push(part)
            return
        }
        const part: Part = {
            id: `${id}:part:${index}`,
            sessionID: input.sessionID,
            messageID: id,
            type: "compaction",
        }
        originByPartId.set(part.id, { part: hostPart })
        parts.push(part)
    })

    return { info, parts }
}

function normalizeToolInput(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return { ...(value as Record<string, unknown>) }
    }
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value)
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed
        } catch {
            // fall through
        }
        return { input: value }
    }
    return value === undefined ? {} : { input: value }
}

function attachToolResults(
    hostMessage: HostModelMessage,
    index: number,
    lastAssistant: { withParts: WithParts; origin: MessageOrigin },
    originByPartId: Map<string, PartOrigin>,
): void {
    const group: ToolGroup = { index, message: hostMessage, callIds: [], orphans: [] }
    lastAssistant.origin.toolGroups.push(group)

    for (const hostPart of hostMessage.content) {
        if (hostPart.type !== "tool-result") {
            group.orphans.push(hostPart)
            continue
        }
        const resultPart = hostPart as HostModelToolResultPart
        const callID = String(resultPart.id)
        const toolPart = lastAssistant.withParts.parts.find(
            (part): part is ToolPart => part.type === "tool" && part.callID === callID,
        )
        if (!toolPart) {
            group.orphans.push(hostPart)
            continue
        }

        group.callIds.push(callID)
        const resultText = toolResultToText(resultPart.result)
        const resultStatus = resultPart.result?.type === "error" ? "error" : "completed"
        const previous = toolPart.state
        const time =
            previous.status === "completed" || previous.status === "error"
                ? previous.time
                : undefined
        const metadata =
            previous.status === "completed" || previous.status === "error"
                ? previous.metadata
                : undefined
        toolPart.state =
            resultStatus === "error"
                ? {
                      status: "error",
                      input: previous.input,
                      error: resultText,
                      metadata,
                      time: time ?? { start: 0, end: 0 },
                  }
                : {
                      status: "completed",
                      input: previous.input,
                      output: resultText,
                      title: previous.status === "completed" ? previous.title : undefined,
                      metadata,
                      time: time ?? { start: 0, end: 0 },
                  }

        const origin = originByPartId.get(toolPart.id)
        if (origin) {
            origin.result = resultPart
            origin.resultText = resultText
            origin.resultStatus = resultStatus
        }
    }
}

function rebuildModelMessages(
    messages: readonly WithParts[],
    originByMessageId: Map<string, MessageOrigin>,
    originByPartId: Map<string, PartOrigin>,
    passthroughs: Passthrough[],
): HostModelMessage[] {
    const out: HostModelMessage[] = []
    let cursor = 0
    const flushBefore = (index: number | undefined) => {
        while (
            cursor < passthroughs.length &&
            (index === undefined || passthroughs[cursor].index < index)
        ) {
            out.push(passthroughs[cursor].message)
            cursor++
        }
    }

    for (const withParts of messages) {
        const origin = originByMessageId.get(withParts.info.id)
        if (!origin) {
            if (withParts.info.role === "user" && isIgnoredUserMessage(withParts)) continue
            out.push(buildSyntheticModelMessage(withParts))
            continue
        }

        flushBefore(origin.index)
        if (withParts.info.role === "user") {
            if (isIgnoredUserMessage(withParts)) continue
            out.push(rebuildUserMessage(withParts, origin, originByPartId))
            continue
        }

        const { assistant, resultsByCallId } = rebuildAssistantMessage(
            withParts,
            origin,
            originByPartId,
        )
        out.push(assistant)
        for (const group of origin.toolGroups) {
            flushBefore(group.index)
            const rebuilt = rebuildToolGroup(group, resultsByCallId)
            if (rebuilt) out.push(rebuilt)
        }
        for (const [, result] of resultsByCallId) {
            out.push({ role: "tool", content: [result] })
        }
    }

    flushBefore(undefined)
    return out
}

function buildSyntheticModelMessage(withParts: WithParts): HostModelMessage {
    const content: HostModelPart[] = []
    for (const part of withParts.parts) {
        if (part.type === "text") content.push({ type: "text", text: part.text })
    }
    return {
        id: withParts.info.id,
        role: withParts.info.role === "assistant" ? "assistant" : "user",
        content,
    }
}

function rebuildUserMessage(
    withParts: WithParts,
    origin: MessageOrigin,
    originByPartId: Map<string, PartOrigin>,
): HostModelMessage {
    const content: HostModelPart[] = []
    for (const part of withParts.parts) {
        if (part.type === "text") {
            content.push(rebuildTextPart(part, originByPartId))
            continue
        }
        const partOrigin = originByPartId.get(part.id)
        if (partOrigin) content.push(partOrigin.part)
    }
    return sameOrClone(origin.message, content)
}

function rebuildTextPart(part: TextPart, originByPartId: Map<string, PartOrigin>): HostModelPart {
    const partOrigin = originByPartId.get(part.id)
    if (partOrigin && partOrigin.text === part.text) return partOrigin.part
    if (partOrigin) return { ...partOrigin.part, type: "text", text: part.text }
    return { type: "text", text: part.text }
}

function rebuildAssistantMessage(
    withParts: WithParts,
    origin: MessageOrigin,
    originByPartId: Map<string, PartOrigin>,
): { assistant: HostModelMessage; resultsByCallId: Map<string, HostModelPart> } {
    const content: HostModelPart[] = []
    const resultsByCallId = new Map<string, HostModelPart>()

    for (const part of withParts.parts) {
        if (part.type === "step-start" || part.type === "step-finish") continue
        if (part.type === "text") {
            content.push(rebuildTextPart(part, originByPartId))
            continue
        }
        const partOrigin = originByPartId.get(part.id)
        if (part.type === "tool") {
            if (!partOrigin) continue
            const inputJson = safeStringify(part.state.input)
            content.push(
                inputJson === partOrigin.inputJson
                    ? partOrigin.part
                    : { ...partOrigin.part, input: part.state.input },
            )
            const result = rebuildToolResult(part, partOrigin)
            if (result) resultsByCallId.set(part.callID, result)
            continue
        }
        if (partOrigin) content.push(partOrigin.part)
    }

    return { assistant: sameOrClone(origin.message, content), resultsByCallId }
}

function rebuildToolResult(part: ToolPart, origin: PartOrigin): HostModelPart | undefined {
    if (!origin.result) return undefined
    const state = part.state
    if (state.status === "completed") {
        if (origin.resultStatus === "completed" && origin.resultText === state.output) {
            return origin.result
        }
        return { ...origin.result, result: replaceResultText(origin.result, state.output) }
    }
    if (state.status === "error") {
        if (origin.resultStatus === "error" && origin.resultText === state.error) {
            return origin.result
        }
        return { ...origin.result, result: { type: "error", value: state.error } }
    }
    return origin.result
}

/**
 * Swap the textual payload of a tool result while keeping non-text items
 * (file attachments) of `content` results intact.
 */
function replaceResultText(
    original: HostModelToolResultPart,
    text: string,
): HostModelToolResultPart["result"] {
    const result = original.result
    if (result?.type === "content" && Array.isArray(result.value)) {
        const files = result.value.filter((item) => item?.type === "file")
        return { type: "content", value: [{ type: "text", text }, ...files] }
    }
    return { type: "text", value: text }
}

function rebuildToolGroup(
    group: ToolGroup,
    resultsByCallId: Map<string, HostModelPart>,
): HostModelMessage | undefined {
    const content: HostModelPart[] = []
    for (const hostPart of group.message.content) {
        if (hostPart.type === "tool-result") {
            const callID = String((hostPart as HostModelToolResultPart).id)
            const rebuilt = resultsByCallId.get(callID)
            if (rebuilt) {
                content.push(rebuilt)
                resultsByCallId.delete(callID)
                continue
            }
        }
        if (group.orphans.includes(hostPart)) content.push(hostPart)
    }
    if (content.length === 0) return undefined
    return sameOrClone(group.message, content)
}

function sameOrClone(message: HostModelMessage, content: HostModelPart[]): HostModelMessage {
    const original = message.content
    const unchanged =
        original.length === content.length &&
        original.every((part, index) => part === content[index])
    return unchanged ? message : { ...message, content }
}
