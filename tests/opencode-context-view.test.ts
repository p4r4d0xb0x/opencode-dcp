import assert from "node:assert/strict"
import test from "node:test"
import {
    CONTINUATION_TEXT,
    createContextView,
    enforceTerminalRole,
} from "../lib/opencode/context-view"
import { applySystemStrings, isCompactionRequest } from "../lib/opencode/context-hook"
import type { HostModelMessage, HostSessionMessage } from "../lib/opencode/host-types"
import { createSyntheticUserMessage } from "../lib/messages/utils"
import type { ToolPart } from "../lib/session-types"

const SESSION_ID = "ses_view_test"
const MODEL = { providerID: "anthropic", id: "claude-haiku-4-5", variant: "default" }

function sessionFixture(): HostSessionMessage[] {
    return [
        { type: "user", id: "msg_user_1", time: { created: 1000 }, text: "List files" },
        {
            type: "assistant",
            id: "msg_asst_1",
            time: { created: 2000, completed: 2500 },
            agent: "general",
            model: { id: MODEL.id, providerID: MODEL.providerID, variant: "default" },
            content: [
                {
                    type: "tool",
                    id: "call_ls",
                    name: "shell",
                    state: {
                        status: "completed",
                        input: { command: "ls" },
                        content: [{ type: "text", text: "a.txt\nb.txt" }],
                        metadata: { title: "ls" },
                    },
                    time: { created: 2100, ran: 2200, completed: 2400 },
                },
            ],
            tokens: { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 3 } },
        },
        {
            type: "system",
            id: "msg_sys_1",
            time: { created: 2600 },
            text: "Catalog changed",
            description: "Instructions updated",
        },
        {
            type: "synthetic",
            id: "msg_dcp_note",
            time: { created: 2700 },
            text: "▣ DCP | notification",
            description: "DCP",
            metadata: { dcp: { kind: "notification" } },
        },
        { type: "user", id: "msg_user_2", time: { created: 3000 }, text: "Now say done" },
        {
            type: "assistant",
            id: "msg_asst_2",
            time: { created: 4000 },
            agent: "general",
            model: { id: MODEL.id, providerID: MODEL.providerID },
            content: [{ type: "text", text: "done" }],
            tokens: { input: 20, output: 2, reasoning: 0, cache: { read: 5, write: 0 } },
        },
    ]
}

function modelFixture(): HostModelMessage[] {
    return [
        {
            id: "msg_user_1",
            role: "user",
            content: [{ type: "text", text: "List files" }],
            metadata: {},
        },
        {
            id: "msg_asst_1",
            role: "assistant",
            content: [
                {
                    type: "tool-call",
                    id: "call_ls",
                    name: "shell",
                    input: { command: "ls" },
                    providerExecuted: false,
                    providerMetadata: { anthropic: { itemId: "x" } },
                },
            ],
        },
        {
            role: "tool",
            content: [
                {
                    type: "tool-result",
                    id: "call_ls",
                    name: "shell",
                    result: { type: "content", value: [{ type: "text", text: "a.txt\nb.txt" }] },
                    cache: { anthropic: true },
                },
            ],
        },
        { role: "system", content: [{ type: "text", text: "Catalog changed" }] },
        {
            id: "msg_dcp_note",
            role: "user",
            content: [{ type: "text", text: "▣ DCP | notification" }],
        },
        { id: "msg_user_2", role: "user", content: [{ type: "text", text: "Now say done" }] },
    ]
}

function buildView(modelMessages = modelFixture(), sessionMessages = sessionFixture()) {
    return createContextView({
        sessionID: SESSION_ID,
        agent: "general",
        model: MODEL,
        modelMessages,
        sessionMessages,
    })
}

test("context view builds DCP messages with session metadata and synthesized step-start", () => {
    const view = buildView()
    const ids = view.messages.map((message) => message.info.id)
    assert.deepEqual(ids, ["msg_user_1", "msg_asst_1", "msg_dcp_note", "msg_user_2"])

    const user = view.messages[0]
    assert.equal(user.info.role, "user")
    assert.equal(user.info.sessionID, SESSION_ID)
    assert.equal(user.info.time.created, 1000)
    assert.equal(user.info.agent, "general")

    const assistant = view.messages[1]
    assert.equal(assistant.info.role, "assistant")
    assert.equal(assistant.parts[0].type, "step-start")
    const tool = assistant.parts.find((part): part is ToolPart => part.type === "tool")
    assert.ok(tool)
    assert.equal(tool.callID, "call_ls")
    assert.equal(tool.tool, "shell")
    assert.equal(tool.state.status, "completed")
    assert.equal(tool.state.status === "completed" && tool.state.output, "a.txt\nb.txt")
    assert.equal(tool.state.status === "completed" && tool.state.title, "ls")
    assert.deepEqual(tool.state.input, { command: "ls" })
    if (assistant.info.role === "assistant") {
        assert.equal(assistant.info.tokens.cache.write, 3)
        assert.equal(assistant.info.time.completed, 2500)
    }

    const note = view.messages[2]
    assert.equal(note.parts[0].type === "text" && note.parts[0].ignored, true)
    assert.equal(note.parts[0].type === "text" && note.parts[0].synthetic, true)
})

test("apply() without edits preserves host message identity, order and passthroughs", () => {
    const original = modelFixture()
    const view = buildView(original)
    const rebuilt = view.apply()

    // DCP notification (ignored user message) must never reach the model
    assert.deepEqual(
        rebuilt.map((message) => message.id ?? message.role),
        ["msg_user_1", "msg_asst_1", "tool", "system", "msg_user_2"],
    )
    assert.equal(rebuilt[0], original[0])
    assert.equal(rebuilt[1], original[1])
    assert.equal(rebuilt[2], original[2])
    assert.equal(rebuilt[3], original[3])
    assert.equal(rebuilt[4], original[5])
})

test("pruned tool output is written back as a text result while the call stays untouched", () => {
    const original = modelFixture()
    const view = buildView(original)
    const tool = view.messages[1].parts.find((part): part is ToolPart => part.type === "tool")!
    assert.equal(tool.state.status, "completed")
    if (tool.state.status === "completed") tool.state.output = "[pruned]"

    const rebuilt = view.apply()
    assert.equal(rebuilt[1], original[1], "assistant message object reused")
    const toolMessage = rebuilt[2]
    assert.notEqual(toolMessage, original[2])
    assert.equal(toolMessage.role, "tool")
    const result = toolMessage.content[0] as {
        result: { type: string; value: unknown }
        cache?: unknown
    }
    // the fixture result is content-typed, so the text item is replaced in place
    assert.deepEqual(result.result, {
        type: "content",
        value: [{ type: "text", text: "[pruned]" }],
    })
    assert.deepEqual(result.cache, { anthropic: true }, "other result fields preserved")
})

test("pruned content-type results keep file attachments while replacing the text", () => {
    const original = modelFixture()
    ;(original[2].content[0] as { result: unknown }).result = {
        type: "content",
        value: [
            { type: "text", text: "a.txt\nb.txt" },
            { type: "file", uri: "file:///tmp/shot.png", mime: "image/png", name: "shot.png" },
        ],
    }
    const view = buildView(original)
    const tool = view.messages[1].parts.find((part): part is ToolPart => part.type === "tool")!
    assert.equal(
        tool.state.status === "completed" && tool.state.output.startsWith("a.txt\nb.txt"),
        true,
    )
    if (tool.state.status === "completed") tool.state.output = "[pruned]"

    const rebuilt = view.apply()
    const result = (rebuilt[2].content[0] as { result: { type: string; value: unknown[] } }).result
    assert.equal(result.type, "content")
    assert.deepEqual(result.value, [
        { type: "text", text: "[pruned]" },
        { type: "file", uri: "file:///tmp/shot.png", mime: "image/png", name: "shot.png" },
    ])
})

test("changed tool input rewrites the tool-call part and keeps provider metadata", () => {
    const original = modelFixture()
    const view = buildView(original)
    const tool = view.messages[1].parts.find((part): part is ToolPart => part.type === "tool")!
    tool.state.input.command = "[input removed]"

    const rebuilt = view.apply()
    const call = rebuilt[1].content[0] as { input: unknown; providerMetadata: unknown }
    assert.deepEqual(call.input, { command: "[input removed]" })
    assert.deepEqual(call.providerMetadata, { anthropic: { itemId: "x" } })
})

test("removed range is replaced by a synthetic summary and system passthrough is re-anchored", () => {
    const original = modelFixture()
    const view = buildView(original)
    const lastUser = view.messages[3]
    const summary = createSyntheticUserMessage(lastUser, "Summary of the listing", "b1:msg_user_1")

    // drop user_1 + asst_1 (the compressed range), insert the summary in their place
    view.messages.splice(0, 2, summary)

    const rebuilt = view.apply()
    assert.deepEqual(
        rebuilt.map((message) => message.id ?? message.role),
        [summary.info.id, "system", "msg_user_2"],
    )
    assert.equal(rebuilt[0].role, "user")
    assert.deepEqual(rebuilt[0].content, [{ type: "text", text: "Summary of the listing" }])
})

test("injected synthetic text parts become extra text content", () => {
    const original = modelFixture()
    const view = buildView(original)
    const user = view.messages[3]
    user.parts.push({
        id: "prt_dcp_text_1",
        sessionID: SESSION_ID,
        messageID: user.info.id,
        type: "text",
        text: "<dcp-message-id>m0003</dcp-message-id>",
    })

    const rebuilt = view.apply()
    const rebuiltUser = rebuilt.find((message) => message.id === "msg_user_2")!
    assert.notEqual(rebuiltUser, original[5])
    assert.equal(rebuiltUser.content.length, 2)
    assert.equal(rebuiltUser.content[0], original[5].content[0], "original text part reused")
    assert.deepEqual(rebuiltUser.content[1], {
        type: "text",
        text: "<dcp-message-id>m0003</dcp-message-id>",
    })
})

test("error tool results map to error state and rebuild as error results", () => {
    const model = modelFixture()
    ;(model[2].content[0] as { result: unknown }).result = { type: "error", value: "boom" }
    const view = buildView(model)
    const tool = view.messages[1].parts.find((part): part is ToolPart => part.type === "tool")!
    assert.equal(tool.state.status, "error")
    if (tool.state.status === "error") {
        assert.equal(tool.state.error, "boom")
        tool.state.input.command = "[input removed due to failed tool call]"
    }

    const rebuilt = view.apply()
    assert.equal(rebuilt[2], model[2], "unchanged result object reused")
    const call = rebuilt[1].content[0] as { input: Record<string, unknown> }
    assert.equal(call.input.command, "[input removed due to failed tool call]")
})

test("messages missing from the session history still get a usable view", () => {
    const view = buildView(
        [{ id: "msg_unknown", role: "user", content: [{ type: "text", text: "hi" }] }],
        [],
    )
    assert.equal(view.messages.length, 1)
    assert.equal(view.messages[0].info.agent, "general")
    assert.deepEqual(view.messages[0].info.role === "user" && view.messages[0].info.model, {
        providerID: "anthropic",
        modelID: "claude-haiku-4-5",
        variant: "default",
    })
})

test("apply() restores a trailing user message DCP removed so the request never ends with an assistant", () => {
    // text-only assistant followed by the user turn: dropping the user turn would leave an assistant last
    const original: HostModelMessage[] = [
        { id: "msg_user_1", role: "user", content: [{ type: "text", text: "hi" }] },
        { id: "msg_asst_1", role: "assistant", content: [{ type: "text", text: "hello" }] },
        { id: "msg_user_2", role: "user", content: [{ type: "text", text: "now say done" }] },
    ]
    const view = buildView(original, [
        { type: "user", id: "msg_user_1", time: { created: 1 }, text: "hi" },
        {
            type: "assistant",
            id: "msg_asst_1",
            time: { created: 2 },
            agent: "general",
            model: { id: MODEL.id, providerID: MODEL.providerID },
            content: [{ type: "text", text: "hello" }],
        },
        { type: "user", id: "msg_user_2", time: { created: 3 }, text: "now say done" },
    ])
    // simulate a (mis)compression that drops the final user turn
    view.messages.splice(2, 1)

    const rebuilt = view.apply()
    assert.equal(rebuilt.length, 3)
    assert.equal(rebuilt[2], original[2], "host's final user message restored verbatim")
})

test("enforceTerminalRole appends a continuation turn when the host context ends with an assistant", () => {
    const original: HostModelMessage[] = [
        { id: "u", role: "user", content: [{ type: "text", text: "start" }] },
        { id: "a", role: "assistant", content: [{ type: "text", text: "partial answer" }] },
    ]
    const result = enforceTerminalRole(original, [...original])
    assert.equal(result.length, 3)
    assert.deepEqual(result[2], {
        role: "user",
        content: [{ type: "text", text: CONTINUATION_TEXT }],
    })
})

test("enforceTerminalRole never re-attaches tool results whose assistant was removed", () => {
    const assistant: HostModelMessage = {
        id: "a2",
        role: "assistant",
        content: [{ type: "tool-call", id: "c1", name: "read", input: {} }],
    }
    const toolMessage: HostModelMessage = {
        role: "tool",
        content: [
            { type: "tool-result", id: "c1", name: "read", result: { type: "text", value: "x" } },
        ],
    }
    const earlier: HostModelMessage = {
        id: "a1",
        role: "assistant",
        content: [{ type: "text", text: "old" }],
    }
    const original = [
        { id: "u", role: "user", content: [{ type: "text", text: "go" }] } as HostModelMessage,
        earlier,
        assistant,
        toolMessage,
    ]
    // DCP compressed a2 away; the rebuilt context ends with a1
    const result = enforceTerminalRole(original, [original[0], earlier])
    assert.equal(result.length, 3)
    assert.equal(result[2].role, "user")
    assert.notEqual(result[2], toolMessage)
})

test("enforceTerminalRole keeps tool results attached when their assistant is still final", () => {
    const assistant: HostModelMessage = {
        id: "a1",
        role: "assistant",
        content: [{ type: "tool-call", id: "c1", name: "read", input: {} }],
    }
    const toolMessage: HostModelMessage = {
        role: "tool",
        content: [
            { type: "tool-result", id: "c1", name: "read", result: { type: "text", value: "x" } },
        ],
    }
    const original = [
        { id: "u", role: "user", content: [{ type: "text", text: "go" }] } as HostModelMessage,
        assistant,
        toolMessage,
    ]
    const clonedAssistant = { ...assistant }
    const result = enforceTerminalRole(original, [original[0], clonedAssistant])
    assert.deepEqual(result, [original[0], clonedAssistant, toolMessage])
})

test("enforceTerminalRole leaves requests that already end with a user or tool message untouched", () => {
    const rebuilt = modelFixture()
    assert.equal(enforceTerminalRole(rebuilt, rebuilt), rebuilt)
})

test("isCompactionRequest detects the V2 compaction instruction", () => {
    assert.equal(isCompactionRequest(modelFixture()), false)
    assert.equal(
        isCompactionRequest([
            ...modelFixture(),
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "You MUST summarize the conversation above into a structured summary",
                    },
                ],
            },
        ]),
        true,
    )
})

test("applySystemStrings appends to and rewrites system parts in place", () => {
    const parts: Array<{ type: "text"; text: string; cache?: unknown }> = [
        { type: "text", text: "base", cache: { anthropic: true } },
    ]
    applySystemStrings(parts as any, ["base\n\nDCP prompt"])
    assert.equal(parts.length, 1)
    assert.equal(parts[0].text, "base\n\nDCP prompt")
    assert.deepEqual(parts[0].cache, { anthropic: true })

    applySystemStrings(parts as any, ["base\n\nDCP prompt", "extra"])
    assert.equal(parts.length, 2)
    assert.equal(parts[1].text, "extra")
})
