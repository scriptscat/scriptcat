export function joinPath(...paths: string[]): string {
  let path = "";
  for (let value of paths) {
    if (!value) {
      continue;
    }
    if (!value.startsWith("/")) {
      if (path) {
        value = `/${value}`;
      }
    }
    if (value.endsWith("/")) {
      value = value.substring(0, value.length - 1);
    }
    path += value;
  }
  return path;
}
