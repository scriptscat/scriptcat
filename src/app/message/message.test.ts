import "fake-indexeddb/auto";
import LoggerCore from "../logger/core";
import DBWriter from "../logger/db_writer";
import migrate from "../migrate";
import { LoggerDAO } from "../repo/logger";
import MessageCenter from "./center";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import MessageInternal from "./internal";

migrate();

const logger = new LoggerCore({
  level: "debug",
  writer: new DBWriter(new LoggerDAO()),
  labels: { env: "tests" },
});
logger.logger().info("test start");

// @ts-ignore
global.sandbox = {};
const center = new MessageCenter();
center.start();

const content = new MessageInternal("background");

describe("message center", () => {
  it("set handler", async () => {
    const listener = jest.fn();
    center.setHandler("test", () => {
      listener();
      return Promise.resolve("ok");
    });
    await content.syncSend("test", "test");
    expect(listener).toBeCalled();
  });

  it("with connect", async () => {
    const listener = jest.fn();
    center.setHandlerWithConnect("test-channel", (connect, data) => {
      listener(connect, data);
      connect.setHandler(listener);
    });
    const channel = content.channel();
    channel.channel("test-channel", [1, 2, 3]);
    channel.send("test");
    expect(listener).toBeCalledTimes(2);
  });
});
