import { formatPrunedItemsList, formatProgressBar, formatStatsHeader, formatTokenCount, } from "./utils";
export const PRUNE_REASON_LABELS = {
    completion: "Task Complete",
    noise: "Noise Removal",
    extraction: "Extraction",
};
function buildMinimalMessage(state, reason) {
    const reasonSuffix = reason ? ` — ${PRUNE_REASON_LABELS[reason]}` : "";
    return (formatStatsHeader(state.stats.totalPruneTokens, state.stats.pruneTokenCounter) +
        reasonSuffix);
}
function buildDetailedMessage(state, reason, pruneToolIds, toolMetadata, workingDirectory) {
    let message = formatStatsHeader(state.stats.totalPruneTokens, state.stats.pruneTokenCounter);
    if (pruneToolIds.length > 0) {
        const pruneTokenCounterStr = `~${formatTokenCount(state.stats.pruneTokenCounter)}`;
        const reasonLabel = reason ? ` — ${PRUNE_REASON_LABELS[reason]}` : "";
        message += `\n\n▣ Pruning (${pruneTokenCounterStr})${reasonLabel}`;
        const itemLines = formatPrunedItemsList(pruneToolIds, toolMetadata, workingDirectory);
        message += "\n" + itemLines.join("\n");
    }
    return message.trim();
}
const TOAST_BODY_MAX_LINES = 12;
const TOAST_SUMMARY_MAX_CHARS = 600;
function truncateToastBody(body, maxLines = TOAST_BODY_MAX_LINES) {
    const lines = body.split("\n");
    if (lines.length <= maxLines) {
        return body;
    }
    const kept = lines.slice(0, maxLines - 1);
    const remaining = lines.length - maxLines + 1;
    return kept.join("\n") + `\n... and ${remaining} more`;
}
function truncateToastSummary(summary, maxChars = TOAST_SUMMARY_MAX_CHARS) {
    if (summary.length <= maxChars) {
        return summary;
    }
    return summary.slice(0, maxChars - 3) + "...";
}
function truncateExtractedSection(message, maxChars = TOAST_SUMMARY_MAX_CHARS) {
    const marker = "\n\n▣ Extracted";
    const index = message.indexOf(marker);
    if (index === -1) {
        return message;
    }
    const extracted = message.slice(index);
    if (extracted.length <= maxChars) {
        return message;
    }
    return message.slice(0, index) + truncateToastSummary(extracted, maxChars);
}
export async function sendUnifiedNotification(client, logger, config, state, sessionId, pruneToolIds, toolMetadata, reason, params, workingDirectory) {
    const hasPruned = pruneToolIds.length > 0;
    if (!hasPruned) {
        return false;
    }
    if (config.pruneNotification === "off") {
        return false;
    }
    const message = config.pruneNotification === "minimal"
        ? buildMinimalMessage(state, reason)
        : buildDetailedMessage(state, reason, pruneToolIds, toolMetadata, workingDirectory);
    if (config.pruneNotificationType === "toast") {
        let toastMessage = truncateExtractedSection(message);
        toastMessage =
            config.pruneNotification === "minimal" ? toastMessage : truncateToastBody(toastMessage);
        await client.tui.showToast({
            body: {
                title: "DCP: Compress Notification",
                message: toastMessage,
                variant: "info",
                duration: 5000,
            },
        });
        return true;
    }
    await sendIgnoredMessage(client, sessionId, message, params, logger);
    return true;
}
export async function sendCompressNotification(client, logger, config, state, sessionId, compressionId, summary, summaryTokens, totalSessionTokens, sessionMessageIds, params) {
    if (config.pruneNotification === "off") {
        return false;
    }
    let message;
    const summaryTokensStr = formatTokenCount(summaryTokens);
    const compressionBlock = state.prune.messages.blocksById.get(compressionId);
    if (!compressionBlock) {
        logger.error("Compression block missing for notification", {
            compressionId,
            sessionId,
        });
    }
    const newlyCompressedToolIds = compressionBlock?.directToolIds ?? [];
    const newlyCompressedMessageIds = compressionBlock?.directMessageIds ?? [];
    const topic = compressionBlock?.topic ?? "(unknown topic)";
    const compressedTokens = compressionBlock?.compressedTokens ?? 0;
    if (config.pruneNotification === "minimal") {
        message = formatStatsHeader(state.stats.totalPruneTokens, state.stats.pruneTokenCounter);
        message += ` — Compression #${compressionId}`;
    }
    else {
        message = formatStatsHeader(state.stats.totalPruneTokens, state.stats.pruneTokenCounter);
        const pruneTokenCounterStr = `~${formatTokenCount(compressedTokens)}`;
        const activePrunedMessages = new Map();
        for (const [messageId, entry] of state.prune.messages.byMessageId) {
            if (entry.activeBlockIds.length > 0) {
                activePrunedMessages.set(messageId, entry.tokenCount);
            }
        }
        const progressBar = formatProgressBar(sessionMessageIds, activePrunedMessages, newlyCompressedMessageIds);
        const reduction = totalSessionTokens > 0 ? Math.round((compressedTokens / totalSessionTokens) * 100) : 0;
        message += `\n\n${progressBar}`;
        message += `\n▣ Compression #${compressionId} (${pruneTokenCounterStr} removed, ${reduction}% reduction)`;
        message += `\n→ Topic: ${topic}`;
        message += `\n→ Items: ${newlyCompressedMessageIds.length} messages`;
        if (newlyCompressedToolIds.length > 0) {
            message += ` and ${newlyCompressedToolIds.length} tools compressed`;
        }
        else {
            message += ` compressed`;
        }
        if (config.compress.showCompression) {
            message += `\n→ Compression (~${summaryTokensStr}): ${summary}`;
        }
    }
    if (config.pruneNotificationType === "toast") {
        let toastMessage = message;
        if (config.compress.showCompression) {
            const truncatedSummary = truncateToastSummary(summary);
            if (truncatedSummary !== summary) {
                toastMessage = toastMessage.replace(`\n→ Compression (~${summaryTokensStr}): ${summary}`, `\n→ Compression (~${summaryTokensStr}): ${truncatedSummary}`);
            }
        }
        toastMessage =
            config.pruneNotification === "minimal" ? toastMessage : truncateToastBody(toastMessage);
        await client.tui.showToast({
            body: {
                title: "DCP: Compress Notification",
                message: toastMessage,
                variant: "info",
                duration: 5000,
            },
        });
        return true;
    }
    await sendIgnoredMessage(client, sessionId, message, params, logger);
    return true;
}
export async function sendIgnoredMessage(client, sessionID, text, params, logger) {
    const agent = params.agent || undefined;
    const variant = params.variant || undefined;
    const model = params.providerId && params.modelId
        ? {
            providerID: params.providerId,
            modelID: params.modelId,
        }
        : undefined;
    try {
        await client.session.prompt({
            path: {
                id: sessionID,
            },
            body: {
                noReply: true,
                agent: agent,
                model: model,
                variant: variant,
                parts: [
                    {
                        type: "text",
                        text: text,
                        ignored: true,
                    },
                ],
            },
        });
    }
    catch (error) {
        logger.error("Failed to send notification", { error: error.message });
    }
}
//# sourceMappingURL=notification.js.map