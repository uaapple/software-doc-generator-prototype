# Hermes Agent Generation Handover

## 1. 文档目的

这份文档用于给新线程快速说明当前 `software_requirement` 生成链路已经切换到什么状态、哪些设计已经落地、哪些地方仍然是中间态，以及后续线程应该从哪里继续推进。

当前最重要的结论是：

- 软件需求生成主链路已经切到 `后端主控 + 本机 Hermes CLI 执行`
- `anchor / sourceAnchorIds / reference_resolve` 已经成为主协议
- `task skill bundle + recommended shortlist` 已经接到主链路
- 前端任务详情页已经能看到 agent 运行日志、task skill bundle 信息、以及 Hermes 会话 token 用量

## 2. 当前运行模式

### 2.1 默认运行方式

当前默认配置在 [src/config.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/config.js)：

- `HERMES_TRANSPORT=cli`
- `HERMES_COMMAND=hermes`

这意味着：

- 不依赖常驻 Hermes HTTP 服务
- 后端每执行一个 Hermes step，都会直接拉起一次本机 `hermes chat ...`
- 只要本机 `hermes` 命令可用、已登录、凭证正常，生成任务就能跑

对应实现入口：

- [src/services/hermes-agent-client.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/hermes-agent-client.js)
- [src/services/pipeline-service.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/pipeline-service.js)

### 2.2 如果切换到 API 模式

代码仍保留了 `api` transport：

- `executeApiStep()` 会请求 `POST /internal/steps/execute`

但当前主线验证和日常运行都是 `cli` 模式。新线程如果不是专门做 Hermes 服务化，不要优先碰 `api` 模式。

## 3. 当前软件需求生成主链路

当前软件需求链路的真实步骤是：

1. `task_init`
2. `effective_skill_resolve`
3. `anchor_index_build`
4. `atom_recall`
5. `outline_build`
6. `content_generate`
7. `reference_resolve`
8. `rule_validate`
9. `persist_result`

主流程实现在：

- [src/services/pipeline-service.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/pipeline-service.js)

### 3.1 各步骤的当前职责

`task_init`

- 读取项目、模块、资产、模板、LLM profile
- 解析 effective skill inventory
- 生成 task skill bundle

`anchor_index_build`

- `cli` 模式下目前仍是后端本地抽取资产，再构造成 anchor
- `api` 模式下可以走 Hermes step

`atom_recall`

- 仍由后端本地 deterministic recall 执行
- 已经降级为 shortlist / recommended skills
- 不再是唯一 skill 输入来源

`outline_build`

- 已切到 `skill manifest + shortlist` 驱动
- 不再默认读所有 skill chunk 正文
- 当前优化后耗时明显下降

`content_generate`

- 会拿到 `skillBundlePath + recommendedSkillCodes + recalledAtoms + outline + anchors`
- 这一步仍允许 Hermes 读需要的 skill chunk 正文

`reference_resolve`

- 后端把 `sourceAnchorIds` 反解回前端兼容的 `sourceRefs`

## 4. 当前主协议

### 4.1 Anchor 协议

Hermes / pipeline 使用的主引用对象是 `anchors[]`，至少包含：

- `anchorId`
- `assetId`
- `fileName`
- `fileRole`
- `location`
- `anchorType`
- `excerpt`
- `summary`
- `tags`

### 4.2 结果引用协议

模型现在返回：

- `sourceAnchorIds[]`

而不是：

- `sourceRefs[]`

后端会在 `reference_resolve` 阶段统一把 `sourceAnchorIds -> sourceRefs`。

这条链路已经是主路径，不要再回退到“模型手写 excerpt/sourceRef”的做法。

## 5. Task Skill Bundle 的当前形态

task skill bundle 现在会落到 generation task 私有目录下，包含：

- `skill-bundle/skill-manifest.json`
- `skill-bundle/skills/by-kind/*.json`
- `skill-bundle/skills/by-chunk/*.json`

debug 里会记录：

- `skillBundlePath`
- `skillManifestPath`
- `recommendedSkillCodes`
- `effectiveSkillCount`

前端任务详情页已经展示这些字段。

## 6. Hermes Token Usage 的当前接法

当前没有改 Hermes 本体。

真实 token 用量来自：

- `hermes chat` stdout 返回的 `session_id`
- 再由后端去查询 `~/.hermes/state.db`

当前已接入的字段包括：

- `inputTokens`
- `outputTokens`
- `cacheReadTokens`
- `cacheWriteTokens`
- `reasoningTokens`
- `totalTokens`
- `costStatus`

配置位置：

- [src/config.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/config.js) 的 `hermes.stateDbPath`

实现位置：

- [src/services/hermes-agent-client.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/hermes-agent-client.js)
- [src/services/project-service.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/project-service.js)
- [public/hierarchy.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/public/hierarchy.js)

## 7. 已经解决的关键问题

截至这份 handoff：

- 软件需求生成已经不再依赖模型手写 `sourceRefs`
- 任务详情页不再把后处理误显示成“agent 还在运行”
- `outline_build` 已从“读过重 skill 输入”收缩到“manifest + shortlist”为主
- task skill bundle 已真正接到主链路
- Hermes CLI 生成会话的精确 token 用量已显示到前端任务详情页
- 软件需求链路里异步失败不能正确收口的问题已修复

## 8. 当前仍然要注意的点

### 8.1 已知测试基线失败

当前仓库仍有一个与本轮 Hermes 迁移无关的已知基线失败：

- `Hv/lv system management detail design profile loads dedicated detail design guidance`

如果新线程跑全量测试时看到它，不要先误判成这次 agent 迁移引入的问题。

### 8.2 当前主瓶颈仍偏向 `content_generate`

在真实 case 下：

- `outline_build` 已经比之前快很多
- 当前更重、更容易波动的步骤仍然是 `content_generate`

### 8.3 `anchor_index_build` 在 CLI 模式下仍非“完全由 Hermes 直读”

当前 `cli` 模式仍是：

- 后端本地抽取
- 再构造成 anchor

如果未来要把“资产直读”再更纯粹地推给 Hermes，这里仍有继续演进空间。

## 9. 新线程如果要做“模块冷启动切换到 Hermes 模式”，建议从哪开始

如果新线程的目标是把“新模块冷启动”也切到 Hermes 这套模式，建议按这个顺序看代码：

1. [src/services/pipeline-service.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/pipeline-service.js)
2. [src/services/hermes-agent-client.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/hermes-agent-client.js)
3. [src/services/project-service.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/project-service.js)
4. [src/services/software-requirement-agent-shared.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/software-requirement-agent-shared.js)
5. [public/hierarchy.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/public/hierarchy.js)
6. [tests/run-tests.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/tests/run-tests.js)

更具体一点，新线程优先要回答的问题通常是：

- 冷启动阶段是否也要采用 `anchor + sourceAnchorIds` 主协议
- 冷启动阶段的 skill 上下文是否也应该走 task skill bundle
- 冷启动阶段哪些步骤保留后端 deterministic 逻辑，哪些要交给 Hermes
- 冷启动出来的模块 profile / bootstrap 结果如何进入现有 skill 管理链路

## 10. 建议新线程先读的文件

新线程建议先读这几份：

- [docs/superpowers/hermes-agent-generation-handover.md](/Users/guanzhengyang/Documents/software-doc-generator-prototype/docs/superpowers/hermes-agent-generation-handover.md)
- [progress.md](/Users/guanzhengyang/Documents/software-doc-generator-prototype/progress.md)
- [src/services/pipeline-service.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/pipeline-service.js)
- [src/services/hermes-agent-client.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/src/services/hermes-agent-client.js)
- [tests/run-tests.js](/Users/guanzhengyang/Documents/software-doc-generator-prototype/tests/run-tests.js)

如果目标是“新模块冷启动切到 Hermes”，请直接以这份 handoff 为当前设计基线，而不是从旧的 `LLMService` 直连生成模式重新理解。
