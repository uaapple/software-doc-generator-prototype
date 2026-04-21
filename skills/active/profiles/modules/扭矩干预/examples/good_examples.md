# Good Examples

### MOD-扭矩干预-good_example-001 ESC干预前轴激活标志位判断
当满足以下任一条件时，ESC干预前轴激活标志位置为 active：1. ESC 降扭请求前电机降扭有效 ESC_TqDecReqAct_F = 0x1，且前电机降扭请求标志位激活；2. 前轴制动再生活跃 ESC_EHB_RBS_F_Active = 0x1，且前轴制动再生扭矩请求标志位激活；3. 前驱电机增扭请求标志位 ESC_TrqIncReqActv_F = 0x1，且前电机升扭请求标志位激活。否则，ESC干预前轴激活标志位置为 inactive。对降扭、升扭和制动再生请求还应结合 ESC 扭矩干预低阈值和高阈值进行有效性判断。


### MOD-扭矩干预-good_example-002 ESC干预前轴扭矩计算
ESC干预前轴扭矩的计算应按以下优先级顺序展开：前轴升扭请求 > 前轴降扭请求 > 主动制动 > ADAS 的 VLC 工况 > RBS。当当前前轴升扭请求标志位置为 active 时，ESC干预前轴目标扭矩 ESCWhlTq_tqTarFrntAxle = 前驱电机增扭请求 ESC_TrqIncReq_F；当前前轴降扭请求标志位置为 active 时，ESCWhlTq_tqTarFrntAxle = ESC 前电机降扭请求 ESC_TqDecReq_F；当满足 AEB 激活或 CDP 激活任一条件时，ESCWhlTq_tqTarFrntAxle = 0；当 APA 激活或 ACC 激活，且 VLC 扭矩控制激活 ESC_VLC_TorqCtrlActive 时，ESCWhlTq_tqTarFrntAxle = 扭矩仲裁后前轴目标扭矩 TqSpltArbt_tqTarFrntAxle；当前轴制动再生扭矩请求标志位激活且 VehCfg_stRBCCtrlModeSel = 0x3 ESPCtrlSplt 时，ESCWhlTq_tqTarFrntAxle = min(TqSpltArbt_tqTarFrntAxle + ESC_EHB_RBS_F_TargetRegenTrq, 0)；当前轴制动再生扭矩请求标志位激活且 VehCfg_stRBCCtrlModeSel != 0x3 ESPCtrlSplt 时，ESCWhlTq_tqTarFrntAxle = min(TqSpltArbt_tqTarFrntAxle, 0)；当前轴制动再生扭矩请求标志位未激活时，ESCWhlTq_tqTarFrntAxle = TqSpltArbt_tqTarFrntAxle。注：ESC干预前轴目标扭矩需经过前轴最大扭矩和前轴最小扭矩限制后得到。


### MOD-扭矩干预-good_example-003 ESC干预后轴激活标志位判断
当满足以下任一条件时，ESC干预后轴激活标志位置为 active：1. ESC 降扭请求后电机降扭有效 ESC_TqDecReqAct_R = 0x1，且后电机降扭请求标志位激活；2. 后轴制动再生活跃 ESC_EHB_RBS_R_Active = 0x1，且后轴制动再生扭矩请求标志位激活；3. 后驱电机增扭请求标志位 ESC_TrqIncReqActv_R = 0x1，且后电机升扭请求标志位激活。否则，ESC干预后轴激活标志位置为 inactive。对降扭、升扭和制动再生请求还应结合 ESC 扭矩干预低阈值和高阈值进行有效性判断。


### MOD-扭矩干预-good_example-004 ESC干预后轴扭矩计算
ESC干预后轴扭矩的计算应按以下优先级顺序展开：后轴升扭请求 > 后轴降扭请求 > 主动制动 > ADAS 的 VLC 工况 > RBS。当当前后轴升扭请求标志位置为 active 时，ESC干预后轴目标扭矩 ESCWhlTq_tqTarReAxle = 后驱电机增扭请求 ESC_TrqIncReq_R；当前后轴降扭请求标志位置为 active 时，ESCWhlTq_tqTarReAxle = ESC 后电机降扭请求 ESC_TqDecReq_R；当满足 AEB 激活或 CDP 激活任一条件时，ESCWhlTq_tqTarReAxle = 0；当 APA 激活或 ACC 激活，且 VLC 扭矩控制激活 ESC_VLC_TorqCtrlActive 时，ESCWhlTq_tqTarReAxle = 扭矩仲裁后后轴目标扭矩 TqSpltArbt_tqTarReAxle；当前轴制动再生扭矩请求标志位激活且 VehCfg_stRBCCtrlModeSel = 0x3 ESPCtrlSplt 时，ESCWhlTq_tqTarReAxle = min(TqSpltArbt_tqTarReAxle + ESC_EHB_RBS_R_TargetRegenTrq, 0)；当前轴制动再生扭矩请求标志位激活且 VehCfg_stRBCCtrlModeSel != 0x3 ESPCtrlSplt 时，ESCWhlTq_tqTarReAxle = min(TqSpltArbt_tqTarReAxle, 0)；当前轴制动再生扭矩请求标志位未激活时，ESCWhlTq_tqTarReAxle = TqSpltArbt_tqTarReAxle。注：ESC干预后轴目标扭矩需经过后轴最大扭矩和后轴最小扭矩限制后得到。


### MOD-扭矩干预-good_example-005 ESP干预前轴状态判断
当满足以下任意条件时，<前轴扭矩干预激活标志位>为1：1. <前轴RBS扭矩激活标志位>为1，且<RBS需求前轴扭矩>位于tqESCIntvMin与tqESCIntvMax之间；2. <前轴降扭激活标志位>为1，且<前轴降扭目标扭矩>位于tqESCIntvMin与tqESCIntvMax之间；3. <前轴升扭激活标志位>为1，且<前轴升扭目标扭矩>位于tqESCIntvMin与tqESCIntvMax之间。否则，<前轴扭矩干预激活标志位>为0。


### MOD-扭矩干预-good_example-006 ESP干预前轴扭矩计算
当前轴升扭干预激活=1时，<ESC干预后的前轴目标扭矩>=<前轴升扭目标扭矩>；否则，当降扭干预激活=1时，<ESC干预后的前轴目标扭矩>=<前轴降扭目标扭矩>；否则，当AEB/CDP等任一主动安全功能激活时，<ESC干预后的前轴目标扭矩>=0；否则，当APA或ACC激活且<泊车请求扭矩有效>=1时，<ESC干预后的前轴目标扭矩>=<仲裁后的前轴目标扭矩>；否则，当RBS干预激活且<RBC控制模式状态>=VehCfg_stRBCCtrlModeESPCtrlSplt_SC(3)时，<ESC干预后的前轴目标扭矩>=min(<ESC干涉的滑行回收前轴目标扭矩>+<RBS需求前轴扭矩>,0)；当RBC控制模式不为该值时，<ESC干预后的前轴目标扭矩>=min(<仲裁后的前轴目标扭矩>,0)；否则承接<仲裁后的前轴目标扭矩>。其中，<ESC干涉的滑行回收前轴目标扭矩>需根据前轴RBS激活状态和上一时刻量计算。注：结果需经过前轴最大/最小允许扭矩限制。


### MOD-扭矩干预-good_example-007 计算前轴仅RBS激活标志位
当以下条件全部满足时，将<前轴仅RBS激活标志位>置1，否则置0：1. [前轴升扭干预激活]=0；2. [前轴降扭干预激活]=0；3. <ABS激活标志位>、<EBD激活标志位>、<AEB激活标志位>、<CDP激活标志位>全部为0；4. [前轴RBS干预激活]=0；5. <APA激活标志位>且<ACC激活标志位>为0，或<泊车请求扭矩有效>为0。


### MOD-扭矩干预-good_example-008 ESP干预后轴状态判断
当满足以下任意条件时，<后轴扭矩干预激活标志位>为1：1. <后轴RBS扭矩激活标志位>为1，且<RBS需求后轴扭矩>位于tqESCIntvMin与tqESCIntvMax之间；2. <后轴降扭激活标志位>为1，且<后轴降扭目标扭矩>位于tqESCIntvMin与tqESCIntvMax之间；3. <后轴升扭激活标志位>为1，且<后轴升扭目标扭矩>位于tqESCIntvMin与tqESCIntvMax之间。否则，<后轴扭矩干预激活标志位>为0。


### MOD-扭矩干预-good_example-009 ESP干预后轴扭矩计算
当后轴升扭干预激活=1时，<ESC干预后的后轴目标扭矩>=<后轴升扭目标扭矩>；否则，当降扭干预激活=1时，<ESC干预后的后轴目标扭矩>=<后轴降扭目标扭矩>；否则，当AEB/CDP等任一主动安全功能激活时，<ESC干预后的后轴目标扭矩>=0；否则，当APA或ACC激活且<泊车请求扭矩有效>=1时，<ESC干预后的后轴目标扭矩>=<仲裁后的后轴目标扭矩>；否则，当RBS干预激活且<RBC控制模式状态>=VehCfg_stRBCCtrlModeESPCtrlSplt_SC(3)时，<ESC干预后的后轴目标扭矩>=min(<ESC干涉的滑行回收后轴目标扭矩>+<RBS需求后轴扭矩>,0)；当RBC控制模式不为该值时，<ESC干预后的后轴目标扭矩>=min(<仲裁后的后轴目标扭矩>,0)；否则承接<仲裁后的后轴目标扭矩>。其中，<ESC干涉的滑行回收后轴目标扭矩>需根据后轴RBS激活状态和上一时刻量计算。注：结果需经过后轴最大/最小允许扭矩限制。


### MOD-扭矩干预-good_example-010 计算后轴仅RBS激活标志位
当以下条件全部满足时，将<后轴仅RBS激活标志位>置1，否则置0：1. [后轴升扭干预激活]=0；2. [后轴降扭干预激活]=0；3. <ABS激活标志位>、<EBD激活标志位>、<AEB激活标志位>、<CDP激活标志位>全部为0；4. [后轴RBS干预激活]=0；5. <APA激活标志位>且<ACC激活标志位>为0，或<泊车请求扭矩有效>为0。
