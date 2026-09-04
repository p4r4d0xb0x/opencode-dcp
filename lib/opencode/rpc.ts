/**
 * DCP RPC contract shared by the server plugin (`index.ts`) and the CLI plugin
 * (`tui.tsx`). The server emits `toast` events; the TUI renders them.
 */
import { Rpc } from "@opencode-ai/plugin/rpc"

export interface DcpToastEvent {
    title: string
    message: string
    variant: "info" | "success" | "warning" | "error"
    duration: number
}

export const DcpRpc = Rpc.define({
    id: "dcp",
    methods: {},
    events: {
        toast: {
            schema: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    message: { type: "string" },
                    variant: { type: "string", enum: ["info", "success", "warning", "error"] },
                    duration: { type: "number" },
                },
                required: ["title", "message", "variant", "duration"],
                additionalProperties: false,
            },
        },
    },
})
