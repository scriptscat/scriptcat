import { Script } from "@App/model/script";
import { Value } from "@App/model/value";

export interface IScript {
    // 用于自动启动
    enableScript(script: Script, value: Value[]): Promise<string>;
    disableScript(script: Script): Promise<void>;

    // 用于单次操作
    execScript(script: Script, value: Value[], isdebug: boolean): Promise<void>;
    stopScript(script: Script, isdebug: boolean): Promise<void>;
}
