import { buildSubagentResultText, getSubAgentId, mergeSubagentResult, } from "../../subagents/subagent-results";
import { stripHallucinationsFromString } from "../utils";
async function fetchSubAgentMessages(client, sessionId) {
    const response = await client.session.messages({
        path: { id: sessionId },
    });
    const payload = (response?.data || response);
    return Array.isArray(payload) ? payload : [];
}
export const injectExtendedSubAgentResults = async (client, state, logger, messages, allowSubAgents) => {
    if (!allowSubAgents) {
        return;
    }
    for (const message of messages) {
        const parts = Array.isArray(message.parts) ? message.parts : [];
        for (const part of parts) {
            if (part.type !== "tool" || part.tool !== "task" || !part.callID) {
                continue;
            }
            if (state.prune.tools.has(part.callID)) {
                continue;
            }
            if (part.state?.status !== "completed" || typeof part.state.output !== "string") {
                continue;
            }
            const cachedResult = state.subAgentResultCache.get(part.callID);
            if (cachedResult !== undefined) {
                if (cachedResult) {
                    part.state.output = stripHallucinationsFromString(mergeSubagentResult(part.state.output, cachedResult));
                }
                continue;
            }
            const subAgentSessionId = getSubAgentId(part);
            if (!subAgentSessionId) {
                continue;
            }
            let subAgentMessages = [];
            try {
                subAgentMessages = await fetchSubAgentMessages(client, subAgentSessionId);
            }
            catch (error) {
                logger.warn("Failed to fetch subagent session for output expansion", {
                    subAgentSessionId,
                    callID: part.callID,
                    error: error instanceof Error ? error.message : String(error),
                });
                continue;
            }
            const subAgentResultText = buildSubagentResultText(subAgentMessages);
            if (!subAgentResultText) {
                continue;
            }
            state.subAgentResultCache.set(part.callID, subAgentResultText);
            part.state.output = stripHallucinationsFromString(mergeSubagentResult(part.state.output, subAgentResultText));
        }
    }
};
//# sourceMappingURL=subagent-results.js.map