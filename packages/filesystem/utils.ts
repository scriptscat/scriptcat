export function joinPath(...paths: string[]): string {
  let result = "";

  for (const path of paths) {
    if (!path) {
      continue;
    }

    let start = 0;

    for (let i = 0; i <= path.length; i++) {
      if (i !== path.length && path[i] !== "/") {
        continue;
      }

      if (i > start) {
        result += `/${path.slice(start, i)}`;
      }

      start = i + 1;
    }
  }

  return result;
}
