import { SandboxContext, ScriptContext } from "@App/apps/grant/frontend";
import { ScriptCache, Script } from "@App/model/do/script";

export function buildWindow(): any {
    return {
        localStorage: global.localStorage,
    }
}

let sandboxGlobal: any = {
    "addEventListener": global.addEventListener,
    "removeEventListener": global.removeEventListener,
    "dispatchEvent": global.dispatchEvent,
};

// 记录初始的
export let init = new Map<string, boolean>();

// 复制原有的,防止被前端网页复写
let descs = Object.getOwnPropertyDescriptors(global);
for (const key in descs) {
    let desc = descs[key];
    if (desc && desc.writable && !sandboxGlobal[key]) {
        sandboxGlobal[key] = desc.value;
    } else {
        init.set(key, true);
        try {
            sandboxGlobal[key] = (<any>global)[key];
        } catch (e) {
        }
    }
}

// 处理有多层结构的(先只对特殊的做处理)
['console'].forEach(obj => {
    let descs = Object.getOwnPropertyDescriptors((<any>global)[obj]);
    sandboxGlobal[obj] = {};// 清零
    for (const key in descs) {
        let desc = descs[key];
        if (desc && desc.writable) {
            sandboxGlobal[obj][key] = desc.value;
        }
    }
});

//TODO:做一些恶意操作拦截等
export function buildThis(global: any, context: any) {
    let special = Object.assign({}, sandboxGlobal);
    // 后台脚本要不要考虑不能使用eval?
    let _this: any = { eval: global.eval };
    let proxy: any = new Proxy(context, {
        defineProperty(_, name, desc) {
            return Object.defineProperty(context, name, desc);
        },
        get(_, name) {
            switch (name) {
                case 'window':
                case 'global':
                case 'globalThis':
                    return _this[name] || proxy;
            }
            if (name !== 'undefined' && name !== Symbol.unscopables) {
                if (context[name]) {
                    return context[name];
                }
                if (_this[name]) {
                    return _this[name];
                }
                if (special[name] !== undefined) {
                    if (typeof special[name] === 'function' && !special[name].prototype) {
                        return special[name].bind(global);
                    }
                    return special[name];
                }
                if (init.has(<string>name)) {
                    if (typeof global[name] === 'function' && !global[name].prototype) {
                        return global[name].bind(global);
                    }
                    return global[name];
                }
            }
            return undefined;
        },
        has(_, name) {
            // 全返回true,走get里面,如果返回false,不会进入get,会跑出沙盒取变量
            return true;
        },
        set(_, name: string, val) {
            switch (name) {
                case 'window':
                case 'global':
                case 'globalThis':
                    _this[name] = val;
                    return true;
            }
            if (special[name]) {
                special[name] = val;
                return true;
            }
            if (init.has(name)) {
                let des = Object.getOwnPropertyDescriptor(global, name);
                // 只读的return
                if (des && des.get && !des.set && des.configurable) {
                    return true;
                }
                global[name] = val;
                return true;
            }
            context[name] = val;
            return true;
        },
        getOwnPropertyDescriptor(_, name) {
            let ret = Object.getOwnPropertyDescriptor(context, name)
            if (ret) {
                return ret;
            }
            ret = Object.getOwnPropertyDescriptor(sandboxGlobal, name);
            return ret;
        }
    });
    return proxy;
}
