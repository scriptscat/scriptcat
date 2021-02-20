//沙盒测试

import { CronJob } from "cron";
import { Script, SCRIPT_TYPE_CRONTAB } from "./model/script";

let cronjobMap = new Map<number, CronJob>();

function start(script: Script): string {
    let crontab = script.metadata["crontab"];
    if (crontab == undefined) {
        return "无脚本定时时间";
    }
    let cron = new CronJob(crontab[0], () => {
        //TODO:执行脚本
        sandbox(script.code);
    }, null, true);
    cronjobMap.set(script.id, cron);
    return "";
}

function stop(script: Script) {
    if (script.type != SCRIPT_TYPE_CRONTAB) {
        return;
    }
    let cronjob = cronjobMap.get(script.id);
    if (cronjob == null) {
        return;
    }
    cronjob.stop();
    cronjobMap.delete(script.id);
    return;
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
parent.postMessage({ action: 'load' }, '*');
