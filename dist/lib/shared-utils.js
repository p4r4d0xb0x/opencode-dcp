import { resolveEffectiveCompressPermission } from "./host-permissions";
import { isIgnoredUserMessage } from "./messages/utils";
export const isMessageCompacted = (state, msg) => {
    if (msg.info.time.created < state.lastCompaction) {
        return true;
    }
    const pruneEntry = state.prune.messages.byMessageId.get(msg.info.id);
    if (pruneEntry && pruneEntry.activeBlockIds.length > 0) {
        return true;
    }
    return false;
};
export const getLastUserMessage = (messages, startIndex) => {
    const start = startIndex ?? messages.length - 1;
    for (let i = start; i >= 0; i--) {
        const msg = messages[i];
        if (msg.info.role === "user" && !isIgnoredUserMessage(msg)) {
            return msg;
        }
    }
    return null;
};
export const compressPermission = (state, config) => {
    return state.compressPermission ?? config.compress.permission;
};
export const syncCompressPermissionState = (state, config, hostPermissions, messages) => {
    const activeAgent = getLastUserMessage(messages)?.info.agent;
    state.compressPermission = resolveEffectiveCompressPermission(config.compress.permission, hostPermissions, activeAgent);
};
//# sourceMappingURL=shared-utils.js.map