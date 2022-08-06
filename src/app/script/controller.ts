import ConnectInternal from "../connect/internal";

// 脚本控制器,主要负责与manager交互,控制器发送消息给manager,manager进行处理
export default class ScriptController {
  static instance = new ScriptController(ConnectInternal.getInstance());

  static getInstance() {
    return ScriptController.instance;
  }

  internal: ConnectInternal;

  constructor(internal: ConnectInternal) {
    this.internal = internal;
  }

  public install() {
    return new Promise((resolve) => {
      this.internal.sendSingleStream("install", { test: 123 }, (data) => {
        resolve(data);
      });
    });
  }
}
