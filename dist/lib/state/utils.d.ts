import type { CompressionBlock, PruneMessagesState, PrunedMessageEntry, SessionState, WithParts } from "./types";
interface PersistedPruneMessagesState {
    byMessageId?: Record<string, PrunedMessageEntry>;
    blocksById?: Record<string, CompressionBlock>;
    activeBlockIds?: number[];
    activeByAnchorMessageId?: Record<string, number>;
    nextBlockId?: number;
}
export declare function isSubAgentSession(client: any, sessionID: string): Promise<boolean>;
export declare function findLastCompactionTimestamp(messages: WithParts[]): number;
export declare function countTurns(state: SessionState, messages: WithParts[]): number;
export declare function loadPruneMap(obj?: Record<string, number>): Map<string, number>;
export declare function createPruneMessagesState(): PruneMessagesState;
export declare function loadPruneMessagesState(persisted?: PersistedPruneMessagesState): PruneMessagesState;
export declare function collectTurnNudgeAnchors(messages: WithParts[]): Set<string>;
export declare function resetOnCompaction(state: SessionState): void;
export {};
//# sourceMappingURL=utils.d.ts.map