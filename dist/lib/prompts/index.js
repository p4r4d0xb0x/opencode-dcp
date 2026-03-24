function stripLegacyInlineComments(content) {
    return content.replace(/^[ \t]*\/\/.*?\/\/[ \t]*$/gm, "");
}
function appendSystemOverlays(systemPrompt, overlays) {
    return [systemPrompt, ...overlays].filter(Boolean).join("\n\n");
}
export function renderSystemPrompt(prompts, manual, subagent) {
    const overlays = [];
    if (manual) {
        overlays.push(prompts.manualOverlay.trim());
    }
    if (subagent) {
        overlays.push(prompts.subagentOverlay.trim());
    }
    const strippedSystem = stripLegacyInlineComments(prompts.system).trim();
    const withOverlays = appendSystemOverlays(strippedSystem, overlays);
    return withOverlays.replace(/\n([ \t]*\n)+/g, "\n\n").trim();
}
//# sourceMappingURL=index.js.map