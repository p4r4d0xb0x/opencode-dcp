import { getConfig } from "./lib/config";
import { compressDisabledByOpencode, hasExplicitToolPermission, } from "./lib/host-permissions";
import { Logger } from "./lib/logger";
import { createSessionState } from "./lib/state";
import { createCompressTool } from "./lib/tools";
import { PromptStore } from "./lib/prompts/store";
import { createChatMessageTransformHandler, createCommandExecuteHandler, createSystemPromptHandler, createTextCompleteHandler, } from "./lib/hooks";
import { configureClientAuth, isSecureMode } from "./lib/auth";
const plugin = (async (ctx) => {
    const config = getConfig(ctx);
    if (!config.enabled) {
        return {};
    }
    const logger = new Logger(config.debug);
    const state = createSessionState();
    const prompts = new PromptStore(logger, ctx.directory, config.experimental.customPrompts);
    const hostPermissions = {
        global: undefined,
        agents: {},
    };
    if (isSecureMode()) {
        configureClientAuth(ctx.client);
        // logger.info("Secure mode detected, configured client authentication")
    }
    logger.info("DCP initialized", {
        strategies: config.strategies,
    });
    return {
        "experimental.chat.system.transform": createSystemPromptHandler(state, logger, config, prompts),
        "experimental.chat.messages.transform": createChatMessageTransformHandler(ctx.client, state, logger, config, prompts, hostPermissions),
        "chat.message": async (input, _output) => {
            state.variant = input.variant;
            logger.debug("Cached variant from chat.message hook", { variant: input.variant });
        },
        "experimental.text.complete": createTextCompleteHandler(),
        "command.execute.before": createCommandExecuteHandler(ctx.client, state, logger, config, ctx.directory, hostPermissions),
        tool: {
            ...(config.compress.permission !== "deny" && {
                compress: createCompressTool({
                    client: ctx.client,
                    state,
                    logger,
                    config,
                    workingDirectory: ctx.directory,
                    prompts,
                }),
            }),
        },
        config: async (opencodeConfig) => {
            if (config.commands.enabled) {
                opencodeConfig.command ??= {};
                opencodeConfig.command["dcp"] = {
                    template: "",
                    description: "Show available DCP commands",
                };
            }
            if (config.compress.permission !== "deny" &&
                compressDisabledByOpencode(opencodeConfig.permission)) {
                config.compress.permission = "deny";
            }
            const toolsToAdd = [];
            if (config.compress.permission !== "deny" && !config.experimental.allowSubAgents) {
                toolsToAdd.push("compress");
            }
            if (toolsToAdd.length > 0) {
                const existingPrimaryTools = opencodeConfig.experimental?.primary_tools ?? [];
                opencodeConfig.experimental = {
                    ...opencodeConfig.experimental,
                    primary_tools: [...existingPrimaryTools, ...toolsToAdd],
                };
            }
            if (!hasExplicitToolPermission(opencodeConfig.permission, "compress")) {
                const permission = opencodeConfig.permission ?? {};
                opencodeConfig.permission = {
                    ...permission,
                    compress: config.compress.permission,
                };
            }
            hostPermissions.global = opencodeConfig.permission;
            hostPermissions.agents = Object.fromEntries(Object.entries(opencodeConfig.agent ?? {}).map(([name, agent]) => [
                name,
                agent?.permission,
            ]));
        },
    };
});
export default plugin;
//# sourceMappingURL=index.js.map