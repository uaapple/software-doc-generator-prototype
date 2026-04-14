# 正例

0. 在“扭矩干预功能”领域，优先形成如下骨架：
   - `扭矩干预功能`
   - `ESC前轴扭矩干预`
   - `SMiVCU-10160 ESC干预前轴激活标志位判断`
   - `SMiVCU-10597 ESC干预前轴扭矩计算`
   - `ESC后轴扭矩干预`
   - `SMiVCU-10161 ESC干预后轴激活标志位判断`
   - `SMiVCU-10598 ESC干预后轴扭矩计算`
原因：这体现了目标样例最核心的结构、粒度和对称展开方式。

1. 当 `ESC_TqDecReqAct_F = 0x1` 且前电机降扭请求标志位激活时，软件应将 `ESC干预前轴激活标志位` 置为 `active`；否则置为 `inactive`。
原因：条件、输出状态和否则路径完整，适合激活标志位类需求。

2. ESC干预前轴扭矩的优先级顺序应为：前轴升扭请求 > 前轴降扭请求 > 主动制动 > ADAS的VLC工况 > RBS。
原因：显式给出仲裁优先级，适合多源请求类需求。

3. 当 `ESC_AEB_Active` 或 `ESC_CDP_Active` 激活时，`ESCWhlTq_tqTarFrntAxle` 应输出为 `0`。
原因：对象、触发条件和输出结果明确，且保留了工程信号与内部变量命名。

4. 当 `VehCfg_stRBCCtrlModeSel = 0x3 ESPCtrlSplt` 且前轴制动再生扭矩请求标志位激活时，`ESCWhlTq_tqTarFrntAxle` 应等于 `TqSpltArbt_tqTarFrntAxle + ESC_EHB_RBS_F_TargetRegenTrq` 与 `0` 取小值。
原因：分支条件、控制模式、计算关系和边界处理都清晰。

5. ESC干预前轴目标扭矩应经过前轴最大扭矩和前轴最小扭矩限制后得到，相关限制引用 `SMiVCU-9477`。
原因：保留边界限制和内部引用，符合可追溯、一致性的写法。

6. `ESC后轴扭矩干预 - 激活标志位判断：当满足以下任一条件时，ESC干预后轴激活标志位置为 active，否则置为 inactive：1. ... 2. ... 3. ...`
原因：标题显式保留层级归属，且后轴需求独立成条，不与前轴合并。

7. `ESC后轴扭矩干预 - 扭矩计算：当 AEB 或 CDP 激活时，ESCWhlTq_tqTarReAxle = 0；当 APA 或 ACC 激活且 VLC 扭矩控制激活时，ESCWhlTq_tqTarReAxle = TqSpltArbt_tqTarReAxle；注：输出需经过后轴最大/最小扭矩限制。`
原因：保留了对象、分支、内部变量和边界说明，接近详细设计条目。

8. 在“充电管理”领域，优先形成如下骨架：
   - `充电过程`
   - `CheryVCU-3015 充电过程堵转加热模式`
   - `CheryVCU-8102 充电截止SOC`
   - `CheryVCU-12147 充电截止SOC记忆`
原因：这体现了当前样例最核心的控制主题，先抓系统需求显式给出的三条主线。

9. 当 `ECC_StallHeatingReq = 0x1: ON`、`BMS3_St_DCChargePlugin = 0x1: Connected`、车辆处于 `P` 挡且车速小于 `3 km/h`、`BMS1_St_BatteryMode = 0x4: DC Charge`，并且 `RMCU2_St_StallHeating` 不处于 `Heating Failed` 和 `Heating Over` 时，VCU 应发送 `VCU2_St_StallHeatingReq = 0x1: Request` 和 `VCU82_St_RModeReq = 0x1: TrqCtl`。
原因：输入条件、模式切换和输出请求都明确，适合充电过程中的堵转加热模式需求。

10. 若堵转加热请求发出 `2s` 后，`RMCU2_St_StallHeating != 0x1: Heating`，VCU 应撤销堵转加热请求，并将 `VCU2_St_StallHeatingReq` 置为 `0x0: No Request`。
原因：保留超时阈值和保护动作，符合“条件 + 时序 + 输出”的设计需求写法。

11. 当 `ICM_Chg_SOC_LimitPointSet` 或 `TCP_Chg_SOC_LimitPointSet` 发生变化且不等于 `112` 时，VCU 应更新充电截止SOC，并反馈 `VCU_Chg_SOC_LimitSts`；当表显SOC大于等于截止点时，VCU 应发送 `VCU1_St_ChrStopRequest`。
原因：设置输入、无效值过滤、状态反馈和停止动作被完整保留，适合截止SOC控制需求。

12. 当表显SOC小于截止SOC减 `1%`，或交流枪 `OBC1_St_ChargerConnection = 0x1: Connected` 上升沿，或直流枪 `BMS3_St_DCChargePlugin = 0x1: Connected` 上升沿时，VCU 应重新开始截止判断。
原因：恢复条件和滞回逻辑被明确展开，避免把“恢复充电”写成模糊描述。

13. VCU 应对当前充电截止SOC值进行下电记忆；若 ICM 或 TCP 设置值更新，应在本次循环生效，并在下次下电时继续保存该值。
原因：把“设置更新”和“持久化记忆”拆成单独设计主题，接近当前样例的粒度。
