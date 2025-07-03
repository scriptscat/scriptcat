[中文贡献指南](../CONTRIBUTING.md)

# ScriptCat Contributing Guide

We greatly appreciate your contributions to ScriptCat! This guide aims to help you contribute to ScriptCat in a more standardized way, so please read it carefully.

## Submitting Issues

Before submitting an issue, we recommend that you first check the [existing Issues](https://github.com/scriptscat/scriptcat/issues) to avoid duplicate submissions.

### Reporting Problems, Bugs & Vulnerabilities

ScriptCat is an evolving project. If you encounter problems during use and are confident that these issues are caused by ScriptCat, we welcome you to submit an Issue. When submitting, please include detailed reproduction steps and runtime environment information.

### Proposing New Features

We welcome you to propose new feature suggestions in Issues. To help us better understand your needs, we recommend that you describe the feature in as much detail as possible and provide what you think might be a possible solution.

## Pull Request

ScriptCat uses [pnpm](https://pnpm.io/) to manage project dependencies. If you already have npm installed, the following commands can help you quickly set up the development environment:

```bash
# Install node.js dependencies
pnpm install
```

We recommend using a [proxy](https://pnpm.io/npmrc#https-proxy) to solve pnpm network issues rather than using mirrors.

```bash
pnpm config set proxy http://127.0.0.1:7890
pnpm config set https-proxy https://127.0.0.1:7890
```

### Commit Guidelines

We hope that each commit can clearly describe its purpose, and each commit should ideally contain only one modification. Our commit message format follows the [gitmoji](https://gitmoji.dev/) specification. For example:

```bash
git commit -m "✨ add login feature"
```

This example indicates that a new feature has been added: login functionality.

### Workflow Overview

The `main` branch is ScriptCat's primary branch. To maintain code integrity, please do not directly modify the `main` branch. You should create a new branch and make modifications on this branch, then initiate a Pull Request targeting the `main` branch. Please try to use Chinese for Pull Request titles to facilitate automatic changelog generation.

If you are not a member of the ScriptCat team, you can first fork this repository and then initiate a Pull Request to the `main` branch of this repository. When creating commits, please follow the commit message guidelines mentioned above. We will merge your contributions to the main branch after code review is completed.

## Writing Documentation

ScriptCat's documentation is in a separate repository: [scriptcat.org](https://docs.scriptcat.org), written using [docusaurus](https://docusaurus.io/). There are some [Markdown](https://docusaurus.io/zh-CN/docs/markdown-features) features that can help you. If you need to preview the modified documentation locally, you can use the following commands to install documentation dependencies and start the dev server:

```bash
npm install
npm start
```

### Help Us Translate

[Crowdin](https://crowdin.com/project/scriptcat) is an online multilingual translation platform. If you are interested in helping us translate ScriptCat-related content, you can find the ScriptCat project on Crowdin and start translation work.

- `src/locales` is the translation file directory for the [extension](https://github.com/scriptscat/scriptcat)
- `public/locales` is the translation file directory for the [script site](https://github.com/scriptscat/scriptlist-frontend)

#### Enable WYSIWYG Mode for Extension

> New version not yet supplemented

#### Enable WYSIWYG Mode for Script Site

Visit the script site at: [https://scriptcat.org/ach-UG](https://scriptcat.org/ach-UG) to enable WYSIWYG mode

## Participating in Development

ScriptCat uses ESLint to standardize code style and Vitest for unit testing. You can use the following commands to run them:

```bash
pnpm test
pnpm run lint
```

ScriptCat's page development uses the following technologies:

- [React](https://reactjs.org/)
- UI framework [arco](https://arco.design)
- CSS framework [unocss](https://unocss.dev/interactive/)
- RsPack bundling tool [rspack](https://rspack.dev/)

If you want to run ScriptCat locally, you can use the following commands:

```bash
pnpm run dev
# Please note that for unknown reasons, if you need to use incognito windows, you need to use the following command for development
pnpm run dev:noMap
```

If you want to package the extension, you can use the following command:

```bash
pnpm run pack
```

Before packaging, please ensure that the `scriptcat.pem` file is generated in the `dist` directory.

## Important Notes

- After running `pnpm run dev`, you need to import and load the contents of the `dist/ext` directory into the browser extension, then start editing code and save. The browser updates in real-time, but changes involving `manifest.json`, `service_worker`, `offscreen`, and `sandbox` require reloading.
