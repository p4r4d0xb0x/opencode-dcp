/**
 * OpenCode 2 host adapter (imperative shell).
 *
 * Layer contract: everything that talks to the OpenCode 2 plugin context lives
 * here. The pruning core (`lib/messages`, `lib/compress`, `lib/state`, …) stays
 * host-agnostic and only sees DCP's own session model (`lib/session-types.ts`)
 * through the host port implemented in `client.ts`.
 *
 * Pure modules (safe to unit test without a host): `host-types.ts`,
 * `session-to-parts.ts`, `context-view.ts`.
 */
export {
    createHostClient,
    fetchSessionHistory,
    type DcpHostClient,
    type ToastPayload,
} from "./client"
export { createContextHook, isCompactionRequest, applySystemStrings } from "./context-hook"
export { createContextView, type ContextView } from "./context-view"
export { createModelLimitResolver } from "./model-limits"
export { registerDcpCommands, MANUAL_TRIGGER_BLOCKED } from "./commands"
export { registerDcpTool, COMPRESS_PERMISSION_ACTION } from "./tool"
export { createCompressionTimingTracker } from "./timing"
export { convertSessionMessages, DCP_NOTIFICATION_METADATA } from "./session-to-parts"
export { DcpRpc, type DcpToastEvent } from "./rpc"
