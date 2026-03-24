import type { PluginInput } from "@opencode-ai/plugin";
type Permission = "ask" | "allow" | "deny";
export interface Deduplication {
    enabled: boolean;
    protectedTools: string[];
}
export interface CompressTool {
    permission: Permission;
    showCompression: boolean;
    maxContextLimit: number | `${number}%`;
    minContextLimit: number | `${number}%`;
    modelMaxLimits?: Record<string, number | `${number}%`>;
    modelMinLimits?: Record<string, number | `${number}%`>;
    nudgeFrequency: number;
    iterationNudgeThreshold: number;
    nudgeForce: "strong" | "soft";
    flatSchema: boolean;
    protectedTools: string[];
    protectUserMessages: boolean;
}
export interface Commands {
    enabled: boolean;
    protectedTools: string[];
}
export interface ManualModeConfig {
    enabled: boolean;
    automaticStrategies: boolean;
}
export interface SupersedeWrites {
    enabled: boolean;
}
export interface PurgeErrors {
    enabled: boolean;
    turns: number;
    protectedTools: string[];
}
export interface TurnProtection {
    enabled: boolean;
    turns: number;
}
export interface ExperimentalConfig {
    allowSubAgents: boolean;
    customPrompts: boolean;
}
export interface PluginConfig {
    enabled: boolean;
    debug: boolean;
    pruneNotification: "off" | "minimal" | "detailed";
    pruneNotificationType: "chat" | "toast";
    commands: Commands;
    manualMode: ManualModeConfig;
    turnProtection: TurnProtection;
    experimental: ExperimentalConfig;
    protectedFilePatterns: string[];
    compress: CompressTool;
    strategies: {
        deduplication: Deduplication;
        supersedeWrites: SupersedeWrites;
        purgeErrors: PurgeErrors;
    };
}
export declare const VALID_CONFIG_KEYS: Set<string>;
export declare function getInvalidConfigKeys(userConfig: Record<string, any>): string[];
interface ValidationError {
    key: string;
    expected: string;
    actual: string;
}
export declare function validateConfigTypes(config: Record<string, any>): ValidationError[];
export declare function getConfig(ctx: PluginInput): PluginConfig;
export {};
//# sourceMappingURL=config.d.ts.map