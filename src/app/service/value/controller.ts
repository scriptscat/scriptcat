import IoC from "@App/app/ioc";
import MessageInternal from "@App/app/message/internal";
import { Script } from "@App/app/repo/scripts";
import { ValueDAO } from "@App/app/repo/value";
import Controller from "../controller";

@IoC.Singleton(MessageInternal)
export default class ValueController extends Controller {
  internal: MessageInternal;

  valueDAO: ValueDAO;

  constructor(internal: MessageInternal) {
    super(internal, "value");
    this.internal = internal;
    this.valueDAO = new ValueDAO();
  }

  public setValue(scriptId: number, key: string, value: any) {
    return this.dispatchEvent("upsert", {
      scriptId,
      key,
      value,
    });
  }

  async getValues(script: Script) {
    const where: { [key: string]: any } = {};
    if (script.metadata.storagename) {
      [where.storageName] = script.metadata.storagename;
    } else {
      where.scriptId = script.id;
    }
    return Promise.resolve(await this.valueDAO.list(where));
  }

  watchValue(script: Script) {
    const channel = this.internal.channel();
    channel.channel("watchValue", script);
    return channel;
  }
}
