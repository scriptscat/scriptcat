import { Script } from "@App/model/script";
import { Value } from "@App/model/value";
import { AxiosRequestConfig } from "axios";

export interface IScript {
    enableScript(script: Script): Promise<string>;

    disableScript(script: Script): Promise<void>;

    execScript(script: Script, isdebug: boolean): Promise<void>;
}
