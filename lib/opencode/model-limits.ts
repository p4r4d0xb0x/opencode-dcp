/**
 * Resolves a model's context window from the OpenCode 2 catalog.
 *
 * OpenCode 1 passed `model.limit.context` into the system-prompt hook; V2's
 * `context` hook only carries the model reference, so the limit is looked up
 * (and cached) from `ctx.catalog.model.list()`.
 */
import type { Plugin } from "@opencode-ai/plugin"
import type { Logger } from "../logger"
import type { HostModelRef } from "./host-types"

const REFRESH_INTERVAL_MS = 60_000

interface CatalogModel {
    id: string
    providerID: string
    limit?: { context?: number }
}

export interface ModelLimitResolver {
    contextLimit(model: HostModelRef): Promise<number | undefined>
}

export function createModelLimitResolver(ctx: Plugin.Context, logger: Logger): ModelLimitResolver {
    const limits = new Map<string, number>()
    let lastRefresh = 0
    let inflight: Promise<void> | undefined

    const refresh = async () => {
        try {
            const response = await ctx.catalog.model.list()
            const models = (response as { data?: CatalogModel[] }).data ?? []
            for (const model of models) {
                const limit = model.limit?.context
                if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
                    limits.set(keyOf(model.providerID, model.id), limit)
                }
            }
            lastRefresh = Date.now()
        } catch (error) {
            logger.warn("Failed to load model catalog for context limits", {
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }

    return {
        async contextLimit(model) {
            const key = keyOf(model.providerID, model.id)
            const cached = limits.get(key)
            if (cached !== undefined) return cached
            if (Date.now() - lastRefresh > REFRESH_INTERVAL_MS) {
                inflight ??= refresh().finally(() => {
                    inflight = undefined
                })
                await inflight
            }
            return limits.get(key)
        },
    }
}

function keyOf(providerID: string, modelID: string): string {
    return `${providerID}/${modelID}`
}
