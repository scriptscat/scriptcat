import IoC from "@App/app/ioc";
import MessageInternal from "@App/app/message/internal";
import Controller from "../controller";

@IoC.Singleton(MessageInternal)
export default class SystemController extends Controller {
  internal: MessageInternal;

  constructor(internal: MessageInternal) {
    super(internal, "system");
    this.internal = internal;
  }

  connectVSCode() {
    return this.dispatchEvent("connectVSCode", {});
  }
}
