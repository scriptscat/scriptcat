import { UrlInclude, UrlMatch } from "./match";

// https://developer.chrome.com/docs/extensions/mv3/match_patterns/
describe("UrlMatch-google", () => {
  const url = new UrlMatch<string>();
  url.add("https://*/*", "ok1");
  url.add("https://*/foo*", "ok2");
  url.add("https://*.google.com/foo*bar", "ok3");
  url.add("https://example.org/foo/bar.html", "ok4");
  url.add("http://127.0.0.1/*", "ok5");
  url.add("*://mail.google.com/*", "ok6");
  it("match1", () => {
    expect(url.match("https://www.google.com/")).toEqual(["ok1"]);
    expect(url.match("https://example.org/foo/bar.html")).toEqual([
      "ok1",
      "ok2",
      "ok4",
    ]);
  });
  it("match2", () => {
    expect(url.match("https://example.com/foo/bar.html")).toEqual([
      "ok1",
      "ok2",
    ]);
    expect(url.match("https://www.google.com/foo")).toEqual(["ok1", "ok2"]);
    expect(url.match("https://www.google.com/foo2")).toEqual(["ok1", "ok2"]);
  });
  it("match3", () => {
    expect(url.match("https://www.google.com/foo/baz/bar")).toEqual([
      "ok1",
      "ok2",
      "ok3",
    ]);
    expect(url.match("https://docs.google.com/foobar")).toEqual([
      "ok1",
      "ok2",
      "ok3",
    ]);
  });
  it("match4", () => {
    expect(url.match("https://example.org/foo/bar.html")).toEqual([
      "ok1",
      "ok2",
      "ok4",
    ]);
  });
  it("match5", () => {
    expect(url.match("http://127.0.0.1/")).toEqual(["ok5"]);
    expect(url.match("http://127.0.0.1/foo/bar.html")).toEqual(["ok5"]);
  });
  it("match6", () => {
    expect(url.match("http://mail.google.com/foo/baz/bar")).toEqual(["ok6"]);
    expect(url.match("https://mail.google.com/foobar")).toEqual([
      "ok1",
      "ok2",
      "ok3",
      "ok6",
    ]);
  });
});

describe("UrlMatch-google-error", () => {
  const url = new UrlMatch<string>();
  it("error-1", () => {
    expect(() => {
      url.add("https://*foo/bar", "ok1");
    }).toThrow(Error);
  });
  it("error-2", () => {
    expect(() => {
      url.add("https://foo.*.bar/baz", "ok1");
    }).toThrow(Error);
  });
  it("error-3", () => {
    expect(() => {
      url.add("http:/bar", "ok1");
    }).toThrow(Error);
  });
});

// 从tm找的一些特殊的匹配规则
describe("UrlMatch-search", () => {
  const url = new UrlMatch<string>();
  url.add("https://www.google.com/search?q=*", "ok1");
  it("match1", () => {
    expect(url.match("https://www.google.com/search?q=foo")).toEqual(["ok1"]);
    expect(url.match("https://www.google.com/search?q1=foo")).toEqual([]);
  });

  url.add("https://bbs.tampermonkey.net.cn", "ok2");
  it("match2", () => {
    expect(url.match("https://bbs.tampermonkey.net.cn")).toEqual(["ok2"]);
    expect(url.match("https://bbs.tampermonkey.net.cn/")).toEqual(["ok2"]);
    expect(url.match("https://bbs.tampermonkey.net.cn/foo/bar.html")).toEqual(
      []
    );
  });
});

describe("UrlMatch-port1", () => {
  const url = new UrlMatch<string>();
  url.add("http://test.list.ggnb.top/search", "ok1");
  it("match1", () => {
    expect(url.match("http://test.list.ggnb.top/search")).toEqual(["ok1"]);
    expect(url.match("http://test.list.ggnb.top/search?")).toEqual([]);
    expect(url.match("http://test.list.ggnb.top/search?foo=bar")).toEqual([]);
  });

  it("port", () => {
    expect(url.match("http://test.list.ggnb.top:80/search")).toEqual(["ok1"]);
  });
});

describe("UrlMatch-port2", () => {
  const url = new UrlMatch<string>();
  url.add("http://test.list.ggnb.top:80/search", "ok1");
  url.add("http://test.list.ggnb.top*/search", "ok2");
  url.add("http://test.list.ggnb.top:*/search", "ok3");
  url.add("http://localhost:3000/", "ok4");
  it("match1", () => {
    expect(url.match("http://test.list.ggnb.top:80/search")).toEqual([
      "ok1",
      "ok2",
      "ok3",
    ]);
    expect(url.match("http://test.list.ggnb.top:81/search")).toEqual([
      "ok2",
      "ok3",
    ]);
    expect(url.match("http://test.list.ggnb.top/search")).toEqual([
      "ok1",
      "ok2",
      "ok3",
    ]);
  });
  it("case2", () => {
    expect(url.match("http://localhost:3000/")).toEqual(["ok4"]);
    expect(url.match("http://localhost:8000/")).toEqual([]);
  });
});

describe("特殊情况", () => {
  it("**", () => {
    const url = new UrlMatch<string>();
    url.add("*://**/*", "ok1");
    expect(url.match("http://www.example.com/")).toEqual(["ok1"]);
  });

  it("prefix *", () => {
    const url = new UrlMatch<string>();
    url.add("*https://www.baidu.com*", "ok1");
    expect(url.match("https://www.baidu.com")).toEqual(["ok1"]);
  });
  it("http*", () => {
    const url = new UrlMatch<string>();
    url.add("http*://example.com/*", "ok1");
    expect(url.match("https://example.com/")).toEqual(["ok1"]);
    expect(url.match("http://example.com/")).toEqual(["ok1"]);
  });
});

// --- include
describe("UrlInclude-1", () => {
  const url = new UrlInclude<string>();
  url.add("*://*.baidu.com/", "ok");
  url.add("*://*.m.baidu.com/test*", "ok2");
  url.add("*://*.test.m.baidu.com/lll*233", "ok3");
  url.add("http://test.baidu.com/*", "ok4");
  url.add("http://example.org/foo/bar.html", "ok5");
  url.add("https://bbs.tampermonkey.net.cn/*", "ok6");
  url.add("https://bbs.tampermonkey.net.cn/test/*", "ok66");
  url.add("*://*/test/param?*", "ok7");
  url.add("i.tampermonkey.net.cn/*", "ok8");
  url.add("*i.tampermonkey.net.cn/*", "ok9");
  url.add("http://bbs.tampermonkey.net.cn/test?id=*", "ok10");
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
    expect(
      url.match("https://bbs.tampermonkey.net.cn/test/thread-63-1-1.html")
    ).toEqual(["ok6", "ok66"]);
    expect(
      url.match("https://bbs.tampermonkey.net.cn/forum-68-1.html")
    ).toEqual(["ok6"]);
    expect(url.match("https://bbs.tampermonkey.net.cn/")).toEqual(["ok6"]);
    expect(
      url.match("https://bbs.tampermonkey.net.cn/test/param?a=1&b=2")
    ).toEqual(["ok6", "ok66", "ok7"]);
    expect(url.match("https://www.baidu.com/test/param?id=123")).toEqual([
      "ok7",
    ]);
    expect(url.match("https://i.tampermonkey.net.cn/aa")).toEqual([
      "ok8",
      "ok9",
    ]);
    expect(url.match("https://wwi.tampermonkey.net.cn/aa")).toEqual(["ok9"]);
    expect(url.match("http://bbs.tampermonkey.net.cn/test?id=1234124")).toEqual(
      ["ok10"]
    );
  });
  it("delete", () => {
    url.del("ok5");
    expect(url.match("http://example.org/foo/bar.html")).toEqual([]);
    url.add("http://example.org/foo/bar.html", "ok4");
    expect(url.match("http://example.org/foo/bar.html")).toEqual(["ok4"]);
    url.del("ok5");
    expect(url.match("http://example.org/foo/bar.html")).toEqual(["ok4"]);
    url.del("ok4");
    expect(url.match("http://example.org/foo/bar.html")).toEqual([]);
    expect(url.match("http://test.baidu.com/")).toEqual(["ok"]);
  });
  it("tld 顶域测试", () => {
    url.add("*://*.test-tld.tld/", "ok9");
    expect(url.match("https://www.test-tld.com")).toEqual(["ok9"]);
    expect(url.match("https://www.test-tld.org.cn")).toEqual(["ok9"]);
  });

  it("错误的", () => {
    url.add("*://*.twitter.com/*", "ok10");
    expect(url.match("https://twitter.com/trump_chinese")).toEqual(["ok10"]);
  });

  it("多*", () => {
    url.add("*://*.google*/search*", "ok11");
    expect(
      url.match(
        "https://www.google.com.hk/search?q=%E6%88%91&oq=%E6%88%91&aqs=edge.0.69i59j0i512l5j69i61l3.1416j0j4&sourceid=chrome&ie=UTF-8"
      )
    ).toEqual(["ok11"]);
  });
});

describe("UrlInclude-2", () => {
  it("http*", () => {
    const url = new UrlInclude<string>();
    url.add("http*", "ok1");
    url.add("*://*", "ok2");
    expect(url.match("http://www.http.com")).toEqual(["ok1", "ok2"]);
    expect(
      url.match(
        "https://pan.baidu.com/disk/home?from=newversion&stayAtHome=true#/all?path=%2F&vmode=list"
      )
    ).toEqual(["ok1", "ok2"]);
    expect(url.match("https://github.com/CodFrm")).toEqual(["ok1", "ok2"]);
    url.add("http*://example.com/*", "ok3");
    expect(url.match("https://example.com/")).toEqual(["ok1", "ok2", "ok3"]);
    expect(url.match("http://example.com/")).toEqual(["ok1", "ok2", "ok3"]);
  });
  it("port", () => {
    const url = new UrlInclude<string>();
    url.add("http://domain:8080", "ok2");
    expect(url.match("http://domain:8080/")).toEqual(["ok2"]);
    expect(url.match("http://domain:8080/123")).toEqual([]);
  });
  it("无/", () => {
    const url = new UrlInclude<string>();
    url.add("http://domain2", "ok3");
    url.add("http://domain2*", "ok4");
    expect(url.match("http://domain2/")).toEqual(["ok3", "ok4"]);
    expect(url.match("http://domain2.com/")).toEqual(["ok4"]);
    expect(url.match("http://domain2/123")).toEqual(["ok4"]);
  });
  it("nomral", () => {
    const url = new UrlInclude<string>();
    url.add("*://*.bilibili.com/bangumi/play/*", "ok1");
    expect(url.match("https://www.bilibili.com/bangumi/play/ep691613")).toEqual(
      ["ok1"]
    );
  });
});

describe("match *", () => {
  const url = new UrlMatch<string>();
  url.add("*", "ok1");
  it("ok1", () => {
    expect(url.match("http://www.baidu.com")).toEqual(["ok1"]);
  });
});
