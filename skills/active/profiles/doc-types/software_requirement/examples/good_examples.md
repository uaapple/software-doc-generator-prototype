# Good Examples

## 扭矩干预

### DOC-software_requirement-good_example-001 ESC干预前轴激活标志位判断
当满足以下任一条件时，ESC干预前轴激活标志位置为 active：ESC_TqDecReqAct_F = 0x1 且前电机降扭请求标志位激活，或 ESC_EHB_RBS_F_Active = 0x1 且前轴制动再生扭矩请求标志位激活，或 ESC_TrqIncReqActv_F = 0x1 且前电机升扭请求标志位激活。否则，ESC干预前轴激活标志位置为 inactive。对升扭、降扭和制动再生请求还应结合低/高阈值进行有效性判断。


## 充电管理

### DOC-software_requirement-good_example-002 充电过程 - 充电截止SOC
当 ICM 或 TCP 下发新的充电截止SOC且该值不等于 112 时，VCU 应更新截止SOC并反馈状态；当表显SOC大于等于截止点时，应发送充电停止请求；当表显SOC小于截止点减 1%，或交流枪/直流枪重新连接时，应重新开始截止判断。


## 高低系统管理

### DOC-software_requirement-good_example-003 本地KL15上高压建立流程
当HCU确定整车高压需求后，应向BMS发送高压连通请求以闭合主高压回路；在确认高压回路连通后，请求高压附件使能及DCDC进入Buck状态，并最终判定整车上高压成功。


## 高压能量管理

### DOC-software_requirement-good_example-004 动力电池可用放电功率计算
VCU 内部对动力电池可用放电功率应优先采用 BMS 10s 可用放电功率（BMS4_N_SOF10D），并在此基础上结合 SOC 保护、预留功率及低 SOC 限制进行修正；在怠速发电和行车发电场景下，当动力电池 SOC 大于默认 6% 时，应按 BMS 10s 可用放电功率减去默认 3kW 预留功率计算；当 SOC 低于默认 6% 时，应随 SOC 下降逐步降低，并在 3% 以下限制为 3kW。
