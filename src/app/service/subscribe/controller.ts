import IoC from "@App/app/ioc";
import MessageInternal from "@App/app/message/internal";
import {
  Subscribe,
  SUBSCRIBE_STATUS_DISABLE,
  SUBSCRIBE_STATUS_ENABLE,
  SubscribeDAO,
} from "@App/app/repo/subscribe";
import Controller from "../controller";

@IoC.Singleton(MessageInternal)
export default class SubscribeController extends Controller {
  subscribeDAO = new SubscribeDAO();

  constructor(internal: MessageInternal) {
    super(internal, "subscribe");
  }

  upsert(subscribe: Subscribe) {
    return this.dispatchEvent("upsert", subscribe);
  }

  enable(id: number) {
    // 订阅脚本开启和关闭没有副作用,直接修改数据库
    return this.subscribeDAO.update(id, {
      status: SUBSCRIBE_STATUS_ENABLE,
    });
  }

  disable(id: number) {
    return this.subscribeDAO.update(id, {
      status: SUBSCRIBE_STATUS_DISABLE,
    });
  }

  checkUpdate(id: number) {
    return this.dispatchEvent("checkUpdate", id);
  }

  delete(id: number) {
    return this.dispatchEvent("delete", id);
  }
}
