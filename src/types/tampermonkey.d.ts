
//@copyright https://github.com/silverwzw/Tampermonkey-Typescript-Declaration

declare var unsafeWindow: Window;

declare var GM_info: {
    version: string,
    scriptWillUpdate: boolean,
    scriptHandler: "ScriptCat",
    scriptUpdateURL?: string,
    scriptSource: string,
    scriptMetaStr?: string,
    isIncognito: boolean,
    downloadMode: "native" | "disabled" | "browser",
    script: {
        author?: string,
        description?: string,
        excludes: string[],
        homepage?: string,
        icon?: string,
        icon64?: string,
        includes?: string[],
        lastModified: number,
        matches: string[],
        name: string,
        namespace?: string,
        position: number,
        "run-at": string,
        resources: string[],
        unwrap: boolean,
        version: string,
        options: {
            awareOfChrome: boolean,
            run_at: string,
            noframes?: boolean,
            compat_arrayLeft: boolean,
            compat_foreach: boolean,
            compat_forvarin: boolean,
            compat_metadata: boolean,
            compat_uW_gmonkey: boolean,
            override: {
                orig_excludes: string[],
                orig_includes: string[],
                use_includes: string[],
                use_excludes: string[],
                [key: string]: any,
            },
            [key: string]: any,
        },
        [key: string]: any,
    },
    [key: string]: any,
};

declare function GM_addStyle(css: string): HTMLElement;

declare function GM_deleteValue(name: string): void;

declare function GM_listValues(): string[];

declare function GM_addValueChangeListener(name: string, listener: GM_Types.ValueChangeListener): number;

declare function GM_removeValueChangeListener(listenerId: number): void;

declare function GM_setValue(name: string, value: any): void;

declare function GM_getValue(name: string, defaultValue?: any): any;

declare function GM_log(message: string, level?: GM_Types.LOGGER_LEVEL): any;

declare function GM_getResourceText(name: string): string;

declare function GM_getResourceURL(name: string): string;

declare function GM_registerMenuCommand(name: string, listener: Function, accessKey?: string): number;

declare function GM_unregisterMenuCommand(id: number): void;

declare interface tab {
    close()
    onclose?: () => void
    closed?: boolean
    name?: string
}

declare function GM_openInTab(url: string, options: GM_Types.OpenTabOptions): tab;
declare function GM_openInTab(url: string, loadInBackground: boolean): tab;
declare function GM_openInTab(url: string): tab;

declare function GM_xmlhttpRequest(details: GM_Types.XHRDetails): GM_Types.AbortHandle<void>;

declare function GM_download(details: GM_Types.DownloadDetails): GM_Types.AbortHandle<boolean>;
declare function GM_download(url: string, filename: string): GM_Types.AbortHandle<boolean>;

declare function GM_getTab(callback: (obj: object) => any): void;
declare function GM_saveTab(obj: object): void;
declare function GM_getTabs(callback: (objs: { [key: number]: object }) => any): void;

declare function GM_notification(details: GM_Types.NotificationDetails, ondone: GM_Types.NotificationOnDone): void;
declare function GM_notification(text: string, title: string, image: string, onclick: GM_Types.NotificationOnClick): void;
declare function GM_closeNotification(id: string): void;
declare function GM_updateNotification(id: string, details: GM_Types.NotificationDetails): void;

declare function GM_setClipboard(data: string, info?: string | { type?: string, minetype?: string }): void;

declare function GM_cookie(action: GM_Types.CookieAction, details: GM_Types.CookieDetails, ondone: (cookie: GM_Types.Cookie[], error: any) => void): void;

declare function CAT_setProxy(rule: CAT_Types.ProxyRule[] | string): void;
declare function CAT_clearProxy(): void;
declare function CAT_click(x: number, y: number): void;
// 同步函数
declare namespace GM {
    declare function fetch(details: GM_Types.XHRDetails): Promise<GM_Types.XHRResponse>;
}

declare namespace CAT_Types {
    interface ProxyRule {
        proxyServer: ProxyServer
        matchUrl: string[]
    }
    type ProxyScheme = "http" | "https" | "quic" | "socks4" | "socks5";
    interface ProxyServer {
        scheme?: ProxyScheme
        host: string
        port?: number
    }
}

declare namespace GM_Types {

    type CookieAction = "list" | "delete" | "set";

    type LOGGER_LEVEL = 'debug' | 'info' | 'warn' | 'error';

    interface CookieDetails {
        url?: string
        name: string
        value?: string
        domain?: string
        path?: string
        secure?: boolean
        session?: boolean
        httpOnly?: boolean
        expirationDate?: number
    }

    interface Cookie {
        domain: string;
        name: string;
        storeId: string;
        value: string;
        session: boolean;
        hostOnly: boolean;
        expirationDate?: number;
        path: string;
        httpOnly: boolean;
        secure: boolean;
    }


    type ValueChangeListener = (name: string, oldValue: any, newValue: any, remote: boolean) => any;

    interface OpenTabOptions {
        active?: boolean,
        insert?: boolean,
        setParent?: boolean
    }

    interface XHRResponse {
        finalUrl?: string,
        readyState?: 0 | 1 | 2 | 3 | 4,
        responseHeaders?: string,
        status?: number,
        statusText?: string,
        response?: any,
        responseText?: string,
        responseXML?: Document | null
        responseType?: "arraybuffer" | "blob" | "json"
    }

    interface XHRProgress extends XHRResponse {
        done: number,
        lengthComputable: boolean,
        loaded: number,
        position?: number,
        total: number,
        totalSize: number
    }

    type Listener<OBJ> = (event: OBJ) => any;

    interface XHRDetails {
        method?: "GET" | "HEAD" | "POST" | "PUT" | "DELETE"
        url: string
        headers?: { [key: string]: string }
        data?: string
        cookie?: string
        binary?: boolean
        timeout?: number
        context?: CONTEXT_TYPE
        responseType?: "arraybuffer" | "blob" | "json"
        overrideMimeType?: string,
        anonymous?: boolean,
        fetch?: boolean,
        user?: string,
        password?: string,
        nocache?: boolean

        onload?: Listener<XHRResponse>,
        onloadstart?: Listener<XHRResponse>,
        onloadend?: Listener<XHRResponse>,
        onprogress?: Listener<XHRProgress>,
        onreadystatechange?: Listener<XHRResponse>,
        ontimeout?: Function,
        //TODO
        onabort?: Function,
        onerror?: Function
    }

    interface AbortHandle<RETURN_TYPE> {
        abort(): RETURN_TYPE
    }

    interface DownloadError {
        error: "not_enabled" | "not_whitelisted" | "not_permitted" | "not_supported" | "not_succeeded",
        details?: string
    }

    interface DownloadDetails {
        url: string,
        name: string,
        headers?: { readonly [key: string]: string },
        saveAs?: boolean,
        timeout?: number,
        onerror?: Listener<DownloadError>,
        ontimeout?: Listener<object>,
        onload?: Listener<object>,
        onprogress?: Listener<XHRProgress<void>>
    }

    interface NotificationThis extends NotificationDetails {
        id: string
    }

    type NotificationOnClick = (this: NotificationThis, id: string, index?: number) => any;
    type NotificationOnDone = (this: NotificationThis, clicked: boolean, id: string) => any;

    interface NotificationButton {
        title: string
        iconUrl?: string
    }

    interface NotificationDetails {
        text?: string
        title?: string
        image?: string
        highlight?: boolean
        silent?: boolean
        timeout?: number
        onclick?: NotificationOnClick
        ondone?: NotificationOnDone
        progress?: number
        oncreate?: NotificationOnClick
        buttons?: NotificationButton[]
    }

}
