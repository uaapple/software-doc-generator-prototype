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
- 应用与 API: `src/app.js`
- 流水线编排: `src/services/pipeline-service.js`
- LLM 编排: `src/services/llm-service.js`
- 前端页面: `public/index.html`

## 运行方式

1. 安装依赖
2. 可选配置 `OPENAI_API_KEY`、`OPENAI_MODEL`
3. 启动服务: `npm start`
4. 打开 `http://localhost:3000`

## 环境变量

- `PORT`: 服务端口，默认 `3000`
- `OPENAI_API_KEY`: 大模型 API Key
- `OPENAI_MODEL`: 模型名，默认 `gpt-4.1-mini`
- `OPENAI_BASE_URL`: 可选，自定义兼容 API 地址

## 建议协作方式

长周期开发时，不要只依赖线程上下文。继续开发前，优先阅读以下文件：

- `README.md`: 项目目标、边界、入口
- `DECISIONS.md`: 已锁定决策
- `ARCHITECTURE.md`: 架构与数据流
- `STATUS.md`: 当前进展与下一步
