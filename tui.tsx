/** @jsxImportSource @opentui/solid */

/**
 * Dynamic Context Pruning — OpenCode 2 CLI (TUI) plugin entry point.
 *
 * Provides the `/dcp` panel, forwards `/dcp <subcommand>` to the server-side
 * command, and renders toast notifications emitted by the server plugin.
 */
import { Plugin } from "@opencode-ai/plugin/tui"
import { DcpRpc, type DcpToastEvent } from "./lib/opencode/rpc"
import { registerCommands } from "./lib/tui/commands"
import { activeSessionID, loadConfig } from "./lib/tui/data"
import { openPanelModal } from "./lib/tui/modals"
import { createTuiApi } from "./lib/tui/theme"

export default Plugin.define({
    id: "opencode-dcp",
    setup(context) {
        const api = createTuiApi(context)
        const config = loadConfig(api)
        if (!config.enabled) return

        const rpc = context.client.rpc(DcpRpc)
        const stopToasts = rpc.events.on("toast", (event) => {
            const toast = event.data as unknown as DcpToastEvent
            context.ui.toast.show({
                title: toast.title,
                message: toast.message,
                variant: toast.variant,
                duration: toast.duration,
            })
        })

        let stopCommands: (() => void) | undefined
        if (config.commands.enabled) {
            stopCommands = registerCommands(api, [
                {
                    title: "DCP",
                    name: "panel",
                    description:
                        "Open DCP panel, or run /dcp <context|stats|sweep|manual|compress|decompress|recompress|help>",
                    slashName: "dcp",
                    run: async (input) => {
                        const text = input?.trim() ?? ""
                        if (!text) {
                            openPanelModal(api, config)
                            return
                        }
                        const sessionID = activeSessionID(api)
                        if (!sessionID) {
                            context.ui.toast.show({
                                title: "DCP",
                                message: "Open a session first.",
                                variant: "warning",
                            })
                            return
                        }
                        await context.client.session.command({
                            sessionID,
                            command: "dcp",
                            text,
                        })
                    },
                },
            ])
        }

        return () => {
            stopCommands?.()
            stopToasts()
        }
    },
})
