/**
 * Registers the `/dcp` and `/dcp-compress` slash commands with OpenCode 2.
 *
 * The V1 command handler kept its contract (`{ command, sessionID, arguments }`
 * in, optional prompt parts out). When it produces a prompt (manual compress
 * trigger) this adapter submits it as a real user prompt so the model runs.
 */
import type { Plugin } from "@opencode-ai/plugin"
import type { Logger } from "../logger"

export const MANUAL_TRIGGER_BLOCKED = "__DCP_MANUAL_TRIGGER_BLOCKED__"

export type DcpCommandHandler = (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Array<{ type: string; text?: string }> },
) => Promise<void>

export interface CommandRegistrationOptions {
    compressEnabled: boolean
}

export async function registerDcpCommands(
    ctx: Plugin.Context,
    handler: DcpCommandHandler,
    logger: Logger,
    options: CommandRegistrationOptions,
): Promise<{ dispose(): Promise<void> }> {
    const run = async (
        command: string,
        sessionID: string,
        text: string,
        delivery: "steer" | "queue",
    ) => {
        const output = { parts: [] as Array<{ type: string; text?: string }> }
        try {
            await handler({ command, sessionID, arguments: text }, output)
        } catch (error) {
            if (error instanceof Error && error.message === MANUAL_TRIGGER_BLOCKED) return
            logger.error("DCP command failed", {
                command,
                error: error instanceof Error ? error.message : String(error),
            })
            throw error
        }

        const prompt = output.parts.find((part) => part.type === "text" && part.text)?.text
        if (!prompt) return
        await ctx.session.prompt({ sessionID, text: prompt, delivery })
    }

    return ctx.command.transform((editor) => {
        editor.add({
            name: "dcp",
            description:
                "DCP: context | stats | sweep [n] | manual [on|off] | compress [focus] | decompress <n> | recompress <n> | help",
            execute: ({ sessionID, prompt, delivery }) =>
                run("dcp", sessionID, prompt.text ?? "", delivery),
        })
        if (options.compressEnabled) {
            editor.add({
                name: "dcp-compress",
                description: "Trigger DCP manual compression with: /dcp-compress [focus]",
                execute: ({ sessionID, prompt, delivery }) =>
                    run("dcp-compress", sessionID, prompt.text ?? "", delivery),
            })
        }
    })
}
