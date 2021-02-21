import { ScriptModel, SCRIPT_TYPE_CRONTAB, Script, SCRIPT_STATUS_ENABLE } from "@App/model/script";
import { CronTime, CronJob } from "cron";
import { IScript } from "./interface";

export class Crontab implements IScript {

    protected sandboxWindow: Window;
    constructor(iframe: Window) {
        this.sandboxWindow = iframe;
    }

    protected cronjobMap = new Map<number, CronJob>();

    public enableScript(script: Script): Promise<string> {
        return new Promise(resolve => {
            this.sandboxWindow.postMessage({ action: 'start', data: script }, '*');
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

    public validCrontab(crontab: string): boolean {
        try {
            let t = new CronTime(crontab);
            t.sendAt();
        } catch (e) {
            return false;
        }
        return true;
    }
}

