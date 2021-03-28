import { Script } from "@App/model/script";
import { Value } from "@App/model/value";
import { CronJob } from "cron";
import { IScript } from "./interface";

//后台脚本
export class Background implements IScript {

    protected sandboxWindow: Window;
    constructor(iframe: Window) {
        this.sandboxWindow = iframe;
    }

    protected cronjobMap = new Map<number, CronJob>();

    public enableScript(script: Script, value: Value[]): Promise<string> {
        return new Promise(async resolve => {
            this.sandboxWindow.postMessage({ action: 'start', data: script, value: value }, '*');
            function listener(event: MessageEvent) {
                if (event.data.action != "start") {
                    return;
                }
                resolve(event.data.data);
                window.removeEventListener('message', listener);
            }
            window.addEventListener('message', listener);
        });
    }

    public disableScript(script: Script): Promise<void> {
        return new Promise(async resolve => {
            this.sandboxWindow.postMessage({ action: 'stop', data: script, isdebug: false }, '*');
            function listener(event: MessageEvent) {
                if (event.data.action != "stop") {
                    return;
                }
                resolve();
                window.removeEventListener('message', listener);
            }
            window.addEventListener('message', listener);
        });
    }

    public stopScript(script: Script, isdebug: boolean): Promise<void> {
        return new Promise(async resolve => {
            this.sandboxWindow.postMessage({ action: 'stop', data: script, isdebug: isdebug }, '*');
            function listener(event: MessageEvent) {
                if (event.data.action != "stop") {
                    return;
                }
                resolve();
                window.removeEventListener('message', listener);
            }
            window.addEventListener('message', listener);
        });
    }

    public execScript(script: Script, value: Value[], isdebug: boolean): Promise<void> {
        return new Promise(async resolve => {
            this.sandboxWindow.postMessage({ action: 'exec', data: script, value: value, isdebug: isdebug }, '*');
            function listener(event: MessageEvent) {
                if (event.data.action != "exec") {
                    return;
                }
                resolve();
                window.removeEventListener('message', listener);
            }
            window.addEventListener('message', listener);
        });
    }

}

