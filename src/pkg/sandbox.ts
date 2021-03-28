import { ScriptContext } from "@App/apps/grant/frontend";
import { Script } from "@App/model/script";

export function compileScript(script: Script) {
    let src = 'with (context) {' + script.code + '}'
    return new Function('context', src)
}

let blacklist = new Map<string, boolean>();
blacklist.set('chrome', true).set('browser', true);
//TODO:做一些恶意操作拦截等
export function buildThis(global: any, context: any) {
    return new Proxy(context, {
        get(_, key) {
            if (blacklist.has(<string>key)) {
                return undefined;
            }
            if (key !== 'undefined' && key !== Symbol.unscopables) {
                if (context.hasOwnProperty(key)) {
                    return context[key];
                }
                if (global[key]) {
                    if (typeof global[key] === 'function' && global[key].bind) {
                        context[key] = global[key].bind(global);
                    } else {
                        context[key] = global[key];
                    }
                }
                return context[key];
            }
        },
        has(_, key) {
            if (blacklist.has(<string>key)) {
                throw new ReferenceError(<string>key + " is not defined");
            }
            return key === 'undefined' || context.hasOwnProperty(key) || global.hasOwnProperty(key);
        }
    })
}

export function createContext(context: ScriptContext, script: Script): ScriptContext {
    if (script.metadata["grant"] != undefined) {
        context["GM"] = context;
        script.metadata["grant"].forEach((value) => {
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
    return context;
}
