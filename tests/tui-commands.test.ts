import assert from "node:assert/strict"
import test from "node:test"
import { CommandsHost } from "../lib/tui/commands-host"
import { registerCommands } from "../lib/tui/commands"
import type { DcpCommand, TuiApi } from "../lib/tui/types"

function makeApi() {
    const calls: string[] = []
    let registeredRender: (() => unknown) | undefined
    const api = {
        context: {
            keymap: {
                // Forbidden: imperative `setup` must never invoke the
                // component-owned keymap API directly.
                layer: () => {
                    calls.push("keymap.layer")
                },
            },
            ui: {
                slot: (claim: { append: string; render: () => unknown }) => {
                    calls.push(`slot:${claim.append}`)
                    registeredRender = claim.render
                    return () => {
                        calls.push("slot:dispose")
                    }
                },
            },
        },
    } as unknown as TuiApi
    return { api, calls, getRender: () => registeredRender }
}

test("registerCommands installs DCP commands through the host slot, not imperatively", () => {
    const { api, calls, getRender } = makeApi()
    const commands: DcpCommand[] = [
        {
            title: "DCP",
            name: "panel",
            description: "panel",
            slashName: "dcp",
            run: () => undefined,
        },
    ]

    const cleanup = registerCommands(api, commands)

    // The slot claim is the documented bridge that mounts the keymap layer
    // inside the host `KeymapProvider`. The forbidden imperative call must
    // not happen during registration; it happens only when the host mounts
    // the returned render function.
    assert.deepEqual(calls, ["slot:app"])
    assert.equal(typeof cleanup, "function")
    assert.equal(typeof getRender(), "function")

    // Run cleanup before the host ever mounts the render and assert no
    // keymap invocation leaked out of `setup`.
    cleanup()
    assert.deepEqual(calls, ["slot:app", "slot:dispose"])
})

test("CommandsHost installs the keymap layer when mounted", () => {
    const calls: string[] = []
    const commands: DcpCommand[] = [
        {
            title: "DCP",
            name: "panel",
            description: "panel",
            slashName: "dcp",
            run: () => undefined,
        },
    ]
    const api = {
        context: {
            keymap: {
                layer: (input: () => unknown) => {
                    calls.push("layer")
                    const layer = input()
                    // The layer factory must yield the documented DCP
                    // command shape so `/dcp` is discoverable.
                    assert.equal(layer.mode, "global")
                    assert.deepEqual(
                        (
                            layer as { commands: Array<{ id: string; slash: { name: string } }> }
                        ).commands.map((command) => [command.id, command.slash.name]),
                        [["dcp.panel", "dcp"]],
                    )
                },
            },
        },
    } as unknown as TuiApi

    const result = CommandsHost({ api, commands })

    assert.deepEqual(calls, ["layer"])
    // Invisible mount: no visible DOM is produced.
    assert.equal(result, null)
})
