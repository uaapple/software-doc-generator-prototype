# Good Examples

### MOD-充电管理-good_example-001 充电过程堵转加热模式
当 ECC_StallHeatingReq = ON、DC充电枪已连接、车辆处于P挡、车速低于允许阈值、电池处于DC Charge状态，且 RMCU 堵转加热状态不处于 Heating Failed / Heating Over 时，VCU 应发送堵转加热请求 VCU2_St_StallHeatingReq = Request，并发送后驱模式请求 VCU82_St_RModeReq = TrqCtl。若请求发出 2s 后 RMCU2_St_StallHeating 仍未进入 Heating，则应撤销该请求。


### MOD-充电管理-good_example-002 充电截止SOC
当 ICM 或 TCP 下发新的充电截止SOC且该值不等于 112 时，VCU 应更新截止SOC并反馈状态；当表显SOC大于等于截止点时，应发送充电停止请求；当表显SOC小于截止点减 1%，或交流枪/直流枪重新连接时，应重新开始截止判断。


### MOD-充电管理-good_example-003 充电截止SOC记忆
VCU 应对当前充电截止SOC值进行下电记忆；若 ICM 或 TCP 设置值更新，应在本次循环生效，并在下次下电时继续保存该值。若记忆值无效或超出 50%-100% 范围，则应回退为默认有效值。


### MOD-充电管理-good_example-004 后电机堵转加热请求
当满足以下所有条件时，右后电机堵转加热请求为1，否则，右后电机堵转加热请求为0：1. 后电机堵转加热激活请求为1；2. 后电机堵转加热故障为0。其中，[后电机堵转加热激活请求]控制计算如下，当满足以下所有条件时，[后电机堵转加热激活请求]为1，否则，[后电机堵转加热激活请求]为0：1. 充电状态激活为1；2. <VCU内部驾驶员挡位状态>等于GearLvr_stDrvGearP_SC（6）；3. <实际车速>小于一定值vMax4MCUPlsHeatgEna；4. <电池状态>等于BMS1_stBattMdDCChrg（8）；5. <电机堵转加热需求>等于1；6. 后电机堵转加热状态不等于RMCU_stStalHeatg_HeatgFaild_SC（3），且不等于RMCU_stStalHeatg_HeatgOver_SC（2）。其中，[后电机堵转加热故障]控制计算如下，当满足以下条件时，右后电机堵转加热故障为1，否则，[后电机堵转加热故障]为0：1. 后电机堵转加热激活请求为1，且激活时间大于等于一定值tiMCUStalHeatgFlt_C；2. 后电机堵转加热状态不等于RMCU_stStalHeatg_Heatg_SC（1）。


### MOD-充电管理-good_example-005 AC充电联接至充满标志位
以下条件同时满足，则[AC充电联接至充满标志位]状态值为1：1. [AC充电联接至充满退出标志位]为0；2. [AC充电联接至充满电池状态位]为0；3. <AC充电联接OK标志位>为1；4. <AC充电充满标志位>为1。


### MOD-充电管理-good_example-006 DC充电联接至充满标志位
以下条件同时满足，则[DC充电联接至充满标志位]状态值为1：1. [DC充电联接至充满退出标志位]为0；2. [DC充电联接至充满电池状态位]为0；3. <DC充电联接OK标志位>为1；4. <DC充电充满标志位>为1。
