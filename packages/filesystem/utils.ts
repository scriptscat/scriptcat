/* eslint-disable import/prefer-default-export */

export function joinPath(...paths: string[]): string {
  let path = "";
  paths.forEach((value) => {
    if (!value) {
      return;
    }
    if (!value.startsWith("/")) {
      value = `/${value}`;
    }
    if (value.endsWith("/")) {
      value = value.substring(0, value.length - 1);
    }
    path += value;
  });
  return path;
}
