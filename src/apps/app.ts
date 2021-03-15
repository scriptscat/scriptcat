import { ICache } from "@App/pkg/cache/cache";
import { Logger } from "./logger/logger";

export class App {
    public static Log = new Logger();
    public static Cache: ICache;
    public static Environment: string;
    public static ExtensionId: string;
}

export function InitApp() {
    App.ExtensionId = chrome.runtime.getURL('');
    App.ExtensionId = App.ExtensionId.substr(0, App.ExtensionId.length - 1);
}
