# HIL Excel Extraction Design

## 目标

把“Excel 导出的 HIL 测试用例提取”接入当前模块内的“文档提取”工具，并让提取结果直接成为模块资产，后续可作为 `HIL 用例生成` 的学习材料使用。

本轮只覆盖你已提供的 Excel 导出形态，重点处理：

- `Title`
- `precondition`
- `Step Description`
- `Expected Result`

其他列如 `Severity`、`Description`、`Actual_Result`、`Type`、`_polarion` 暂不进入首版核心提取范围。

## 现状判断

当前系统已经具备三块可复用基础：

1. 模块内“文档提取”工作区
2. Hermes `document_extract_generate` 提取链路
3. `hil_test_case` 生成页与下游文档类型主干

当前缺口不在 HIL 文档类型本身，而在：

- 文档提取输入还只支持图片和文本
- 没有 Excel 文件输入与预处理
- 没有把“导出的 HIL 用例”作为一种模块资产写回

## Excel 样例观察

基于 `workitems (4).xlsx` 的当前样例，首版只需要关注 `Basic Report` 工作表。

其中有效列为：

- `Title`
- `precondition`
- `Step Description`
- `Expected Result`

这些列本质上已经是“结构化测试用例内容”，更适合做“提取整理”，而不是重新让大模型自由生成。

## 方案对比

### 方案 A：Excel 先转结构化文本，再交给 Hermes 整理

流程：

1. 后端读取 Excel
2. 提取目标列并转成结构化中间文本
3. 将中间文本作为 `sourceText` 输入 Hermes
4. Hermes 输出统一 Markdown

优点：

- 与现有图片/文本提取链路最一致
- 仍可利用 Hermes 做版式整理、去噪和统一表达
- 便于后续和截图提取共用同一输出规范

缺点：

- 需要新增一层 Excel 解析
- 解析质量取决于首版列映射规则

### 方案 B：Excel 直接转 Markdown，不经过 Hermes

流程：

1. 后端读取 Excel
2. 直接按固定模板写 Markdown
3. 保存为模块资产

优点：

- 简单、稳定、可控
- 对导出表格特别高效

缺点：

- 不能复用 Hermes 的统一整理能力
- 同时支持截图/文本/Excel 时会形成两套输出逻辑

### 方案 C：Excel 转结构化 JSON，中间对象直接进入模块资产和后续生成

优点：

- 对后续“学习材料”最干净
- 后续可直接做更强的结构消费

缺点：

- 超出当前系统主流资产形态
- 需要额外 UI、预览、存储和兼容处理

## 推荐方案

推荐采用 **方案 A**。

原因：

- 与现有“文档提取”产品形态最一致
- 风险低于直接改造成结构化 JSON 资产
- 比纯模板直转 Markdown 更容易统一截图、文本、Excel 三种输入

## 首版设计

### 输入能力

在现有“文档提取”中，为 `HIL 测试用例` 增加 Excel 文件输入：

- `.xlsx`
- `.xls`
- `.csv`

首版仅保证 `.xlsx` 跑通。

如果输入包含 Excel：

- 不走图片 `images[]`
- 新增表单字段，如 `attachments[]` 或 `spreadsheets[]`
- 前端展示文件名、大小、移除按钮，体验与图片列表保持一致

### Excel 预处理

后端新增一个轻量 Excel 解析步骤：

1. 读取工作表
2. 优先选择 `Basic Report`
3. 用表头定位目标列
4. 逐行提取非空记录
5. 仅保留 4 个核心字段

中间对象建议形态：

```json
{
  "title": "ESC干预前轴激活标志位判断_前电机降扭",
  "precondition": "1. KL15上电 ...",
  "stepDescription": "1. ESC_TqDecReqAct_F = 0x1 ...",
  "expectedResult": "第1步: ESCWhlTq_bFrntAxleTqIntvActv = 0 ..."
}
```

### Hermes 提取输入

Excel 预处理结果不直接落资产，而是先转换为结构化文本，再送给 `document_extract_generate`。

提示词新增 Excel-HIL 约束：

- 当前输入源可能来自 Excel 导出的 HIL 用例
- 仅整理，不改写测试意图
- 保留每条用例的标题、前置条件、步骤描述、预期结果
- 不补写输入中没有的步骤
- 输出为统一的 Markdown HIL 用例文档

### 输出资产

提取结果仍然写为模块 Markdown 资产：

- 文件名：`模块名-HIL测试用例.md`
- 角色：`extracted_hil_test_case`

建议的 Markdown 结构：

```md
# 扭矩干预-HIL测试用例

## 文档信息

- 文档类型：HIL测试用例
- 来源：Excel 导出提取整理

## 用例条目

### 1. ESC干预前轴激活标志位判断_前电机降扭

- Precondition
  1. ...

- Step Description
  1. ...

- Expected Result
  1. ...
```

## 与后续 HIL 生成的关系

这类提取产物的定位不是“最终交付格式”，而是“高价值模块资产”。

后续可作为：

- `HIL 用例生成` 的参考样例
- 模块 skill 冷启动或 few-shot 学习材料
- 人工核对的历史优秀用例资产

因此首版的核心目标是：

- 把 Excel 中已有 HIL 用例稳定整理进模块资产
- 保留可学习的结构
- 不追求 1:1 还原 Polarion 原始导出样式

## 非目标

本轮不做：

- 全量 Polarion 字段恢复
- 多工作表复杂映射
- 富格式单元格还原
- 自动回写 Polarion
- 仅凭系统需求/代码直接生成和 Excel 一样细的 HIL 用例

## 测试策略

需要新增至少 4 类回归：

1. Excel 解析
- 能从 `Basic Report` 提取 4 个目标列

2. 提取任务创建
- `HIL 测试用例 + Excel` 能成功创建文档提取任务

3. 资产落盘
- 提取结果能写成 `模块名-HIL测试用例.md`
- 角色为 `extracted_hil_test_case`

4. 前端可见性
- 文档提取页可上传 Excel
- 任务完成后可直接预览 Markdown

## 后续扩展

等更多 Excel 范例到位后，再补：

- 多模板表头兼容
- `xls/csv` 稳定支持
- 批量工作表导入策略
- 更贴近 Polarion 的导出/回看格式
