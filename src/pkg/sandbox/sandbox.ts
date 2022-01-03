
export function buildWindow(): any {
    return {
        localStorage: global.localStorage,
    }
}

const writables: { [key: string]: any } = {
    'addEventListener': global.addEventListener,
    'removeEventListener': global.removeEventListener,
    'dispatchEvent': global.dispatchEvent,
};

// 记录初始的
export const init = new Map<string, boolean>();

// 复制原有的,防止被前端网页复写
const descs = Object.getOwnPropertyDescriptors(global);
for (const key in descs) {
    const desc = descs[key];
    if (desc && desc.writable && !writables[key]) {
        writables[key] = desc.value;
    } else {
        init.set(key, true);
    }
}


// 处理有多层结构的(先只对特殊的做处理)
['console'].forEach((obj: string) => {
    const descs = Object.getOwnPropertyDescriptors((<AnyMap><unknown>global)[obj]);
    writables[obj] = {};// 清零
    for (const key in descs) {
        const desc = descs[key];
        if (desc && desc.writable) {
            (<AnyMap>writables[obj])[key] = desc.value;
        }
    }
});

//TODO:做一些恶意操作拦截等
export function buildThis(global: AnyMap, context: AnyMap) {
    const special = <AnyMap>Object.assign({}, writables);
    // 后台脚本要不要考虑不能使用eval?
    const _this: AnyMap = { eval: global.eval };
    const proxy: AnyMap = new Proxy(context, {
        defineProperty(_, name, desc) {
            if (Object.defineProperty(context, name, desc)) {
                return true;
            }
            return false;
        },
        get(_, name) {
            switch (name) {
                case 'window':
                case 'self':
                // case 'global':
                case 'globalThis':
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return special['global'] || proxy;
                case 'top':
                case 'parent':
                    if (global[name] == global.self) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        return special['global'] || proxy;
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return global.top;
            }
            if (typeof name == 'string' && name !== 'undefined') {
                if (context[name]) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return context[name];
                }
                if (_this[name]) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return _this[name];
                }
                if (special[name] !== undefined) {
                    if (typeof special[name] === 'function' && !(<EmptyFunction>special[name]).prototype) {
                        return (<EmptyFunction>special[name]).bind(global);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return special[name];
                }
                if ((global)[name] !== undefined) {
                    if (typeof (global)[name] === 'function' && !(<EmptyFunction>(global)[name]).prototype) {
                        return (<EmptyFunction>global[name]).bind(global);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return global[name];
                }
            }
            return undefined;
        },
        has(_, name) {
            return true;
        },
        set(_, name: string, val) {
            switch (name) {
                case 'window':
                case 'self':
                // case 'global':
                case 'globalThis':
                    special['global'] = val;
                    return true;
            }
            if (special[name]) {
                special[name] = val;
                return true;
            }
            if (init.has(name)) {
                const des = Object.getOwnPropertyDescriptor(global, name);
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
            ret = Object.getOwnPropertyDescriptor(global, name);
            return ret;
        }
    });
    return proxy;
}