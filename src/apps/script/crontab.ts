import { ScriptModel, SCRIPT_TYPE_CRONTAB, Script, SCRIPT_STATUS_ENABLE } from "@App/model/script";
import { CronTime, CronJob } from "cron";
import { IScript } from "./interface";

export class Crontab implements IScript {

    protected script = new ScriptModel();

    protected cronjobMap = new Map<number, CronJob>();

    public enableScript(script: Script): Promise<string> {
        return new Promise(resolve => {
            let crontab = script.metadata["crontab"];
            if (crontab == undefined) {
                return resolve("无脚本定时时间");
            }
            let cron = new CronJob(crontab[0], () => {
                //TODO:执行脚本
                console.log('定时');
            }, null, true);
            this.cronjobMap.set(script.id, cron);

            return resolve("");
        });
    }

    public disableScript(script: Script): Promise<void> {
        return new Promise(async resolve => {
            if (script.type != SCRIPT_TYPE_CRONTAB) {
                return resolve();
            }
            let cronjob = this.cronjobMap.get(script.id);
            if (cronjob == null) {
                return resolve();
            }
            cronjob.stop();
            this.cronjobMap.delete(script.id);
            return resolve();
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

