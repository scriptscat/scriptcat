import { ScriptModel, SCRIPT_TYPE_CRONTAB, Script } from "@App/model/script";
import { ScriptController } from "./script";

export class CrontabController extends ScriptController {

    protected script = new ScriptModel();

    constructor() {
        super();
        this.script.find().where({ type: SCRIPT_TYPE_CRONTAB }).toArray().then(items => {
            items.forEach((value: Script, index: number) => {
                this.enableScript(value);
            });
        });
    }

    public enableScript(script: Script): void {

    }

    public disableScript(name: string): void {

    }
}

