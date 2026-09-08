import { RPC_PARAM_VALIDATORS } from "./generated/validators.generated";
import type { WSEnvelope } from "./types";

interface BusinessParams {
  input: unknown;
}

export function decodeWireEnvelope(frame: string): WSEnvelope {
  const value: unknown = JSON.parse(frame);
  assertJSONRPCMessage(value);
  const message = value as WSEnvelope;
  if (message.method && Object.hasOwn(RPC_PARAM_VALIDATORS, message.method)) {
    const params = message.params as BusinessParams;
    const method = message.method as keyof typeof RPC_PARAM_VALIDATORS;
    const validateParams = RPC_PARAM_VALIDATORS[method];
    if (!validateParams(params.input)) {
      throw new Error(`Invalid params for ${message.method}`);
    }
  }
  return message;
}

function assertJSONRPCMessage(value: unknown): asserts value is WSEnvelope {
  if (!isRecord(value) || value.jsonrpc !== "2.0") {
    throw new Error("Invalid JSON-RPC message");
  }
  const hasMethod = typeof value.method === "string" && value.method.length > 0;
  const hasResult = Object.hasOwn(value, "result");
  const hasError = Object.hasOwn(value, "error");
  if (hasMethod) {
    if (hasResult || hasError || (value.id !== undefined && !isNonEmptyString(value.id))) {
      throw new Error("Invalid JSON-RPC request");
    }
    if (value.params !== undefined && !isRecord(value.params)) {
      throw new Error("Invalid JSON-RPC params");
    }
    assertOnlyFields(value, ["jsonrpc", "id", "method", "params"]);
    return;
  }
  if (!isNonEmptyString(value.id) || hasResult === hasError) {
    throw new Error("Invalid JSON-RPC response");
  }
  if (hasError) {
    const error = value.error;
    if (!isRecord(error) || !Number.isInteger(error.code) || typeof error.message !== "string") {
      throw new Error("Invalid JSON-RPC error");
    }
  }
  assertOnlyFields(value, ["jsonrpc", "id", "result", "error"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertOnlyFields(value: Record<string, unknown>, allowed: string[]): void {
  const allowedFields = new Set(allowed);
  const unexpected = Object.keys(value).find((field) => !allowedFields.has(field));
  if (unexpected) {
    throw new Error(`Unexpected JSON-RPC field: ${unexpected}`);
  }
}
