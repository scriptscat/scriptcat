import { afterEach, describe, expect, it, vi } from "vitest";
import LoggerCore, { type Writer } from "./core";

const createWriter = () => ({ write: vi.fn() }) satisfies Writer;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LoggerCore 持久化日志级别", () => {
  it("开发环境默认应持久化 debug 但不持久化 trace", () => {
    vi.stubEnv("NODE_ENV", "development");
    const writer = createWriter();
    const logger = new LoggerCore({ writer, consoleLevel: "none", labels: {} }).logger();

    logger.trace("trace message");
    logger.debug("debug message");

    expect(writer.write).toHaveBeenCalledOnce();
    expect(writer.write).toHaveBeenCalledWith("debug", "debug message", {});
  });

  it("生产环境默认不应持久化 debug 但应持久化 info", () => {
    vi.stubEnv("NODE_ENV", "production");
    const writer = createWriter();
    const logger = new LoggerCore({ writer, consoleLevel: "none", labels: {} }).logger();

    logger.debug("debug message");
    logger.info("info message");

    expect(writer.write).toHaveBeenCalledOnce();
    expect(writer.write).toHaveBeenCalledWith("info", "info message", {});
  });

  it("显式级别应覆盖环境默认值", () => {
    vi.stubEnv("NODE_ENV", "development");
    const developmentWriter = createWriter();
    const developmentLogger = new LoggerCore({
      writer: developmentWriter,
      level: "info",
      consoleLevel: "none",
      labels: {},
    }).logger();

    developmentLogger.debug("debug message");
    developmentLogger.info("info message");

    vi.stubEnv("NODE_ENV", "production");
    const productionWriter = createWriter();
    const productionLogger = new LoggerCore({
      writer: productionWriter,
      level: "debug",
      consoleLevel: "none",
      labels: {},
    }).logger();

    productionLogger.debug("debug message");

    expect(developmentWriter.write).toHaveBeenCalledOnce();
    expect(developmentWriter.write).toHaveBeenCalledWith("info", "info message", {});
    expect(productionWriter.write).toHaveBeenCalledOnce();
    expect(productionWriter.write).toHaveBeenCalledWith("debug", "debug message", {});
  });
});
