import { assignMessageRefs } from "./message-ids";
import { syncToolCache } from "./state/tool-cache";
import { prune, syncCompressionBlocks, injectCompressNudges, injectMessageIds, injectExtendedSubAgentResults, stripStaleMetadata, } from "./messages";
import { buildToolIdList, isIgnoredUserMessage, stripHallucinations } from "./messages/utils";
import { checkSession } from "./state";
import { renderSystemPrompt } from "./prompts";
import { handleStatsCommand } from "./commands/stats";
import { handleContextCommand } from "./commands/context";
import { handleHelpCommand } from "./commands/help";
import { handleSweepCommand } from "./commands/sweep";
import { handleManualToggleCommand, handleManualTriggerCommand } from "./commands/manual";
import { handleDecompressCommand } from "./commands/decompress";
import { handleRecompressCommand } from "./commands/recompress";
import { compressPermission, syncCompressPermissionState } from "./shared-utils";
import { ensureSessionInitialized } from "./state/state";
import { cacheSystemPromptTokens } from "./ui/utils";
const INTERNAL_AGENT_SIGNATURES = [
    "You are a title generator",
    "You are a helpful AI assistant tasked with summarizing conversations",
    "Summarize what was done in this conversation",
];
const DCP_MESSAGE_ID_TAG_REGEX = /<dcp-message-id>(?:m\d+|b\d+)<\/dcp-message-id>/g;
const DCP_SYSTEM_REMINDER_REGEX = /<dcp-system-reminder\b[^>]*>[\s\S]*?<\/dcp-system-reminder>/g;
function applyManualPrompt(state, messages, logger) {
    const pending = state.pendingManualTrigger;
    if (!pending) {
        return;
    }
    if (!state.sessionId || pending.sessionId !== state.sessionId) {
        state.pendingManualTrigger = null;
        return;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.info.role !== "user" || isIgnoredUserMessage(msg)) {
            continue;
        }
        for (const part of msg.parts) {
            if (part.type !== "text" || part.ignored || part.synthetic) {
                continue;
            }
            part.text = pending.prompt;
            state.pendingManualTrigger = null;
            logger.debug("Applied manual prompt", { sessionId: pending.sessionId });
            return;
        }
    }
    state.pendingManualTrigger = null;
}
export function createSystemPromptHandler(state, logger, config, prompts) {
    return async (input, output) => {
        if (input.model?.limit?.context) {
            state.modelContextLimit = input.model.limit.context;
            logger.debug("Cached model context limit", { limit: state.modelContextLimit });
        }
        if (state.isSubAgent && !config.experimental.allowSubAgents) {
            return;
        }
        const systemText = output.system.join("\n");
        if (INTERNAL_AGENT_SIGNATURES.some((sig) => systemText.includes(sig))) {
            logger.info("Skipping DCP system prompt injection for internal agent");
            return;
        }
        const effectivePermission = input.sessionID && state.sessionId === input.sessionID
            ? compressPermission(state, config)
            : config.compress.permission;
        if (effectivePermission === "deny") {
            return;
        }
        prompts.reload();
        const runtimePrompts = prompts.getRuntimePrompts();
        const newPrompt = renderSystemPrompt(runtimePrompts, !!state.manualMode, state.isSubAgent && config.experimental.allowSubAgents);
        if (output.system.length > 0) {
            output.system[output.system.length - 1] += "\n\n" + newPrompt;
        }
        else {
            output.system.push(newPrompt);
        }
    };
}
export function createChatMessageTransformHandler(client, state, logger, config, prompts, hostPermissions) {
    return async (input, output) => {
        await checkSession(client, state, logger, output.messages, config.manualMode.enabled);
        syncCompressPermissionState(state, config, hostPermissions, output.messages);
        if (state.isSubAgent && !config.experimental.allowSubAgents) {
            return;
        }
        stripHallucinations(output.messages);
        cacheSystemPromptTokens(state, output.messages);
        assignMessageRefs(state, output.messages);
        syncCompressionBlocks(state, logger, output.messages);
        syncToolCache(state, config, logger, output.messages);
        buildToolIdList(state, output.messages);
        prune(state, logger, config, output.messages);
        await injectExtendedSubAgentResults(client, state, logger, output.messages, config.experimental.allowSubAgents);
        prompts.reload();
        injectCompressNudges(state, config, logger, output.messages, prompts.getRuntimePrompts());
        injectMessageIds(state, config, output.messages);
        applyManualPrompt(state, output.messages, logger);
        stripStaleMetadata(output.messages);
        if (state.sessionId) {
            await logger.saveContext(state.sessionId, output.messages);
        }
    };
}
export function createCommandExecuteHandler(client, state, logger, config, workingDirectory, hostPermissions) {
    return async (input, output) => {
        if (!config.commands.enabled) {
            return;
        }
        if (input.command === "dcp") {
            const messagesResponse = await client.session.messages({
                path: { id: input.sessionID },
            });
            const messages = (messagesResponse.data || messagesResponse);
            await ensureSessionInitialized(client, state, input.sessionID, logger, messages, config.manualMode.enabled);
            syncCompressPermissionState(state, config, hostPermissions, messages);
            const effectivePermission = compressPermission(state, config);
            const args = (input.arguments || "").trim().split(/\s+/).filter(Boolean);
            const subcommand = args[0]?.toLowerCase() || "";
            const subArgs = args.slice(1);
            const commandCtx = {
                client,
                state,
                config,
                logger,
                sessionId: input.sessionID,
                messages,
            };
            if (subcommand === "context") {
                await handleContextCommand(commandCtx);
                throw new Error("__DCP_CONTEXT_HANDLED__");
            }
            if (subcommand === "stats") {
                await handleStatsCommand(commandCtx);
                throw new Error("__DCP_STATS_HANDLED__");
            }
            if (subcommand === "sweep") {
                await handleSweepCommand({
                    ...commandCtx,
                    args: subArgs,
                    workingDirectory,
                });
                throw new Error("__DCP_SWEEP_HANDLED__");
            }
            if (subcommand === "manual") {
                await handleManualToggleCommand(commandCtx, subArgs[0]?.toLowerCase());
                throw new Error("__DCP_MANUAL_HANDLED__");
            }
            if (subcommand === "compress" && effectivePermission !== "deny") {
                const userFocus = subArgs.join(" ").trim();
                const prompt = await handleManualTriggerCommand(commandCtx, "compress", userFocus);
                if (!prompt) {
                    throw new Error("__DCP_MANUAL_TRIGGER_BLOCKED__");
                }
                state.manualMode = "compress-pending";
                state.pendingManualTrigger = {
                    sessionId: input.sessionID,
                    prompt,
                };
                const rawArgs = (input.arguments || "").trim();
                output.parts.length = 0;
                output.parts.push({
                    type: "text",
                    text: rawArgs ? `/dcp ${rawArgs}` : `/dcp ${subcommand}`,
                });
                return;
            }
            if (subcommand === "decompress" && effectivePermission !== "deny") {
                await handleDecompressCommand({
                    ...commandCtx,
                    args: subArgs,
                });
                throw new Error("__DCP_DECOMPRESS_HANDLED__");
            }
            if (subcommand === "recompress" && effectivePermission !== "deny") {
                await handleRecompressCommand({
                    ...commandCtx,
                    args: subArgs,
                });
                throw new Error("__DCP_RECOMPRESS_HANDLED__");
            }
            await handleHelpCommand(commandCtx);
            throw new Error("__DCP_HELP_HANDLED__");
        }
    };
}
export function createTextCompleteHandler() {
    return async (_input, output) => {
        output.text = output.text
            .replace(DCP_SYSTEM_REMINDER_REGEX, "")
            .replace(DCP_MESSAGE_ID_TAG_REGEX, "");
    };
}
//# sourceMappingURL=hooks.js.map