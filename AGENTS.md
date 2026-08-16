# 全局协作约定

- 以后由 Codex 生成的 Git commit message 默认使用中文，除非用户明确要求使用其他语言。

## macOS 本地 MATLAB MCP 调试

仅当 Codex 在 macOS 本机调试 Simulink/MATLAB MCP 时适用：

- 调用 `satk_eval.py` 或 `matlab-mcp-server` 必须使用沙箱外权限，以允许 MCP watchdog 创建 Unix socket。
- 显式设置 MATLAB 根目录为 `/Applications/MATLAB_R2026a.app`。
- 此规则只改变本机 Codex 的工具调用方式；不得修改技能实现、Windows Hermes Agent、生产部署、release 包或其脚本。

# Codex 开发提交约束

本项目生产部署分为 `release/linux-prod` 和 `release/windows-prod`。Mac 开发环境可以 all-in-one 运行后端、Hermes Agent、MATLAB/MCP，但 Codex 在开发分支提交时必须显式维护部署边界。

每次修改代码时，Codex 必须优先判断改动归属：

- `linux`: 平台后端、前端、项目管理、任务调度、上传下载、调用远端 Hermes/MATLAB 服务。
- `windows`: Hermes Agent、MATLAB Worker、MATLAB/MCP、SLX/SATK 解析、Windows 部署脚本。
- `shared`: 配置、协议、schema、通用服务、MRV/事实模型、两边都需要的脚本。
- `dev-only`: 测试夹具、实验材料、验证脚本，不进入生产 release。
- `runtime/local`: `.env`、`.mcp.json`、`data/**`、`output/**`、`videos/**`、`input/**` 等，不提交或不进入 release。

提交前必须运行：

```bash
npm run classify:changes -- --allow-ambiguous
```

不得把以下内容提交到功能提交中：

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

如果新增文件类型或目录，必须判断是否需要更新：

- `deploy/ownership.yml`
- `deploy/targets/linux-prod.json`
- `deploy/targets/windows-prod-full.json`
- `deploy/targets/windows-prod-source.json`

提交时尽量按部署归属拆分 commit：

- Linux 平台能力单独提交。
- Windows/MATLAB/Hermes 能力单独提交。
- shared 协议/配置单独提交。
- dev-only 夹具或验证材料单独提交。

如果本次改动会改变部署方式、运行环境变量、release 包内容或拆分规则，必须同步更新：

- `docs/deployment-split-handoff.md`

<!-- core-principles:start -->
## 核心原则

1. Choose the simplest implementation that fully satisfies the current requirements. Avoid unnecessary abstraction, configuration, indirection, or speculative extensibility.
2. Make the smallest necessary change that fixes the root cause. Do not refactor unrelated modules or change strategy semantics unless explicitly requested.
3. Grow the system in layers. Start from the smallest working end-to-end version and add new capabilities incrementally. Never replace a working system with unfinished complexity.
<!-- core-principles:end -->
