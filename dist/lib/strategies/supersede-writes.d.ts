import { PluginConfig } from "../config";
import { Logger } from "../logger";
import type { SessionState, WithParts } from "../state";
/**
 * Supersede Writes strategy - prunes write tool inputs for files that have
 * subsequently been read. When a file is written and later read, the original
 * write content becomes redundant since the current file state is captured
 * in the read result.
 *
 * Modifies the session state in place to add pruned tool call IDs.
 */
export declare const supersedeWrites: (state: SessionState, logger: Logger, config: PluginConfig, messages: WithParts[]) => void;
//# sourceMappingURL=supersede-writes.d.ts.map