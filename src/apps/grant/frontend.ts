import { ScriptCache } from '@App/model/do/script';
import { Value } from '@App/model/do/value';
import { addStyle } from '@App/pkg/frontend';
import { blobToBase64, randomInt, randomString } from '@App/pkg/utils/utils';
import { url } from 'inspector';
import { BrowserMsg, ListenMsg } from '../msg-center/browser';
import { AppEvent, ScriptValueChange } from '../msg-center/event';
import { Grant } from './interface';

type Callback = (grant: Grant) => void;
type FrontendApi = () => any;

interface DescriptionParam {
    depend?: string[]
    listener?: () => void
}

export interface FrontenApiValue {
    api: FrontendApi
    param: DescriptionParam
}

export interface ScriptContext {
    [key: string]: any

    getApi(grant: string): FrontenApiValue | undefined;
    ValueChange(name: string, value: Value): void;
    GM_info(): any;
}

export class FrontendGrant implements ScriptContext {

    public request = new Map<string, Callback>();

    public static apis = new Map<string, FrontenApiValue>();

    public script: ScriptCache;

    public browserMsg: BrowserMsg;

    constructor(script: ScriptCache, browserMsg: BrowserMsg) {
        this.script = script;
        this.browserMsg = browserMsg;
        if (browserMsg) {
            this.listenMsg();
        }
        // 处理GM_cookie.list等操作
        const action = (action: string) => {
            return (details: GM_Types.CookieDetails, done: (cookie: GM_Types.Cookie[] | any, error: any | undefined) => void) => {
                this.GM_cookie(action, details, done);
            }
        }
        (<{ [key: string]: any }>FrontendGrant.prototype.GM_cookie)['list'] = action('list');
        (<{ [key: string]: any }>FrontendGrant.prototype.GM_cookie)['delete'] = action('delete');
        (<{ [key: string]: any }>FrontendGrant.prototype.GM_cookie)['set'] = action('set');
    }

    public static GMFunction(param: DescriptionParam = {}) {
        return function (
            target: any,
            propertyName: string,
            descriptor: PropertyDescriptor
        ) {
            const key = propertyName;
            param.listener && param.listener();
            FrontendGrant.apis.set(key, {
                api: descriptor.value,
                param: param
            });
            // 兼容GM.*
            const dot = key.replace('_', '.');
            if (dot != key) {
                FrontendGrant.apis.set(dot, {
                    api: descriptor.value,
                    param: param
                });
            }
        }
    }

    public GM_info() {
        return {
            scriptWillUpdate: false,
            scriptHandler: 'ScriptCat',
            scriptUpdateURL: this.script.checkupdate_url,
            scriptSource: this.script.code,
            script: {
                name: this.script.name,
                namespace: this.script.namespace,
                version: this.script.metadata['version'] && this.script.metadata['version'][0],
            }
        }
    }

    public getApi(grant: string): FrontenApiValue | undefined {
        return FrontendGrant.apis.get(grant);
    }

    public postRequest = (value: string, params: any[], callback?: Callback | undefined) => {
        const grant: Grant = {
            id: this.script.id,
            name: this.script.name,
            value: value,
            params: params,
            request: randomString(32),
            flag: this.script.flag,
        };
        if (callback) {
            this.request.set(grant.request, (grant: Grant) => {
                callback(grant);
                if (grant.error) {
                    throw grant.name + ': ' + grant.value + ' ErrCode:' + grant.error + ' ErrMsg:' + (grant.errorMsg || '');
                }
            });
        }
        this.browserMsg.send('grant', grant);
    }

    public listenMsg = () => {
        this.browserMsg.listen(this.script.flag, (grant: Grant) => {
            const callback = this.request.get(grant.request);
            if (callback) {
                callback(grant);
            }
        });
    }

    @FrontendGrant.GMFunction()
    public CAT_fetchBlob(url: string): Promise<Blob> {
        return new Promise(resolve => {
            this.postRequest('CAT_fetchBlob', [url], (grant: Grant) => {
                resolve(<Blob>grant.data);
            });
        });
    }

    @FrontendGrant.GMFunction({ depend: ['CAT_fetchBlob'] })
    public async GM_xmlhttpRequest(details: GM_Types.XHRDetails) {
        const u = new URL(details.url, window.location.href);
        if (details.headers) {
            for (const key in details.headers) {
                if (key.toLowerCase() == 'cookie') {
                    details.cookie = details.cookie || details.headers[key];
                    delete details.headers[key];
                }
            }
        }
        const param: GMSend.XHRDetails = {
            method: details.method,
            timeout: details.timeout,
            url: u.href,
            headers: details.headers,
            cookie: details.cookie,
            context: details.context,
            responseType: details.responseType,
            overrideMimeType: details.overrideMimeType,
            anonymous: details.anonymous,
            user: details.user,
            password: details.password
        };
        if (!param.headers) {
            param.headers = {};
        }
        if (details.nocache) {
            param.headers['Cache-Control'] = 'no-cache';
        }
        if (details.data) {
            if (details.data instanceof FormData) {
                param.dataType = 'FormData';
                const data: Array<GMSend.XHRFormData> = [];
                const keys: { [key: string]: boolean } = {};
                details.data.forEach((val, key) => {
                    keys[key] = true;
                });
                for (const key in keys) {
                    const values = details.data.getAll(key);
                    for (let i = 0; i < values.length; i++) {
                        const val = values[i];
                        if (val instanceof File) {
                            data.push({
                                key: key,
                                type: 'file',
                                val: await blobToBase64(val) || '',
                                filename: val.name
                            });
                        } else {
                            data.push({
                                key: key,
                                type: 'text',
                                val: val
                            });
                        }
                    }
                }
                param.data = data;
            } else {
                param.data = details.data;
            }
        }

        if (details.onload && (details.responseType == 'arraybuffer' || details.responseType == 'blob')) {
            const old = details.onload;
            details.onload = async (xhr) => {
                const resp = await this.CAT_fetchBlob(<string>xhr.response);
                if (details.responseType == 'arraybuffer') {
                    xhr.response = await resp.arrayBuffer();
                } else {
                    xhr.response = resp;
                }
                old(xhr);
            }
        }

        this.postRequest('GM_xmlhttpRequest', [param], (grant: Grant) => {
            if (grant.error) {
                details.onerror && details.onerror(grant.errorMsg || '');
                return;
            }
            const data = <{ type: string, data: GM_Types.XHRResponse }>grant.data || {};
            switch (data.type) {
                case 'load':
                    details.onload && details.onload(data.data);
                    break;
                case 'onloadend':
                    details.onloadend && details.onloadend(data.data);
                    break;
                case 'onloadstart':
                    details.onloadstart && details.onloadstart(data.data);
                    break;
                case 'onprogress':
                    details.onprogress && details.onprogress(<GM_Types.XHRProgress>data.data);
                    break;
                case 'onreadystatechange':
                    details.onreadystatechange && details.onreadystatechange(data.data);
                    break;
                case 'ontimeout':
                    details.ontimeout && details.ontimeout();
                    break;
                case 'onerror':
                    details.onerror && details.onerror('');
                    break;
                case 'onabort':
                    details.onabort && details.onabort();
                    break;
            }
        });
    }

    public GM_notification(text: string, title: string, image: string, onclick?: GM_Types.NotificationOnClick): void

    @FrontendGrant.GMFunction()
    public GM_notification(detail: GM_Types.NotificationDetails | string, ondone: GM_Types.NotificationOnDone | string, image?: string, onclick?: GM_Types.NotificationOnClick): void {
        let data: GM_Types.NotificationDetails = {};
        if (typeof detail === 'string') {
            data.text = detail;
            switch (arguments.length) {
                case 4:
                    data.onclick = onclick;
                case 3:
                    data.image = image;
                case 2:
                    data.title = <string>ondone;
            }
        } else {
            data = detail;
            data.ondone = data.ondone || <GM_Types.NotificationOnDone>ondone;
        }
        let click: GM_Types.NotificationOnClick, done: GM_Types.NotificationOnDone,
            create: GM_Types.NotificationOnClick;
        if (data.onclick) {
            click = data.onclick;
            delete data.onclick;
        }
        if (data.ondone) {
            done = data.ondone;
            delete data.ondone;
        }
        if (data.oncreate) {
            create = data.oncreate;
            delete data.oncreate;
        }
        this.postRequest('GM_notification', [data], (grant: Grant) => {
            const data = <{ type: string, id: string, index: number, user: boolean }>grant.data || {};
            switch (data.type) {
                case 'click': {
                    click && click.apply({ id: data.id }, [data.id, data.index])
                    break;
                }
                case 'done': {
                    done && done.apply({ id: data.id }, [data.user, data.id])
                    break;
                }
                case 'create': {
                    create && create.apply({ id: data.id }, [data.id]);
                }
            }
        });
    }

    @FrontendGrant.GMFunction()
    public GM_closeNotification(id: string) {
        this.postRequest('GM_closeNotification', [id]);
    }

    @FrontendGrant.GMFunction()
    public GM_updateNotification(id: string, details: GM_Types.NotificationDetails): void {
        this.postRequest('GM_updateNotification', [id, details]);
    }

    @FrontendGrant.GMFunction()
    public GM_log(message: string, level?: GM_Types.LoggerLevel): void {
        this.postRequest('GM_log', [message, level]);
    }

    @FrontendGrant.GMFunction()
    public GM_getValue(name: string, defaultValue?: any): any {
        const ret = this.script.value[name];
        if (ret) {
            return ret.value;
        }
        return defaultValue;
    }

    @FrontendGrant.GMFunction()
    public GM_setValue(name: string, value: any): void {
        // 对object的value进行一次转化
        if (typeof value === 'object') {
            value = JSON.parse(JSON.stringify(value));
        }
        let ret = this.script.value[name];
        if (ret) {
            ret.value = value;
        } else {
            ret = {
                id: 0,
                scriptId: this.script.id,
                storageName: (this.script.metadata['storagename'] && this.script.metadata['storagename'][0]) || '',
                key: name,
                value: value,
                createtime: new Date().getTime()
            };
        }
        if (value === undefined) {
            delete this.script.value[name];
        } else {
            this.script.value[name] = ret;
        }
        this.postRequest('GM_setValue', [name, value]);
    }

    protected valueChangeListener = new Map<number, { name: string, listener: GM_Types.ValueChangeListener }>();

    ValueChange = (name: string, value: Value): void => {
        this.valueChangeListener.forEach(val => {
            if (val.name === name) {
                const old = this.script.value && this.script.value[name] && this.script.value[name].value;
                val.listener(name, old, value.value, this.script.value === value.value);
            }
        });
        if (!this.script.value) {
            this.script.value = {};
        }
        this.script.value[name] = value;
    }

    @FrontendGrant.GMFunction({ depend: ['GM_setValue'] })
    public GM_deleteValue(name: string): void {
        this.GM_setValue(name, undefined);
    }

    @FrontendGrant.GMFunction()
    public GM_listValues(): string[] {
        const ret: string[] = [];
        for (const key in this.script.value) {
            ret.push(key);
        }
        return ret;
    }

    @FrontendGrant.GMFunction()
    public GM_addValueChangeListener(name: string, listener: GM_Types.ValueChangeListener): number {
        const id = Math.random() * 10000000;
        this.valueChangeListener.set(id, { name: name, listener: listener });
        return id;
    }

    @FrontendGrant.GMFunction()
    public GM_removeValueChangeListener(listenerId: number): void {
        this.valueChangeListener.delete(listenerId);
    }

    public GM_openInTab(url: string, loadInBackground: boolean): tab
    public GM_openInTab(url: string, options: GM_Types.OpenTabOptions): tab
    @FrontendGrant.GMFunction({ depend: ['GM_closeInTab'] })
    public GM_openInTab(url: string, options?: GM_Types.OpenTabOptions | boolean): tab {
        let option: GM_Types.OpenTabOptions = {};
        if (arguments.length == 1) {
            option.active = true;
        } else {
            if (typeof options == 'boolean') {
                option.active = options;
            } else {
                option = <GM_Types.OpenTabOptions>options;
            }
        }
        let tabid: any;
        const ret: tab = {
            close: () => {
                this.GM_closeInTab(tabid);
            },
        };
        this.postRequest('GM_openInTab', [url, option], grant => {
            const data = <{ type: string, tabId: number }>grant.data || {};
            switch (data.type) {
                case 'tabid':
                    tabid = data.tabId
                    ret.closed = false;
                    break;
                case 'close':
                    ret.onclose && ret.onclose();
                    ret.closed = true;
                    break;
            }
        });
        return ret;
    }

    @FrontendGrant.GMFunction()
    protected GM_closeInTab(tabId: any) {
        this.postRequest('GM_closeInTab', [tabId]);
    }

    @FrontendGrant.GMFunction()
    public CAT_click(x: number, y: number): void {
        this.postRequest('CAT_click', [x, y]);
    }

    @FrontendGrant.GMFunction()
    public GM_setClipboard(data: string, info?: string | { type?: string, minetype?: string }): void {
        this.postRequest('GM_setClipboard', [data, info]);
    }

    @FrontendGrant.GMFunction()
    public GM_addStyle(css: string): any {
        return addStyle(css);
    }

    @FrontendGrant.GMFunction()
    public GM_registerMenuCommand(name: string, listener: () => any, accessKey?: string): number {
        const id = randomInt(1, 100000);
        this.postRequest('GM_registerMenuCommand', [{ name: name, accessKey: accessKey, id: id }], (grant: Grant) => {
            const data = <{ action: string }>grant.data || {};
            if (data.action == 'click') {
                listener();
            }
        });
        return id;
    }

    @FrontendGrant.GMFunction()
    public GM_unregisterMenuCommand(id: number): void {
        this.postRequest('GM_unregisterMenuCommand', [{ id: id }]);
    }

    @FrontendGrant.GMFunction()
    public GM_getResourceText(name: string): string | undefined {
        if (!this.script.resource) {
            return undefined;
        }
        const r = this.script.resource[name];
        if (r) {
            return r.content;
        }
        return undefined;
    }

    @FrontendGrant.GMFunction()
    public GM_getResourceURL(name: string): string | undefined {
        if (!this.script.resource) {
            return undefined;
        }
        const r = this.script.resource[name];
        if (r) {
            return r.base64;
        }
        return undefined;
    }

    @FrontendGrant.GMFunction()
    public GM_cookie(action: string, details: GM_Types.CookieDetails, done: (cookie: GM_Types.Cookie[] | any, error: any | undefined) => void) {
        if (!details.url && !details.domain) {
            details.url = window.location.href;
        }
        this.postRequest('GM_cookie', [action, details], (grant: Grant) => {
            if (grant.error) {
                return done && done([], grant.errorMsg);
            }
            const data = <{ type: string, data: GM_Types.Cookie[] | any }>grant.data || {};
            switch (data.type) {
                case 'done':
                    done && done(data.data, undefined);
                    break;
            }
        });
    }

    @FrontendGrant.GMFunction()
    protected GM_getCookieStore(tabid: number, done: (storeId: number, error: any | undefined) => void): void {
        this.postRequest('GM_getCookieStore', [tabid], (grant: Grant) => {
            if (grant.error) {
                return done && done(0, grant.errorMsg);
            }
            const data = <{ type: string, data: number }>grant.data || {};
            switch (data.type) {
                case 'done':
                    done && done(data.data, undefined);
                    break;
            }
        });
    }

    @FrontendGrant.GMFunction()
    protected GM_getTab(callback: (data: any) => void) {
        this.postRequest('GM_getTab', [], (grant: Grant) => {
            if (grant.error) {
                throw new Error(grant.errorMsg);
            }
            callback(grant.data);
        })
    }

    @FrontendGrant.GMFunction()
    protected GM_saveTab(obj: object): void {
        this.postRequest('GM_saveTab', [JSON.parse(JSON.stringify(obj))]);
    }

    @FrontendGrant.GMFunction()
    protected GM_getTabs(callback: (objs: { [key: number]: object }) => any): void {
        this.postRequest('GM_getTabs', [], (grant: Grant) => {
            if (grant.error) {
                throw new Error(grant.errorMsg);
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            callback(grant.data);
        })
    }

    @FrontendGrant.GMFunction()
    protected GM_download(url: GM_Types.DownloadDetails | string, name?: string): void {
        let details: GM_Types.DownloadDetails;
        if (typeof url == 'string') {
            details = {
                name: name || '',
                url: url
            };
        } else {
            details = url;
        }
        this.postRequest('GM_download', [details], (grant: Grant) => {
            if (grant.error) {
                details.onerror && details.onerror({
                    error: 'unknown',
                    details: grant.error
                })
                return
            }
        });
    }

    @FrontendGrant.GMFunction()
    protected CAT_createFile(file: string | Blob, name: string, ondone?: (download: boolean, error?: any | undefined) => void): void {
        this.postRequest('CAT_createFile', [file, name], (grant: Grant) => {
            if (grant.error) {
                ondone && ondone(false, grant.error);
                return
            }
            ondone && ondone(true);
        });
    }
}

export type rejectCallback = (msg: string, delayrun: number) => void

export class SandboxMsg implements BrowserMsg {

    public send(topic: string, msg: any) {
        top!.postMessage(msg, '*');
    }

    public listen() {
        //TODO: 未实现
        // console.log('未实现');
    }

}

//ts会定义在prototype里,Proxy拦截的时候会有问题,所以function使用属性的方式定义(虽然可以处理,先这样)
export class SandboxContext extends FrontendGrant {

    constructor(script: ScriptCache) {
        super(script, new SandboxMsg);
        // 监听Value Change
        AppEvent.listener(ScriptValueChange, this.valueChange);
    }

    ValueChange = (name: string, value: Value, tabid?: number): void => {
        this.valueChangeListener.forEach(val => {
            if (val.name === name) {
                const old = this.script.value && this.script.value[name] && this.script.value[name].value;
                val.listener(name, old, value.value, this.script.value === value.value, tabid);
            }
        });
        if (!this.script.value) {
            this.script.value = {};
        }
        this.script.value[name] = value;
    }

    public valueChange = (msg: any) => {
        const { model, tabid } = <{ model: Value, tabid: number }>msg;
        if (!this.script.value) {
            this.script.value = {};
        }
        if (this.script.metadata['storagename'] && this.script.metadata['storagename'][0] == model.storageName) {
            this.ValueChange(model.key, model, tabid);
        } else if (this.script.id == model.scriptId) {
            this.ValueChange(model.key, model, tabid);
        }
    }

    public destruct = () => {
        AppEvent.removeListener(ScriptValueChange, this.valueChange);
        this.CAT_runComplete();
    }

    public begin = () => {
        window.addEventListener('message', this.message);
    }

    public end = () => {
        //释放资源
        window.removeEventListener('message', this.message);
        this.request.clear();
    }

    public message = (event: MessageEvent) => {
        const grant = <Grant>event.data;
        if (!grant.request) {
            return;
        }
        const callback = this.request.get(grant.request);
        if (callback) {
            callback(grant);
        }
    }

    public CAT_setLastRuntime = (time: number) => {
        this.begin();
        this.postRequest('CAT_setLastRuntime', [time], () => {
            console.log('CAT_setLastRuntime');
        });
    }

    public CAT_setRunError = (error: string, time: number) => {
        this.end();
        this.postRequest('CAT_setRunError', [error, time], () => {
            console.log('CAT_setRunError');
        });
    }

    public CAT_runComplete = () => {
        this.end();
        this.postRequest('CAT_runComplete', []);
    }

    @FrontendGrant.GMFunction()
    public CAT_setProxy(rule: CAT_Types.ProxyRule[] | string): void {
        this.postRequest('CAT_setProxy', [rule]);
    }

    @FrontendGrant.GMFunction()
    public CAT_clearProxy(): void {
        this.postRequest('CAT_clearProxy', []);
    }

}
