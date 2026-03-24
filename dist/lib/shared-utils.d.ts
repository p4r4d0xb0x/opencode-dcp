import type { PluginConfig } from "./config";
import { type HostPermissionSnapshot } from "./host-permissions";
import { SessionState, WithParts } from "./state";
export declare const isMessageCompacted: (state: SessionState, msg: WithParts) => boolean;
export declare const getLastUserMessage: (messages: WithParts[], startIndex?: number) => WithParts | null;
export declare const compressPermission: (state: SessionState, config: PluginConfig) => "ask" | "allow" | "deny";
export declare const syncCompressPermissionState: (state: SessionState, config: PluginConfig, hostPermissions: HostPermissionSnapshot, messages: WithParts[]) => void;
//# sourceMappingURL=shared-utils.d.ts.map