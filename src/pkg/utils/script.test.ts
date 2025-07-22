import { describe, test, expect } from "vitest";
import { parseMetadata } from "./script";
import { getMetadataStr, getUserConfigStr } from "./utils";
import { parseUserConfig } from "./yaml";

describe("parseMetadata", () => {
  test("解析标准UserScript元数据", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  这是一个测试脚本
// @author       测试作者
// @match        https://example.com/*
// @grant        none
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.version).toEqual(["1.0.0"]);
    expect(result?.description).toEqual(["这是一个测试脚本"]);
    expect(result?.author).toEqual(["测试作者"]);
    expect(result?.match).toEqual(["https://example.com/*"]);
    expect(result?.grant).toEqual(["none"]);
  });

  test("解析@match *", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  这是一个测试脚本
// @author       测试作者
// @match        *://*/*
// @include      *
// @grant        none
// ==/UserScript==
`;
    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.match).toEqual(["*://*/*"]);
  });

  test("解析UserSubscribe元数据", () => {
    const code = `
// ==UserSubscribe==
// @name         测试订阅
// @author       订阅作者
// @version      1.0.0
// @description  这是一个测试订阅
// ==/UserSubscribe==

// 订阅内容
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试订阅"]);
    expect(result?.author).toEqual(["订阅作者"]);
    expect(result?.version).toEqual(["1.0.0"]);
    expect(result?.description).toEqual(["这是一个测试订阅"]);
    expect(result?.usersubscribe).toEqual([]);
  });

  test("解析多个相同键的元数据", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @match        https://example.com/*
// @match        https://test.com/*
// @match        https://demo.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.match).toEqual(["https://example.com/*", "https://test.com/*", "https://demo.com/*"]);
    expect(result?.grant).toEqual(["GM_setValue", "GM_getValue"]);
  });

  test("解析包含空值的元数据", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  
// @author       
// @match        https://example.com/*
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
  });

  test("缺少name字段应返回null", () => {
    const code = `
// ==UserScript==
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  这是一个测试脚本
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).toBeNull();
  });

  test("元数据字段少于3个应返回null", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @version      1.0.0
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).toBeNull();
  });

  test("没有UserScript或UserSubscribe标签应返回null", () => {
    const code = `
console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).toBeNull();
  });

  test("不完整的UserScript标签应返回null", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// 缺少结束标签

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).toBeNull();
  });

  test("自动添加空namespace", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @version      1.0.0
// @description  这是一个测试脚本
// @author       测试作者
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.namespace).toEqual([""]);
  });

  test("解析键名大小写不敏感", () => {
    const code = `
// ==UserScript==
// @Name         测试脚本
// @NAMESPACE    http://tampermonkey.net/
// @Version      1.0.0
// @Description  这是一个测试脚本
// @Author       测试作者
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.version).toEqual(["1.0.0"]);
    expect(result?.description).toEqual(["这是一个测试脚本"]);
    expect(result?.author).toEqual(["测试作者"]);
  });

  test("处理带有额外空格的元数据", () => {
    const code = `
// ==UserScript==
//   @name           测试脚本   
//   @namespace      http://tampermonkey.net/   
//   @version        1.0.0   
//   @description    这是一个测试脚本   
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.version).toEqual(["1.0.0"]);
    expect(result?.description).toEqual(["这是一个测试脚本"]);
  });
});

describe("getMetadataStr", () => {
  test("提取UserScript元数据字符串", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @version      1.0.0
// ==/UserScript==

console.log('Hello World');
`;

    const result = getMetadataStr(code);
    expect(result).toBe(`// ==UserScript==
// @name         测试脚本
// @version      1.0.0
// ==/UserScript==`);
  });

  test("没有UserScript标签应返回null", () => {
    const code = `console.log('Hello World');`;
    const result = getMetadataStr(code);
    expect(result).toBeNull();
  });

  test("不完整的UserScript标签应返回null", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// 缺少结束标签
`;
    const result = getMetadataStr(code);
    expect(result).toBeNull();
  });
});

describe("getUserConfigStr", () => {
  test("提取UserConfig配置字符串", () => {
    const code = `
/* ==UserConfig==
config:
  name: 配置名称
  value: 123
==/UserConfig== */

console.log('Hello World');
`;

    const result = getUserConfigStr(code);
    expect(result).toBe(`/* ==UserConfig==
config:
  name: 配置名称
  value: 123
==/UserConfig== */`);
  });

  test("没有UserConfig标签应返回null", () => {
    const code = `console.log('Hello World');`;
    const result = getUserConfigStr(code);
    expect(result).toBeNull();
  });

  test("不完整的UserConfig标签应返回null", () => {
    const code = `
/* ==UserConfig==
config:
  name: 配置名称
缺少结束标签 */
`;
    const result = getUserConfigStr(code);
    expect(result).toBeNull();
  });
});

describe("parseUserConfig", () => {
  test("解析单个YAML配置", () => {
    const code = `
/* ==UserConfig==
group1:
  config1:
    title: 测试配置
    default: 123
    enabled: true
==/UserConfig== */

console.log('Hello World');
`;

    const result = parseUserConfig(code);
    expect(result).toEqual({
      group1: {
        config1: {
          title: "测试配置",
          default: 123,
          enabled: true,
          index: 0,
        },
      },
    });
  });

  test("解析多个YAML配置（用---分隔）", () => {
    const code = `
/* ==UserConfig==
group1:
  config1:
    title: 配置1
    default: 123
---
group1:
  config2:
    title: 配置2
    default: 456
    enabled: true
==/UserConfig== */

console.log('Hello World');
`;

    const result = parseUserConfig(code);
    expect(result).toEqual({
      group1: {
        config2: {
          // 后面的配置会覆盖前面的同名分组
          title: "配置2",
          default: 456,
          enabled: true,
          index: 0,
        },
      },
    });
  });

  test("没有UserConfig标签应返回undefined", () => {
    const code = `console.log('Hello World');`;
    const result = parseUserConfig(code);
    expect(result).toBeUndefined();
  });

  test("解析空的UserConfig", () => {
    const code = `
/* ==UserConfig==
==/UserConfig== */

console.log('Hello World');
`;

    const result = parseUserConfig(code);
    expect(result).toEqual({});
  });

  test("解析格式错误的YAML应该抛出错误", () => {
    const code = `
/* ==UserConfig==
name: 配置
  invalid yaml: [
==/UserConfig== */

console.log('Hello World');
`;

    expect(() => parseUserConfig(code)).toThrow();
  });

  test("不符合分组规范的YAML配置应该抛出错误", () => {
    const code = `
/* ==UserConfig==
name: 测试配置
value: 123
enabled: true
==/UserConfig== */

console.log('Hello World');
`;

    expect(() => parseUserConfig(code)).toThrow('UserConfig group "name" is not a valid object.');
  });
});
