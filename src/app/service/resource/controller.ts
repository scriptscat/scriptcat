import IoC from "@App/app/ioc";
import MessageInternal from "@App/app/message/internal";
import { Resource } from "@App/app/repo/resource";
import { Script } from "@App/app/repo/scripts";
import Controller from "../controller";

@IoC.Singleton(MessageInternal)
export default class ResourceController extends Controller {
  constructor(message: MessageInternal) {
    super(message, "resource");
  }

  getResource(script: Script): Promise<{ [key: string]: Resource }> {
    return this.dispatchEvent("getScriptResources", script);
  }

  deleteResource(id: number): Promise<void> {
    return this.dispatchEvent("deleteResource", id);
  }
}
