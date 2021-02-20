import { Script } from "@App/model/script";
import { AxiosRequestConfig } from "axios";

export interface IScript {
    enableScript(script: Script): Promise<string>;

    disableScript(script: Script): Promise<void>;
}

export interface ICrontab extends IScript {
    validCrontab(crontab: string): boolean;
}
