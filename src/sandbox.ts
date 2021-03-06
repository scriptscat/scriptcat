import { CronJob } from "cron";
import { Script, SCRIPT_TYPE_CRONTAB } from "./model/script";
import { compileCode, createContext } from "@App/pkg/sandbox";
import { SandboxContext } from "./apps/grant/frontend";
import { logger } from "./apps/logger/logger";
import { SendLogger } from "./pkg/utils";
import { LOGGER_LEVEL_INFO } from "./model/logger";

let cronjobMap = new Map<number, Array<CronJob>>();

let cache = new Map<number, [SandboxContext, Function]>();

type ExecType = 'run' | 'retry' | 'debug';
function execScript(script: Script, type: ExecType = 'run') {
    //使用SandboxContext接管postRequest
    let ret = cache.get(script.id);
    if (ret) {
        let [context, func] = ret;
        if (type == 'retry') {
            script.delayruntime = 0;
            context.GM_setDelayRuntime(script.delayruntime);
        }
        script.lastruntime = new Date().getTime();
        context.GM_setLastRuntime(script.lastruntime);
        SendLogger(LOGGER_LEVEL_INFO, "sandbox", "exec script id:", script.id.toString(), "by:", <string>type);
        let execRet = func(createContext(window, context));
        if (execRet instanceof Promise) {
            execRet.then(() => {
                SendLogger(LOGGER_LEVEL_INFO, "sandbox", "exec script id:", script.id.toString(), "time:", (new Date().getTime() - (script.lastruntime || 0)).toString() + 'ms');
            })
        } else {
            SendLogger(LOGGER_LEVEL_INFO, "sandbox", "exec script id:", script.id.toString(), "time:", (new Date().getTime() - (script.lastruntime || 0)).toString() + 'ms');
        }
    }
}

function createContextCache(script: Script): SandboxContext {
    let ret = cache.get(script.id);
    if (ret) {
        return ret[0];
    }
    let context: SandboxContext = new SandboxContext(script.id);
    if (script.metadata["grant"] != undefined) {
        script.metadata["grant"].forEach((value) => {
            (<{ [key: string]: any }>context)[value] = context.getApi(value);
        });
    }
    cache.set(script.id, [<SandboxContext>context, compileCode(script.code)]);
    context.listenReject((result: any) => {
        if (typeof result == 'number') {
            script.delayruntime = new Date().getTime() + (result * 1000);
            context.GM_setDelayRuntime(script.delayruntime);
        }
    });
    return context;
}

function start(script: Script): any {
    let crontab = script.metadata["crontab"];
    if (crontab == undefined) {
        return top.postMessage({ action: 'start', data: '无脚本定时时间' }, '*');
    }
    createContextCache(script);

    let list = new Array<CronJob>();
    crontab.forEach((val) => {
        let oncePos = 0;
        if (val.indexOf('once') !== -1) {
            let vals = val.split(' ');
            vals.forEach((val, index) => {
                if (val == 'once') {
                    oncePos = index;
                }
            });
            if (vals.length == 5) {
                oncePos++;
            }
            val = val.replaceAll('once', '*');
        }
        //TODO:优化once的逻辑，不必每分钟都判断一次
        let cron = new CronJob(val, () => {
            if (oncePos) {
                if (!script.lastruntime) {
                    execScript(script);
                    return;
                }
                let now = new Date();
                if (script.delayruntime && script.delayruntime < now.getTime()) {
                    execScript(script, 'retry');
                    return;
                }
                if (script.lastruntime > now.getTime()) {
                    return;
                }
                let last = new Date(script.lastruntime);
                let flag = false;
                switch (oncePos) {
                    case 1://每分钟
                        flag = last.getMinutes() != now.getMinutes();
                        break;
                    case 2://每小时
                        flag = last.getHours() != now.getHours()
                        break;
                    case 3: //每天
                        flag = last.getDay() != now.getDay()
                        break;
                    case 4://每月
                        flag = last.getMonth() != now.getMonth()
                        break;
                    case 5://每年
                        flag = last.getFullYear() != now.getFullYear()
                        break;
                    case 6://每星期
                        flag = getWeek(last) != getWeek(now);
                    default:
                }
                if (flag) {
                    execScript(script);
                }
            } else {
                execScript(script);
            }
        }, null, true);
        list.push(cron);
    });
    cronjobMap.set(script.id, list);
    return top.postMessage({ action: 'start', data: '' }, '*');
}

function debug(script: Script) {
    createContextCache(script);
    execScript(script, 'debug');
    return top.postMessage({ action: 'debug', data: '' }, '*');
}

function stop(script: Script) {
    if (script.type != SCRIPT_TYPE_CRONTAB) {
        return top.postMessage({ action: 'stop' }, '*');
    }
    let list = cronjobMap.get(script.id);
    if (list == null) {
        return top.postMessage({ action: 'stop' }, '*');
    }
    list.forEach((val) => {
        val.stop();
    });
    cronjobMap.delete(script.id);
    let ret = cache.get(script.id);
    if (ret) {
        let [context, _] = ret;
        context.destruct();
        cache.delete(script.id);
    }
    return top.postMessage({ action: 'stop' }, '*');
}

function getWeek(date: Date) {
    let nowDate = new Date(date);
    let firstDay = new Date(date);
    firstDay.setMonth(0);//设置1月
    firstDay.setDate(1);//设置1号
    let diffDays = Math.ceil((nowDate.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
    let week = Math.ceil(diffDays / 7);
    return week === 0 ? 1 : week;
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
        case 'debug': {
            debug(event.data.data);
            break;
        }
    }
});
top.postMessage({ action: 'load' }, '*');
