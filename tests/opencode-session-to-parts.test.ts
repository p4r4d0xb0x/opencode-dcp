import assert from "node:assert/strict"
import test from "node:test"
import type { HostSessionMessage } from "../lib/opencode/host-types"
import { convertSessionMessages } from "../lib/opencode/session-to-parts"
import { findLastCompactionTimestamp } from "../lib/state/utils"
import { getCurrentTokenUsage } from "../lib/token-utils"
import { createSessionState } from "../lib/state"
import type { ToolPart } from "../lib/session-types"

const SESSION_ID = "ses_convert_test"

test("convertSessionMessages maps user, assistant tools, shell, skill and compaction", () => {
    const messages: HostSessionMessage[] = [
        {
            type: "user",
            id: "m1",
            time: { created: 100 },
            text: "hello",
            files: [{ mime: "image/png", name: "a.png" }],
        },
        {
            type: "assistant",
            id: "m2",
            time: { created: 200 },
            agent: "code",
            model: { id: "gpt-5", providerID: "openai", variant: "high" },
            content: [
                { type: "reasoning", text: "thinking" },
                { type: "text", text: "running" },
                {
                    type: "tool",
                    id: "call_1",
                    name: "read",
                    state: {
                        status: "error",
                        input: { path: "x" },
                        error: { type: "not_found", message: "missing file" },
                    },
                },
                {
                    type: "tool",
                    id: "call_2",
                    name: "shell",
                    state: { status: "running", input: { command: "sleep" } },
                },
                {
                    type: "tool",
                    id: "call_3",
                    name: "shell",
                    state: { status: "streaming", input: '{"comm' },
                },
            ],
            tokens: { input: 7, output: 3 },
        },
        {
            type: "skill",
            id: "m3",
            time: { created: 300 },
            skill: "docs",
            name: "Docs",
            text: "skill body",
        },
        {
            type: "shell",
            id: "m4",
            time: { created: 400 },
            command: "ls",
            status: "exited",
            exit: 0,
            output: { stdout: "a\n", stderr: "" },
        },
        { type: "agent-switched", id: "m5", time: { created: 450 } },
        {
            type: "compaction",
            id: "m6",
            time: { created: 500 },
            status: "completed",
            reason: "auto",
            summary: "checkpoint",
        },
        { type: "compaction", id: "m7", time: { created: 550 }, status: "failed", reason: "auto" },
        { type: "user", id: "m8", time: { created: 600 }, text: "after" },
    ]

    const result = convertSessionMessages(messages, {
        sessionID: SESSION_ID,
        agent: "general",
        model: { providerID: "anthropic", modelID: "claude" },
    })
    assert.deepEqual(
        result.map((message) => message.info.id),
        ["m1", "m2", "m3", "m4", "m6", "m8"],
    )

    const user = result[0]
    assert.equal(user.info.agent, "general")
    assert.equal(user.parts.length, 2)
    assert.equal(user.parts[0].type, "text")
    assert.equal(user.parts[1].type, "file")

    const assistant = result[1]
    assert.equal(assistant.info.role, "assistant")
    if (assistant.info.role === "assistant") {
        assert.equal(assistant.info.modelID, "gpt-5")
        assert.equal(assistant.info.providerID, "openai")
        assert.equal(assistant.info.variant, "high")
        assert.deepEqual(assistant.info.tokens, {
            input: 7,
            output: 3,
            reasoning: 0,
            cache: { read: 0, write: 0 },
        })
    }
    assert.deepEqual(
        assistant.parts.map((part) => part.type),
        ["step-start", "reasoning", "text", "tool", "tool", "tool"],
    )
    const tools = assistant.parts.filter((part): part is ToolPart => part.type === "tool")
    assert.equal(tools[0].state.status, "error")
    assert.equal(tools[0].state.status === "error" && tools[0].state.error, "missing file")
    assert.equal(tools[1].state.status, "running")
    assert.equal(tools[2].state.status, "pending")

    // later user messages inherit the most recent assistant agent/model
    const after = result[5]
    assert.equal(after.info.agent, "code")
    assert.deepEqual(after.info.role === "user" && after.info.model, {
        providerID: "openai",
        modelID: "gpt-5",
        variant: "high",
    })

    const skill = result[2]
    assert.equal(skill.parts[0].type === "text" && skill.parts[0].synthetic, true)
    const shell = result[3]
    assert.equal(shell.parts[0].type === "text" && shell.parts[0].text, "$ ls\na\n")

    const compaction = result[4]
    assert.equal(compaction.info.role === "assistant" && compaction.info.summary, true)
    assert.equal(findLastCompactionTimestamp(result), 500)
})

test("token usage reads the latest assistant tokens through the converted view", () => {
    const messages: HostSessionMessage[] = [
        { type: "user", id: "u", time: { created: 1 }, text: "q" },
        {
            type: "assistant",
            id: "a",
            time: { created: 2 },
            agent: "general",
            model: { id: "m", providerID: "p" },
            content: [{ type: "text", text: "ok" }],
            tokens: { input: 100, output: 10, reasoning: 5, cache: { read: 20, write: 30 } },
        },
    ]
    const result = convertSessionMessages(messages, { sessionID: SESSION_ID })
    assert.equal(getCurrentTokenUsage(createSessionState(), result), 165)
})
