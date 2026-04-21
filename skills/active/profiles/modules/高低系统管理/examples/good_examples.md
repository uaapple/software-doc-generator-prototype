# Good Examples

### MOD-高低系统管理-good_example-001 本地KL15上高压请求激活判断
HCU应根据VCCM控制器的KL15上拉状态或ZCU发送的Powerup信号标志位，判断本地KL15上高压请求是否被激活。


### MOD-高低系统管理-good_example-002 本地KL15上高压建立流程
当HCU确定整车高压需求后，应向BMS发送高压连通请求以闭合主高压回路；在确认高压回路连通后，请求高压附件使能及DCDC进入Buck状态，并最终判定整车上高压成功。


### MOD-高低系统管理-good_example-003 KeyOn高压请求标志位
以下条件同时满足，则激活[KeyOn高压请求标志位]：1. <整车电源模式>为0x1：On，TurnOnDelay一定时间tiKeyOnDly出现上升沿，则激活并锁存；2. <电池SOC>大于等于pctBatSOCLim4Shut或<电池最大放电功率>大于等于pwrBatDChrgLim4Shut。若<高压下电指令>为1且TurnOnDelay一定时间tiPwrOffDly4RstKeyOn，或<整车电源模式>为0x0：off，或当前时刻<高压系统状态>在115~130之间出现上升沿，则Reset。


### MOD-高低系统管理-good_example-004 本地KL15上高压建立流程
当本地KL15上高压请求成立且整车存在高压需求时，HCU应向BMS发送高压连通请求，由BMS执行预充并闭合主高压回路。HCU应结合主回路正负继电器状态、MCU母线电压和ISG母线电压联合判断高压回路是否连通；当高压回路连通后，请求高压附件使能，并请求DCDC进入Buck状态；当DCDC进入Buck且高压系统满足Ready判定条件后，置HvReady有效。
