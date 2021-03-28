import { CronJob } from "cron";
import { Script, SCRIPT_TYPE_CRONTAB } from "./model/script";
import { buildThis, compileScript, createContext } from "@App/pkg/sandbox";
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
        let key: any;
        if (type == "debug") {
            key = "script:debug:" + script.id;
        } else {
            key = "script:" + script.id;
        }
        script.delayruntime = 0;
        context.CAT_setRunError("", 0);
        script.lastruntime = new Date().getTime();
        context.CAT_setLastRuntime(script.lastruntime);
        SendLogger(LOGGER_LEVEL_INFO, type, "exec script id: " + script.id, script.name);
        let execRet = func(buildThis(window, context));
        if (execRet instanceof Promise) {
            execRet
                .then((result: any) => {
                    SendLogger(
                        LOGGER_LEVEL_INFO,
                        type,
                        "exec script id: " +
                        script.id +
                        " time: " +
                        (new Date().getTime() - (script.lastruntime || 0)).toString() +
                        "ms result: " +
                        result,
                        script.name,
                    );
                    context.CAT_runComplete();
                    resolve(true);
                })
                .catch((error: string, delayrun: number = 0) => {
                    SendLogger(
                        LOGGER_LEVEL_ERROR,
                        type,
                        "exec script id: " +
                        script.id +
                        " error: " +
                        error +
                        (delayrun ? " delayrun: " + delayrun : ""),
                        script.name,
                    );
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
                script.name,
            );
            //30s后标记完成并清理资源
            setTimeout(() => {
                context.CAT_runComplete();
            }, 30 * 1000);
            resolve(true);
        }
    });
}

function createSandboxContext(script: Script, value: Value[]): SandboxContext {
    let valMap = new Map();
    value.forEach((val) => {
        valMap.set(val.key, val);
    });
    let context: SandboxContext = new SandboxContext(script, valMap);
    return <SandboxContext>createContext(context, script);
}

function start(script: Script, value: Value[]): any {
    if (script.metadata["crontab"]) {
        return runCrontab(script, value);
    } else if (script.metadata["background"]) {
        let context = createSandboxContext(script, value);
        App.Cache.set("script:" + script.id, context);
        execScript(script, compileScript(script), context, "run");
        return top.postMessage({ action: "start", data: "" }, "*");
    }
}

function runCrontab(script: Script, value: Value[]) {
    let crontab = script.metadata["crontab"];
    let context = createSandboxContext(script, value);
    App.Cache.set("script:" + script.id, context);
    let func = compileScript(script);

    let list = new Array<CronJob>();
    crontab.forEach((val) => {
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
            val = val.replaceAll("once", "*");
        }
        //TODO:优化once的逻辑，不必每分钟都判断一次
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

async function exec(script: Script, value: Value[], isdebug: boolean) {
    let context = createSandboxContext(script, value);
    App.Cache.set("script:" + (isdebug ? "debug:" : "") + script.id, context);
    execScript(script, compileScript(script), context, isdebug ? "debug" : "run");
    return top.postMessage({ action: "exec", data: "" }, "*");
}

async function stop(script: Script, isdebug: boolean) {
    let context = <SandboxContext>(
        await App.Cache.get("script:" + (isdebug ? "debug:" : "") + script.id)
    );
    if (context) {
        context.CAT_runComplete();
    }
    if (script.type != SCRIPT_TYPE_CRONTAB) {
        return top.postMessage({ action: "stop" }, "*");
    }
    let list = cronjobMap.get(script.id);
    if (list == null) {
        return top.postMessage({ action: "stop" }, "*");
    }
    list.forEach((val) => {
        val.stop();
    });
    cronjobMap.delete(script.id);

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
            start(event.data.data, event.data.value);
            break;
        }
        case "stop": {
            stop(event.data.data, event.data.isdebug);
            break;
        }
        case "exec": {
            exec(event.data.data, event.data.value, event.data.isdebug);
            break;
        }
    }
});
top.postMessage({ action: "load" }, "*");
