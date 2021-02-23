
//@copyright https://github.com/silverwzw/Tampermonkey-Typescript-Declaration

declare var unsafeWindow: Window;

declare var GM_info: {
    version: string,
    scriptWillUpdate: boolean,
    scriptHandler: "Tampermonkey",
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

declare function GM_addStyle(css: string): void;

declare function GM_deleteValue(name: string): void;

declare function GM_listValues(): string[];

declare function GM_addValueChangeListener(name: string, listener: GM_Types.ValueChangeListener): number;

declare function GM_removeValueChangeListener(listenerId: number): void;

declare function GM_setValue(name: string, value: any): void;

declare function GM_getValue(name: string, defaultValue?: any): any;

declare function GM_log(message: string): any;

declare function GM_getResourceText(name: string): string;

declare function GM_getResourceURL(name: string): string;

declare function GM_registerMenuCommand(name: string, listener: Function, accessKey?: string): number;

declare function GM_unregisterMenuCommand(id: number): void;

declare function GM_openInTab(url: string, options: GM_Types.OpenTabOptions): void;
declare function GM_openInTab(url: string, loadInBackground: boolean): void;
declare function GM_openInTab(url: string): void;

declare function GM_xmlhttpRequest<CONTEXT_TYPE>(details: GM_Types.XHRDetails<CONTEXT_TYPE>): GM_Types.AbortHandle<void>;


declare function GM_download(details: GM_Types.DownloadDetails): GM_Types.AbortHandle<boolean>;
declare function GM_download(url: string, filename: string): GM_Types.AbortHandle<boolean>;

declare function GM_getTab(callback: (obj: object) => any): void;
declare function GM_saveTab(obj: object): void;
declare function GM_getTabs(callback: (objs: { [key: number]: object }) => any): void;

declare function GM_notification(details: GM_Types.NotificationDetails, ondone: Function): void;
declare function GM_notification(text: string, title: string, image: string, onclick: Function): void;

declare function GM_setClipboard(data: string, info?: string | { type?: string, minetype?: string }): void;

declare namespace GM_Types {

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
    }

    interface XHRProgress extends XHRResponse {
        done: number,
        lengthComputable: boolean,
        loaded: number,
        position: number,
        total: number,
        totalSize: number
    }

    type Listener<OBJ> = (event: OBJ) => any;

    interface XHRDetails {
        method?: "GET" | "HEAD" | "POST",
        url?: string,
        headers?: { readonly [key: string]: string },
        data?: string,
        binary?: boolean,
        timeout?: number,
        context?: CONTEXT_TYPE,
        responseType?: "arraybuffer" | "blob" | "json",
        overrideMimeType?: string,
        anonymous?: boolean,
        fetch?: boolean,
        username?: string,
        password?: string,

        onload?: Listener<XHRResponse>,
        onloadstart?: Listener<XHRResponse>,
        onprogress?: Listener<XHRProgress>,
        onreadystatechange?: Listener<XHRResponse>,
        ontimeout?: Listener<Function>,
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

    type NotificationOnClick = (this: NotificationThis) => any;
    type NotificationOnDone = (this: NotificationThis, clicked: boolean) => any;

    interface NotificationDetails {
        text?: string
        title?: string
        image?: string
        highlight?: boolean
        silent?: boolean
        timeout?: number
        onclick?: NotificationOnClick
        ondone?: NotificationOnDone
    }
}
