/**
 * Integration: the OpenCode 2 `context` hook adapter driving the real DCP
 * pruning core. No host process is involved; the plugin context is stubbed.
 */
import assert from "node:assert/strict"
import test from "node:test"
import type { PluginConfig } from "../lib/config"
import type { HostPermissionSnapshot } from "../lib/host-permissions"
import { createChatMessageTransformHandler, createSystemPromptHandler } from "../lib/hooks"
import { Logger } from "../lib/logger"
import { createContextHook } from "../lib/opencode/context-hook"
import type { HostModelMessage, HostSessionMessage } from "../lib/opencode/host-types"
import { createCompressionTimingTracker } from "../lib/opencode/timing"
import { createSessionState } from "../lib/state"

function buildConfig(permission: "allow" | "ask" | "deny" = "allow"): PluginConfig {
    return {
        enabled: true,
        autoUpdate: false,
        debug: false,
        pruneNotification: "off",
        pruneNotificationType: "chat",
        commands: { enabled: true, protectedTools: [] },
        manualMode: { enabled: false, automaticStrategies: true },
        turnProtection: { enabled: false, turns: 4 },
        experimental: { allowSubAgents: false, customPrompts: false },
        protectedFilePatterns: [],
        compress: {
            mode: "range",
            permission,
            showCompression: false,
            maxContextLimit: 150000,
            minContextLimit: 50000,
            nudgeFrequency: 5,
            iterationNudgeThreshold: 15,
            nudgeForce: "soft",
            protectedTools: ["task"],
            protectTags: false,
            protectUserMessages: false,
        },
        strategies: {
            deduplication: { enabled: true, protectedTools: [] },
            purgeErrors: { enabled: true, turns: 4, protectedTools: [] },
        },
    } as PluginConfig
}

const SESSION_ID = "ses_hook_test"

function sessionMessages(): HostSessionMessage[] {
    return [
        { type: "user", id: "msg_u1", time: { created: 1000 }, text: "read the file" },
        {
            type: "assistant",
            id: "msg_a1",
            time: { created: 2000 },
            agent: "general",
            model: { id: "claude-haiku-4-5", providerID: "anthropic" },
            content: [
                {
                    type: "tool",
                    id: "call_read",
                    name: "read",
                    state: {
                        status: "completed",
                        input: { path: "big.txt" },
                        content: [{ type: "text", text: "HUGE FILE CONTENT" }],
                    },
                },
            ],
            tokens: { input: 5, output: 5 },
        },
        { type: "user", id: "msg_u2", time: { created: 3000 }, text: "thanks" },
    ]
}

function modelMessages(): HostModelMessage[] {
    return [
        { id: "msg_u1", role: "user", content: [{ type: "text", text: "read the file" }] },
        {
            id: "msg_a1",
            role: "assistant",
            content: [
                { type: "tool-call", id: "call_read", name: "read", input: { path: "big.txt" } },
            ],
        },
        {
            role: "tool",
            content: [
                {
                    type: "tool-result",
                    id: "call_read",
                    name: "read",
                    result: { type: "text", value: "HUGE FILE CONTENT" },
                },
            ],
        },
        { id: "msg_u2", role: "user", content: [{ type: "text", text: "thanks" }] },
    ]
}

function buildHook(config: PluginConfig, session: HostSessionMessage[]) {
    const state = createSessionState()
    const logger = new Logger(false)
    const hostPermissions: HostPermissionSnapshot = { global: undefined, agents: {} }
    const prompts = {
        reload() {},
        getRuntimePrompts() {
            return {
                system: "DCP SYSTEM PROMPT",
                compressRange: "",
                compressMessage: "",
                contextLimitNudge: "",
                turnNudge: "",
                iterationNudge: "",
            }
        },
    } as any
    const client = { session: { get: async () => ({ data: {} }) } }
    const ctx = {
        session: { context: async () => session },
    } as any

    const hook = createContextHook({
        ctx,
        state,
        config,
        logger,
        hostPermissions,
        timing: createCompressionTimingTracker(state, logger),
        modelLimits: { contextLimit: async () => 200_000 },
        systemHandler: createSystemPromptHandler(state, logger, config, prompts),
        messagesHandler: createChatMessageTransformHandler(
            client,
            state,
            logger,
            config,
            prompts,
            hostPermissions,
        ),
    })
    return { hook, state, hostPermissions }
}

test("context hook prunes tool output for pruned call IDs and injects the DCP system prompt", async () => {
    const { hook, state } = buildHook(buildConfig("allow"), sessionMessages())
    // simulate a compress/dedupe decision from an earlier call
    state.sessionId = SESSION_ID
    state.prune.tools.set("call_read", 1)

    const event: any = {
        sessionID: SESSION_ID,
        agent: "general",
        model: { providerID: "anthropic", id: "claude-haiku-4-5" },
        system: [{ type: "text", text: "base system" }],
        messages: modelMessages(),
        tools: { compress: { description: "", input: {} }, read: { description: "", input: {} } },
        generation: {},
        providerOptions: {},
    }

    await hook(event)

    const toolMessage = event.messages.find((message: HostModelMessage) => message.role === "tool")
    assert.ok(toolMessage)
    const result = toolMessage.content[0].result
    assert.equal(result.type, "text")
    assert.match(String(result.value), /Output removed to save context/)

    assert.equal(state.modelContextLimit, 200_000)
    assert.equal(event.system.length, 1)
    assert.match(event.system[0].text, /^base system\n\n/)
    assert.match(event.system[0].text, /DCP SYSTEM PROMPT/)
    assert.ok("compress" in event.tools, "compress tool stays available for primary agents")
})

test("context hook skips the system prompt when compress is denied for this call", async () => {
    const { hook } = buildHook(buildConfig("allow"), sessionMessages())
    const event: any = {
        sessionID: SESSION_ID,
        agent: "explore",
        model: { providerID: "anthropic", id: "claude-haiku-4-5" },
        system: [{ type: "text", text: "base system" }],
        messages: modelMessages(),
        tools: { read: { description: "", input: {} } }, // host removed `compress` via a deny rule
        generation: {},
        providerOptions: {},
    }

    await hook(event)

    assert.equal(event.system[0].text, "base system")
})

test("context hook leaves compaction requests without the DCP system prompt", async () => {
    const { hook } = buildHook(buildConfig("allow"), sessionMessages())
    const event: any = {
        sessionID: SESSION_ID,
        agent: "general",
        model: { providerID: "anthropic", id: "claude-haiku-4-5" },
        system: [{ type: "text", text: "base system" }],
        messages: [
            ...modelMessages(),
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "You MUST summarize the conversation above into a structured summary",
                    },
                ],
            },
        ],
        tools: { compress: { description: "", input: {} } },
        generation: {},
        providerOptions: {},
    }

    await hook(event)

    assert.equal(event.system[0].text, "base system")
    assert.equal(event.messages.length, 5)
})
