import { CronJob } from "cron";
import { Script, SCRIPT_TYPE_CRONTAB } from "./model/script";
import { compileScript, createContext } from "@App/pkg/sandbox";
import { SandboxContext } from "./apps/grant/frontend";
import { SendLogger } from "./pkg/utils";
import { LOGGER_LEVEL_ERROR, LOGGER_LEVEL_INFO } from "./model/logger";
import { App, InitApp } from "./apps/app";
import { MapCache } from "./pkg/cache/cache";
import { Value } from "./model/value";
import { ConsoleLogger } from "./apps/logger/logger";

InitApp({
    Log: new ConsoleLogger(),
    Cache: new MapCache(),
    Environment: 'frontend',
});

let cronjobMap = new Map<number, Array<CronJob>>();

type ExecType = 'run' | 'retry' | 'debug';
async function execScript(script: Script, type: ExecType = 'run') {
    //使用SandboxContext接管postRequest
    let ret: any;
    if (type == 'debug') {
        ret = await App.Cache.get('script:debug:' + script.id);
    } else {
        ret = await App.Cache.get('script:' + script.id);
    }
    if (ret) {
        let [context, func] = ret;
        if (type !== 'debug') {
            script.delayruntime = 0;
            context.CAT_setRunError("", 0);
            script.lastruntime = new Date().getTime();
            context.CAT_setLastRuntime(script.lastruntime);
        }
        SendLogger(LOGGER_LEVEL_INFO, type, "exec script id: " + script.id + " by: " + <string>type, script.name);
        let execRet = func(createContext(window, context));
        if (execRet instanceof Promise) {
            execRet.then((result: any) => {
                SendLogger(LOGGER_LEVEL_INFO, type, "exec script id: " + script.id + " time: " +
                    (new Date().getTime() - (script.lastruntime || 0)).toString() + 'ms result: ' + result, script.name);
                if (type !== 'debug') {
                    context.CAT_runComplete();
                }
            }).catch((error: string, delayrun: number = 0) => {
                SendLogger(LOGGER_LEVEL_ERROR, type, "exec script id: " + script.id + " error: " + error + (delayrun ? ' delayrun: ' + delayrun : ''), script.name);
                if (type !== 'debug') {
                    if (delayrun > 0) {
                        script.delayruntime = new Date().getTime() + (delayrun * 1000);
                        context.CAT_setRunError(error, script.delayruntime);
                    } else {
                        context.CAT_setRunError(error, 0);
                    }
                }
            });
        } else {
            SendLogger(LOGGER_LEVEL_INFO, "sandbox", "exec script id: " + script.id + " time: " + (new Date().getTime() - (script.lastruntime || 0)).toString() + 'ms', script.name);
        }
    }
}

async function createContextCache(script: Script, value: Value[], isdebug: boolean = false): Promise<SandboxContext> {
    let key: string;
    if (isdebug) {
        key = "script:debug:" + script.id;
    } else {
        key = "script:" + script.id;
    }
    let valMap = new Map();
    value.forEach(val => {
        valMap.set(val.key, val);
    })
    let context: SandboxContext = new SandboxContext(script, valMap);
    if (script.metadata["grant"] != undefined) {
        (<{ [key: string]: any }>context)['GM'] = (<{ [key: string]: any }>context);
        script.metadata["grant"].forEach((value) => {
            let apiVal = context.getApi(value);
            if (value.startsWith('GM.')) {
                let [_, t] = value.split('.');
                (<{ [key: string]: any }>context)['GM'][t] = apiVal?.api;
            } else {
                (<{ [key: string]: any }>context)[value] = apiVal?.api;
            }
            if (apiVal?.param.depend) {
                for (let i = 0; i < apiVal?.param.depend.length; i++) {
                    let value = apiVal.param.depend[i];
                    let dependApi = context.getApi(value);
                    if (value.startsWith('GM.')) {
                        let [_, t] = value.split('.');
                        (<{ [key: string]: any }>context)['GM'][t] = dependApi?.api;
                    } else {
                        (<{ [key: string]: any }>context)[value] = dependApi?.api;
                    }
                }
            }
        });
    }
    await App.Cache.set(key, [<SandboxContext>context, compileScript(script)]);
    return context;
}

function start(script: Script, value: Value[]): any {
    if (script.metadata["crontab"]) {
        return runCrontab(script, value);
    } else if (script.metadata["background"]) {
        createContextCache(script, value);
        execScript(script, 'run');
        return top.postMessage({ action: 'start', data: '' }, '*');
    }
}

function runCrontab(script: Script, value: Value[]) {
    let crontab = script.metadata["crontab"];
    createContextCache(script, value);

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
                    //TODO:使用单独的计时器执行
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

function exec(script: Script, value: Value[], isdebug: boolean) {
    createContextCache(script, value, isdebug);
    execScript(script, isdebug ? 'debug' : 'run');
    return top.postMessage({ action: 'exec', data: '' }, '*');
}

async function stop(script: Script) {
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
    let ret = await App.Cache.get("script:" + script.id);
    if (ret) {
        let [context, _] = ret;
        //释放资源
        context.destruct();
        App.Cache.del("script:" + script.id);
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
            start(event.data.data, event.data.value);
            break;
        }
        case 'stop': {
            stop(event.data.data);
            break;
        }
        case 'exec': {
            exec(event.data.data, event.data.value, event.data.isdebug);
            break;
        }
    }
});
top.postMessage({ action: 'load' }, '*');
