import type { Logger } from "../logger";
import type { SessionState } from "../state";
import { ToolParameterEntry } from "../state";
import { PluginConfig } from "../config";
export type PruneReason = "completion" | "noise" | "extraction";
export declare const PRUNE_REASON_LABELS: Record<PruneReason, string>;
export declare function sendUnifiedNotification(client: any, logger: Logger, config: PluginConfig, state: SessionState, sessionId: string, pruneToolIds: string[], toolMetadata: Map<string, ToolParameterEntry>, reason: PruneReason | undefined, params: any, workingDirectory: string): Promise<boolean>;
export declare function sendCompressNotification(client: any, logger: Logger, config: PluginConfig, state: SessionState, sessionId: string, compressionId: number, summary: string, summaryTokens: number, totalSessionTokens: number, sessionMessageIds: string[], params: any): Promise<boolean>;
export declare function sendIgnoredMessage(client: any, sessionID: string, text: string, params: any, logger: Logger): Promise<void>;
//# sourceMappingURL=notification.d.ts.map