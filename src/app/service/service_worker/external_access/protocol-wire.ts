import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { RPC_METHODS } from "./generated/protocol.generated";
import { RPC_SCHEMAS } from "./generated/schema.generated";
import type { WSEnvelope } from "./types";

interface BusinessParams {
  input: unknown;
}

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const methodValidators = new Map<string, ValidateFunction>(
  Object.entries(RPC_METHODS).map(([method, metadata]) => {
    const schema = RPC_SCHEMAS[metadata.params as keyof typeof RPC_SCHEMAS];
    return [method, ajv.compile(schema)];
  })
);

export function decodeWireEnvelope(frame: string): WSEnvelope {
  const value: unknown = JSON.parse(frame);
  assertJSONRPCMessage(value);
  const message = value as WSEnvelope;
  if (message.method && methodValidators.has(message.method)) {
    const params = message.params as BusinessParams;
    const validateParams = methodValidators.get(message.method);
    if (!validateParams) {
      throw new Error(`Unknown RPC method: ${message.method}`);
    }
    if (!validateParams(params.input)) {
      throw new Error(`Invalid params for ${message.method}: ${ajv.errorsText(validateParams.errors)}`);
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
