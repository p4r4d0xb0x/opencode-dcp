/**
 * Dynamic Context Pruning — OpenCode 2 server plugin entry point.
 *
 * Wiring only: builds the DCP core (config, state, prompts), the host port,
 * and registers the V2 hooks/tools/commands. All host-specific logic lives in
 * `lib/opencode/`; all pruning logic lives in the host-agnostic core.
 */
import { Plugin } from "@opencode-ai/plugin"
import { getConfig } from "./lib/config"
import { createCompressMessageTool, createCompressRangeTool } from "./lib/compress"
import type { HostPermissionSnapshot } from "./lib/host-permissions"
import {
    createChatMessageTransformHandler,
    createCommandExecuteHandler,
    createSystemPromptHandler,
} from "./lib/hooks"
import { Logger } from "./lib/logger"
import {
    createCompressionTimingTracker,
    createContextHook,
    createHostClient,
    createModelLimitResolver,
    DcpRpc,
    registerDcpCommands,
    registerDcpTool,
    type ToastPayload,
} from "./lib/opencode"
import { PromptStore } from "./lib/prompts/store"
import { createSessionState } from "./lib/state"
import { startAutoUpdate } from "./lib/update"

export const PLUGIN_ID = "opencode-dcp"

interface Disposable {
    dispose(): Promise<void>
}

async function disposeAll(registrations: Disposable[]): Promise<void> {
    for (const registration of registrations.reverse()) {
        try {
            await registration.dispose()
        } catch {
            // best effort during unload
        }
    }
}

export default Plugin.define({
    id: PLUGIN_ID,
    async setup(ctx) {
        const directory = ctx.location.directory
        const pendingToasts: ToastPayload[] = []
        let emitToast: ((toast: ToastPayload) => Promise<void>) | undefined
        const toast = async (payload: ToastPayload) => {
            if (!emitToast) {
                pendingToasts.push(payload)
                return
            }
            try {
                await emitToast(payload)
            } catch {
                // the TUI plugin may not be connected; toasts are best effort
            }
        }

        const config = getConfig({ directory, notify: (warning) => void toast(warning) })
        if (!config.enabled) {
            return
        }

        const logger = new Logger(config.debug)
        const state = createSessionState()
        const prompts = new PromptStore(logger, directory, config.experimental.customPrompts)
        const hostPermissions: HostPermissionSnapshot = { global: undefined, agents: {} }
        const client = createHostClient(ctx, toast)
        const registrations: Disposable[] = []

        try {
            const rpc = await ctx.rpc.register(DcpRpc, {})
            registrations.push(rpc)
            emitToast = (payload) =>
                rpc.events.emit("toast", payload as unknown as Record<string, unknown>)
            for (const queued of pendingToasts.splice(0)) void toast(queued)

            logger.info("DCP initialized", { strategies: config.strategies, host: "opencode2" })
            startAutoUpdate((payload) => void toast(payload), config.autoUpdate)

            const compressEnabled = config.compress.permission !== "deny"
            if (compressEnabled) {
                const definition =
                    config.compress.mode === "message"
                        ? createCompressMessageTool({ client, state, logger, config, prompts })
                        : createCompressRangeTool({ client, state, logger, config, prompts })
                registrations.push(await registerDcpTool(ctx, definition, logger))
            }

            if (config.commands.enabled) {
                registrations.push(
                    await registerDcpCommands(
                        ctx,
                        createCommandExecuteHandler(
                            client,
                            state,
                            logger,
                            config,
                            directory,
                            hostPermissions,
                        ),
                        logger,
                        { compressEnabled },
                    ),
                )
            }

            const timing = createCompressionTimingTracker(state, logger)
            registrations.push(...(await timing.register(ctx)))

            registrations.push(
                await ctx.session.hook(
                    "context",
                    createContextHook({
                        ctx,
                        state,
                        config,
                        logger,
                        hostPermissions,
                        timing,
                        modelLimits: createModelLimitResolver(ctx, logger),
                        systemHandler: createSystemPromptHandler(state, logger, config, prompts),
                        messagesHandler: createChatMessageTransformHandler(
                            client,
                            state,
                            logger,
                            config,
                            prompts,
                            hostPermissions,
                        ),
                    }),
                ),
            )
        } catch (error) {
            await disposeAll(registrations)
            throw error
        }

        return () => disposeAll(registrations)
    },
})
