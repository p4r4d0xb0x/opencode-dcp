import type { SessionState, WithParts } from "../state";
export declare const createSyntheticUserMessage: (baseMessage: WithParts, content: string, variant?: string, stableSeed?: string) => WithParts;
export declare const createSyntheticTextPart: (baseMessage: WithParts, content: string, stableSeed?: string) => {
    id: string;
    sessionID: string;
    messageID: string;
    type: "text";
    text: string;
};
type MessagePart = WithParts["parts"][number];
type ToolPart = Extract<MessagePart, {
    type: "tool";
}>;
export declare const appendIdToTool: (part: ToolPart, tag: string) => boolean;
export declare const findLastToolPart: (message: WithParts) => ToolPart | null;
export declare function buildToolIdList(state: SessionState, messages: WithParts[]): string[];
export declare const isIgnoredUserMessage: (message: WithParts) => boolean;
export declare const stripHallucinationsFromString: (text: string) => string;
export declare const stripHallucinations: (messages: WithParts[]) => void;
export {};
//# sourceMappingURL=utils.d.ts.map