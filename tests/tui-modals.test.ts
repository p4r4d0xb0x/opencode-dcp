import assert from "node:assert/strict"
import test from "node:test"
import { showDialog } from "../lib/tui/dialog"
import type { TuiApi } from "../lib/tui/types"

test("showDialog sets the custom size before rendering", () => {
    const events: string[] = []
    const render = () => null
    const api = {
        context: {
            ui: {
                dialog: {
                    set: (options: { size: string }) => events.push(`set:${options.size}`),
                    show: (callback: () => unknown) => {
                        assert.equal(callback, render)
                        events.push("show")
                    },
                },
            },
        },
    } as unknown as TuiApi

    showDialog(api, render)

    assert.deepEqual(events, ["set:xlarge", "show"])
})
