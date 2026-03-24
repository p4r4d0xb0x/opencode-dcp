/**
 * DCP Help command handler.
 * Shows available DCP commands and their descriptions.
 */
import { compressPermission } from "../shared-utils";
import { sendIgnoredMessage } from "../ui/notification";
import { getCurrentParams } from "../strategies/utils";
const BASE_COMMANDS = [
    ["/dcp context", "Show token usage breakdown for current session"],
    ["/dcp stats", "Show DCP pruning statistics"],
    ["/dcp sweep [n]", "Prune tools since last user message, or last n tools"],
    ["/dcp manual [on|off]", "Toggle manual mode or set explicit state"],
];
const TOOL_COMMANDS = {
    compress: ["/dcp compress [focus]", "Trigger manual compress tool execution"],
    decompress: ["/dcp decompress <n>", "Restore selected compression"],
    recompress: ["/dcp recompress <n>", "Re-apply a user-decompressed compression"],
};
function getVisibleCommands(state, config) {
    const commands = [...BASE_COMMANDS];
    if (compressPermission(state, config) !== "deny") {
        commands.push(TOOL_COMMANDS.compress);
        commands.push(TOOL_COMMANDS.decompress);
        commands.push(TOOL_COMMANDS.recompress);
    }
    return commands;
}
function formatHelpMessage(state, config) {
    const commands = getVisibleCommands(state, config);
    const colWidth = Math.max(...commands.map(([cmd]) => cmd.length)) + 4;
    const lines = [];
    lines.push("╭─────────────────────────────────────────────────────────────────────────╮");
    lines.push("│                              DCP Commands                               │");
    lines.push("╰─────────────────────────────────────────────────────────────────────────╯");
    lines.push("");
    lines.push(`  ${"Manual mode:".padEnd(colWidth)}${state.manualMode ? "ON" : "OFF"}`);
    lines.push("");
    for (const [cmd, desc] of commands) {
        lines.push(`  ${cmd.padEnd(colWidth)}${desc}`);
    }
    lines.push("");
    return lines.join("\n");
}
export async function handleHelpCommand(ctx) {
    const { client, state, logger, sessionId, messages } = ctx;
    const { config } = ctx;
    const message = formatHelpMessage(state, config);
    const params = getCurrentParams(state, messages, logger);
    await sendIgnoredMessage(client, sessionId, message, params, logger);
    logger.info("Help command executed");
}
//# sourceMappingURL=help.js.map