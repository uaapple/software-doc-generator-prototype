# 软件设计需求示例：充电管理

## 文档信息

- 文档类型：软件设计需求示例
- 领域：嵌入式 VCU
- 语言：中文
- 版本：v1
- 来源：`AI case_ITK_20260411.docx` 中 `充电管理(20260410新增) -> 输出：软件需求` 图片，人工提取整理
- 整理日期：2026-04-14

## 章节结构

- `5.3.2` 充电过程

## 需求条目

### CheryVCU-3015

- 状态：`released`
- 所属章节：`5.3.2`
- 主题：充电过程堵转加热模式
- 原文：
  若 ECC 有堵转加热请求（`ECC_StallHeatingReq=0x1: ON`），VCU 满足以下条件则发送堵转加热请求（`VCU2_St_StallHeatingReq=0x1: Request`）和 Trq 模式（`VCU82_St_RModeReq=0x1: TrqCtl`）给 RMCU：
  1. DC 充电枪已连接（`BMS3_St_DCChargePlugin = 0x1: Connected`）；
  2. 当前挡位为 `P` 挡（`VCU1_N_ActualGear=0x1: P`）且车辆处于停车状态（`ESC_VehiclESCspeed < 3km/h`）；
  3. 电池处于 DC 充电状态（`BMS1_St_BatteryMode = 0x4: DC Charge`）；
  4. ECC 有堵转加热需求（`ECC_StallHeatingReq=0x1: ON`）；
  5. RMCU 反馈的堵转加热状态正常（`RMCU2_St_StallHeating` 状态不为 `0x3: Heating Failed` 且 `0x2: Heating Over`）。
  MCU 收到请求后进入 Torque 模式启动堵转加热并反馈状态（`RMCU2_St_StallHeating`，`RMCU1_St_RMCUMode`），开始加热电池。
  若 2s 后 MCU 无法正常进入堵转加热（`RMCU2_St_StallHeating ≠ 0x1: Heating`），VCU 收回信号停止堵转加热请求（`VCU2_St_StallHeatingReq = 0x0: No Request`）。

### CheryVCU-8102

- 状态：`released`
- 所属章节：`5.3.2`
- 主题：充电截止SOC
- 原文：
  VCU 接受大屏（`ICM_Chg_SOC_LimitPointSet`）或远程（`TCP_Chg_SOC_LimitPointSet`）的充电 SOC 截止点并记忆，当大屏（`ICM_Chg_SOC_LimitPointSet`）或远程（`TCP_Chg_SOC_LimitPointSet`）发来得 SOC 限值有变化并且不是 `112`（Invalid 值）时，VCU 应当将此值更新为充电 SOC 上限值，并将此 SOC 值重新反馈大屏（`VCU_Chg_SOC_LimitSts`）；
  在 AC/DC 充电过程中，若表显 SOC（`BMS2_N_SOC`）不小于充电截止 SOC，则 VCU 发送充电截至信号（`VCU1_St_ChrStopRequest`），否则当表显 SOC 值小于充电截至 SOC 减去 `1%`（可标定）或重新插枪（`OBC1_St_ChargerConnection=0x1: Connected` 上升沿或 `BMS3_St_DCChargePlugin=0x1: Connected` 上升沿）时，将重新判断。

### CheryVCU-12147

- 状态：`released`
- 所属章节：`5.3.2`
- 主题：充电截止SOC记忆
- 原文：
  VCU 应当每次下电时记忆当前设置得充电截止 SOC 值，若 ICM 或 TCP 有设置值更新时，应及时进行更新，更新值在本次驾驶循环使用，并在下次下电记忆。

## 提炼摘要

- 主主题：充电管理的输出软件需求围绕堵转加热模式、充电截止SOC和截止值记忆展开
- 结构特征：
  - 统一归属在 `5.3.2 充电过程`
  - 每条需求直接保留原图中的信号名、状态值和阈值描述
  - 以图片原文为准，不引入代码侧补充解释
