# V2L系统需求文档

## 文档信息
- 项目名称：VCU / V2L
- 文档类型：system_requirement
- 语言：zh-CN
- 来源文件：pasted-image-1776928105935.png
- 来源说明：迁移自旧版 Torque Intervention Trial，并附带 2026-04-04 的 Skill Refinement case / run 摘要。
- 识别状态：draft

## 章节信息
- 需求条目：CheryVCU-1191

## 需求条目
### CheryVCU-1191
当同时满足以下条件时，HCU则执行挡位入P动作，若当前挡位为非P挡，则HCU控制入P，请求EPB拉紧，若当前已处于P挡，则保持禁止切入其他挡位。
1.电源ON挡;
2.车速≤3km/h，且有效Valid;
3.检测逆变枪已连接 0x1： Connected

## 提炼摘要
- 识别到 1 条系统需求：CheryVCU-1191。
- 需求内容围绕满足指定条件时的入P控制逻辑及EPB请求。
- 图片中可见状态标记：draft。