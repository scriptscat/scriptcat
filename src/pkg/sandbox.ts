import { Script } from "@App/model/script";

export function compileCode(src: string) {
    src = 'with (context) {' + src + '}'
    return new Function('context', src)
}

export function createContext(script: Script) {
    let context = {};
    return new Proxy(context, {
        has: () => {
            return true;
        }
    })
}
