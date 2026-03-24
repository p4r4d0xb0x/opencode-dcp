import { SessionState, WithParts } from "../state";
import { Logger } from "../logger";
/**
 * Get current token usage from the last assistant message.
 * Returns total tokens (input + output + reasoning + cache).
 */
export declare function getCurrentTokenUsage(messages: WithParts[]): number;
export declare function getCurrentParams(state: SessionState, messages: WithParts[], logger: Logger): {
    providerId: string | undefined;
    modelId: string | undefined;
    agent: string | undefined;
    variant: string | undefined;
};
export declare function countTokens(text: string): number;
export declare function estimateTokensBatch(texts: string[]): number;
export declare function extractToolContent(part: any): string[];
export declare function countToolTokens(part: any): number;
export declare function getTotalToolTokens(state: SessionState, toolIds: string[]): number;
export declare function countMessageTextTokens(msg: WithParts): number;
export declare function countAllMessageTokens(msg: WithParts): number;
//# sourceMappingURL=utils.d.ts.map