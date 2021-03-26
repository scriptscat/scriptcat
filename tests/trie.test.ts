
import { UrlMatch } from '@App/pkg/match';

describe("UrlMatch", () => {
    let url = new UrlMatch<string>();
    url.add("*://*.baidu.com/", "ok");
    url.add("*://*.m.baidu.com/test*", "ok2");
    url.add("*://*.test.m.baidu.com/lll*233", "ok3");
    url.add("http://test.baidu.com/*", "ok4");
    url.add("http://example.org/foo/bar.html", "ok5")
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
        expect(url.match("http://test.baidu.com/aaa")).toEqual(["ok4"]);
        expect(url.match("http://test.baidu.com/")).toEqual(["ok", "ok4"]);
        expect(url.match("http://example.org/foo/bar.html")).toEqual(["ok5"]);
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

