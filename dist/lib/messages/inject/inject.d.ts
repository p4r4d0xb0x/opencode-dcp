import type { SessionState, WithParts } from "../../state";
import type { Logger } from "../../logger";
import type { PluginConfig } from "../../config";
import type { RuntimePrompts } from "../../prompts/store";
export declare const injectCompressNudges: (state: SessionState, config: PluginConfig, logger: Logger, messages: WithParts[], prompts: RuntimePrompts) => void;
export declare const injectMessageIds: (state: SessionState, config: PluginConfig, messages: WithParts[]) => void;
//# sourceMappingURL=inject.d.ts.map