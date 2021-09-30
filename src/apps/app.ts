import { SystemConfig } from "@App/pkg/config";
import { ICache } from "@App/pkg/storage/cache/cache";
import { Logger } from "./logger/logger";

export const ENV_BACKGROUND = 'background';
export const ENV_FRONTEND = 'frontend';
export class App {
    public static Log: Logger;
    public static Cache: ICache;
    public static Environment: string;
    public static ExtensionId: string;
}

export interface Component {
    Log: Logger
    Cache: ICache
    Environment: string
}

export function InitApp(Component: Component) {
    App.Log = Component.Log;
    App.Cache = Component.Cache;
    App.Environment = Component.Environment;
    if (App.Environment == ENV_BACKGROUND) {
        App.ExtensionId = chrome.runtime.getURL('');
        App.ExtensionId = App.ExtensionId.substr(0, App.ExtensionId.length - 1);
    }
}
