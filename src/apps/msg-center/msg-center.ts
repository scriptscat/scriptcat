
export type ListenCallback = (msg: any, port: chrome.runtime.Port) => any | Promise<any>;

let topicMap = new Map<string, Map<any, any>>();

chrome.runtime.onConnect.addListener((port: chrome.runtime.Port) => {
    let val = topicMap.get(port.name);
    if (!val) {
        return;
    }
    port.onMessage.addListener((msg, port) => {
        val?.forEach((func) => {
            let ret = func(msg, port);
            if (ret) {
                if (ret instanceof Promise) {
                    ret.then(result => {
                        port.postMessage(result);
                    });
                } else {
                    port.postMessage(ret);
                }
            }
        });
    });
});

export class MsgCenter {

    public static listener(topic: string, callback: ListenCallback) {
        let val = topicMap.get(topic);
        if (!val) {
            val = new Map();
            topicMap.set(topic, val);
        }
        val.set(callback, callback);
    }

    public static removeListener(topic: string, callback: ListenCallback) {
        let val = topicMap.get(topic);
        if (val) {
            val.delete(callback);
            if (!val.size) {
                topicMap.delete(topic);
            }
        }
    }

    public static connect(topic: string, msg?: any): onRecv {
        let port = chrome.runtime.connect({
            name: topic,
        });
        if (msg) {
            port.postMessage(msg);
        }
        return new onRecv(port);
    }
}

export class onRecv {

    protected callback!: ListenCallback
    protected port: chrome.runtime.Port;

    constructor(port: chrome.runtime.Port) {
        this.port = port;
        this.port.onMessage.addListener((msg, port) => {
            if (!msg) {
                return;
            }
            let ret = this.callback(msg, port);
            if (ret) {
                if (ret instanceof Promise) {
                    ret.then(result => {
                        port.postMessage(result);
                    });
                } else {
                    port.postMessage(ret);
                }
            }
        });
    }

    public addListener(callback: ListenCallback) {
        this.callback = callback;
    }

}