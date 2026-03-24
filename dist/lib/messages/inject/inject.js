import { formatMessageIdTag } from "../../message-ids";
import { compressPermission, getLastUserMessage } from "../../shared-utils";
import { saveSessionState } from "../../state/persistence";
import { appendIdToTool, createSyntheticTextPart, findLastToolPart, isIgnoredUserMessage, } from "../utils";
import { addAnchor, applyAnchoredNudges, countMessagesAfterIndex, findLastNonIgnoredMessage, getIterationNudgeThreshold, getNudgeFrequency, getModelInfo, isContextOverLimits, messageHasCompress, } from "./utils";
export const injectCompressNudges = (state, config, logger, messages, prompts) => {
    if (compressPermission(state, config) === "deny") {
        return;
    }
    if (state.manualMode) {
        return;
    }
    const lastMessage = findLastNonIgnoredMessage(messages);
    const lastAssistantMessage = messages.findLast((message) => message.info.role === "assistant");
    if (lastAssistantMessage && messageHasCompress(lastAssistantMessage)) {
        state.nudges.contextLimitAnchors.clear();
        state.nudges.turnNudgeAnchors.clear();
        state.nudges.iterationNudgeAnchors.clear();
        void saveSessionState(state, logger);
        return;
    }
    const { providerId, modelId } = getModelInfo(messages);
    let anchorsChanged = false;
    const { overMaxLimit, overMinLimit } = isContextOverLimits(config, state, providerId, modelId, messages);
    if (!overMinLimit) {
        const hadTurnAnchors = state.nudges.turnNudgeAnchors.size > 0;
        const hadIterationAnchors = state.nudges.iterationNudgeAnchors.size > 0;
        if (hadTurnAnchors || hadIterationAnchors) {
            state.nudges.turnNudgeAnchors.clear();
            state.nudges.iterationNudgeAnchors.clear();
            anchorsChanged = true;
        }
    }
    if (overMaxLimit) {
        if (lastMessage) {
            const interval = getNudgeFrequency(config);
            const added = addAnchor(state.nudges.contextLimitAnchors, lastMessage.message.info.id, lastMessage.index, messages, interval);
            if (added) {
                anchorsChanged = true;
            }
        }
    }
    else if (overMinLimit) {
        const isLastMessageUser = lastMessage?.message.info.role === "user";
        if (isLastMessageUser && lastAssistantMessage) {
            const previousSize = state.nudges.turnNudgeAnchors.size;
            state.nudges.turnNudgeAnchors.add(lastMessage.message.info.id);
            state.nudges.turnNudgeAnchors.add(lastAssistantMessage.info.id);
            if (state.nudges.turnNudgeAnchors.size !== previousSize) {
                anchorsChanged = true;
            }
        }
        const lastUserMessage = getLastUserMessage(messages);
        if (lastUserMessage && lastMessage) {
            const lastUserMessageIndex = messages.findIndex((message) => message.info.id === lastUserMessage.info.id);
            if (lastUserMessageIndex >= 0) {
                const messagesSinceUser = countMessagesAfterIndex(messages, lastUserMessageIndex);
                const iterationThreshold = getIterationNudgeThreshold(config);
                if (lastMessage.index > lastUserMessageIndex &&
                    messagesSinceUser >= iterationThreshold) {
                    const interval = getNudgeFrequency(config);
                    const added = addAnchor(state.nudges.iterationNudgeAnchors, lastMessage.message.info.id, lastMessage.index, messages, interval);
                    if (added) {
                        anchorsChanged = true;
                    }
                }
            }
        }
    }
    applyAnchoredNudges(state, config, messages, prompts);
    if (anchorsChanged) {
        void saveSessionState(state, logger);
    }
};
export const injectMessageIds = (state, config, messages) => {
    if (compressPermission(state, config) === "deny") {
        return;
    }
    // Find the last assistant message index to avoid injecting synthetic text
    // parts into it, which would cause "assistant message prefill" errors
    // on models that don't support prefill (e.g. claude-opus-4-6).
    const lastAssistantIndex = findLastAssistantIndex(messages);
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (message.info.role === "user" && isIgnoredUserMessage(message)) {
            continue;
        }
        const messageRef = state.messageIds.byRawId.get(message.info.id);
        if (!messageRef) {
            continue;
        }
        const tag = formatMessageIdTag(messageRef);
        if (message.info.role === "user") {
            message.parts.push(createSyntheticTextPart(message, tag));
            continue;
        }
        if (message.info.role !== "assistant") {
            continue;
        }
        const lastToolPart = findLastToolPart(message);
        if (lastToolPart && appendIdToTool(lastToolPart, tag)) {
            continue;
        }
        // Skip adding synthetic text parts to the last assistant message
        // to prevent prefill errors on models that don't support it.
        if (i === lastAssistantIndex) {
            continue;
        }
        const syntheticPart = createSyntheticTextPart(message, tag);
        const firstToolIndex = message.parts.findIndex((p) => p.type === "tool");
        if (firstToolIndex === -1) {
            message.parts.push(syntheticPart);
        }
        else {
            message.parts.splice(firstToolIndex, 0, syntheticPart);
        }
    }
};
/**
 * Find the index of the last assistant message in the array.
 * Returns -1 if no assistant message is found.
 */
function findLastAssistantIndex(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].info.role === "assistant") {
            return i;
        }
    }
    return -1;
}
//# sourceMappingURL=inject.js.map