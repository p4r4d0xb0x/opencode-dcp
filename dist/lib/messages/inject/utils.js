import { createSyntheticTextPart, isIgnoredUserMessage } from "../utils";
import { getLastUserMessage } from "../../shared-utils";
import { getCurrentTokenUsage } from "../../strategies/utils";
export function getNudgeFrequency(config) {
    return Math.max(1, Math.floor(config.compress.nudgeFrequency || 1));
}
export function getIterationNudgeThreshold(config) {
    return Math.max(1, Math.floor(config.compress.iterationNudgeThreshold || 1));
}
export function findLastNonIgnoredMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.info.role === "user" && isIgnoredUserMessage(message)) {
            continue;
        }
        return { message, index: i };
    }
    return null;
}
export function countMessagesAfterIndex(messages, index) {
    let count = 0;
    for (let i = index + 1; i < messages.length; i++) {
        const message = messages[i];
        if (message.info.role === "user" && isIgnoredUserMessage(message)) {
            continue;
        }
        count++;
    }
    return count;
}
export function messageHasCompress(message) {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    return parts.some((part) => part.type === "tool" && part.state.status === "completed" && part.tool === "compress");
}
export function getModelInfo(messages) {
    const lastUserMessage = getLastUserMessage(messages);
    if (!lastUserMessage) {
        return {
            providerId: undefined,
            modelId: undefined,
        };
    }
    const userInfo = lastUserMessage.info;
    return {
        providerId: userInfo.model.providerID,
        modelId: userInfo.model.modelID,
    };
}
function resolveContextTokenLimit(config, state, providerId, modelId, threshold) {
    const parseLimitValue = (limit) => {
        if (limit === undefined) {
            return undefined;
        }
        if (typeof limit === "number") {
            return limit;
        }
        if (!limit.endsWith("%") || state.modelContextLimit === undefined) {
            return undefined;
        }
        const parsedPercent = parseFloat(limit.slice(0, -1));
        if (isNaN(parsedPercent)) {
            return undefined;
        }
        const roundedPercent = Math.round(parsedPercent);
        const clampedPercent = Math.max(0, Math.min(100, roundedPercent));
        return Math.round((clampedPercent / 100) * state.modelContextLimit);
    };
    const modelLimits = threshold === "max" ? config.compress.modelMaxLimits : config.compress.modelMinLimits;
    if (modelLimits && providerId !== undefined && modelId !== undefined) {
        const providerModelId = `${providerId}/${modelId}`;
        const modelLimit = modelLimits[providerModelId];
        if (modelLimit !== undefined) {
            return parseLimitValue(modelLimit);
        }
    }
    const globalLimit = threshold === "max" ? config.compress.maxContextLimit : config.compress.minContextLimit;
    return parseLimitValue(globalLimit);
}
export function isContextOverLimits(config, state, providerId, modelId, messages) {
    const maxContextLimit = resolveContextTokenLimit(config, state, providerId, modelId, "max");
    const minContextLimit = resolveContextTokenLimit(config, state, providerId, modelId, "min");
    const currentTokens = getCurrentTokenUsage(messages);
    const overMaxLimit = maxContextLimit === undefined ? false : currentTokens > maxContextLimit;
    const overMinLimit = minContextLimit === undefined ? true : currentTokens >= minContextLimit;
    return {
        overMaxLimit,
        overMinLimit,
    };
}
export function addAnchor(anchorMessageIds, anchorMessageId, anchorMessageIndex, messages, interval) {
    if (anchorMessageIndex < 0) {
        return false;
    }
    let latestAnchorMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (anchorMessageIds.has(messages[i].info.id)) {
            latestAnchorMessageIndex = i;
            break;
        }
    }
    const shouldAdd = latestAnchorMessageIndex < 0 || anchorMessageIndex - latestAnchorMessageIndex >= interval;
    if (!shouldAdd) {
        return false;
    }
    const previousSize = anchorMessageIds.size;
    anchorMessageIds.add(anchorMessageId);
    return anchorMessageIds.size !== previousSize;
}
export function buildCompressedBlockGuidance(state) {
    const refs = Array.from(state.prune.messages.activeBlockIds)
        .filter((id) => Number.isInteger(id) && id > 0)
        .sort((a, b) => a - b)
        .map((id) => `b${id}`);
    const blockCount = refs.length;
    const blockList = blockCount > 0 ? refs.join(", ") : "none";
    return [
        "Compressed block context:",
        `- Active compressed blocks in this session: ${blockCount} (${blockList})`,
        "- If your selected compression range includes any listed block, include each required placeholder exactly once in the summary using \`(bN)\`.",
    ].join("\n");
}
function appendGuidanceToDcpTag(hintText, guidance) {
    const closeTag = "</dcp-system-reminder>";
    const closeTagIndex = hintText.lastIndexOf(closeTag);
    if (closeTagIndex === -1) {
        return hintText;
    }
    const beforeClose = hintText.slice(0, closeTagIndex).trimEnd();
    const afterClose = hintText.slice(closeTagIndex);
    return `${beforeClose}\n\n${guidance}\n${afterClose}`;
}
function applyAnchoredNudge(anchorMessageIds, messages, hintText) {
    if (anchorMessageIds.size === 0) {
        return;
    }
    // Find the last assistant message to avoid injecting synthetic text
    // parts into it, which would cause "assistant message prefill" errors
    // on models that don't support prefill (e.g. claude-opus-4-6).
    const lastAssistantId = findLastAssistantId(messages);
    for (const anchorMessageId of anchorMessageIds) {
        const messageIndex = messages.findIndex((message) => message.info.id === anchorMessageId);
        if (messageIndex === -1) {
            continue;
        }
        const message = messages[messageIndex];
        if (message.info.role === "user") {
            message.parts.push(createSyntheticTextPart(message, hintText));
            continue;
        }
        if (message.info.role !== "assistant") {
            continue;
        }
        // Skip adding synthetic text parts to the last assistant message
        // to prevent prefill errors on models that don't support it.
        if (message.info.id === lastAssistantId) {
            continue;
        }
        const syntheticPart = createSyntheticTextPart(message, hintText);
        const firstToolIndex = message.parts.findIndex((p) => p.type === "tool");
        if (firstToolIndex === -1) {
            message.parts.push(syntheticPart);
        }
        else {
            message.parts.splice(firstToolIndex, 0, syntheticPart);
        }
    }
}
/**
 * Find the ID of the last assistant message in the array.
 * Returns undefined if no assistant message is found.
 */
function findLastAssistantId(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].info.role === "assistant") {
            return messages[i].info.id;
        }
    }
    return undefined;
}
export function applyAnchoredNudges(state, config, messages, prompts) {
    const compressedBlockGuidance = buildCompressedBlockGuidance(state);
    const contextLimitNudge = appendGuidanceToDcpTag(prompts.contextLimitNudge, compressedBlockGuidance);
    applyAnchoredNudge(state.nudges.contextLimitAnchors, messages, contextLimitNudge);
    const turnNudgeAnchors = new Set();
    const targetRole = config.compress.nudgeForce === "strong" ? "user" : "assistant";
    const turnNudge = appendGuidanceToDcpTag(prompts.turnNudge, compressedBlockGuidance);
    for (const message of messages) {
        if (!state.nudges.turnNudgeAnchors.has(message.info.id))
            continue;
        if (message.info.role === targetRole) {
            turnNudgeAnchors.add(message.info.id);
        }
    }
    applyAnchoredNudge(turnNudgeAnchors, messages, turnNudge);
    const iterationNudge = appendGuidanceToDcpTag(prompts.iterationNudge, compressedBlockGuidance);
    applyAnchoredNudge(state.nudges.iterationNudgeAnchors, messages, iterationNudge);
}
//# sourceMappingURL=utils.js.map