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

export class AllPage extends Page {
    constructor() {
        super(0, 0);
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
export function get(url: string, success: (resp: string) => void) {
    let xmlhttp = createRequest();
    xmlhttp.open("GET", url, true);
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                success && success(this.responseText);
            } else {
                (<any>xmlhttp).errorCallback && (<any>xmlhttp).errorCallback(this);
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
export function post(url: string, data: any, json = true, success: Function) {
    let xmlhttp = createRequest();
    xmlhttp.open("POST", url, true);
    if (json) {
        xmlhttp.setRequestHeader("Content-Type", "application/json");
    } else {
        xmlhttp.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    }
    xmlhttp.onreadystatechange = function () {
        if (this.readyState == 4) {
            if (this.status == 200) {
                success && success(this.responseText);
            } else {
                (<any>xmlhttp).errorCallback && (<any>xmlhttp).errorCallback(this);
            }
        }
    };

    xmlhttp.send(data);
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
