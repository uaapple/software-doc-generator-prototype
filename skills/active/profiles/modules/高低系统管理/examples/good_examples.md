# Good Examples

### MOD-高低系统管理-good_example-001 本地KL15上高压请求激活判断
HCU应根据VCCM控制器的KL15上拉状态或ZCU发送的Powerup信号标志位，判断本地KL15上高压请求是否被激活。


### MOD-高低系统管理-good_example-002 本地KL15上高压建立流程
当HCU确定整车高压需求后，应向BMS发送高压连通请求以闭合主高压回路；在确认高压回路连通后，请求高压附件使能及DCDC进入Buck状态，并最终判定整车上高压成功。
