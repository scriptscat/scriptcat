import type { ApiParam, ApiValue } from "../types";

const apis: Map<string, ApiValue[]> = new Map();

type AudioListener = (...args: any[]) => unknown;
type AudioRegistrationCancel = () => void;

const audioRegistrationCancels = new WeakMap<object, Map<AudioListener, Set<AudioRegistrationCancel>>>();

function registerAudioCancellation(context: object, listener: AudioListener, cancel: AudioRegistrationCancel): void {
  let registrations = audioRegistrationCancels.get(context);
  if (!registrations) {
    registrations = new Map();
    audioRegistrationCancels.set(context, registrations);
  }
  let cancellations = registrations.get(listener);
  if (!cancellations) {
    cancellations = new Set();
    registrations.set(listener, cancellations);
  }
  cancellations.add(cancel);
}

function unregisterAudioCancellation(context: object, listener: AudioListener, cancel: AudioRegistrationCancel): void {
  const registrations = audioRegistrationCancels.get(context);
  const cancellations = registrations?.get(listener);
  cancellations?.delete(cancel);
  if (!cancellations?.size) registrations?.delete(listener);
  if (!registrations?.size) audioRegistrationCancels.delete(context);
}

function cancelAudioRegistrations(context: object, listener: unknown): void {
  if (typeof listener !== "function") return;
  const registrations = audioRegistrationCancels.get(context);
  const cancellations = registrations?.get(listener as AudioListener);
  if (!cancellations) return;
  registrations!.delete(listener as AudioListener);
  if (!registrations!.size) audioRegistrationCancels.delete(context);
  for (const cancel of cancellations) cancel();
}

function safeInvoke(callback: unknown, ...args: unknown[]): void {
  if (typeof callback !== "function") return;
  try {
    callback(...args);
  } catch (error) {
    console.error(error);
  }
}

function wrapAudioRegistrationApi(propertyName: string, api: (...args: any[]) => any): (...args: any[]) => any {
  if (propertyName === "GM.audio.addStateChangeListener") {
    return function (this: object, listener: unknown, ...args: unknown[]) {
      let registration: Promise<unknown>;
      try {
        registration = Promise.resolve(api.call(this, listener, ...args));
      } catch (error) {
        return Promise.reject(error);
      }
      if (typeof listener !== "function") return registration;

      let cancel!: AudioRegistrationCancel;
      const cancelled = new Promise<void>((resolve) => {
        cancel = resolve;
      });
      registerAudioCancellation(this, listener as AudioListener, cancel);
      return Promise.race([registration, cancelled]).finally(() => {
        unregisterAudioCancellation(this, listener as AudioListener, cancel);
      });
    };
  }

  if (propertyName === "GM_audio.addStateChangeListener") {
    return function (this: object, listener: unknown, callback?: (...args: any[]) => void) {
      if (typeof listener !== "function") return api.call(this, listener, callback);

      let settled = false;
      const cancel: AudioRegistrationCancel = () => {
        void Promise.resolve().then(() => finish(undefined));
      };
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        unregisterAudioCancellation(this, listener as AudioListener, cancel);
        safeInvoke(callback, error);
      };
      registerAudioCancellation(this, listener as AudioListener, cancel);
      try {
        return api.call(this, listener, finish);
      } catch (error) {
        unregisterAudioCancellation(this, listener as AudioListener, cancel);
        throw error;
      }
    };
  }

  if (propertyName === "GM.audio.removeStateChangeListener" || propertyName === "GM_audio.removeStateChangeListener") {
    return function (this: object, listener: unknown, ...args: unknown[]) {
      cancelAudioRegistrations(this, listener);
      return api.call(this, listener, ...args);
    };
  }

  return api;
}

export function GMContextApiGet(name: string): ApiValue[] | undefined {
  // 回传 Api 列表
  return apis.get(name);
}

function GMContextApiSet(grant: string, fnKey: string, api: any, param: ApiParam): void {
  // 一个 @grant 可以扩充多个 API 函数
  let m: ApiValue[] | undefined = apis.get(grant);
  if (!m) apis.set(grant, (m = []));
  m.push({ fnKey, api, param });
}

export const protect: { [key: string]: any } = {};

export default class GMContext {
  public static protected(value: any = undefined) {
    return (target: any, propertyName: string) => {
      // keyword是与createContext时同步的,避免访问到context的内部变量
      // 暂时只用於禁止存取（value = undefined)。日后有需要可扩展成假值
      protect[propertyName] = value;
    };
  }

  public static API(param: ApiParam = {}) {
    return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
      const key = propertyName;
      const api = wrapAudioRegistrationApi(key, descriptor.value);
      descriptor.value = api;
      let { follow } = param;
      const { alias } = param;
      if (!follow) {
        follow = key; // follow 是实际 @grant 的权限；使用follow时，不要使用alias以避免混乱
      }
      GMContextApiSet(follow, key, api, param);
      if (alias) {
        // 追加别名呼叫（参数和回传完全一致，为 GM_xxx 与 GM.xxx 等问题设计）
        GMContextApiSet(alias, alias, api, param);
      }
    };
  }
}
