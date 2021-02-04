import { Metadata, Script, ScriptModel } from "@App/model/script";
import { Crontab } from "@App/script/crontab";
import { v5 as uuidv5 } from "uuid";
import axios from "axios";

export interface IScript {
    enableScript(script: Script): void;

    disableScript(id: number): Promise<void>;
}

export class ScriptController {

    protected script = new ScriptModel();
    protected crontab = new Crontab();

    protected cache = new Map<string, string>();

    constructor() {

    }

    protected parseMetadata(code: string): Metadata | null {
        let regex = /\/\/\s*==UserScript==([\s\S]+?)\/\/\s*==\/UserScript==/m;
        let header = regex.exec(code)
        if (!header) {
            return null;
        }
        regex = /\/\/\s*@(.*?)\s+(.*?)$/gm;
        let ret: Metadata = {};
        let meta: RegExpExecArray | null;
        while (meta = regex.exec(header[1])) {
            let [key, val] = [meta[1], meta[2]];
            let values = ret[key]
            if (values == null) {
                values = [];
            }
            values.push(val);
            ret[key] = values;
        }
        return ret;
    }

    protected validMetadata(metadata: Metadata | null): Metadata | null {
        if (metadata == null) {
            return null;
        }

        return metadata;
    }

    public installScript(url: string): Promise<string> {
        return new Promise(resolve => {
            axios.get(url).then((response) => {
                if (response.status != 200) {
                    return resolve("");
                }
                let metadata = this.parseMetadata(response.data);
                if (!this.validMetadata(metadata)) {
                    return resolve("");
                }
                let key = uuidv5(url, uuidv5.URL);
                this.cache.set(key, response.data);
                resolve(key);
            }).catch((e) => {
                resolve("");
            });
        });
    }

    public uninstallScript(id: number) {

    }

}