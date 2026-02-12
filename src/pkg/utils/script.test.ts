import { describe, it, expect } from "vitest";
import { parseMetadata } from "./script";
import { getMetadataStr, getUserConfigStr } from "./utils";
import { parseUserConfig } from "./yaml";

describe.concurrent("parseMetadata", () => {
  it.concurrent("解析标准UserScript元数据", () => {
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

  it.concurrent("解析最少UserScript元数据", () => {
    const code = `
// ==UserScript==
// @name         GM_addElement test
// @match        *://*/*
// @grant        GM_addElement
// ==/UserScript==

console.log('image insertion begin');

await new Promise((resolve, reject) => {
    GM_addElement(document.body, 'img', {
        src: 'https://www.tampermonkey.net/favicon.ico',
        onload: resolve,
        onerror: reject
    });

    console.log('image insertion end');
});

console.log('image loaded'); // never fired
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["GM_addElement test"]);
    expect(result?.match).toEqual(["*://*/*"]);
    expect(result?.grant).toEqual(["GM_addElement"]);
  });

  it.concurrent("解析@match *", () => {
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

  it.concurrent("解析UserSubscribe元数据", () => {
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

  it.concurrent("解析多个相同键的元数据", () => {
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

  it.concurrent("解析包含空值的元数据 (1)", () => {
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
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
  });


  it.concurrent("解析包含空值的元数据(2)", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @version
// @description  
// @author       
// @match        https://example.com/*
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
    expect(result?.version).toEqual([""]);
  });

  it.concurrent("解析元数据(分行1)", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @match        https://example.org/*
// @match        https://test.com/*
// @match        https://demo.com/*
// @version      1.0.0
// @description  
// @author       
// @match        https://example.com/*
// @grant        GM_setValue
// @grant        GM_getValue

// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual([
      "https://example.org/*",
      "https://test.com/*",
      "https://demo.com/*",
      "https://example.com/*",
    ]);
    expect(result?.grant).toEqual(["GM_setValue", "GM_getValue"]);
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("解析元数据(分行2)", () => {
    const code = `
// ==UserScript==
// @name         测试脚本

// @namespace    http://tampermonkey.net/

// @match        https://example.org/*
// @match        https://test.com/*

// @match        https://demo.com/*
// @version      1.0.0
// @description  

// @author       
// @match        https://example.com/*
// @grant        GM_setValue

// @grant        GM_getValue

// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual([
      "https://example.org/*",
      "https://test.com/*",
      "https://demo.com/*",
      "https://example.com/*",
    ]);
    expect(result?.grant).toEqual(["GM_setValue", "GM_getValue"]);
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("解析元数据(分行3)", () => {
    const code = `
// ==UserScript==
// @name         测试脚本


// @namespace    http://tampermonkey.net/

// @match        https://example.org/*
// @match        https://test.com/*


// @match        https://demo.com/*
// @version      1.0.0
// @description  

//

// @author       
// @match        https://example.com/*
// @grant        GM_setValue

// @grant        GM_getValue
//

//
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual([
      "https://example.org/*",
      "https://test.com/*",
      "https://demo.com/*",
      "https://example.com/*",
    ]);
    expect(result?.grant).toEqual(["GM_setValue", "GM_getValue"]);
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("解析元数据(分行4)", () => {
    const code = `
// ==UserScript==
// @name       测试脚本


// @namespace      http://tampermonkey.net/

// @match          https://example.org/*
// @match      https://test.com/*


// @match          https://demo.com/*
// @version     1.0.0
// @description  

//

// @author       
// @match         https://example.com/*
// @grant       GM_setValue

// @grant         GM_getValue
//

//
// ==/UserScript==

console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual([
      "https://example.org/*",
      "https://test.com/*",
      "https://demo.com/*",
      "https://example.com/*",
    ]);
    expect(result?.grant).toEqual(["GM_setValue", "GM_getValue"]);
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("正確解析元数据(空version)", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @match        https://example.org/*
// @match        https://test.com/*
// @match        https://demo.com/*
// @description  
// @early-start  
// @author       
// @match        https://example.com/*
// @grant    
    GM_setValue
// @grant        GM_getValue
// ==/UserScript==
console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual([
      "https://example.org/*",
      "https://test.com/*",
      "https://demo.com/*",
      "https://example.com/*",
    ]);
    expect(result?.["early-start"]).toEqual([""]);
    expect(result?.grant).toEqual(["", "GM_getValue"]);
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("正確解析元数据(換行空白1)", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @match        https://example.org/*
// @match        https://test.com/*
// @match        https://demo.com/*
// @version      1.0.0
// @description  
// @early-start  
// @author       
// @match        https://example.com/*
// @grant    
    GM_setValue
// @grant        GM_getValue
// ==/UserScript==
console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual([
      "https://example.org/*",
      "https://test.com/*",
      "https://demo.com/*",
      "https://example.com/*",
    ]);
    expect(result?.["early-start"]).toEqual([""]);
    expect(result?.grant).toEqual(["", "GM_getValue"]);
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("正確解析元数据(換行空白2)", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @match        https://example.org/*
// @match        https://test.com/*
//
@match        https://demo.com/*
// @version      1.0.0
// @description  
// @early-start
// @author       
// @match        https://example.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual(["https://example.org/*", "https://test.com/*", "https://example.com/*"]);
    expect(result?.["early-start"]).toEqual([""]);
    expect(result?.grant).toEqual(["GM_setValue", "GM_getValue"]);
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("正確解析元数据(換行空白3)", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @match        https://example.org/*
// match        https://test.com/*
// match        https://demo.com/*
// @version      1.0.0
// @description  
//
@early-start       
// @author
// @match        https://example.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual(["https://example.org/*", "https://example.com/*"]);
    expect(result?.["early-start"]).toEqual(undefined);
    expect(result?.grant).toEqual(["GM_setValue", "GM_getValue"]);
    expect(result?.description).toEqual([""]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("忽略非元数据的注釋", () => {
    const code = `
/*
Copyright <YEAR> <COPYRIGHT HOLDER>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
// The above is The MIT License.
// ==UserScript==
// Ignore me please
// @name         测试脚本
//      I am a comment
// @namespace    http://tampermonkey.net/
// @match        https://example.org/*
// match        https://test.com/*
// match        https://demo.com/*
// @version      1.0.0
// -------------------------------------------------
// @description  This is Description
// -------------------------------------------------
// 不要使用 @early-start
// @author
// @match        https://example.com/*
//
// @grant        GM_setValue
// @grant        GM_getValue
// 
// This is just a comment.
// ==/UserScript==
console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual(["https://example.org/*", "https://example.com/*"]);
    expect(result?.["early-start"]).toEqual(undefined);
    expect(result?.grant).toEqual(["GM_setValue", "GM_getValue"]);
    expect(result?.description).toEqual(["This is Description"]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("兼容TM: 可不包含空白開首(1)", () => {
    const code = `
//==UserScript==
//@name         测试脚本
//@namespace    http://tampermonkey.net/
// @match        https://example.org/*
// @match        https://test.com/*
// @match        https://demo.com/*
// @version      1.0.0
// -------------------------------------------------
// @description  This is Description
// -------------------------------------------------
// 不要使用 @early-start
// @author
// @match        https://example.com/*
//
// @grant        GM_setValue
// @grant        GM_getValue
// 
// This is just a comment.
// ==/UserScript==
console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual([
      "https://example.org/*",
      "https://test.com/*",
      "https://demo.com/*",
      "https://example.com/*",
    ]);
    expect(result?.["early-start"]).toEqual(undefined);
    expect(result?.grant).toEqual(["GM_setValue", "GM_getValue"]);
    expect(result?.description).toEqual(["This is Description"]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("兼容TM: 可不包含空白開首(2)", () => {
    const code = `
//  ==UserScript==
// @name         测试脚本
// @namespace    http://tampermonkey.net/
// @match        https://example.org/*
// @match        https://test.com/*
// @match        https://demo.com/*
// @version      1.0.0
// -------------------------------------------------
// @description  This is Description
// -------------------------------------------------
// 不要使用 @early-start
// @author
// @match        https://example.com/*
//
//@grant        GM_setValue
//   @grant        GM_getValue
// 
//This is just a comment.
//==/UserScript==
console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).not.toBeNull();
    expect(result?.name).toEqual(["测试脚本"]);
    expect(result?.namespace).toEqual(["http://tampermonkey.net/"]);
    expect(result?.match).toEqual([
      "https://example.org/*",
      "https://test.com/*",
      "https://demo.com/*",
      "https://example.com/*",
    ]);
    expect(result?.["early-start"]).toEqual(undefined);
    expect(result?.grant).toEqual(["GM_setValue", "GM_getValue"]);
    expect(result?.description).toEqual(["This is Description"]);
    expect(result?.author).toEqual([""]);
  });

  it.concurrent("缺少name字段应返回null", () => {
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

  it.concurrent("元数据字段少于3个应返回null", () => {
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

  it.concurrent("没有UserScript或UserSubscribe标签应返回null", () => {
    const code = `
console.log('Hello World');
`;

    const result = parseMetadata(code);
    expect(result).toBeNull();
  });

  it.concurrent("不完整的UserScript标签应返回null", () => {
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

  it.concurrent("自动添加空namespace", () => {
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

  it.concurrent("解析键名大小写不敏感", () => {
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

  it.concurrent("处理带有额外空格的元数据", () => {
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

describe.concurrent("getMetadataStr", () => {
  it.concurrent("提取UserScript元数据字符串", () => {
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

  it.concurrent("提取UserScript元数据字符串 (分行1)", () => {
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

  it.concurrent("提取UserScript元数据字符串 (分行2)", () => {
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

  it.concurrent("提取UserScript元数据字符串 (分行3)", () => {
    const code = `
// ==UserScript==
// @name         测试脚本


// @version      1.0.0
//
// ==/UserScript==

console.log('Hello World');
`;

    const result = getMetadataStr(code);
    expect(result).toBe(`// ==UserScript==
// @name         测试脚本


// @version      1.0.0
//
// ==/UserScript==`);
  });

  it.concurrent("提取UserScript元数据字符串 (分行4)", () => {
    const code = `
// ==UserScript==
// @name           测试脚本


// @version    1.0.0
//
// ==/UserScript==

console.log('Hello World');
`;

    const result = getMetadataStr(code);
    expect(result).toBe(`// ==UserScript==
// @name           测试脚本


// @version    1.0.0
//
// ==/UserScript==`);
  });

  it.concurrent("没有UserScript标签应返回null", () => {
    const code = `console.log('Hello World');`;
    const result = getMetadataStr(code);
    expect(result).toBeNull();
  });

  it.concurrent("不完整的UserScript标签应返回null", () => {
    const code = `
// ==UserScript==
// @name         测试脚本
// 缺少结束标签
`;
    const result = getMetadataStr(code);
    expect(result).toBeNull();
  });
});

describe.concurrent("getUserConfigStr", () => {
  it.concurrent("提取UserConfig配置字符串", () => {
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

  it.concurrent("没有UserConfig标签应返回null", () => {
    const code = `console.log('Hello World');`;
    const result = getUserConfigStr(code);
    expect(result).toBeNull();
  });

  it.concurrent("不完整的UserConfig标签应返回null", () => {
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

describe.concurrent("parseUserConfig", () => {
  it.concurrent("解析单个YAML配置", () => {
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
      "#options": { sort: ["group1"] },
    });
  });

  it.concurrent("解析多个YAML配置（用---分隔）", () => {
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
      "#options": { sort: ["group1"] },
    });
  });

  it.concurrent("没有UserConfig标签应返回undefined", () => {
    const code = `console.log('Hello World');`;
    const result = parseUserConfig(code);
    expect(result).toBeUndefined();
  });

  it.concurrent("解析空的UserConfig", () => {
    const code = `
/* ==UserConfig==
==/UserConfig== */

console.log('Hello World');
`;

    const result = parseUserConfig(code);
    expect(result).toEqual({ "#options": { sort: [] } });
  });

  it.concurrent("解析格式错误的YAML应该抛出错误", () => {
    const code = `
/* ==UserConfig==
name: 配置
  invalid yaml: [
==/UserConfig== */

console.log('Hello World');
`;

    expect(() => parseUserConfig(code)).toThrow();
  });

  it.concurrent("不符合分组规范的YAML配置应该抛出错误", () => {
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
