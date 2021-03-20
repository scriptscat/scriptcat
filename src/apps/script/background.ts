import { Script } from "@App/model/script";
import { Value, ValueModel } from "@App/model/value";
import { AllPage } from "@App/pkg/utils";
import { CronJob } from "cron";
import { IScript } from "./interface";

//后台脚本
export class Background implements IScript {

    protected sandboxWindow: Window;
    constructor(iframe: Window) {
        this.sandboxWindow = iframe;
    }

    protected cronjobMap = new Map<number, CronJob>();
    protected valueModel = new ValueModel();

    public enableScript(script: Script): Promise<string> {
        return new Promise(async resolve => {
            let list: Value[];
            if (script.namespace) {
                list = await this.valueModel.list((table) => {
                    return table.where({ namespace: script.namespace });
                }, new AllPage());
            } else {
                list = await this.valueModel.list((table) => {
                    return table.where({ scriptId: script.id });
                }, new AllPage());
            }
            this.sandboxWindow.postMessage({ action: 'start', data: script, value: list }, '*');
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

    public execScript(script: Script, isdebug: boolean): Promise<void> {
        return new Promise(async resolve => {
            let list: Value[];
            if (script.namespace) {
                list = await this.valueModel.list((table) => {
                    return table.where({ namespace: script.namespace });
                }, new AllPage());
            } else {
                list = await this.valueModel.list((table) => {
                    return table.where({ scriptId: script.id });
                }, new AllPage());
            }
            this.sandboxWindow.postMessage({ action: 'exec', data: script, value: list, isdebug: isdebug }, '*');
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

