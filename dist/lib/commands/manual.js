/**
 * DCP Manual mode command handler.
 * Handles toggling manual mode and triggering individual tool executions.
 *
 * Usage:
 *   /dcp manual [on|off]  - Toggle manual mode or set explicit state
 *   /dcp compress [focus]  - Trigger manual compress execution
 */
import { sendIgnoredMessage } from "../ui/notification";
import { getCurrentParams } from "../strategies/utils";
import { buildCompressedBlockGuidance } from "../messages/inject/utils";
const MANUAL_MODE_ON = "Manual mode is now ON. Use /dcp compress to trigger context tools manually.";
const MANUAL_MODE_OFF = "Manual mode is now OFF.";
const COMPRESS_TRIGGER_PROMPT = [
    "<compress triggered manually>",
    "Manual mode trigger received. You must now use the compress tool.",
    "Find the most significant completed section of the conversation that can be compressed into a high-fidelity technical summary.",
    "Choose safe boundaries and preserve all critical implementation details.",
    "Return after compress with a brief explanation of what range was compressed.",
].join("\n\n");
function getTriggerPrompt(tool, state, userFocus) {
    const base = COMPRESS_TRIGGER_PROMPT;
    const compressedBlockGuidance = buildCompressedBlockGuidance(state);
    const sections = [base, compressedBlockGuidance];
    if (userFocus && userFocus.trim().length > 0) {
        sections.push(`Additional user focus:\n${userFocus.trim()}`);
    }
    return sections.join("\n\n");
}
export async function handleManualToggleCommand(ctx, modeArg) {
    const { client, state, logger, sessionId, messages } = ctx;
    if (modeArg === "on") {
        state.manualMode = "active";
    }
    else if (modeArg === "off") {
        state.manualMode = false;
    }
    else {
        state.manualMode = state.manualMode ? false : "active";
    }
    const params = getCurrentParams(state, messages, logger);
    await sendIgnoredMessage(client, sessionId, state.manualMode ? MANUAL_MODE_ON : MANUAL_MODE_OFF, params, logger);
    logger.info("Manual mode toggled", { manualMode: state.manualMode });
}
export async function handleManualTriggerCommand(ctx, tool, userFocus) {
    return getTriggerPrompt(tool, ctx.state, userFocus);
}
//# sourceMappingURL=manual.js.map