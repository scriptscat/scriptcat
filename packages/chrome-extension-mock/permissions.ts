export default class Permissions {
  request(permissions: chrome.permissions.Permissions, callback?: (granted: boolean) => void) {
    // Mock implementation - always grant permissions for testing
    if (callback) {
      callback(true);
    }
    return Promise.resolve(true);
  }

  contains(permissions: chrome.permissions.Permissions, callback?: (result: boolean) => void) {
    // Mock implementation - always return true for testing
    if (callback) {
      callback(true);
    }
    return Promise.resolve(true);
  }

  getAll(callback?: (permissions: chrome.permissions.Permissions) => void) {
    const mockPermissions = {
      permissions: ["activeTab" as chrome.runtime.ManifestPermissions, "storage" as chrome.runtime.ManifestPermissions],
      origins: ["<all_urls>"],
    };
    if (callback) {
      callback(mockPermissions);
    }
    return Promise.resolve(mockPermissions);
  }

  remove(permissions: chrome.permissions.Permissions, callback?: (removed: boolean) => void) {
    // Mock implementation - always succeed for testing
    if (callback) {
      callback(true);
    }
    return Promise.resolve(true);
  }
}
