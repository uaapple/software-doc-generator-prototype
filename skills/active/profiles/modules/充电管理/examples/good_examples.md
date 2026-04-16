# Good Examples

### MOD-充电管理-good_example-001 充电过程堵转加热模式
当 ECC_StallHeatingReq = ON、DC充电枪已连接、车辆处于P挡、车速低于允许阈值、电池处于DC Charge状态，且 RMCU 堵转加热状态不处于 Heating Failed / Heating Over 时，VCU 应发送堵转加热请求 VCU2_St_StallHeatingReq = Request，并发送后驱模式请求 VCU82_St_RModeReq = TrqCtl。若请求发出 2s 后 RMCU2_St_StallHeating 仍未进入 Heating，则应撤销该请求。


### MOD-充电管理-good_example-002 充电截止SOC
当 ICM 或 TCP 下发新的充电截止SOC且该值不等于 112 时，VCU 应更新截止SOC并反馈状态；当表显SOC大于等于截止点时，应发送充电停止请求；当表显SOC小于截止点减 1%，或交流枪/直流枪重新连接时，应重新开始截止判断。


### MOD-充电管理-good_example-003 充电截止SOC记忆
VCU 应对当前充电截止SOC值进行下电记忆；若 ICM 或 TCP 设置值更新，应在本次循环生效，并在下次下电时继续保存该值。若记忆值无效或超出 50%-100% 范围，则应回退为默认有效值。
