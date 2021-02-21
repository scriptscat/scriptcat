
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
                return global[key];
            }
        },
        has(_, key) {
            return key === 'undefined' || context.hasOwnProperty(key) || global.hasOwnProperty(key);
        }
    })
}
