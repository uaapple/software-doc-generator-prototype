# V2L软件需求

## 文档信息
- 项目名称：VCU / V2L
- 文档类型：software_requirement
- 领域：embedded_vcu
- 来源说明：迁移自旧版 Torque Intervention Trial，并附带 2026-04-04 的 Skill Refinement case / run 摘要。
- 源文件：pasted-image-1776928642679.png

## 章节结构
### 5.6.1 V2L
- CheryVCU-4762 - 插放电枪入P

## 需求条目
### 5.6.1 V2L
#### CheryVCU-4762 - 插放电枪入P
当同时满足以下条件时，若此时档位非P，则执行入P动作，并请求EPB拉起VCU_EPBActReq==0x1 Apply Request，
VCU_EPBActReqVal==0X1 valid；若此时处于P挡，则禁止切入其他档位，即<退出P挡标志位> Inactive

1.电源ON挡;
2.车速ESC_VehiclESCspeed≤3km/h，且有效ESC_VehiclSpeedInvalid=0x1 Valid;
3.检测逆变枪已连接OBC2_St_DischargerConnection= 0x1: Connected

## 提炼摘要
- 提取到 1 个章节：5.6.1 V2L。
- 提取到 1 条需求：CheryVCU-4762 - 插放电枪入P。
- 保留了原文中的编号、信号名、状态值与条件列表。