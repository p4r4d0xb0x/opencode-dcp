/**
 * OpenCode 2 implementation of DCP's host port.
 *
 * The pruning core was written against a small slice of the OpenCode 1 SDK
 * client (`session.messages`, `session.get`, `session.prompt`,
 * `tui.showToast`). Rather than rewriting every call site, this module keeps
 * that slice as DCP's host port and backs it with the V2 plugin context.
 */
import type { Plugin } from "@opencode-ai/plugin"
import type { WithParts } from "../state"
import type { HostSessionMessage } from "./host-types"
import { convertSessionMessages, DCP_NOTIFICATION_METADATA } from "./session-to-parts"

export interface ToastPayload {
    title: string
    message: string
    variant: "info" | "success" | "warning" | "error"
    duration: number
}

export type ToastSink = (toast: ToastPayload) => void | Promise<void>

/** The host-port surface consumed by the pruning core (`client: any` today). */
export interface DcpHostClient {
    session: {
        messages(input: { path: { id: string } }): Promise<{ data: WithParts[] }>
        get(input: { path: { id: string } }): Promise<{ data: { parentID?: string } }>
        prompt(input: {
            path: { id: string }
            body: {
                noReply?: boolean
                agent?: string
                model?: { providerID: string; modelID: string }
                variant?: string
                parts: Array<{ type: "text"; text: string; ignored?: boolean }>
            }
        }): Promise<void>
    }
    tui: {
        showToast(input: { body: ToastPayload }): Promise<void>
    }
}

export async function fetchSessionHistory(
    ctx: Plugin.Context,
    sessionID: string,
): Promise<WithParts[]> {
    const messages = (await ctx.session.context({ sessionID })) as unknown as HostSessionMessage[]
    return convertSessionMessages(messages, { sessionID })
}

export function createHostClient(ctx: Plugin.Context, toast: ToastSink): DcpHostClient {
    return {
        session: {
            async messages({ path }) {
                return { data: await fetchSessionHistory(ctx, path.id) }
            },
            async get({ path }) {
                const info = await ctx.session.get({ sessionID: path.id })
                return { data: { parentID: info.parentID } }
            },
            async prompt({ path, body }) {
                const text = body.parts
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join("\n\n")
                if (!text.trim()) return
                await ctx.session.synthetic({
                    sessionID: path.id,
                    text,
                    description: "DCP",
                    metadata: DCP_NOTIFICATION_METADATA,
                    resume: false,
                })
            },
        },
        tui: {
            async showToast({ body }) {
                await toast(body)
            },
        },
    }
}
