/** 权限取值里一个地址的展示切片:截断时省略 middle,域名与文件名加参数(通常就是版本号)保留 */
export interface UrlDisplayParts {
  /** @resource 的资源名与其后的空白 */
  prefix: string;
  scheme: string;
  host: string;
  middle: string;
  tail: string;
}

// 协议允许通配(*://),域名允许通配(*.a.com);@resource 取值形如「资源名 地址」
const URL_PATTERN = /^((?:\S+\s+)?)([a-z*][a-z0-9+.*-]*:\/\/)([^/?#\s]*)(.*)$/i;
// 控制字符与格式字符(含双向覆盖 U+202E):解码出这些就可能把文件名伪装成别的样子
const INVISIBLE = /[\p{Cc}\p{Cf}]/u;

/**
 * 百分号编码对人不可读,解码后再展示。只用 decodeURI:它不解码 %2F、%3F 这类保留字符,
 * 不会凭空造出路径分隔或查询参数。
 */
function decodeForDisplay(path: string): string {
  let decoded: string;
  try {
    decoded = decodeURI(path);
  } catch {
    // 不完整的 % 序列是脚本作者写的原文,照原样展示即可
    return path;
  }
  return INVISIBLE.test(decoded) ? path : decoded;
}

export function splitUrlForDisplay(value: string): UrlDisplayParts | null {
  const m = URL_PATTERN.exec(value);
  if (!m) return null;
  const [, prefix, scheme, host, rawPath] = m;
  const path = decodeForDisplay(rawPath);
  const queryStart = path.search(/[?#]/);
  const lastSlash = (queryStart === -1 ? path : path.slice(0, queryStart)).lastIndexOf("/");
  if (lastSlash <= 0) return { prefix, scheme, host, middle: "", tail: path };
  return { prefix, scheme, host, middle: path.slice(0, lastSlash), tail: path.slice(lastSlash) };
}
