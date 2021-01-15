import { Script } from "@App/model/script";

export abstract class ScriptController {

    public abstract enableScript(script: Script): void;

    public abstract disableScript(name: string): void;

    public installScript(script: Script) {

    }

    public uninstallScript(name: string) {

    }

}