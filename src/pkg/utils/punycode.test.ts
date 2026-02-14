import { describe, it, expect } from "vitest";
import { decodePunycode } from "./punycode"; // Update with your actual file path

const getPunycode = (x: string) => {
  return new URL(`http://${x}.io`).hostname.slice(0, -3);
};

describe.concurrent("punycode - decode only", () => {
  it.concurrent("basic", () => {
    expect(decodePunycode("xn--viertelvergngen-bwb")).toBe("viertelvergnügen");
    expect(decodePunycode("xn--maana-pta")).toBe("mañana");
    expect(decodePunycode("xn--bcher-kva")).toBe("b\xFCcher");
    expect(decodePunycode("xn--caf-dma")).toBe("caf\xE9");
    expect(decodePunycode("xn----dqo34k")).toBe("\u2603-\u2318");
    expect(decodePunycode("xn----dqo34kn65z")).toBe("\uD400\u2603-\u2318");
    expect(decodePunycode("xn--ls8h")).toBe("\uD83D\uDCA9");
    expect(decodePunycode("xn--p-8sbkgc5ag7bhce")).toBe("джpумлатест");
    expect(decodePunycode("xn--ba-lmcq")).toBe("bрфa");

    const codes = {
      "为什么选择scriptcat-脚本猫": "xn--scriptcat--xx2pif85dpx1n4mn5i9brrzc1f2c",
      "scriptcat脚本猫完全兼容油猴脚本-同时提供后台脚本运行框架-丰富的api扩展-让你的浏览体验更出色":
        "xn--scriptcat--api--803xq5lxg84bn7x9law6gwxrftatbw476a18aopi2ky56dycj3jr6wh00beah022clsg5u6cb6en53e7ka292jha3303jiai546nxt1eksp1sw6k3c251h",
      "为什么选择scriptcat-基于油猴的设计理念-完全兼容油猴脚本-提供更多丰富的api让脚本能够完成更多强大的功能":
        "xn--scriptcat---api-903xremky1ci2a25kznmfnap9t8q1beegea3l0js49dka54lbs864gsvf33vulhm9i656aja69tka9912dga2675eha679g784aral7387kja72mma6139lpna01bz17n",
      "为什么选择scriptcat-基于油猴的设计理念-完全兼容油猴脚本-提供更多丰富的api-脚本猫不仅兼容油猴脚本-还支持后台脚本运行-功能更强大-覆盖范围广-安装脚本管理器-寻找适合的脚本一键安装即可":
        "xn--scriptcat---api-------ql07anix3aghnnp9dxybze30yj7pksaja010heqhtxe3a13grg250g79e2zm98lzqas99fea7iu6hla65gc3exv9ccdi39j2m0b43e9pbw40acmuh6ysa365alaefkf5967ggar9528i6rahat638mlb3788ara0bz70d1o7id3te56bnaignj0264b5n7g88ioa140pgu0cyicj71n8vat3kmrap232b",
      "asmdksmklcmdsk-寻找-lmklamdkjqdenakjc-njkqelnuiconwerj-ksfnvcslkjdmc-jweasjkndjk-sandkjasnjxksakjkxnjaksn适合的-xj-kqwnjkxnqjas-nxsjkanxjksnjxansjk-cnajskn-cjkaxjksn-kxjasnjkxansjk-xnasjkxnksaj-cnjkdcnjksdncjsdnjcsdjkc-nmckj脚本":
        "xn--asmdksmklcmdsk--lmklamdkjqdenakjc-njkqelnuiconwerj-ksfnvcslkjdmc-jweasjkndjk-sandkjasnjxksakjkxnjaksn-xj-kqwnjkxnqjas-nxsjkanxjksnjxansjk-cnajskn-cjkaxjksn-kxjasnjkxansjk-xnasjkxnksaj-cnjkdcnjksdncjsdnjcsdjkc-nmckj-0g768an264bok8jtmrh2e00as1gp9lgw",
    };

    let testRaw: keyof typeof codes;

    testRaw = "为什么选择scriptcat-脚本猫";

    expect(codes[testRaw]).toBe(getPunycode(testRaw));
    expect(decodePunycode(codes[testRaw])).toBe(testRaw);

    testRaw = "scriptcat脚本猫完全兼容油猴脚本-同时提供后台脚本运行框架-丰富的api扩展-让你的浏览体验更出色";

    expect(codes[testRaw]).toBe(getPunycode(testRaw));
    expect(decodePunycode(codes[testRaw])).toBe(testRaw);

    testRaw = "为什么选择scriptcat-基于油猴的设计理念-完全兼容油猴脚本-提供更多丰富的api让脚本能够完成更多强大的功能";

    expect(codes[testRaw]).toBe(getPunycode(testRaw));
    expect(decodePunycode(codes[testRaw])).toBe(testRaw);

    testRaw =
      "为什么选择scriptcat-基于油猴的设计理念-完全兼容油猴脚本-提供更多丰富的api-脚本猫不仅兼容油猴脚本-还支持后台脚本运行-功能更强大-覆盖范围广-安装脚本管理器-寻找适合的脚本一键安装即可";

    expect(codes[testRaw]).toBe(getPunycode(testRaw));
    expect(decodePunycode(codes[testRaw])).toBe(testRaw);

    testRaw =
      "asmdksmklcmdsk-寻找-lmklamdkjqdenakjc-njkqelnuiconwerj-ksfnvcslkjdmc-jweasjkndjk-sandkjasnjxksakjkxnjaksn适合的-xj-kqwnjkxnqjas-nxsjkanxjksnjxansjk-cnajskn-cjkaxjksn-kxjasnjkxansjk-xnasjkxnksaj-cnjkdcnjksdncjsdnjcsdjkc-nmckj脚本";

    expect(codes[testRaw]).toBe(getPunycode(testRaw));
    expect(decodePunycode(codes[testRaw])).toBe(testRaw);
  });
});
