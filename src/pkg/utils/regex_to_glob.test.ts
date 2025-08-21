import { describe, it, expect } from "vitest";
import { regexToGlob } from "./regex_to_glob";

describe("regexToGlob examples", () => {
  const cases: Array<[string, string | null]> = [
    ["(a|b|c)", "?"], // union of single chars
    ["a(b|c)d", "a?d"],
    ["a.b.c", "a?b?c"],

    ["\\!", "!"],
    ["\\$", "$"],
    ["\\+", "+"],
    ["\\.", "."],
    ["\\/", "/"],
    ["\\-", "-"],
    ["\\?", "?"], // special case
    ["\\*", "?"], // special case
    ["[abc]", "?"],
    ["[^abc]", "?"],
    ["[-!$+.?*]", "?"],
    ["[^-!$+.?*]", "?"],

    ["^(http|https):\\/\\/www\\.google\\.com", "http*://www.google.com"],
    ["^(http|https?):\\/\\/www\\.google\\.com", "http*://www.google.com"],

    ["\\w*", "*"],
    ["\\w+", "?*"],
    ["file\\.(js|ts)", "file.?s"],
    ["file\\.(js|tsx)", "file.??*"],
    ["file\\.(js|tsx|\\w+)", "file.?*"],
    ["\\d{3}-\\d{2}-\\d{4}", "???-??-????"],
    ["[^abc]", "?"], // character class approx -> ?
    ["user_\\d{2,}", "user_??*"],
    [".*", "*"],
    ["\\w?", "*"], // optional single char -> '*'
    ["(abc|def)", "???"], // union of 3-char literals -> '???'
    ["(ab|abc)", "ab*"], // min length 2 -> 'ab*'
    ["\\S", "?"], // non-space single
    ["\\S+", "?*"],
    ["\\S+?", "?*"], // lazy+? still -> '?*'
    ["\\S*?", "*"], // lazy*? still -> '*'
    ["\\S?", "*"], // optional single -> '*'
    ["\\S??", "*"], // optional lazy -> '*'

    // ignore ^ and $
    ["^test$", "test"],

    // longer, with escape chars
    ["https?://www.google.com/search\\?q=\\w+&page=\\d+", "http*://www?google?com/search?q=?*&page=?*"],
    ["https?://www.google.com/search?q=\\w+&page=\\d+", "http*://www?google?com/searc*q=?*&page=?*"],
    [
      "https?://www.go\\$og\\@l\\!e\\.co\\#m/sea\\*r\\(c\\)h?q=\\w+&page=\\d+",
      "http*://www?go$og@l!e.co#m/sea?r(c)*q=?*&page=?*",
    ],

    // invalid regex -> null
    ["[abc", null],
    ["(ab", null],
    ["test\\", null],

    // counted repetitions with alternations
    ["te(st){5,}", "teststststst*"],
    ["te(st){5,8}", "teststststst*"],
    ["te(st|ac){5,}", "te??????????*"],
    ["te(st|ac){5,8}", "te??????????*"],
    ["te(st|ac|acx){5,}", "te??????????*"],
    ["te(st|ac|acx){5,8}", "te??????????*"],

    // character classes with ranges
    ["p[^abc]{0,2}q", "p*q"],
    ["p[^abc]{8,}q", "p????????*q"],
    ["p(uuid-\\d+|id-\\d+){0,2}q", "p*q"],
    ["p(uuid-\\d+|id-\\d+)q", "p????*q"], // min len 4 then variable
    ["p(uuid-\\d+|id-\\d+){8,}q", "p????????????????????????????????*q"], // 32 ? then *

    // backward
    [".*(?<!exam)ple.*", "*ple*"],

    // complex structures -> approximate
    ["p(abc-\\w+-x|(uuid-\\d+|id-\\d+)-y){8,}q", "p*q"], // alternative: 48 ? then *

    // simple structures -> exact
    ["\\b(?:public|private|protected)\\s+(?!void|string|int|bool)(\\w+)\\s+", "p????????*"],

    // URLs
    ["https?://live\\.bilibili\\.com/", "http*://live.bilibili.com/"],
    ["https?:\\/\\/live\\.bilibili\\.com\\/", "http*://live.bilibili.com/"],

    // others
    ["https?://live.bilibili.com/", "http*://live?bilibili?com/"],
    ["https?:\\/\\/live\\.bilibili\\.com\\/(blanc\\/)?\\d+([/?]|$)", "http*://live.bilibili.com/?*"],
  ];

  cases.forEach(([input, expected]) => {
    it(`regexToGlob("${input}") → ${expected}`, () => {
      const result = regexToGlob(input);
      if (expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toBe(expected);
      }
    });
  });
});
