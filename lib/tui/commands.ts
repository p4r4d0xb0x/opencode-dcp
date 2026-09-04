import type { JSX } from "@opentui/solid"
import { createComponent } from "solid-js"
import { CommandsHost } from "./commands-host"
import type { DcpCommand, TuiApi } from "./types"

/**
 * Register DCP commands in the palette and as slash commands.
 *
 * Mounts `CommandsHost` through `context.ui.slot({ append: "app" })` so the
 * keymap layer is installed from inside a rendered component, where the
 * host's `KeymapProvider` context is available. Returns the slot cleanup so
 * the plugin teardown can dispose the layer.
 */
export function registerCommands(api: TuiApi, commands: DcpCommand[]): () => void {
    return api.context.ui.slot({
        append: "app",
        render: () => createComponent(CommandsHost, { api, commands }) as unknown as JSX.Element,
    })
}
