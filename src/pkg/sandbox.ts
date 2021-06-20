import { ScriptContext } from "@App/apps/grant/frontend";
import { ScriptCache, Script } from "@App/model/do/script";

export function compileScriptCode(script: ScriptCache): string {
    let code = script.code;
    script.metadata['require']?.forEach((val) => {
        let res = script.resource![val];
        if (res) {
            code = res.content + "\n" + code;
        }
    });
    return 'with (context) {\n' + code + '\n}'
}

export function compileScript(script: ScriptCache) {
    return new Function('context', script.code);
}


export function buildWindow(): any {
    return {
        localStorage: window.localStorage,
    }
}

//TODO:做一些恶意操作拦截等
export function buildThis(global: any, context: any) {
    let proxy: any = new Proxy(context, {
        get(_, key) {
            switch (key) {
                case 'window':
                case 'global':
                case 'self':
                case 'globalThis':
                    return proxy;
            }
            if (key !== 'undefined' && key !== Symbol.unscopables) {
                if (context.hasOwnProperty(key)) {
                    return context[key];
                }
                if (global[key]) {
                    if (typeof global[key] === 'function' && !global[key].prototype) {
                        return global[key].bind(global);
                    }
                    return global[key];
                }
            }
            return undefined;
        },
        has() {
            return true;
        }
    })
    return proxy;
}

export function createContext(context: ScriptContext, script: Script): ScriptContext {
    if (script.metadata["grant"]) {
        context["GM"] = context;
        script.metadata["grant"].forEach((value: any) => {
            let apiVal = context.getApi(value);
            if (value.startsWith("GM.")) {
                let [_, t] = value.split(".");
                context["GM"][t] = apiVal?.api;
            } else {
                context[value] = apiVal?.api;
            }
            if (apiVal?.param.depend) {
                for (let i = 0; i < apiVal?.param.depend.length; i++) {
                    let value = apiVal.param.depend[i];
                    let dependApi = context.getApi(value);
                    if (value.startsWith("GM.")) {
                        let [_, t] = value.split(".");
                        context["GM"][t] = dependApi?.api;
                    } else {
                        context[value] = dependApi?.api;
                    }
                }
            }
        });
    }
    if (script.metadata["console"]) {
        context["console"] = {};
        let logMap = new Map();
        let log = (level: GM_Types.LOGGER_LEVEL) => {
            return (...data: any[]) => {
                let msg = "";
                data.forEach(val => {
                    msg = msg + val + " ";
                });
                msg = msg.trimEnd();
                console[level](...data);
                context.GM_log(msg, level);
            }
        }
        logMap.set("info", log("info")).set("log", log("info")).
            set("warn", log("warn")).set("error", log("error"));
        script.metadata["console"].forEach(val => {
            let strs = val.split(" ");
            strs.forEach(val => {
                context["console"][val] = logMap.get(val);
            })
        });
    }
    return context;
}
