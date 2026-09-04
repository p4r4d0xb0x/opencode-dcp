/**
 * Registers a DCP tool definition with the OpenCode 2 tool registry.
 *
 * Permission mapping: the tool declares the `compress` permission action so a
 * `{ "action": "compress", "effect": "deny" }` rule removes it from the model.
 * OpenCode 2 (beta) does not let plugin tools raise an interactive permission
 * prompt, so the V1 `ask` flow degrades to `allow`; `ask()` is therefore a no-op.
 */
import type { Plugin } from "@opencode-ai/plugin"
import type { DcpToolDefinition } from "../compress/types"
import type { Logger } from "../logger"

export const COMPRESS_PERMISSION_ACTION = "compress"

export interface ToolRegistration {
    dispose(): Promise<void>
}

export async function registerDcpTool(
    ctx: Plugin.Context,
    definition: DcpToolDefinition<any>,
    logger: Logger,
): Promise<ToolRegistration> {
    return ctx.tool.transform((editor) => {
        editor.add({
            name: definition.name,
            description: definition.description,
            input: definition.input as unknown as Parameters<typeof editor.add>[0]["input"],
            options: { permission: COMPRESS_PERMISSION_ACTION, codemode: false },
            execute: async (input, tool) => {
                logger.debug("DCP tool invoked", {
                    tool: definition.name,
                    sessionID: tool.sessionID,
                    callID: tool.id,
                })
                const output = await definition.execute(input, {
                    sessionID: tool.sessionID,
                    messageID: tool.messageID,
                    callID: tool.id,
                    agent: tool.agent,
                    ask: async () => {},
                    metadata: ({ title }) => {
                        void tool.progress({ title }).catch(() => {})
                    },
                })
                return { content: output }
            },
        })
    })
}
