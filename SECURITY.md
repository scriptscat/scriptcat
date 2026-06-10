# Security Policy

ScriptCat is a Manifest V3 browser extension that runs user-provided scripts with broad
privileges, so we take security reports seriously. Thank you for helping keep users safe.

## Supported Versions

ScriptCat is distributed through the Chrome Web Store, Firefox Add-ons, and Edge Add-ons and
auto-updates to the latest release. Security fixes ship in **new releases only**:

| Version | Supported |
| --- | --- |
| Latest stable release | :white_check_mark: |
| Current beta channel | :white_check_mark: |
| Any older / superseded version | :x: — update to the latest |

Because the stores auto-update, staying on the latest version is the most reliable mitigation.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub Issues, Discord, the
Telegram group, or any other public channel** — doing so discloses the issue to attackers
before a fix is available.

Instead, report it privately:

1. **Preferred — GitHub private vulnerability reporting.** Open a private advisory at
   <https://github.com/scriptscat/scriptcat/security/advisories/new> (repo **Security** tab →
   *Report a vulnerability*). The report is visible only to you and the maintainers.
2. **Fallback.** If you cannot use that, send a **private** direct message to a maintainer via
   [Telegram](https://t.me/scriptscat) or [Discord](https://discord.gg/JF76nHCCM7) asking for a
   private channel — do not post details in the public chat.

Please include, as far as you can:

- affected version(s), browser, and OS;
- the impact — what an attacker can actually do;
- step-by-step reproduction, plus a proof-of-concept userscript or page if applicable;
- any suggested fix or mitigation.

### What to expect

- We aim to acknowledge your report within a few days and to keep you updated as we investigate.
- We follow **coordinated disclosure**: we prepare a fix and agree a disclosure timeline with you
  before any public write-up, and we credit you unless you ask to stay anonymous.

## 中文上报指引

请**不要**通过公开的 GitHub Issue、Discord、Telegram 群或任何公开渠道提交安全漏洞——那会在修复发布前把问题暴露给攻击者。

请改用私密渠道:

- **首选**:GitHub 私密漏洞上报——在 <https://github.com/scriptscat/scriptcat/security/advisories/new> 提交私密 advisory(仓库 **Security** 标签页 → *Report a vulnerability*),仅你与维护者可见。
- **备选**:通过 [Telegram](https://t.me/scriptscat) 或 [Discord](https://discord.gg/JF76nHCCM7) **私信**维护者索取私密渠道,不要在公开群里贴细节。

请尽量附上:受影响版本 / 浏览器 / 操作系统、影响说明(攻击者能做什么)、复现步骤与 PoC、以及可能的修复建议。我们会尽快确认并与你协调披露时间,默认在公开前先修复,并为你署名(除非你希望匿名)。
