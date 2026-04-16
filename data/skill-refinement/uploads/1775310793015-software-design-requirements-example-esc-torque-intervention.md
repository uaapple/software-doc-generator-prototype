# 软件设计需求示例：ESC前后轴扭矩干预

## 文档信息

- 文档类型：软件设计需求示例
- 领域：嵌入式 VCU
- 语言：中文
- 版本：v1
- 来源：预期输出示例图片，人工提取整理
- 整理日期：2026-04-04

## 章节结构

- `3.31` 扭矩干预功能
- `3.31.1` ESC前轴扭矩干预
- `3.31.2` ESC后轴扭矩干预

## 需求条目

### SMiVCU-10160

- 状态：`released`
- 所属章节：`3.31.1`
- 主题：ESC干预前轴激活标志位判断
- 类型：激活标志位逻辑
- 触发条件（任一满足）：
  - `ESC_TqDecReqAct_F = 0x1`，且前电机降扭请求标志位激活
  - `ESC_EHB_RBS_F_Active = 0x1`，且前轴制动再生扭矩请求标志位激活
  - `ESC_TrqIncReqActv_F = 0x1`，且前电机升扭请求标志位激活
- 输出行为：
  - `ESC干预前轴激活标志位 = active`
- 否则：
  - `ESC干预前轴激活标志位 = inactive`
- 阈值说明：
  - 当前驱电机增扭请求 `ESC_TrqIncReq_F` 大于 ESC 扭矩干预低阈值，且小于等于 ESC 扭矩干预高阈值时，认为前轴增扭请求标志位激活
  - 当前轴目标制动再生扭矩 `ESC_EHB_RBS_F_TargetRegenTrq` 大于等于 ESC 扭矩干预低阈值，且小于 `0` 时，认为前轴制动再生扭矩请求标志位激活

### SMiVCU-10597

- 状态：`released`
- 所属章节：`3.31.1`
- 主题：ESC干预前轴扭矩计算
- 类型：扭矩计算逻辑
- 优先级顺序：
  - 前轴升扭请求
  - 前轴降扭请求
  - 主动制动
  - ADAS的VLC工况
  - RBS
- 计算分支：
  - 当前轴升扭请求标志位（引用 `SMiVCU-10160`）为 `active` 时：
    `ESCWhlTq_tqTarFrntAxle = ESC_TrqIncReq_F`
  - 当前轴降扭请求标志位（引用 `SMiVCU-10160`）为 `active` 时：
    `ESCWhlTq_tqTarFrntAxle = ESC_TqDecReq_F`
  - 当以下任一条件满足时：
    - `AEB激活（ESC_AEB_Active）`
    - `CDP激活（ESC_CDP_Active）`
    输出：
    `ESCWhlTq_tqTarFrntAxle = 0`
  - 当 APA 或 ACC 激活，且 VLC 扭矩控制激活（`ESC_VLC_TorqCtrlActive`）时：
    `ESCWhlTq_tqTarFrntAxle = TqSpltArbt_tqTarFrntAxle`
    引用：`SMiVCU-9469`
  - 当前轴制动再生扭矩请求标志位激活，且 `VehCfg_stRBCCtrlModeSel = 0x3 ESPCtrlSplt` 时：
    `ESCWhlTq_tqTarFrntAxle = min(TqSpltArbt_tqTarFrntAxle + ESC_EHB_RBS_F_TargetRegenTrq, 0)`
    引用：`SMiVCU-9469`
  - 当前轴制动再生扭矩请求标志位激活，且 `VehCfg_stRBCCtrlModeSel != 0x3 ESPCtrlSplt` 时：
    `ESCWhlTq_tqTarFrntAxle = min(TqSpltArbt_tqTarFrntAxle, 0)`
    引用：`SMiVCU-9469`
  - 当前轴制动再生扭矩请求标志位未激活时：
    `ESCWhlTq_tqTarFrntAxle = TqSpltArbt_tqTarFrntAxle`
    引用：`SMiVCU-9469`
- 注：
  - ESC干预前轴目标扭矩需要经过前轴最大扭矩和前轴最小扭矩限制后得到
  - 限制相关需求引用：`SMiVCU-9477`

### SMiVCU-10161

- 状态：`released`
- 所属章节：`3.31.2`
- 主题：ESC干预后轴激活标志位判断
- 类型：激活标志位逻辑
- 触发条件（任一满足）：
  - `ESC_TqDecReqAct_R = 0x1`，且后电机降扭请求标志位激活
  - `ESC_EHB_RBS_R_Active = 0x1`，且后轴制动再生扭矩请求标志位激活
  - `ESC_TrqIncReqActv_R = 0x1`，且后电机升扭请求标志位激活
- 输出行为：
  - `ESC干预后轴激活标志位 = active`
- 否则：
  - `ESC干预后轴激活标志位 = inactive`
- 阈值说明：
  - 当后驱电机增扭请求 `ESC_TrqIncReq_R` 大于 ESC 扭矩干预低阈值，且小于等于 ESC 扭矩干预高阈值时，认为后轴增扭请求标志位激活
  - 当后轴目标制动再生扭矩 `ESC_EHB_RBS_R_TargetRegenTrq` 大于等于 ESC 扭矩干预低阈值，且小于 `0` 时，认为后轴制动再生扭矩请求标志位激活

### SMiVCU-10598

- 状态：`released`
- 所属章节：`3.31.2`
- 主题：ESC干预后轴扭矩计算
- 类型：扭矩计算逻辑
- 优先级顺序：
  - 后轴升扭请求
  - 后轴降扭请求
  - 主动制动
  - ADAS的VLC工况
  - RBS
- 计算分支：
  - 当后轴升扭请求标志位（引用 `SMiVCU-10161`）为 `active` 时：
    `ESCWhlTq_tqTarReAxle = ESC_TrqIncReq_R`
  - 当后轴降扭请求标志位（引用 `SMiVCU-10161`）为 `active` 时：
    `ESCWhlTq_tqTarReAxle = ESC_TqDecReq_R`
  - 当以下任一条件满足时：
    - `AEB激活（ESC_AEB_Active）`
    - `CDP激活（ESC_CDP_Active）`
    输出：
    `ESCWhlTq_tqTarReAxle = 0`
  - 当 APA 或 ACC 激活，且 VLC 扭矩控制激活（`ESC_VLC_TorqCtrlActive`）时：
    `ESCWhlTq_tqTarReAxle = TqSpltArbt_tqTarReAxle`
    引用：`SMiVCU-9469`
  - 当后轴制动再生扭矩请求标志位激活，且 `VehCfg_stRBCCtrlModeSel = 0x3 ESPCtrlSplt` 时：
    `ESCWhlTq_tqTarReAxle = min(TqSpltArbt_tqTarReAxle + ESC_EHB_RBS_R_TargetRegenTrq, 0)`
    引用：`SMiVCU-9469`
  - 当后轴制动再生扭矩请求标志位激活，且 `VehCfg_stRBCCtrlModeSel != 0x3 ESPCtrlSplt` 时：
    `ESCWhlTq_tqTarCstRgnReAxle = min(TqSpltArbt_tqTarReAxle, 0)`
    引用：`SMiVCU-9469`
  - 当后轴制动再生扭矩请求标志位未激活时：
    `ESCWhlTq_tqTarReAxle = TqSpltArbt_tqTarReAxle`
    引用：`SMiVCU-9469`
- 注：
  - ESC干预后轴目标扭矩需要经过后轴最大扭矩和后轴最小扭矩限制后得到
  - 限制相关需求引用：`SMiVCU-9477`

## 提炼摘要

- 主主题：将扭矩干预功能细化为前轴/后轴对称的软件设计需求
- 结构特征：
  - 采用 `3.31 -> 3.31.1 / 3.31.2` 的多级章节结构
  - 前后轴需求按相同模式展开
  - 先定义激活标志位判断，再定义扭矩计算逻辑
  - 通过内部引用保证设计需求之间的一致性
  - 信号、内部变量、控制模式和边界限制均显式写出
