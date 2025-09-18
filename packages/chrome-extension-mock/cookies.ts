export default class Cookies {
  getAllCookieStores(callback: (cookieStores: chrome.cookies.CookieStore[]) => void) {
    callback([
      {
        id: "0",
        tabIds: [1],
      },
    ]);
  }

  mockGetAll?: (
    details: chrome.cookies.GetAllDetails,
    callback: (cookies: chrome.cookies.Cookie[]) => void
  ) => void | undefined;

  async getAll(
    details: chrome.cookies.GetAllDetails,
    callback: (cookies: chrome.cookies.Cookie[]) => void
  ): Promise<chrome.cookies.Cookie[]> {
    this.mockGetAll?.(details, callback);
    return [];
  }

  set(details: chrome.cookies.SetDetails, callback?: () => void): void {
    callback?.();
  }

  remove(details: chrome.cookies.CookieDetails, callback?: () => void): void {
    callback?.();
  }
}
