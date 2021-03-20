import { Script } from "@App/model/script";

export interface IScript {
    // 用于自动启动
    enableScript(script: Script): Promise<string>;
    disableScript(script: Script): Promise<void>;

    // 用于单次操作
    execScript(script: Script, isdebug: boolean): Promise<void>;
    stopScript(script: Script, isdebug: boolean): Promise<void>;
}
