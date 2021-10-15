import { App } from "@App/apps/app";
import { Logger } from "@App/apps/msg-center/event";
import { LOGGER_LEVEL } from "@App/model/do/logger";

export class Page {
    protected _page: number;
    protected _count: number;
    protected _order: string;
    protected _sort: "asc" | "desc";

    constructor(page: number, count: number, sort?: "asc" | "desc", order?: string) {
        this._page = page;
        this._count = count;
        this._order = order || "id";
        this._sort = sort || "desc";
    }

    public page() {
        return this._page;
    }

    public count() {
        return this._count;
    }

    public order() {
        return this._order;
    }

    public sort() {
        return this._sort;
    }
}

export function randomString(e: number) {
    e = e || 32;
    var t = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz",
        a = t.length,
        n = "";
    for (let i = 0; i < e; i++) n += t.charAt(Math.floor(Math.random() * a));
    return n;
}

export function isFirefox() {
    if (navigator.userAgent.indexOf("Firefox") >= 0) {
        return true;
    }
    return false;
}

export function SendLogger(level: LOGGER_LEVEL, origin: string, msg: string, title: string = "", scriptId?: number) {
    top!.postMessage(
        {
            action: Logger,
            data: {
                level: level,
                message: msg,
                origin: origin,
                title: title,
                scriptId: scriptId,
            },
        },
        "*",
    );
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function dealScript(url: string, source: string): string {
    source = "//# sourceURL=" + url + "\n" + source;
    return dealSymbol(source);
}

export function dealSymbol(source: string): string {
    source = source.replace(/("|\\)/g, "\\$1");
    source = source.replace(/(\r\n|\n)/g, "\\n");
    return source;
}


/**
 * get请求
 * @param {*} url
 */
export function get(url: string, success?: (resp: string) => void, error?: (resp: XMLHttpRequest) => void) {
    let xmlhttp = createRequest();
    xmlhttp.open("GET", url, true);
    xmlhttp.onerror = () => error && error(xmlhttp);
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                success && success(this.responseText);
            } else {
                error && error(this);
            }
        }
    };
    xmlhttp.send();
    return xmlhttp;
}

/**
 * get请求
 * @param {*} url
 */
export function getJson(url: string, success: (resp: any) => void, error?: () => void) {
    let xmlhttp = createRequest();
    xmlhttp.open("GET", url, true);
    xmlhttp.onerror = () => error && error();
    xmlhttp.responseType = 'json';
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                success && success(this.response);
            } else {
                error && error();
            }
        }
    };
    xmlhttp.send();
    return xmlhttp;
}


/**
 * post请求
 * @param {*} url
 * @param {*} data
 * @param {*} json
 */
export function post(url: string, data: string, success: (resp: string) => void, error?: () => void) {
    let xmlhttp = createRequest();
    xmlhttp.open("POST", url, true);
    xmlhttp.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xmlhttp.onerror = () => error && error();
    xmlhttp.responseType = 'json';
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                success && success(this.response);
            } else {
                error && error();
            }
        }
    };
    xmlhttp.send(data);
    return xmlhttp;
}

/**
 * post请求
 * @param {*} url
 * @param {*} data
 * @param {*} json
 */
export function postJson(url: string, data: any, success: (resp: any) => void, error?: () => void) {
    let xmlhttp = createRequest();
    xmlhttp.open("POST", url, true);
    xmlhttp.setRequestHeader("Content-Type", "application/json");
    xmlhttp.onerror = () => error && error();
    xmlhttp.responseType = 'json';
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                success && success(this.response);
            } else {
                error && error();
            }
        }
    };
    xmlhttp.send(JSON.stringify(data));
    return xmlhttp;
}

/**
 * put请求
 * @param {*} url
 * @param {*} data
 * @param {*} json
 */
export function put(url: string, data: string, success: (resp: any) => void, error?: () => void) {
    let xmlhttp = createRequest();
    xmlhttp.open("PUT", url, true);
    xmlhttp.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xmlhttp.onerror = () => error && error();
    xmlhttp.responseType = 'json';
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                success && success(this.response);
            } else {
                error && error();
            }
        }
    };
    xmlhttp.send(data);
    return xmlhttp;
}


/**
 * put请求
 * @param {*} url
 * @param {*} data
 * @param {*} json
 */
export function putJson(url: string, data: any, success: (resp: any) => void, error?: () => void) {
    let xmlhttp = createRequest();
    xmlhttp.open("PUT", url, true);
    xmlhttp.setRequestHeader("Content-Type", "application/json");
    xmlhttp.onerror = () => error && error();
    xmlhttp.responseType = 'json';
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                success && success(this.response);
            } else {
                error && error();
            }
        }
    };
    xmlhttp.send(JSON.stringify(data));
    return xmlhttp;
}


/**
 * 创建http请求
 */
function createRequest(): XMLHttpRequest {
    let xmlhttp = new XMLHttpRequest();
    (<any>xmlhttp).error = function (callback: Function) {
        (<any>xmlhttp).errorCallback = callback;
        return xmlhttp;
    };
    xmlhttp.withCredentials = true;
    return xmlhttp;
}

export function randomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function InfoNotification(title: string, msg: string) {
    chrome.notifications.create({
        type: "basic",
        title: title,
        message: msg,
        iconUrl: chrome.runtime.getURL("assets/logo.png")
    });
    App.Log.Info("system", msg, title);
}

export function blobToBase64(blob: Blob): Promise<string | null> {
    return new Promise((resolve, _) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(<string | null>reader.result);
        reader.readAsDataURL(blob);
    });
}

export function base64ToStr(base64: string): string {
    return decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

export function strToBase64(str: string): string {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        (match, p1) => {
            return String.fromCharCode(parseInt('0x' + p1, 16));
        }));
}

export class waitGroup {

    num = 0;
    callback: () => void;

    constructor(callback: () => void) {
        this.callback = callback;
    }

    done() {
        this.num--;
        if (this.num == 0) {
            this.callback();
        }
    }

    add(val: number) {
        this.num += val;
        if (this.num == 0) {
            this.callback();
        }
    }
}