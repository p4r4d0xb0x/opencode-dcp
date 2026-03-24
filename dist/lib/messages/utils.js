import { createHash } from "node:crypto";
import { isMessageCompacted } from "../shared-utils";
const SUMMARY_ID_HASH_LENGTH = 16;
const DCP_MESSAGE_ID_TAG_REGEX = /<dcp-message-id>(?:m\d+|b\d+)<\/dcp-message-id>/g;
const DCP_SYSTEM_REMINDER_REGEX = /<dcp-system-reminder\b[^>]*>[\s\S]*?<\/dcp-system-reminder>/g;
const generateStableId = (prefix, seed) => {
    const hash = createHash("sha256").update(seed).digest("hex").slice(0, SUMMARY_ID_HASH_LENGTH);
    return `${prefix}_${hash}`;
};
export const createSyntheticUserMessage = (baseMessage, content, variant, stableSeed) => {
    const userInfo = baseMessage.info;
    const now = Date.now();
    const deterministicSeed = stableSeed?.trim() || userInfo.id;
    const messageId = generateStableId("msg_dcp_summary", deterministicSeed);
    const partId = generateStableId("prt_dcp_summary", deterministicSeed);
    return {
        info: {
            id: messageId,
            sessionID: userInfo.sessionID,
            role: "user",
            agent: userInfo.agent,
            model: userInfo.model,
            time: { created: now },
            ...(variant !== undefined && { variant }),
        },
        parts: [
            {
                id: partId,
                sessionID: userInfo.sessionID,
                messageID: messageId,
                type: "text",
                text: content,
            },
        ],
    };
};
export const createSyntheticTextPart = (baseMessage, content, stableSeed) => {
    const userInfo = baseMessage.info;
    const deterministicSeed = stableSeed?.trim() || userInfo.id;
    const partId = generateStableId("prt_dcp_text", deterministicSeed);
    return {
        id: partId,
        sessionID: userInfo.sessionID,
        messageID: userInfo.id,
        type: "text",
        text: content,
    };
};
export const appendIdToTool = (part, tag) => {
    if (part.type !== "tool") {
        return false;
    }
    if (part.state?.status !== "completed" || typeof part.state.output !== "string") {
        return false;
    }
    if (part.state.output.includes(tag)) {
        return true;
    }
    part.state.output = `${part.state.output}${tag}`;
    return true;
};
export const findLastToolPart = (message) => {
    for (let i = message.parts.length - 1; i >= 0; i--) {
        const part = message.parts[i];
        if (part.type === "tool") {
            return part;
        }
    }
    return null;
};
export function buildToolIdList(state, messages) {
    const toolIds = [];
    for (const msg of messages) {
        if (isMessageCompacted(state, msg)) {
            continue;
        }
        const parts = Array.isArray(msg.parts) ? msg.parts : [];
        if (parts.length > 0) {
            for (const part of parts) {
                if (part.type === "tool" && part.callID && part.tool) {
                    toolIds.push(part.callID);
                }
            }
        }
    }
    state.toolIdList = toolIds;
    return toolIds;
}
export const isIgnoredUserMessage = (message) => {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    if (parts.length === 0) {
        return true;
    }
    for (const part of parts) {
        if (!part.ignored) {
            return false;
        }
    }
    return true;
};
export const stripHallucinationsFromString = (text) => {
    return text.replace(DCP_SYSTEM_REMINDER_REGEX, "").replace(DCP_MESSAGE_ID_TAG_REGEX, "");
};
export const stripHallucinations = (messages) => {
    for (const message of messages) {
        for (const part of message.parts) {
            if (part.type === "text" && typeof part.text === "string") {
                part.text = stripHallucinationsFromString(part.text);
            }
            if (part.type === "tool" &&
                part.state?.status === "completed" &&
                typeof part.state.output === "string") {
                part.state.output = stripHallucinationsFromString(part.state.output);
            }
        }
    }
};
//# sourceMappingURL=utils.js.map