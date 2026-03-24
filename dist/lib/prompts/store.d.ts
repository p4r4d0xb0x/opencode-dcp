import type { Logger } from "../logger";
export type PromptKey = "system" | "compress" | "context-limit-nudge" | "turn-nudge" | "iteration-nudge";
export interface RuntimePrompts {
    system: string;
    compress: string;
    contextLimitNudge: string;
    turnNudge: string;
    iterationNudge: string;
    manualOverlay: string;
    subagentOverlay: string;
}
export declare const PROMPT_KEYS: PromptKey[];
export declare class PromptStore {
    private readonly logger;
    private readonly paths;
    private readonly customPromptsEnabled;
    private runtimePrompts;
    constructor(logger: Logger, workingDirectory: string, customPromptsEnabled?: boolean);
    getRuntimePrompts(): RuntimePrompts;
    reload(): void;
    private getOverrideCandidates;
    private ensureDefaultFiles;
}
//# sourceMappingURL=store.d.ts.map