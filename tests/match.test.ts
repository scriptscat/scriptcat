
import { UrlMatch } from '@App/pkg/match';

describe("UrlMatch", () => {
    let url = new UrlMatch<string>();
    url.add("*://*.baidu.com/", "ok");
    url.add("*://*.m.baidu.com/test*", "ok2");
    url.add("*://*.test.m.baidu.com/lll*233", "ok3");
    url.add("http://test.baidu.com/*", "ok4");
    url.add("http://example.org/foo/bar.html", "ok5")
    url.add("https://bbs.tampermonkey.net.cn/*", "ok6")
    url.add("https://bbs.tampermonkey.net.cn/test/*", "ok66")
    url.add("*://*/test/param?*", "ok7")
    url.add("i.tampermonkey.net.cn/*", "ok8")
    url.add("*i.tampermonkey.net.cn/*", "ok9")
    it("match", () => {
        expect(url.match("https://www.baidu.com")).toEqual(["ok"]);
        expect(url.match("https://m.baidu.com")).toEqual(["ok"]);
        expect(url.match("https://www.m.baidu.com")).toEqual(["ok"]);
        expect(url.match("https://www.m.baidu.com/undefined")).toEqual([]);
        expect(url.match("http://test.m.baidu.com/test")).toEqual(["ok2"]);
        expect(url.match("http://test.m.baidu.com/test/233")).toEqual(["ok2"]);
        expect(url.match("http://test.m.baidu.com/test233")).toEqual(["ok2"]);
        expect(url.match("http://a.test.m.baidu.com/lll")).toEqual([]);
        expect(url.match("http://a.test.m.baidu.com/lll/a/233")).toEqual(["ok3"]);
        expect(url.match("http://a.test.m.baidu.com/lll/233")).toEqual(["ok3"]);
        expect(url.match("http://a.test.m.baidu.com/lll233")).toEqual(["ok3"]);
        expect(url.match("http://a.test.m.baidu.com/lll233end")).toEqual([]);
        expect(url.match("http://test.baidu.com/aaa")).toEqual(["ok4"]);
        expect(url.match("http://test.baidu.com/")).toEqual(["ok", "ok4"]);
        expect(url.match("http://example.org/foo/bar.html")).toEqual(["ok5"]);
        expect(url.match("https://bbs.tampermonkey.net.cn/test/thread-63-1-1.html")).toEqual(["ok6", "ok66"]);
        expect(url.match("https://bbs.tampermonkey.net.cn/forum-68-1.html")).toEqual(["ok6"]);
        expect(url.match("https://bbs.tampermonkey.net.cn/")).toEqual(["ok6"]);
        expect(url.match("https://bbs.tampermonkey.net.cn/test/param?a=1&b=2")).
            toEqual(["ok6", "ok66", "ok7"]);
        expect(url.match("https://www.baidu.com/test/param")).
            toEqual(["ok7"]);
        expect(url.match("https://i.tampermonkey.net.cn/aa")).
            toEqual(["ok8", "ok9"]);
        expect(url.match("https://wwi.tampermonkey.net.cn/aa")).
            toEqual(["ok9"]);
    });
    it("delete", () => {
        url.del("http://example.org/foo/bar.html", "ok5");
        expect(url.match("http://example.org/foo/bar.html")).toEqual([]);
        url.add("http://example.org/foo/bar.html", "ok4");
        expect(url.match("http://example.org/foo/bar.html")).toEqual(["ok4"]);
        url.del("http://example.org/foo/bar.html", "ok5");
        expect(url.match("http://example.org/foo/bar.html")).toEqual(["ok4"]);
        url.del("http://example.org/foo/bar.html", "ok4");
        expect(url.match("http://example.org/foo/bar.html")).toEqual([]);
        expect(url.match("http://test.baidu.com/")).toEqual(["ok", "ok4"]);
    })

});

