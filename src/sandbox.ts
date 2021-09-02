import { CronJob } from "cron";
import { buildThis, compileScript, createContext } from "@App/pkg/sandbox";
import { SandboxContext } from "./apps/grant/frontend";
import { SendLogger } from "./pkg/utils";
import { App, InitApp } from "./apps/app";
import { MapCache } from "./pkg/storage/cache/cache";
import { ConsoleLogger } from "./apps/logger/logger";
import { AppEvent, ScriptValueChange } from "./apps/msg-center/event";
import { LOGGER_LEVEL_INFO, LOGGER_LEVEL_ERROR } from "./model/do/logger";
import { Script, ScriptCache, SCRIPT_TYPE_CRONTAB } from "./model/do/script";
import { nextTime } from "./views/pages/utils";

InitApp({
    Log: new ConsoleLogger(),
    Cache: new MapCache(),
    Environment: "frontend",
});

let cronjobMap = new Map<number, Array<CronJob>>();

type ExecType = "run" | "crontab" | "retry" | "debug";

async function execScript(
    script: Script,
    func: Function,
    context: SandboxContext,
    type: ExecType = "run",
): Promise<boolean> {
    return new Promise(async (resolve) => {
        //使用SandboxContext接管postRequest
        script.delayruntime = 0;
        context.CAT_setRunError("", 0);
        script.lastruntime = new Date().getTime();
        context.CAT_setLastRuntime(script.lastruntime);
        SendLogger(LOGGER_LEVEL_INFO, type, "exec script id: " + script.id, script.name, script.id);
        let execRet;
        try {
            execRet = func(buildThis(window, context));
        } catch (error) {
            let msg = "exec script id: " + script.id + " time: " + (new Date().getTime() - (script.lastruntime || 0)).toString() + "ms"
            if (error) {
                msg += " error: " + error;
            }
            SendLogger(LOGGER_LEVEL_ERROR, type, msg, script.name, script.id);
            script.delayruntime = 0;
            context.CAT_setRunError(error, script.delayruntime);
            resolve(true);
            return
        }
        if (execRet instanceof Promise) {
            execRet
                .then((result: any) => {
                    let msg = "exec script id: " + script.id + " time: " + (new Date().getTime() - (script.lastruntime || 0)).toString() + "ms"
                    if (result) {
                        msg += " result: " + result;
                    }
                    SendLogger(LOGGER_LEVEL_INFO, type, msg, script.name, script.id);
                    context.CAT_runComplete();
                    resolve(true);
                })
                .catch((error: string, delayrun: number = 0) => {
                    let msg = "exec script id: " + script.id + " time: " + (new Date().getTime() - (script.lastruntime || 0)).toString() + "ms"
                    if (error) {
                        msg += " error: " + error + (delayrun ? " delayrun: " + delayrun : "")
                    }
                    SendLogger(LOGGER_LEVEL_ERROR, type, msg, script.name, script.id);
                    if (delayrun > 0) {
                        script.delayruntime = new Date().getTime() + delayrun * 1000;
                    } else {
                        script.delayruntime = 0;
                    }
                    context.CAT_setRunError(error, script.delayruntime);
                    resolve(true);
                });
        } else {
            SendLogger(
                LOGGER_LEVEL_INFO,
                type,
                "exec script id: " +
                script.id +
                " time: " +
                (new Date().getTime() - (script.lastruntime || 0)).toString() +
                "ms",
                script.name, script.id
            );
            context.CAT_runComplete();
        }
    });
}

function createSandboxContext(script: ScriptCache): SandboxContext {
    let context: SandboxContext = new SandboxContext(script);
    return <SandboxContext>createContext(context, script);
}

function start(script: ScriptCache): any {
    if (script.metadata["crontab"]) {
        return runCrontab(script);
    } else if (script.metadata["background"]) {
        let context = createSandboxContext(script);
        App.Cache.set("script:" + script.id, context);
        execScript(script, compileScript(script), context, "run");
        return top.postMessage({ action: "start", data: "" }, "*");
    }
}

function runCrontab(script: ScriptCache) {
    let crontab = script.metadata["crontab"];
    let context = createSandboxContext(script);
    App.Cache.set("script:" + script.id, context);
    let func = compileScript(script);

    let list = new Array<CronJob>();
    crontab.forEach((val: string) => {
        let oncePos = 0;
        if (val.indexOf("once") !== -1) {
            let vals = val.split(" ");
            vals.forEach((val, index) => {
                if (val == "once") {
                    oncePos = index;
                }
            });
            if (vals.length == 5) {
                oncePos++;
            }
            val = val.replace(/once/g, "*");
        }
        //TODO:优化once的逻辑，不必每分钟都判断一次
        // 校验表达式
        if (nextTime(val) == '错误的定时表达式') {
            return;
        }
        let cron = new CronJob(
            val,
            () => {
                if (oncePos) {
                    if (!script.lastruntime) {
                        execScript(script, func, context, "crontab");
                        return;
                    }
                    let now = new Date();
                    if (script.delayruntime && script.delayruntime < now.getTime()) {
                        //TODO:使用单独的计时器执行
                        execScript(script, func, context, "retry");
                        return;
                    }
                    if (script.lastruntime > now.getTime()) {
                        return;
                    }
                    let last = new Date(script.lastruntime);
                    let flag = false;
                    switch (oncePos) {
                        case 1: //每分钟
                            flag = last.getMinutes() != now.getMinutes();
                            break;
                        case 2: //每小时
                            flag = last.getHours() != now.getHours();
                            break;
                        case 3: //每天
                            flag = last.getDay() != now.getDay();
                            break;
                        case 4: //每月
                            flag = last.getMonth() != now.getMonth();
                            break;
                        case 5: //每年
                            flag = last.getFullYear() != now.getFullYear();
                            break;
                        case 6: //每星期
                            flag = getWeek(last) != getWeek(now);
                        default:
                    }
                    if (flag) {
                        execScript(script, func, context, "crontab");
                    }
                } else {
                    execScript(script, func, context, "crontab");
                }
            },
            null,
            true,
        );
        list.push(cron);
    });
    cronjobMap.set(script.id, list);
    return top.postMessage({ action: "start", data: "" }, "*");
}

async function exec(script: ScriptCache, isdebug: boolean) {
    let context = createSandboxContext(script);
    App.Cache.set("script:" + (isdebug ? "debug:" : "") + script.id, context);
    execScript(script, compileScript(script), context, isdebug ? "debug" : "run");
    return top.postMessage({ action: "exec", data: "" }, "*");
}

async function disable(script: Script) {
    let context = <SandboxContext>(
        await App.Cache.get("script:" + script.id)
    );
    if (context) {
        context.destruct();
    }
    if (script.type != SCRIPT_TYPE_CRONTAB) {
        return top.postMessage({ action: "disable" }, "*");
    }
    let list = cronjobMap.get(script.id);
    if (!list) {
        return top.postMessage({ action: "disable" }, "*");
    }
    list.forEach((val) => {
        val.stop();
    });
    cronjobMap.delete(script.id);
    return top.postMessage({ action: "disable" }, "*");
}

async function stop(script: Script, isdebug: boolean) {
    let context = <SandboxContext>(
        await App.Cache.get("script:" + (isdebug ? "debug:" : "") + script.id)
    );
    if (context) {
        if (script.type == SCRIPT_TYPE_CRONTAB) {
            context.CAT_runComplete();
        } else {
            context.destruct();
        }
    }
    return top.postMessage({ action: "stop" }, "*");
}

function getWeek(date: Date) {
    let nowDate = new Date(date);
    let firstDay = new Date(date);
    firstDay.setMonth(0); //设置1月
    firstDay.setDate(1); //设置1号
    let diffDays = Math.ceil((nowDate.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
    let week = Math.ceil(diffDays / 7);
    return week === 0 ? 1 : week;
}

window.addEventListener("message", (event) => {
    switch (event.data.action) {
        case "start": {
            start(event.data.data);
            break;
        }
        case "disable": {
            disable(event.data.data);
            break;
        }
        case "exec": {
            exec(event.data.data, event.data.isdebug);
            break;
        }
        case "stop": {
            stop(event.data.data, event.data.isdebug);
            break;
        }
        case ScriptValueChange: {
            AppEvent.trigger(ScriptValueChange, event.data.value);
        }
    }
});
top.postMessage({ action: "load" }, "*");
