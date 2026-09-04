import type { DcpCommand, TuiApi } from "./types"

/** Register DCP commands in the palette and as slash commands (OpenCode 2 keymap layer). */
export function registerCommands(api: TuiApi, commands: DcpCommand[]) {
    api.context.keymap.layer(() => ({
        mode: "global",
        commands: commands.map((command) => ({
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
}
