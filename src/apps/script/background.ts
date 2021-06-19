import { ScriptCache, Script } from "@App/model/do/script";
import { Value } from "@App/model/do/value";
import { CronJob } from "cron";
import { AppEvent, ScriptValueChange } from "../msg-center/event";

//后台脚本
export class Background {

    public enableScript(script: ScriptCache): Promise<string> {
        return new Promise(async resolve => {
            sandbox.postMessage({ action: 'start', data: script, value: script.value }, '*');
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
            sandbox.postMessage({ action: 'stop', data: script, isdebug: false }, '*');
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
            sandbox.postMessage({ action: 'stop', data: script, isdebug: isdebug }, '*');
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

    public execScript(script: ScriptCache, isdebug: boolean): Promise<void> {
        return new Promise(async resolve => {
            sandbox.postMessage({ action: 'exec', data: script, value: script.value, isdebug: isdebug }, '*');
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

