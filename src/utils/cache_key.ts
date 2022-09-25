// 缓存key,所有缓存相关的key都需要定义在此

// 脚本缓存
export function keyScript(id: number): string {
  return `script:${id.toString()}`;
}

// 加载脚本信息时的缓存,已处理删除
export function keyScriptInfo(uuid: string): string {
  return `script:info:${uuid}`;
}

// 脚本资源url缓存,可能存在泄漏
export function keyResourceByUrl(url: string): string {
  return `resource:${url}`;
}

// 脚本value缓存,可能存在泄漏
export function keyScriptValue(id: number, storagename?: string[]): string {
  if (storagename) {
    return `value:storagename:${storagename[0]}`;
  }
  return `value:id:${id.toString()}`;
}
