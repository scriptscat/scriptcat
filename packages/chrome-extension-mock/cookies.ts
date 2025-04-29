export default class Cookies {
  getAllCookieStores(
    callback: (cookieStores: chrome.cookies.CookieStore[]) => void
  ) {
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

  getAll(
    details: chrome.cookies.GetAllDetails,
    callback: (cookies: chrome.cookies.Cookie[]) => void
  ): void {
    this.mockGetAll?.(details, callback);
  }

  set(details: chrome.cookies.SetDetails, callback?: () => void): void {
    callback?.();
  }

  remove(details: chrome.cookies.Details, callback?: () => void): void {
    callback?.();
  }
}
