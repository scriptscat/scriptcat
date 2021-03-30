// splitChunks对injected可能会有问题

Object.defineProperty(window, ScriptFlag, {
    get: () => { return undefined; },
    set: (val) => {
        val();
    }
});
