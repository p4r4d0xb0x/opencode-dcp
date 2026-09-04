/**
 * Compression timing for OpenCode 2.
 *
 * OpenCode 1 exposed tool part lifecycle events (pending → running) that DCP
 * used to measure how long the model spent producing a compress call. V2 has
 * no part events, so the same metric is derived from the `context` hook (model
 * call start) and the `execute.before` tool hook (compress call handed to DCP).
 */
import type { Plugin } from "@opencode-ai/plugin"
import { buildCompressionTimingKey } from "../compress/timing"
import type { Logger } from "../logger"
import type { SessionState } from "../state"

export interface CompressionTimingTracker {
    /** Record that a model call started for the session. */
    markModelCallStart(sessionID: string, at?: number): void
    /** Register the tool hooks that turn compress calls into pending durations. */
    register(ctx: Plugin.Context): Promise<{ dispose(): Promise<void> }[]>
}

export function createCompressionTimingTracker(
    state: SessionState,
    logger: Logger,
): CompressionTimingTracker {
    const modelCallStartBySession = new Map<string, number>()

    return {
        markModelCallStart(sessionID, at = Date.now()) {
            modelCallStartBySession.set(sessionID, at)
        },
        async register(ctx) {
            const before = await ctx.tool.hook("execute.before", (event) => {
                if (event.tool !== "compress") return
                const startedAt = modelCallStartBySession.get(event.sessionID)
                if (startedAt === undefined) return
                const durationMs = Math.max(0, Date.now() - startedAt)
                const key = buildCompressionTimingKey(event.messageID, event.id)
                state.compressionTiming.pendingByCallId.set(key, {
                    messageId: event.messageID,
                    callId: event.id,
                    durationMs,
                })
                logger.debug("Recorded compression duration", {
                    messageID: event.messageID,
                    callID: event.id,
                    durationMs,
                })
            })
            const after = await ctx.tool.hook("execute.after", (event) => {
                if (event.tool !== "compress" || event.status !== "error") return
                const key = buildCompressionTimingKey(event.messageID, event.id)
                state.compressionTiming.pendingByCallId.delete(key)
            })
            return [before, after]
        },
    }
}
