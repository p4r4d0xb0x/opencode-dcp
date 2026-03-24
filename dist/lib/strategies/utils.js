import { countTokens as anthropicCountTokens } from "@anthropic-ai/tokenizer";
import { getLastUserMessage } from "../shared-utils";
/**
 * Get current token usage from the last assistant message.
 * Returns total tokens (input + output + reasoning + cache).
 */
export function getCurrentTokenUsage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.info.role === "assistant") {
            const assistantInfo = msg.info;
            if (assistantInfo.tokens?.output > 0) {
                const input = assistantInfo.tokens?.input || 0;
                const output = assistantInfo.tokens?.output || 0;
                const reasoning = assistantInfo.tokens?.reasoning || 0;
                const cacheRead = assistantInfo.tokens?.cache?.read || 0;
                const cacheWrite = assistantInfo.tokens?.cache?.write || 0;
                return input + output + reasoning + cacheRead + cacheWrite;
            }
        }
    }
    return 0;
}
export function getCurrentParams(state, messages, logger) {
    const userMsg = getLastUserMessage(messages);
    if (!userMsg) {
        logger.debug("No user message found when determining current params");
        return {
            providerId: undefined,
            modelId: undefined,
            agent: undefined,
            variant: state.variant,
        };
    }
    const userInfo = userMsg.info;
    const agent = userInfo.agent;
    const providerId = userInfo.model.providerID;
    const modelId = userInfo.model.modelID;
    const variant = state.variant ?? userInfo.variant;
    return { providerId, modelId, agent, variant };
}
export function countTokens(text) {
    if (!text)
        return 0;
    try {
        return anthropicCountTokens(text);
    }
    catch {
        return Math.round(text.length / 4);
    }
}
export function estimateTokensBatch(texts) {
    if (texts.length === 0)
        return 0;
    return countTokens(texts.join(" "));
}
export function extractToolContent(part) {
    const contents = [];
    if (part.tool === "question") {
        const questions = part.state?.input?.questions;
        if (questions !== undefined) {
            const content = typeof questions === "string" ? questions : JSON.stringify(questions);
            contents.push(content);
        }
        return contents;
    }
    if (part.tool === "edit" || part.tool === "write") {
        if (part.state?.input) {
            const inputContent = typeof part.state.input === "string"
                ? part.state.input
                : JSON.stringify(part.state.input);
            contents.push(inputContent);
        }
    }
    if (part.state?.status === "completed" && part.state?.output) {
        const content = typeof part.state.output === "string"
            ? part.state.output
            : JSON.stringify(part.state.output);
        contents.push(content);
    }
    else if (part.state?.status === "error" && part.state?.error) {
        const content = typeof part.state.error === "string"
            ? part.state.error
            : JSON.stringify(part.state.error);
        contents.push(content);
    }
    return contents;
}
export function countToolTokens(part) {
    const contents = extractToolContent(part);
    return estimateTokensBatch(contents);
}
export function getTotalToolTokens(state, toolIds) {
    let total = 0;
    for (const id of toolIds) {
        const entry = state.toolParameters.get(id);
        total += entry?.tokenCount ?? 0;
    }
    return total;
}
export function countMessageTextTokens(msg) {
    const texts = [];
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    for (const part of parts) {
        if (part.type === "text") {
            texts.push(part.text);
        }
    }
    if (texts.length === 0)
        return 0;
    return estimateTokensBatch(texts);
}
export function countAllMessageTokens(msg) {
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    const texts = [];
    for (const part of parts) {
        if (part.type === "text") {
            texts.push(part.text);
        }
        else {
            texts.push(...extractToolContent(part));
        }
    }
    if (texts.length === 0)
        return 0;
    return estimateTokensBatch(texts);
}
//# sourceMappingURL=utils.js.map