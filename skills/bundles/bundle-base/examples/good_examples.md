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
