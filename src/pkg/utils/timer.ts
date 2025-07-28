const timerMap: { [key: string | number]: NodeJS.Timeout | number | undefined } = {};
export const timeoutExecution = (key: string, fn: () => void, delayMs: number) => {
  if (timerMap[key]) {
    clearTimeout(timerMap[key]);
    timerMap[key] = 0;
  }
  timerMap[key] = setTimeout(fn, delayMs);
};
export const intervalExecution = (
  key: string,
  fn: (firstExecute?: boolean) => void,
  delayMs: number,
  executeNow: boolean = false
) => {
  if (timerMap[key]) {
    clearInterval(timerMap[key]);
    timerMap[key] = 0;
  }
  timerMap[key] = setInterval(fn, delayMs);
  if (executeNow) fn(true);
};
