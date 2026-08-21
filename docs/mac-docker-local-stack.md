# Mac 本地容器栈运行手册（后端容器 + DSH Worker 容器 + 宿主 MATLAB Gateway）

> 目标拓扑：Mac 上 Docker Desktop（linux/amd64 容器）内运行 平台后端容器 + DSH Worker
> 容器；MATLAB R2026a 原生跑在宿主，经宿主 MATLAB Gateway（:5100）供 Worker 访问；
> 浏览器访问 `http://127.0.0.1:3000` 上传模型并生成任务。
> 架构不变：后端（platform 角色）经 `HERMES_TRANSPORT=api + HERMES_BASE_URL` 把任务
> 分发给 Worker（hermes-agent 角色），Worker 内的 Agent 由 Hermes 换成 DSH。

## 0. 前置条件

- Docker Desktop 已启动（Linux 容器模式）
- 宿主 Node 可执行：`pnpm exec node --version` ≥ 22（本机 DSH Desktop 运行时自带 v24）
- MATLAB R2026a 已安装且许可可用
- DeepSeek API key（DeepSeek 平台签发）

## 1. 一次性准备

```bash
# 1) 依赖（宿主，供 Gateway 进程与构建期使用）
pnpm install

# 2) 宿主 Gateway 配置（不提交）
cp .env.gateway.example .env.gateway
# 通过安全方式生成两项 Gateway 随机凭据，并分别填入 Gateway 与 Worker
# 的本机未跟踪配置；不得把凭据写入命令记录、本文档或仓库。

# 3) 栈配置（不提交；填入模型凭据）
cp .env.mac-docker.example .env
```

## 2. 启动顺序

```bash
# 1) 宿主 MATLAB Gateway（后台，日志到 data-docker/.tcsd-gateway.log）
pnpm exec node --disable-warning=ExperimentalWarning src/matlab-worker-server.js > data-docker/.tcsd-gateway.log 2>&1 &
curl -s http://127.0.0.1:5100/health   # 应返回 activeJobs/activeLeases

# 2) 构建并启动 后端 + Worker 容器
pnpm stack:up    # 等价 docker compose --env-file .env -f compose.mac-docker.yaml up -d --build

# 3) 检查
pnpm stack:logs  # 或 docker compose -f compose.mac-docker.yaml ps
curl -s http://127.0.0.1:3000/health    # 后端
curl -s http://127.0.0.1:3101/health    # Worker（hermes-server）
```

## 3. 使用

- 浏览器打开 `http://127.0.0.1:3000/unit-test-case-generation`
- 上传 SLX/MAT/addon → 创建任务 → 平台经 `HERMES_TRANSPORT=api` 把任务提示词发给
  Worker（`POST /internal/dsh/tasks`）→ Worker 内 `dsh --profile headless` 跑完整
  12 阶段（确定性运行时 + Gateway 访问宿主 MATLAB）→ 产物/checkpoint/三件套落回共享
  `data-docker/` → 前端展示。
- 任务详情页「DSH 会话日志」按钮导出该任务的 session.jsonl（本地栈：平台直接读共享
  `data-docker/` 下 `job.input.outputDir/.tcsd-dsh/session*.jsonl`；生产分离架构：平台经
  Worker API `GET /internal/tcsd-pipeline/jobs/:jobId/dsh-session-log` 转发，两端无需共享数据卷）。

## 4. 验证点

- 12/12 checkpoint（`data-docker/unit-test-case-generation/tasks/<id>/workspace/outputs/.tcsd-checkpoints/`）
- execution/timeline/artifact 三件套（`.tcsd-host/`），completion 按最终门禁
- 覆盖率对照历史（B04: C96.7/D100/M100(调整)；B09: C97.3/D71.7/M57.1）
- Gateway 日志无 token；Worker 会话日志无 token

## 5. 常见问题

- **DSH 会话内命令全部被拒（SandboxUnavailableError）**：linuxkit 内核无
  bwrap/Landlock 沙箱后端，必须设 `DSH_PERMISSION_MODE=danger-full-access`
  （容器即沙箱：cap_drop ALL + no-new-privileges + 只读 rootfs + uid 10001）。
- **Worker 容器内 MATLAB 调用失败（401）**：只核对本机未跟踪配置中的两项
  Gateway 凭据是否与宿主 Gateway 一致，不要打印凭据内容。
- **后端连不上 Worker**：HERMES_BASE_URL=http://worker:3101 需在 compose 网络内解析；
  检查 worker 服务是否健康。
- **MATLAB 冷启动慢**：首阶段可能耗时 5-10 分钟，属正常（nodesktop 无头）。
- TCSD 默认且正式使用 DSH；Hermes 只保留给尚未迁移的软件详设链路，不作为
  TCSD 回退路径。
