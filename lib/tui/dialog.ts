import type { TuiApi } from "./types"

/** Configure a custom dialog before mounting its render function. */
export function showDialog(api: TuiApi, render: () => any) {
    api.context.ui.dialog.set({ size: "xlarge" })
    api.context.ui.dialog.show(render)
}
