import type { Plugin } from "@opencode-ai/plugin/tui"
import type { RGBA } from "@opentui/core"
import type { buildStatsReport } from "../commands/stats"

/** OpenCode 2 CLI plugin context. */
export type TuiContext = Plugin.Context

/** Flat colour palette the DCP dialogs render with (OpenCode 1 theme shape). */
export interface Theme {
    primary: RGBA
    secondary: RGBA
    accent: RGBA
    text: RGBA
    textMuted: RGBA
    background: RGBA
    backgroundElement: RGBA
    borderSubtle: RGBA
    selectedListItemText: RGBA
    success: RGBA
    warning: RGBA
    error: RGBA
    info: RGBA
}

export type ThemeColor = keyof Theme

/**
 * The surface the DCP dialogs need from the host. Built from the OpenCode 2
 * context by `createTuiApi` so the Solid components stay host-agnostic.
 */
export interface TuiApi {
    context: TuiContext
    theme: { current: Theme }
    ui: { dialog: { clear(): void } }
}

export type StatsReport = Awaited<ReturnType<typeof buildStatsReport>>

export type DcpCommand = {
    title: string
    name: string
    description: string
    slashName: string
    slashAliases?: string[]
    run: (input?: string) => void | Promise<void>
}
