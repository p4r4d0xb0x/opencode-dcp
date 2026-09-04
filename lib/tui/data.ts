import { getConfig, type PluginConfig } from "../config"
import { Logger } from "../logger"
import type { HostSessionMessage } from "../opencode/host-types"
import { convertSessionMessages } from "../opencode/session-to-parts"
import { createSessionState, type SessionState, type WithParts } from "../state"
import { loadSessionState } from "../state/persistence"
import { findLastCompactionTimestamp, loadPruneMap, loadPruneMessagesState } from "../state/utils"
import type { TuiApi } from "./types"

export const logger = new Logger(false)

export function loadConfig(api: TuiApi): PluginConfig {
    const location = api.context.location ?? api.context.data.location.default()
    return getConfig({
        directory: location?.directory,
        notify: (warning) =>
            api.context.ui.toast.show({
                title: warning.title,
                message: warning.message,
                variant: warning.variant,
                duration: warning.duration,
            }),
    })
}

export function activeSessionID(api: TuiApi): string | undefined {
    const current = api.context.ui.router.current()
    return current.type === "session" ? current.sessionID : undefined
}

export async function sessionMessages(api: TuiApi, sessionID: string): Promise<WithParts[]> {
    await api.context.data.session.message.sync(sessionID)
    const messages = api.context.data.session.message.list(
        sessionID,
    ) as unknown as HostSessionMessage[]
    return convertSessionMessages(messages, { sessionID })
}

export async function buildSessionState(
    sessionID: string,
    messages: WithParts[],
    config: PluginConfig,
): Promise<SessionState> {
    const state = createSessionState()
    state.sessionId = sessionID
    state.manualMode = config.manualMode.enabled ? "active" : false
    state.lastCompaction = findLastCompactionTimestamp(messages)

    const persisted = await loadSessionState(sessionID, logger)
    if (persisted) {
        if (typeof persisted.manualMode === "boolean") {
            state.manualMode = persisted.manualMode ? "active" : false
        }

        state.prune.tools = loadPruneMap(persisted.prune.tools)
        state.prune.messages = loadPruneMessagesState(persisted.prune.messages)
        state.nudges.contextLimitAnchors = new Set(persisted.nudges.contextLimitAnchors || [])
        state.nudges.turnNudgeAnchors = new Set(persisted.nudges.turnNudgeAnchors || [])
        state.nudges.iterationNudgeAnchors = new Set(persisted.nudges.iterationNudgeAnchors || [])
        state.stats = {
            pruneTokenCounter: persisted.stats?.pruneTokenCounter || 0,
            totalPruneTokens: persisted.stats?.totalPruneTokens || 0,
        }
    }

    return state
}

export async function loadSessionData(api: TuiApi, config: PluginConfig) {
    const sessionID = activeSessionID(api)
    if (!sessionID) return undefined

    const messages = await sessionMessages(api, sessionID)
    const state = await buildSessionState(sessionID, messages, config)
    return { state, messages }
}
