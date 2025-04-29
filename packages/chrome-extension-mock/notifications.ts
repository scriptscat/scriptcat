export default class Notifications {
  notification: Map<string, boolean> = new Map();

  onClosedHandler?: (id: string, byUser: boolean) => void;

  onClosed = {
    addListener: (
      callback: (notificationId: string, byUser: boolean) => void
    ) => {
      this.onClosedHandler = callback;
    },
  };

  onButtonClickedHandler?: (id: string, index: number) => void;

  onButtonClicked = {
    addListener: (
      callback: (notificationId: string, buttonIndex: number) => void
    ) => {
      this.onButtonClickedHandler = callback;
    },
  };

  mockClickButton(id: string, index: number) {
    this.onButtonClickedHandler?.(id, index);
  }

  onClickedHandler?: (id: string) => void;

  onClicked = {
    addListener: (callback: (notificationId: string) => void) => {
      this.onClickedHandler = callback;
    },
  };

  create(
    options: chrome.notifications.NotificationOptions,
    callback?: (id: string) => void
  ) {
    const id = Math.random().toString();
    this.notification.set(id, true);
    if (callback) {
      callback(id);
    }
  }

  clear(id: string) {
    if (!this.notification.has(id)) {
      throw new Error("notification not found");
    }
    this.notification.delete(id);
  }

  update(id: string) {
    if (!this.notification.has(id)) {
      throw new Error("notification not found");
    }
    return true;
  }

  mockClick(id: string) {
    this.onClickedHandler?.(id);
  }
}
