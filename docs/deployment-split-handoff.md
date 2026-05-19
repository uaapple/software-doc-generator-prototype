# 部署分支拆分交接说明

本文档给部署端 AI 使用，用于把开发分支改动拆分到 `release/linux-prod` 和 `release/windows-prod`。当前开发分支已经引入部署边界显性化机制，后续不要再完全按旧方式人工扫所有 diff，应优先使用仓库内的分类器和部署目标清单。

## 关键提交

与新拆分流程相关的提交：

- `87be900 显性化开发侧部署边界`

这个提交新增或修改了以下核心入口：

- `deploy/ownership.yml`
- `deploy/targets/linux-prod.json`
- `deploy/targets/windows-prod-full.json`
- `deploy/targets/windows-prod-source.json`
- `scripts/classify-changes.mjs`
- `scripts/build-release-zip.mjs`
- `.env.linux-prod.example`
- `.env.windows-prod.example`
- `.env.dev-distributed.example`
- `src/config.js`
- `package.json`

## 拆分入口

部署端拿到开发分支后，先运行分类器判断文件归属：

```bash
npm run classify:changes -- <base>..<head> --allow-ambiguous
```

例如：

```bash
npm run classify:changes -- release/linux-prod..feat/slx-parser-integration --allow-ambiguous
```

分类结果含义：

- `linux`: 优先进入 `release/linux-prod`
- `windows`: 优先进入 `release/windows-prod`
- `shared`: 两边都要评估，通常两边都需要
- `runtime-data`: 不进入部署分支
- `local-only`: 不进入部署分支
- `ambiguous`: 需要人工判断，不能机械 cherry-pick

## 这次新机制本身如何拆

`87be900` 这个提交本身要让两个部署分支都具备新的拆分能力，因此不能只进入一边。

### `release/linux-prod`

建议包含：

- `.env.linux-prod.example`
- `.env.dev-distributed.example`
- `deploy/ownership.yml`
- `deploy/targets/linux-prod.json`
- `scripts/classify-changes.mjs`
- `scripts/build-release-zip.mjs`
- `src/config.js`
- `package.json`

原因：

- Linux 端是平台后端和前端入口。
- Linux 生产环境应设置 `APP_RUNTIME_ROLE=platform`。
- 生产数据和 skill 目录通过 `APP_DATA_DIR`、`APP_SKILLS_DIR` 外置。
- Linux 端通过 HTTP 访问 Windows VM 上的 Hermes Agent 和 MATLAB Worker。
- 后续通过 `npm run release:zip:linux` 构建 Linux 包。

### `release/windows-prod`

建议包含：

- `.env.windows-prod.example`
- `.env.dev-distributed.example`
- `deploy/ownership.yml`
- `deploy/targets/windows-prod-full.json`
- `deploy/targets/windows-prod-source.json`
- `scripts/classify-changes.mjs`
- `scripts/build-release-zip.mjs`
- `src/config.js`
- `package.json`

原因：

- Windows VM 端运行 Hermes Agent、MATLAB Worker 和 MATLAB/MCP 相关能力。
- Windows VM 生产环境应设置 `APP_RUNTIME_ROLE=hermes-agent`。
- 后续区分完整包和源码更新包：
  - `npm run release:zip:windows-full`
  - `npm run release:zip:windows-source`

## 运行态数据排除规则

无论分类器结果如何，以下内容默认不要进入 release 分支：

- `.mcp.json`
- `.env`
- `data/projects/**`
- `data/uploads/**`
- `data/rejections/**`
- `data/skills.sqlite`
- `data/skill-rules/**`
- `output/**`
- `videos/**`
- `input/**`
- `release-dist/**`
- `test-fixtures/**/artifacts/**`

这些属于本机配置、生产或开发运行态数据、生成产物、验证快照。

## 生产运行边界

`src/config.js` 已经加入生产保护。

Linux 生产端如果设置：

```bash
APP_ENV=production
APP_RUNTIME_ROLE=platform
```

则不能再使用：

```bash
HERMES_TRANSPORT=cli
MATLAB_MCP_TRANSPORT=stdio
```

Linux 生产端必须通过 HTTP 调 Windows VM：

```bash
HERMES_TRANSPORT=api
HERMES_BASE_URL=http://WINDOWS_VM_HOST:3101

MATLAB_MCP_TRANSPORT=http
MATLAB_MCP_BASE_URL=http://WINDOWS_VM_HOST:5100
```

Windows VM 负责运行 Hermes Agent、MATLAB Worker 和 MATLAB/MCP 相关能力。

## Release 包构建入口

Linux 包：

```bash
npm run release:zip:linux
```

Windows 完整包：

```bash
npm run release:zip:windows-full
```

Windows 源码更新包：

```bash
npm run release:zip:windows-source
```

这些命令读取 `deploy/targets/*.json`，不要再手写 include/exclude 列表。

## 部署端 AI 推荐流程

1. 拉取开发分支最新提交。
2. 确认要拆分的 commit range。
3. 运行 `npm run classify:changes -- <base>..<head> --allow-ambiguous`。
4. 按分类结果处理：
   - `linux` 进入 `release/linux-prod`
   - `windows` 进入 `release/windows-prod`
   - `shared` 两边都评估，通常两边都需要
   - `runtime-data` 和 `local-only` 排除
   - `ambiguous` 结合提交说明和文件内容人工判断
5. 每个 release 分支提交前检查：

```bash
git diff --cached --stat
git diff --cached --name-status
```

确认没有混入运行态数据后再提交。
