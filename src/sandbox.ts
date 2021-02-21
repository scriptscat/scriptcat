import { CronJob } from "cron";
import { Script, SCRIPT_TYPE_CRONTAB } from "./model/script";
import { compileCode, createContext } from "@App/pkg/sandbox";
import { FrontendGrant, SandboxContext } from "./apps/grant/frontend";

let cronjobMap = new Map<number, CronJob>();
let grant = new FrontendGrant(0);

let cache = new Map<number, [SandboxContext, Function]>();
function execScript(script: Script) {
    //使用SandboxContext接管postRequest
    let ret = cache.get(script.id);
    let context: { [key: string]: any };
    let func: Function;
    if (ret) {
        [context, func] = ret;
    } else {
        context = new SandboxContext(script.id);
        if (script.metadata["grant"] != undefined) {
            script.metadata["grant"].forEach((value) => {
                context[value] = grant.getApi(value);
            });
        }
        func = compileCode(script.code);
        cache.set(script.id, [<SandboxContext>context, func]);
    }
    func(createContext(window, context));
}

function start(script: Script): any {
    let crontab = script.metadata["crontab"];
    if (crontab == undefined) {
        return top.postMessage({ action: 'start', data: '无脚本定时时间' }, '*');
    }
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
    let ret = cache.get(script.id);
    if (ret) {
        let [context, _] = ret;
        context.destruct();
        cache.delete(script.id);
    }
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
