import ConnectInternal from "../connect/internal";

export default class ScriptBackground {
  internal: ConnectInternal;

  constructor(internal: ConnectInternal) {
    this.internal = internal;
  }
}
