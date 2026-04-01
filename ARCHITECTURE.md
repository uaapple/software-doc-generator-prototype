# 架构说明

## 总体结构

当前原型采用五层结构：

1. 文件接入层
2. 预处理与信息抽取层
3. LLM 编排层
4. 规则校验层
5. 审核与展示层

## 各层职责

### 1. 文件接入层

- 负责项目创建、文件上传、任务发起
- 当前支持的文件类型：
  - 系统需求 PDF
  - 模型 PDF
  - 生成 C 文件
  - `slx` 预留上传
- 相关代码：
  - `src/app.js`
  - `src/services/project-service.js`

### 2. 预处理与信息抽取层

- 系统需求 PDF 与模型 PDF 通过 `pdf-parse` 做文本抽取
- 生成 C 文件通过规则提取函数、条件、赋值、宏定义等候选证据
- `slx` 当前不解析，只记录为保留扩展项
- 相关代码：
  - `src/services/pdf-extractor.js`
  - `src/services/c-extractor.js`
  - `src/services/extraction-service.js`

### 3. LLM 编排层

- 汇总抽取结果与模板信息
- 根据 skill 和模板组织提示词
- 优先调用 OpenAI API 生成结构化需求条目
- 若未配置 API Key，则回退到本地规则生成
- 相关代码：
  - `src/services/llm-service.js`
  - `skills/`
  - `templates/software-requirement-template.json`

### 4. 规则校验层

- 检查缺编号、缺来源、重复项、模糊措辞
- 当前不会自动消解冲突，只做标记
- 相关代码：
  - `src/services/validation-service.js`

### 5. 审核与展示层

- 展示需求条目、来源依据、冲突提示、审核状态
- 支持在前端逐条接受、修改、驳回
- 相关代码：
  - `public/index.html`
  - `public/app.js`
  - `public/app.css`

## 数据流

1. 用户创建项目
2. 上传系统需求 PDF、模型 PDF、C 文件
3. 后端保存文件元数据
4. 抽取层生成证据块和摘要
5. LLM 编排层基于模板和 skill 生成结构化需求
6. 校验层检查生成结果并输出冲突
7. 前端展示需求并支持人工审核
8. 审核结果回写到项目数据

## 关键数据对象

### Project

- 项目基础信息
- 输入文件列表
- 抽取结果
- 需求列表
- 追溯关系
- 冲突列表
- 审核日志

### Extraction

- 来源文件
- 文件角色
- 摘要
- 证据块
- 标签
- 置信度

### Requirement

- `requirementId`
- `title`
- `requirementText`
- `type`
- `sourceRefs`
- `rationale`
- `verificationHint`
- `confidence`
- `conflictNote`
- `review`

## 当前已知限制

- `slx` 尚未解析
- PDF 抽取仍以通用文本抽取为主，未做复杂版面理解
- 目前数据存储为本地 JSON 文件，适合原型，不适合正式生产
- 远端仓库当前是通过 GitHub 连接器逐文件写入构建的，提交历史较碎
