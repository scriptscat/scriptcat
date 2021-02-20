//沙盒测试

import { CronJob } from "cron";
import { Script, SCRIPT_TYPE_CRONTAB } from "./model/script";
import { compileCode, createContext } from "@App/pkg/sandbox";
import { FrontendGrant } from "./apps/grant/frontend";
import { Grant } from "./apps/grant/interface";
import { randomString } from "./pkg/utils";

let cronjobMap = new Map<number, CronJob>();
let grant = new FrontendGrant();

function execScript(script: Script) {
    let context: { [key: string]: any } = {};
    if (script.metadata["grant"] != undefined) {
        context["postRequest"] = function (value: string, params: any[]) {
            let grant: Grant = {
                value: value,
                params: params,
                request: randomString(32)
            };
            top.postMessage(grant, '*');
        };
        script.metadata["grant"].forEach((value) => {
            context[value] = grant.getApi(value);
        });
    }
    let func = compileCode(script.code);
    func(createContext(window, context));
}

function start(script: Script): any {
    let crontab = script.metadata["crontab"];
    if (crontab == undefined) {
        return top.postMessage({ action: 'start', data: '无脚本定时时间' }, '*');
    }
    execScript(script);
    let cron = new CronJob(crontab[0], () => {
        execScript(script);
    }, null, true);
    cronjobMap.set(script.id, cron);
    return top.postMessage({ action: 'start', data: '' }, '*');
}

function stop(script: Script) {
    if (script.type != SCRIPT_TYPE_CRONTAB) {
        return top.postMessage({ action: 'stop' }, '*');
    }
    let cronjob = cronjobMap.get(script.id);
    if (cronjob == null) {
        return top.postMessage({ action: 'stop' }, '*');
    }
    cronjob.stop();
    cronjobMap.delete(script.id);
    return top.postMessage({ action: 'stop' }, '*');
}

window.addEventListener('message', (event) => {
    switch (event.data.action) {
        case 'start': {
            start(event.data.data);
            break;
        }
        case 'stop': {
            stop(event.data.data);
            break;
        }
    }
});
top.postMessage({ action: 'load' }, '*');
