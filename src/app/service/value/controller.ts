import IoC from "@App/app/ioc";
import MessageInternal from "@App/app/message/internal";
import Controller from "../controller";

@IoC.Singleton(MessageInternal)
export default class ValueController extends Controller {
  internal: MessageInternal;

  constructor(internal: MessageInternal) {
    super(internal, "value");
    this.internal = internal;
  }

  public setValue(scriptId: number, key: string, value: any) {
    return this.dispatchEvent("upsert", {
      scriptId,
      key,
      value,
    });
  }
}
