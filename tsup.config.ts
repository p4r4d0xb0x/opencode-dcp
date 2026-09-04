import { defineConfig } from "tsup"

export default defineConfig({
    entry: ["index.ts", "tui.tsx", "lib/opencode/rpc.ts"],
    format: ["esm"],
    dts: false,
    clean: true,
    sourcemap: true,
    noExternal: ["jsonc-parser"], // Bundle this to fix its broken ESM imports
})
