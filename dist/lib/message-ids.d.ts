import type { SessionState, WithParts } from "./state";
export declare const MESSAGE_REF_MAX_INDEX = 9999;
export type ParsedBoundaryId = {
    kind: "message";
    ref: string;
    index: number;
} | {
    kind: "compressed-block";
    ref: string;
    blockId: number;
};
export declare function formatMessageRef(index: number): string;
export declare function formatBlockRef(blockId: number): string;
export declare function parseMessageRef(ref: string): number | null;
export declare function parseBlockRef(ref: string): number | null;
export declare function parseBoundaryId(id: string): ParsedBoundaryId | null;
export declare function formatMessageIdTag(ref: string): string;
export declare function assignMessageRefs(state: SessionState, messages: WithParts[]): number;
//# sourceMappingURL=message-ids.d.ts.map