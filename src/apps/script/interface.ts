import { ScriptCache, Script } from '@App/model/do/script';

export interface IScript {
    // 用于自动启动
    enableScript(script: ScriptCache): Promise<string>;
    disableScript(script: Script): Promise<void>;

    // 用于单次操作
    execScript(script: ScriptCache, isdebug: boolean): Promise<void>;
    stopScript(script: Script, isdebug: boolean): Promise<void>;
}
