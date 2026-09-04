/** @jsxImportSource @opentui/solid */

import type { Component } from "solid-js"
import type { DcpCommand, TuiApi } from "./types"

/**
 * Mount DCP commands inside the host's `KeymapProvider` boundary.
 *
 * `context.keymap.layer` is component-owned and calls Solid hooks internally,
 * so it must be invoked from inside a rendered component, not from the
 * imperative plugin `setup`. This component renders nothing visible; the
 * host mounts it through `context.ui.slot({ append: "app", ... })` so the
 * render runs inside the host `KeymapProvider`.
 */
export const CommandsHost: Component<{ api: TuiApi; commands: DcpCommand[] }> = (props) => {
    props.api.context.keymap.layer(() => ({
        mode: "global",
        commands: props.commands.map((command) => ({
            id: `dcp.${command.name}`,
            title: command.title,
            description: command.description,
            group: "DCP",
            palette: true as const,
            bind: false as const,
            slash: {
                name: command.slashName,
                aliases: command.slashAliases,
                arguments: true as const,
            },
            run: (input?: string) => command.run(input),
        })),
    }))
    return null
}
