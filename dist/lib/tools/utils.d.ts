import type { CompressionBlock, SessionState, WithParts } from "../state";
export interface CompressToolArgs {
    topic: string;
    content: {
        startId: string;
        endId: string;
        summary: string;
    };
}
export interface FlatCompressToolArgs {
    topic: string;
    startId: string;
    endId: string;
    summary: string;
}
export declare function normalizeCompressArgs(args: Record<string, unknown>): CompressToolArgs;
export interface BoundaryReference {
    kind: "message" | "compressed-block";
    rawIndex: number;
    messageId?: string;
    blockId?: number;
    anchorMessageId?: string;
}
export interface SearchContext {
    rawMessages: WithParts[];
    rawMessagesById: Map<string, WithParts>;
    rawIndexById: Map<string, number>;
    summaryByBlockId: Map<number, CompressionBlock>;
}
export interface RangeResolution {
    startReference: BoundaryReference;
    endReference: BoundaryReference;
    messageIds: string[];
    messageTokenById: Map<string, number>;
    toolIds: string[];
    requiredBlockIds: number[];
}
export interface ParsedBlockPlaceholder {
    raw: string;
    blockId: number;
    startIndex: number;
    endIndex: number;
}
export interface InjectedSummaryResult {
    expandedSummary: string;
    consumedBlockIds: number[];
}
export interface AppliedCompressionResult {
    compressedTokens: number;
    messageIds: string[];
    newlyCompressedMessageIds: string[];
    newlyCompressedToolIds: string[];
}
export interface CompressionStateInput {
    topic: string;
    startId: string;
    endId: string;
    compressMessageId: string;
}
export declare const COMPRESSED_BLOCK_HEADER = "[Compressed conversation section]";
export declare function formatBlockPlaceholder(blockId: number): string;
export declare function validateCompressArgs(args: CompressToolArgs): void;
export declare function fetchSessionMessages(client: any, sessionId: string): Promise<WithParts[]>;
export declare function buildSearchContext(state: SessionState, rawMessages: WithParts[]): SearchContext;
export declare function resolveBoundaryIds(context: SearchContext, state: SessionState, startId: string, endId: string): {
    startReference: BoundaryReference;
    endReference: BoundaryReference;
};
export declare function resolveRange(context: SearchContext, startReference: BoundaryReference, endReference: BoundaryReference): RangeResolution;
export declare function resolveAnchorMessageId(startReference: BoundaryReference): string;
export declare function parseBlockPlaceholders(summary: string): ParsedBlockPlaceholder[];
export declare function validateSummaryPlaceholders(placeholders: ParsedBlockPlaceholder[], requiredBlockIds: number[], startReference: BoundaryReference, endReference: BoundaryReference, summaryByBlockId: Map<number, CompressionBlock>): number[];
export declare function injectBlockPlaceholders(summary: string, placeholders: ParsedBlockPlaceholder[], summaryByBlockId: Map<number, CompressionBlock>, startReference: BoundaryReference, endReference: BoundaryReference): InjectedSummaryResult;
export declare function allocateBlockId(state: SessionState): number;
export declare function wrapCompressedSummary(blockId: number, summary: string): string;
export declare function applyCompressionState(state: SessionState, input: CompressionStateInput, range: RangeResolution, anchorMessageId: string, blockId: number, summary: string, consumedBlockIds: number[]): AppliedCompressionResult;
export declare function appendProtectedUserMessages(summary: string, range: RangeResolution, searchContext: SearchContext, state: SessionState, enabled: boolean): string;
export declare function appendProtectedTools(client: any, state: SessionState, allowSubAgents: boolean, summary: string, range: RangeResolution, searchContext: SearchContext, protectedTools: string[], protectedFilePatterns?: string[]): Promise<string>;
export declare function appendMissingBlockSummaries(summary: string, missingBlockIds: number[], summaryByBlockId: Map<number, CompressionBlock>, consumedBlockIds: number[]): InjectedSummaryResult;
//# sourceMappingURL=utils.d.ts.map