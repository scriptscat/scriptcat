import EventEmitter from "eventemitter3";

class PermissionsEvent {
  private EE = new EventEmitter<string, any>();

  addListener(callback: (permissions: chrome.permissions.Permissions) => void) {
    this.EE.addListener("permission", callback);
  }

  removeListener(callback: (permissions: chrome.permissions.Permissions) => void) {
    this.EE.removeListener("permission", callback);
  }

  hasListener(callback: (permissions: chrome.permissions.Permissions) => void) {
    return this.EE.listeners("permission").includes(callback);
  }

  emit(permissions: chrome.permissions.Permissions) {
    this.EE.emit("permission", permissions);
  }

  reset() {
    this.EE.removeAllListeners();
  }
}

export default class Permissions {
  onAdded = new PermissionsEvent();
  onRemoved = new PermissionsEvent();

  private grantedPermissions: Set<string> | null = null;
  private grantedOrigins: Set<string> | null = null;

  __setGrantedPermissions(permissions: string[], origins: string[] = []) {
    this.grantedPermissions = new Set(permissions);
    this.grantedOrigins = new Set(origins);
  }

  reset() {
    this.grantedPermissions = null;
    this.grantedOrigins = null;
    this.onAdded.reset();
    this.onRemoved.reset();
  }

  request(permissions: chrome.permissions.Permissions, callback?: (granted: boolean) => void) {
    if (this.grantedPermissions) {
      for (const permission of permissions.permissions || []) {
        this.grantedPermissions.add(permission);
      }
    }
    if (this.grantedOrigins) {
      for (const origin of permissions.origins || []) {
        this.grantedOrigins.add(origin);
      }
    }
    this.onAdded.emit(permissions);
    if (callback) {
      callback(true);
    }
    return Promise.resolve(true);
  }

  contains(permissions: chrome.permissions.Permissions, callback?: (result: boolean) => void) {
    const result =
      this.grantedPermissions === null && this.grantedOrigins === null
        ? true
        : (permissions.permissions || []).every((permission) => this.grantedPermissions?.has(permission)) &&
          (permissions.origins || []).every((origin) => this.grantedOrigins?.has(origin));
    if (callback) {
      callback(result);
    }
    return Promise.resolve(result);
  }

  getAll(callback?: (permissions: chrome.permissions.Permissions) => void) {
    const mockPermissions = {
      permissions: (this.grantedPermissions
        ? [...this.grantedPermissions]
        : ["activeTab", "storage"]) as chrome.runtime.ManifestPermissions[],
      origins: this.grantedOrigins ? [...this.grantedOrigins] : ["<all_urls>"],
    };
    if (callback) {
      callback(mockPermissions);
    }
    return Promise.resolve(mockPermissions);
  }

  remove(permissions: chrome.permissions.Permissions, callback?: (removed: boolean) => void) {
    if (this.grantedPermissions) {
      for (const permission of permissions.permissions || []) {
        this.grantedPermissions.delete(permission);
      }
    }
    if (this.grantedOrigins) {
      for (const origin of permissions.origins || []) {
        this.grantedOrigins.delete(origin);
      }
    }
    this.onRemoved.emit(permissions);
    if (callback) {
      callback(true);
    }
    return Promise.resolve(true);
  }
}
