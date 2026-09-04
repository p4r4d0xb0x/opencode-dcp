import type { DcpToolDefinition, JsonSchemaObject, ToolContext, ToolRunContext } from "./types"
import { countTokens } from "../token-utils"
import { MESSAGE_FORMAT_EXTENSION } from "../prompts/extensions/tool"
import { formatIssues, formatResult, resolveMessages, validateArgs } from "./message-utils"
import { finalizeSession, prepareSession, type NotificationEntry } from "./pipeline"
import { appendProtectedPromptInfo, appendProtectedTools } from "./protected-content"
import {
    allocateBlockId,
    allocateRunId,
    applyCompressionState,
    wrapCompressedSummary,
} from "./state"
import type { CompressMessageToolArgs } from "./types"

function buildSchema(): JsonSchemaObject {
    return {
        type: "object",
        properties: {
            topic: {
                type: "string",
                description:
                    "Short label (3-5 words) for the overall batch - e.g., 'Closed Research Notes'",
            },
            content: {
                type: "array",
                description: "Batch of individual message summaries to create in one tool call",
                items: {
                    type: "object",
                    properties: {
                        messageId: {
                            type: "string",
                            description: "Raw message ID to compress (e.g. m0001)",
                        },
                        topic: {
                            type: "string",
                            description: "Short label (3-5 words) for this one message summary",
                        },
                        summary: {
                            type: "string",
                            description: "Complete technical summary replacing that one message",
                        },
                    },
                    required: ["messageId", "topic", "summary"],
                    additionalProperties: false,
                },
            },
        },
        required: ["topic", "content"],
        additionalProperties: false,
    }
}

export function createCompressMessageTool(
    ctx: ToolContext,
): DcpToolDefinition<CompressMessageToolArgs> {
    ctx.prompts.reload()
    const runtimePrompts = ctx.prompts.getRuntimePrompts()

    return {
        name: "compress",
        description: runtimePrompts.compressMessage + MESSAGE_FORMAT_EXTENSION,
        input: buildSchema(),
        async execute(args: CompressMessageToolArgs, toolCtx: ToolRunContext) {
            const input = args
            validateArgs(input)
            const callId = typeof toolCtx.callID === "string" ? toolCtx.callID : undefined

            const { rawMessages, searchContext } = await prepareSession(
                ctx,
                toolCtx,
                `Compress Message: ${input.topic}`,
            )
            const { plans, skippedIssues, skippedCount } = resolveMessages(
                input,
                searchContext,
                ctx.state,
                ctx.config,
            )

            if (plans.length === 0 && skippedCount > 0) {
                throw new Error(formatIssues(skippedIssues, skippedCount))
            }

            const notifications: NotificationEntry[] = []

            const preparedPlans: Array<{
                plan: (typeof plans)[number]
                summaryWithTools: string
            }> = []

            for (const plan of plans) {
                const summaryWithPromptInfo = appendProtectedPromptInfo(
                    plan.entry.summary,
                    plan.selection,
                    searchContext,
                    ctx.state,
                    ctx.config.compress.protectTags,
                )

                const summaryWithTools = await appendProtectedTools(
                    ctx.client,
                    ctx.state,
                    ctx.config.experimental.allowSubAgents,
                    summaryWithPromptInfo,
                    plan.selection,
                    searchContext,
                    ctx.config.compress.protectedTools,
                    ctx.config.protectedFilePatterns,
                )

                preparedPlans.push({
                    plan,
                    summaryWithTools,
                })
            }

            const runId = allocateRunId(ctx.state)

            for (const { plan, summaryWithTools } of preparedPlans) {
                const blockId = allocateBlockId(ctx.state)
                const storedSummary = wrapCompressedSummary(blockId, summaryWithTools)
                const summaryTokens = countTokens(storedSummary)

                applyCompressionState(
                    ctx.state,
                    {
                        topic: plan.entry.topic,
                        batchTopic: input.topic,
                        startId: plan.entry.messageId,
                        endId: plan.entry.messageId,
                        mode: "message",
                        runId,
                        compressMessageId: toolCtx.messageID,
                        compressCallId: callId,
                        summaryTokens,
                    },
                    plan.selection,
                    plan.anchorMessageId,
                    blockId,
                    storedSummary,
                    [],
                )

                notifications.push({
                    blockId,
                    runId,
                    summary: summaryWithTools,
                    summaryTokens,
                })
            }

            await finalizeSession(ctx, toolCtx, rawMessages, notifications, input.topic)

            return formatResult(plans.length, skippedIssues, skippedCount)
        },
    }
}
