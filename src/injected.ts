// splitChunks对injected可能会有问题

import { ExternalWhitelist } from './apps/config';
import { FrontendGrant, ScriptContext } from './apps/grant/frontend';
import { FrontendMsg } from './apps/msg-center/browser';
import { ExternalMessage, ScriptExec, ScriptValueChange } from './apps/msg-center/event';
import { ScriptCache } from './model/do/script';
import { Value } from './model/do/value';
import { addStyle } from './pkg/frontend';
import { createContext } from './pkg/sandbox/compile';
import { buildThis } from './pkg/sandbox/sandbox';

// 参考了tm的实现
function waitBody(callback: () => void) {
    if (document.body) {
        return callback();
    }
    const listen = function () {
        document.removeEventListener('load', listen, false);
        document.removeEventListener('DOMNodeInserted', listen, false);
        document.removeEventListener('DOMContentLoaded', listen, false);
        waitBody(callback);
    };
    document.addEventListener('load', listen, false);
    document.addEventListener('DOMNodeInserted', listen, false);
    document.addEventListener('DOMContentLoaded', listen, false);
};

const browserMsg = new FrontendMsg(ScriptFlag, false);
browserMsg.listen('scripts', (msg) => {
    const scripts: ScriptCache[] = msg;
    browserMsg.listen(ScriptValueChange, (msg: Value) => {
        scripts.forEach(val => {
            if (!val.value) {
                val.value = {};
            }
            if ((val.metadata['storagename'] && val.metadata['storagename'][0] == msg.storageName) || val.id == msg.id) {
                val.context && val.context.ValueChange && val.context.ValueChange(msg.key, msg);
            }
        })
    });
    browserMsg.listen(ScriptExec, (msg) => {
        for (let i = 0; i < scripts.length; i++) {
            if (scripts[i].uuid == msg) {
                (<{ [key: string]: (context: ScriptContext) => void }><unknown>window)[scripts[i].flag].apply(scripts[i].context, [scripts[i].context]);
                break;
            }
        }
    });
    scripts.forEach(script => {
        // 构建沙盒
        let context: ScriptContext;
        if (script.grantMap['none']) {
            context = <any>window;
        } else {
            context = new FrontendGrant(script, browserMsg);
            context = createContext(context, script);
            context['unsafeWindow'] = window;
            context = buildThis(window, context);
            script.context = context;
        }
        if (script.metadata['run-at'] && (script.metadata['run-at'][0] === 'document-menu' || script.metadata['run-at'][0] === 'document-body')) {
            if (script.metadata['run-at'][0] === 'document-body') {
                waitBody(() => {
                    if ((<{ [key: string]: () => void }><unknown>window)[script.flag]) {
                        (<{ [key: string]: (context: ScriptContext) => void }><unknown>window)[script.flag].apply(context, [context]);
                    }
                    Object.defineProperty(window, script.flag, {
                        get: () => { return undefined; },
                        set: (val: (context: ScriptContext) => void) => {
                            val.apply(context, [context]);
                        }
                    });
                    // 注入css
                    script.metadata['require-css']?.forEach(val => {
                        const res = script.resource[val];
                        if (res) {
                            addStyle(res.content);
                        }
                    });
                });
            }
            return;
        }
        if ((<{ [key: string]: () => void }><unknown>window)[script.flag]) {
            (<{ [key: string]: (context: ScriptContext) => void }><unknown>window)[script.flag].apply(context, [context]);
        }
        Object.defineProperty(window, script.flag, {
            get: () => { return undefined; },
            set: (val: (context: ScriptContext) => void) => {
                val.apply(context, [context]);
            }
        });
        // 注入css
        script.metadata['require-css']?.forEach(val => {
            const res = script.resource[val];
            if (res) {
                addStyle(res.content);
            }
        });
    });

});


// 对外接口白名单
for (let i = 0; i < ExternalWhitelist.length; i++) {
    if (window.location.host.endsWith(ExternalWhitelist[i])) {
        // 注入
        let isInstalledCallback: (data: any) => void;
        (<{ external: any }><unknown>window).external = window.external || {};
        browserMsg.listen(ExternalMessage, (msg: any) => {
            const m = <{ action: string, data: any }>msg;
            switch (m.action) {
                case 'isInstalled':
                    isInstalledCallback(m.data);
                    break;
            }
        });
        ((<{ external: { Scriptcat: { isInstalled: (name: string, namespace: string, callback: any) => void } } }><unknown>window).external).Scriptcat = {
            isInstalled(name: string, namespace: string, callback: any) {
                isInstalledCallback = callback;
                browserMsg.send(ExternalMessage, { 'action': 'isInstalled', 'params': { name, namespace } });
            }
        };
        ((<{ external: { Tampermonkey: any } }><unknown>window).external).Tampermonkey = ((<{ external: { Scriptcat: any } }><unknown>window).external).Scriptcat;
        break;
    }

}
