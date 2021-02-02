import { ScriptModel, SCRIPT_TYPE_CRONTAB, Script, SCRIPT_STATUS_ENABLE } from "@App/model/script";
import { ScriptController } from "./script";
import { CronJob } from "cron";

export class CrontabController extends ScriptController {

    protected script = new ScriptModel();

    protected cronjobMap = new Map<number, CronJob>();

    constructor() {
        super();

        this.script.find().where({ type: SCRIPT_TYPE_CRONTAB, status: SCRIPT_STATUS_ENABLE }).toArray().then(items => {
            items.forEach((value: Script, index: number) => {
                let err = this.enableScript(value);
                if (err != "") {
                    value.error = err;
                    this.script.save(value);
                }
            });
        });
    }

    public enableScript(script: Script): string {
        let crontab = script.metadata["crontab"];
        if (crontab.length == 0) {
            return "无脚本定时时间";
        }
        this.cronjobMap.set(script.id, new CronJob(crontab[0], () => {
            //执行脚本
        }, null, true));

        return "";
    }

    public async disableScript(id: number): Promise<void> {
        let script = await this.script.findById(id);
        if (script == null) {
            return;
        }
        if (script.type != SCRIPT_TYPE_CRONTAB) {
            return;
        }
        let cronjob = this.cronjobMap.get(script.id);
        if (cronjob == null) {
            return;
        }
        cronjob.stop();
        this.cronjobMap.delete(script.id);
    }
}

