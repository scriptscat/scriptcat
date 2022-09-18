/* eslint-disable camelcase */
/* eslint-disable max-classes-per-file */
import { Message } from "@App/app/message/message";
import { ScriptRunResouce } from "@App/app/repo/scripts";

interface ApiParam {
  depend?: string[];
  listener?: () => void;
}

export interface ApiValue {
  api: any;
  param: ApiParam;
}

export class GMContext {
  static apis: Map<string, ApiValue> = new Map();

  public static API(param: ApiParam = {}) {
    return (
      target: any,
      propertyName: string,
      descriptor: PropertyDescriptor
    ) => {
      const key = propertyName;
      if (param.listener) {
        param.listener();
      }
      GMContext.apis.set(key, {
        api: descriptor.value,
        param,
      });
      // 兼容GM.*
      let dot = key.replace("_", ".");
      if (dot !== key) {
        // 特殊处理GM.xmlHttpRequest
        if (dot === "GM.xmlhttpRequest") {
          dot = "GM.xmlHttpRequest";
        }
        GMContext.apis.set(dot, {
          api: descriptor.value,
          param,
        });
      }
    };
  }
}

export default class GMApi {
  script!: ScriptRunResouce;

  message!: Message;

  valueChangeListener = new Map<
    number,
    { name: string; listener: GMTypes.ValueChangeListener }
  >();

  // 单次回调使用
  public sendMessage(api: string, params: any[]) {
    return this.message.syncSend("gmApi", {
      api,
      scriptId: this.script.id,
      params,
    });
  }

  // 长连接使用
  public connect() {
    return this.message.connect();
  }

  @GMContext.API()
  public GM_info() {
    return {
      scriptWillUpdate: false,
      scriptHandler: "ScriptCat",
      scriptUpdateURL: this.script.checkUpdateUrl,
      scriptSource: this.script.code,
      script: {
        name: this.script.name,
        namespace: this.script.namespace,
        version:
          this.script.metadata.version && this.script.metadata.version[0],
        author: this.script.author,
      },
    };
  }

  @GMContext.API()
  public GM_getValue(key: string, defaultValue?: any) {
    const ret = this.script.value[key];
    if (ret) {
      return ret.value;
    }
    return defaultValue;
  }

  @GMContext.API()
  public GM_setValue(key: string, value: any) {
    // 对object的value进行一次转化
    if (typeof value === "object") {
      value = JSON.parse(JSON.stringify(value));
    }
    let ret = this.script.value[key];
    if (ret) {
      ret.value = value;
    } else {
      ret = {
        id: 0,
        scriptId: this.script.id,
        storageName:
          (this.script.metadata.storagename &&
            this.script.metadata.storagename[0]) ||
          "",
        key,
        value,
        createtime: new Date().getTime(),
      };
    }
    if (value === undefined) {
      delete this.script.value[key];
    } else {
      this.script.value[key] = ret;
    }
    this.sendMessage("GM_setValue", [key, value]);
  }

  @GMContext.API({ depend: ["GM_setValue"] })
  public GM_deleteValue(name: string): void {
    this.GM_setValue(name, undefined);
  }

  @GMContext.API()
  public GM_listValues(): string[] {
    return Object.keys(this.script.value);
  }

  @GMContext.API()
  public GM_addValueChangeListener(
    name: string,
    listener: GMTypes.ValueChangeListener
  ): number {
    const id = Math.random() * 10000000;
    this.valueChangeListener.set(id, { name, listener });
    return id;
  }

  @GMContext.API()
  public GM_removeValueChangeListener(listenerId: number): void {
    this.valueChangeListener.delete(listenerId);
  }
}
