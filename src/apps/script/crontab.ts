import { ScriptModel, SCRIPT_TYPE_CRONTAB, Script, SCRIPT_STATUS_ENABLE } from "@App/model/script";
import { Value, ValueModel } from "@App/model/value";
import { AllPage } from "@App/pkg/utils";
import { CronTime, CronJob } from "cron";
import { IScript } from "./interface";

export class Crontab implements IScript {

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
            this.sandboxWindow.postMessage({ action: 'stop', data: script }, '*');
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

    public debugScript(script: Script): Promise<void> {
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
            this.sandboxWindow.postMessage({ action: 'debug', data: script, value: list }, '*');
            function listener(event: MessageEvent) {
                if (event.data.action != "debug") {
                    return;
                }
                resolve();
                window.removeEventListener('message', listener);
            }
            window.addEventListener('message', listener);
        });
    }

    public validCrontab(crontab: string[]): boolean {
        for (let i = 0; i < crontab.length; i++) {
            let val = crontab[i].replaceAll('once', '*');
            try {
                let t = new CronTime(val);
                t.sendAt();
            } catch (e) {
                return false;
            }
        }
        return true;
    }
}

