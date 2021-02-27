
export function compileCode(src: string) {
    src = 'with (context) {' + src + '}'
    return new Function('context', src)
}

//TODO:做一些恶意操作拦截等
export function createContext(global: any, context: any) {

    return new Proxy(context, {
        get(_, key) {
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
        getOwnPropertyDescriptor(_, name) {
            console.log(name);
            return undefined;
        },
        has(_, key) {
            return key === 'undefined' || context.hasOwnProperty(key) || global.hasOwnProperty(key);
        }
    })
}
