# 软件开发需求自动生成原型

这是第一阶段的内网 Web 原型，目标是把“客户系统需求 PDF + 模型侧产物”转换为“可审核、可追溯的软件开发需求条目草稿”，用于降低补写软件开发需求的人力成本。

## 当前目标

- 搭建一个可运行的内网 Web 原型
- 支持上传系统需求 PDF、模型 PDF、生成 C 文件
- 在后端完成抽取、编排、生成、校验
- 在前端展示可审核的需求条目、来源依据和冲突信息

## 当前范围

- 第一阶段默认输出中文软件开发需求
- 第一阶段以结构化需求条目为主，不直接生成最终排版文档
- `slx` 文件当前只做上传和接口预留，不直接解析
- 未配置 LLM API 时，系统自动回退到本地规则模式

## 核心规则

- 系统需求是最高优先级事实源
- 模型 PDF 与生成 C 文件主要用于补充实现细节与佐证
- 每条需求都必须具备可追溯来源
- 冲突项不自动裁决，而是标记给人工审核
- LLM 只允许在后端编排层接入，前端不直接调用

## 代码入口

- 服务入口: `src/server.js`
- Wiki 服务入口: `src/wiki-server.js`
- 应用与 API: `src/app.js`
- 流水线编排: `src/services/pipeline-service.js`
- LLM 编排: `src/services/llm-service.js`
- 前端页面: `public/index.html`
- Wiki 内容源: `wiki/navigation.json` 与 `wiki/content/*.md`

## 运行方式

1. 安装依赖
2. 默认情况下无需额外配置模型，仓库自带可用的 Ark / Doubao 默认连接参数
3. 如需覆盖默认配置，可在仓库根目录创建 `.env`
4. 启动服务: `npm start`
5. 打开 `http://localhost:3000`

## 用户 Wiki

- 独立用户 Wiki 默认通过 `3001` 端口访问
- 启动命令: `npm run wiki:start`
- 开发时可执行: `npm run wiki:dev`
- 内容源位于 `wiki/` 目录，页面正文使用 Markdown，导航顺序由 `wiki/navigation.json` 控制
- 开发期检查命令: `npm run check:wiki`

如需一键启动 Wiki，可执行：

- `./start-wiki.sh`
- `./restart-wiki.sh`
- 停止时执行 `./stop-wiki.sh`
- macOS 下也可以直接双击：
- `启动Wiki.command`
- `终止Wiki.command`
- `重启Wiki.command`

## 一键启动

- 双击根目录下的 `start-local.cmd`
- 或在 PowerShell 里执行: `.\scripts\start-local.ps1`

脚本会自动完成这些动作：

- 检查 `node_modules`，缺失时自动执行 `npm install`
- 启动本地 Hermes Agent 后端服务（默认 `http://127.0.0.1:3101`）
- 启动本地平台后端服务
- 等待 `http://127.0.0.1:3000/api/meta` 就绪
- 自动在浏览器中打开前端页面 `http://127.0.0.1:3000`

如果 `3000` 端口已经有服务在监听，脚本会直接打开当前页面，不会重复启动一个新实例。

本机一键启动默认使用平台 + Hermes Agent sidecar 模式，单元测试用例生成页面可直接访问 `http://127.0.0.1:3000/unit-test-case-generation`。TCSD 使用十二个相互独立的 Hermes Agent 会话，每阶段显式调用一个原子技能，再由宿主验证候选产物并写 checkpoint；默认每阶段最多 `200` turns、`120` 分钟，可通过 `TCSD_STAGE_HERMES_MAX_TURNS`、`TCSD_STAGE_HERMES_TIMEOUT_MS` 调整，并可用 `TCSD_STAGE_HERMES_PROFILE` 覆盖通用 `HERMES_PROFILE`。该链路没有整体 Agent 或纯脚本生产 fallback；使用 `START_HERMES_AGENT=0` 或 `-NoHermesAgent` 时必须另行提供可访问的 Hermes Agent HTTP 服务。

## 环境变量

- 仓库会先加载 `.env.defaults`，再加载 `.env`
- 优先级: 系统环境变量 > `.env` > `.env.defaults`
- `APP_ENV_FILE`: 可选，加载额外的外置环境文件，如正式 VM 的 `config\.env.production`
- `APP_DATA_DIR`: 可选，将工程、上传物、任务产物、反馈与 `skills.sqlite` 放到代码目录之外
- `APP_SKILLS_DIR`: 可选，将运行态可变技能目录放到代码目录之外，默认仍使用仓库内 `skills`
- `PORT`: 服务端口，默认 `3000`
- `WIKI_PORT`: Wiki 服务端口，默认 `3001`
- `OPENAI_API_KEY`: 大模型 API Key
- `OPENAI_MODEL`: 模型名，默认 `gpt-4.1-mini`
- `OPENAI_BASE_URL`: 可选，自定义兼容 API 地址

## 正式发布部署

- 发布分支固定为 `release/windows-prod`
- Mac 侧打包命令：`npm run release:zip`
- 默认输出目录：`release-dist/`
- Windows VM 一键部署脚本：`scripts/deploy-release.ps1`
- Windows 服务安装脚本：`scripts/install-windows-services.ps1`
- 详细流程见 `docs/windows-vm-zip-deployment.md`

发布包不会包含 `.env`、`.git`、`node_modules`、`.local` 或运行态 `data/`。正式数据应通过 `APP_DATA_DIR` 和 `APP_SKILLS_DIR` 固定到 VM 外置目录，避免部署新代码时覆盖正式工程和技能库。

## 编码协作规范

- 仓库文本文件默认使用 `UTF-8`（无 BOM）
- 大多数源码与文档使用 `LF`，Windows 脚本保留 `CRLF`
- 提交前建议执行 `npm run check:encoding`
- 如需清理 BOM，可执行 `npm run fix:encoding`
- 详细约束见 `ENCODING.md`
## 建议协作方式

长周期开发时，不要只依赖线程上下文。继续开发前，优先阅读以下文件：

- `README.md`: 项目目标、边界、入口
- `DECISIONS.md`: 已锁定决策
- `ARCHITECTURE.md`: 架构与数据流
- `STATUS.md`: 当前进展与下一步

## 一键启动

- 双击根目录下的 `start-local.cmd`
- 或在 PowerShell 里执行: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1`
- 停止服务可双击 `stop-local.cmd`
- 或在 PowerShell 里执行: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1`

脚本会自动完成这些动作：

- 检查 `node_modules`，缺失时自动执行 `npm install`
- 启动本地 Hermes Agent 后端服务（默认 `http://127.0.0.1:3101`）
- 启动本地平台后端服务
- 等待 `http://127.0.0.1:3000/api/meta` 就绪
- 自动在浏览器中打开前端页面 `http://127.0.0.1:3000`
- 在 `.local/server.pid` 记录当前服务进程，供停止脚本安全关闭
- 在 `.local/hermes-agent.pid` 记录一键启动拉起的 Hermes Agent 进程，供停止脚本安全关闭

如果 `3000` 端口已经有服务在监听，脚本会直接打开当前页面，不会重复启动一个新实例。

本机一键启动默认使用平台 + Hermes Agent sidecar 模式，单元测试用例生成页面可直接访问 `http://127.0.0.1:3000/unit-test-case-generation`。TCSD 使用十二个相互独立的 Hermes Agent 会话，每阶段显式调用一个原子技能，再由宿主验证候选产物并写 checkpoint；默认每阶段最多 `200` turns、`120` 分钟，可通过 `TCSD_STAGE_HERMES_MAX_TURNS`、`TCSD_STAGE_HERMES_TIMEOUT_MS` 调整，并可用 `TCSD_STAGE_HERMES_PROFILE` 覆盖通用 `HERMES_PROFILE`。该链路没有整体 Agent 或纯脚本生产 fallback；使用 `START_HERMES_AGENT=0` 或 `-NoHermesAgent` 时必须另行提供可访问的 Hermes Agent HTTP 服务。

## UTF-8 Guard Rule

- Any task that reads, edits, or rewrites Chinese or other non-ASCII text files must follow `windows-utf8-guard`.
- Prefer small patch-style edits over full file rewrites.
- Do not treat terminal mojibake as proof of file-byte corruption.
- See `docs/encoding-workflow.md` for the project workflow.
