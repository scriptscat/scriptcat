import { Script } from "@App/model/script";

export abstract class ScriptController {

    public abstract enableScript(script: Script): void;

    public abstract disableScript(id: number): Promise<void>;

    public installScript(script: Script) {

    }

    public uninstallScript(id: number) {

    }

}