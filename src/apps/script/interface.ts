import { Script } from "@App/model/script";

export interface IScript {
    enableScript(script: Script): Promise<string>;

    disableScript(script: Script): Promise<void>;
}

export interface ICrontab extends IScript {
    validCrontab(crontab: string): boolean;
}
