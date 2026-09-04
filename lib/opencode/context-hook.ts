/**
 * The OpenCode 2 `context` session hook.
 *
 * One hook now replaces two OpenCode 1 hooks: the message transform (pruning,
 * compression summaries, nudges) and the system-prompt transform. Messages run
 * first so session state is initialized before the system prompt is rendered.
 */
import type { Plugin } from "@opencode-ai/plugin"
import type { SessionContext } from "@opencode-ai/plugin/promise/session"
import type { PluginConfig } from "../config"
import type { HostPermissionSnapshot } from "../host-permissions"
import type { Logger } from "../logger"
import type { SessionState } from "../state"
import { createContextView } from "./context-view"
import type { HostModelMessage, HostSessionMessage } from "./host-types"
import type { ModelLimitResolver } from "./model-limits"
import type { CompressionTimingTracker } from "./timing"

type SystemPart = SessionContext["system"][number]

export type SystemPromptHandler = (
    input: { sessionID?: string; model: { limit: { context: number } } },
    output: { system: string[] },
) => Promise<void>

export type MessagesHandler = (input: {}, output: { messages: any[] }) => Promise<void>

export interface ContextHookDeps {
    ctx: Plugin.Context
    state: SessionState
    config: PluginConfig
    logger: Logger
    hostPermissions: HostPermissionSnapshot
    timing: CompressionTimingTracker
    modelLimits: ModelLimitResolver
    systemHandler: SystemPromptHandler
    messagesHandler: MessagesHandler
}

/** V2 compaction requests append this instruction as the final user turn. */
const V2_COMPACTION_SIGNATURE = "You MUST summarize the conversation above"

export function isCompactionRequest(messages: readonly HostModelMessage[]): boolean {
    const last = messages[messages.length - 1]
    if (!last || last.role !== "user") return false
    return last.content.some(
        (part) =>
            part.type === "text" &&
            typeof part.text === "string" &&
            part.text.includes(V2_COMPACTION_SIGNATURE),
    )
}

export function createContextHook(deps: ContextHookDeps) {
    const { ctx, state, config, logger, hostPermissions, timing, modelLimits } = deps

    return async (event: SessionContext) => {
        timing.markModelCallStart(event.sessionID)
        hostPermissions.toolAvailable = Object.prototype.hasOwnProperty.call(
            event.tools,
            "compress",
        )

        const modelMessages = event.messages as unknown as HostModelMessage[]
        const compaction = isCompactionRequest(modelMessages)

        let sessionMessages: HostSessionMessage[] = []
        try {
            sessionMessages = (await ctx.session.context({
                sessionID: event.sessionID,
            })) as unknown as HostSessionMessage[]
        } catch (error) {
            logger.warn("Failed to load session history for context hook", {
                sessionID: event.sessionID,
                error: error instanceof Error ? error.message : String(error),
            })
        }

        const view = createContextView({
            sessionID: event.sessionID,
            agent: event.agent,
            model: event.model,
            modelMessages,
            sessionMessages,
        })

        await deps.messagesHandler({}, { messages: view.messages })
        event.messages = view.apply() as unknown as SessionContext["messages"]

        if (!compaction) {
            const limit = await modelLimits.contextLimit(event.model)
            const output = { system: event.system.map((part) => part.text) }
            await deps.systemHandler(
                { sessionID: event.sessionID, model: { limit: { context: limit ?? 0 } } },
                output,
            )
            applySystemStrings(event.system, output.system)
        }

        if (state.isSubAgent && !config.experimental.allowSubAgents && "compress" in event.tools) {
            delete event.tools.compress
        }
    }
}

export function applySystemStrings(parts: SystemPart[], strings: string[]): void {
    for (let index = 0; index < strings.length; index++) {
        const text = strings[index]
        if (index < parts.length) {
            if (parts[index].text !== text) parts[index] = { ...parts[index], text }
        } else {
            parts.push({ type: "text", text })
        }
    }
    if (parts.length > strings.length) parts.length = strings.length
}
