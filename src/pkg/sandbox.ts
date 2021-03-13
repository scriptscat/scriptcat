
export function compileCode(src: string) {
    src = 'with (context) {' + src + '}'
    return new Function('context', src)
}

let blacklist = new Map<string, boolean>();
blacklist.set('chrome', true).set('browser', true);
//TODO:做一些恶意操作拦截等
export function createContext(global: any, context: any) {
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
