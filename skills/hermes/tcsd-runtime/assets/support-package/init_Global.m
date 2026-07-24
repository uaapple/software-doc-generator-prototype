%% Initialize Global constants 

TaskTime_10ms = single(0.01);
TaskTime_100ms = single(0.1);
TaskTime_1s = single(1);
TaskTime_10s = single(10);
Glb_TaskTime10ms_SC = single(0.01);

Glb_rpm2radps_SC = single(2*pi/60);
Glb_mps2kph_SC = single(3.6);
Glb_rad2deg_SC = single(180/pi);
Glb_GrvyAccrn_SC = single(9.8);
rpm2radps = single(2*pi/60);
mps2kph = single(3.6);
rad2deg = single(180/pi);

%% vehicle parameters
Glb_DstCentdToFrntAxle_SC = single(1.5); % The distance from centroid to front axle, unit: m
Glb_DstCentdToReAxle_SC = single(1.265); % The distance from centroid to rear axle, unit: m
Glb_DstWhl_SC = single(1.587); % The distance between left front wheel to right front wheel, unit: m
Glb_DstWhlBase_SC = single(2.765); % The distance between left front wheel to right front wheel, unit: m
Glb_VehCurbMass_SC = single(2120); % The curb mass of the vehicle, unit: m
Glb_CentdHgt_SC = single(0.5); % The centroid height, unit: m
Glb_WhlRollgRd_SC = single(0.36); % The rolling radius of wheel, unit: m
Glb_WhlRollgInertia_SC = single(17.7); % The rolling inertia of wheel, unit: kg*m2
Glb_VehRollgInertia_SC = single(750); % The rolling inertia of vehicle, unit: kg*m2
Glb_kwh2ws_SC = single(3600000);
%% DCDC actual mode Status
DCDCActSt_init = uint8(0);
DCDCActSt_disconnected = uint8(1);
DCDCActSt_connected = uint8(2);
DCDCActSt_buck = uint8(3);
DCDCActSt_failure = uint8(4);

%% DCDC request mode Status
DCDCReqSt_init = uint8(0);
DCDCReqSt_standby = uint8(1);
DCDCReqSt_buck = uint8(2);
DCDCReqSt_service = uint8(4);

%% EPB actual status
EPBActSt_Rlsd_SC = uint8(0);
EPBActSt_Appld_SC = uint8(1);
EPBActSt_Rlsg_SC = uint8(2);
EPBActSt_Flt = uint8(3);
EPBActSt_Applyg = uint8(4);
EPBActSt_Disengaged = uint8(5);

%% AVH actual status
AVHActSt_Off_SC = uint8(0);
AVHActSt_Stb_SC = uint8(1);
AVHActSt_Actv_SC = uint8(2);

%% TBOX Book Charge status
TboxBookChrgSt_NotBooking = uint8(0);
TboxBookChrgSt_NotStrtCycle = uint8(1);
TboxBookChrgSt_InCycle = uint8(2);
TboxBookChrgSt_NotStrtSingle = uint8(3);
TboxBookChrgSt_InSingle = uint8(4);
TboxBookChrgSt_EndSingle = uint8(5);

%% BMS actual operation status 
BMSActSt_undefined = uint8(0);
BMSActSt_offline = uint8(1);
BMSActSt_prechrg = uint8(2);
BMSActSt_connect = uint8(3);
BMSActSt_online = uint8(4);
BMSActSt_wait = uint8(5);
BMSActSt_disconnect = uint8(6);
BMSActSt_DCChrg = uint8(8);
BMSActSt_ACChrg = uint8(9);
BMSActSt_EmergencyDisconnect = uint8(10);
BMSActSt_service = uint8(14);

%% BMS  states target request
BMSReqSt_init = uint8(0);
BMSReqSt_offline = uint8(1);
BMSReqSt_online = uint8(2);
BMSReqSt_ACChrg = uint8(3);
BMSReqSt_DCChrg = uint8(4);
BMSReqSt_emergencyOffline = uint8(5);

%% BMS main positive relay actual status
BMSMainPosRlySt_Inin_SC = uint8(0);
BMSMainPosRlySt_Open_SC = uint8(1);
BMSMainPosRlySt_Clsd_SC = uint8(2);
BMSMainPosRlySt_StuckInOpen_SC = uint8(3);
BMSMainPosRlySt_StuckInClsd_SC = uint8(4);

%% BMS main negative relay actual status
BMSMainNegRlySt_Inin_SC = uint8(0);
BMSMainNegRlySt_Open_SC = uint8(1);
BMSMainNegRlySt_Clsd_SC = uint8(2);
BMSMainNegRlySt_StuckInOpen_SC = uint8(3);
BMSMainNegRlySt_StuckInClsd_SC = uint8(4);

%% BMS precharge relay actual status
BMSPrecRlySt_Inin_SC = uint8(0);
BMSPrecRlySt_Open_SC = uint8(1);
BMSPrecRlySt_Clsd_SC = uint8(2);
BMSPrecRlySt_StuckInOpen_SC = uint8(3);
BMSPrecRlySt_StuckInClsd_SC = uint8(4);

%% MCU mode actual 
MCUActSt_init = uint8(1);
MCUActSt_standby = uint8(2);
MCUActSt_ready = uint8(3);
MCUActSt_trqCtrl = uint8(4);
MCUActSt_hillHoldCtrl = uint8(5);
MCUActSt_discharge = uint8(6);
MCUActSt_afterRun = uint8(7);
MCUActSt_failure = uint8(8);
MCUActSt_offsetCal = uint8(9);
MCUActSt_powerOff = uint8(10);
MCUActSt_SpdCtrl_SC = uint8(11);

%% MCU mode Request 
MCUReqSt_init = uint8(1);
MCUReqSt_standby = uint8(2);
MCUReqSt_ready = uint8(3);
MCUReqSt_trqCtrl = uint8(4);
MCUReqSt_hillHoldCtrl = uint8(5);
MCUReqSt_discharge = uint8(6);
MCUReqSt_afterRun = uint8(7);
MCUReqSt_failure = uint8(8);
MCUReqSt_offsetCal = uint8(9);
MCUReqSt_powerOff = uint8(10);
MCUReqSt_SpdCtrl_SC = uint8(11);
MCUReqSt_VoltCtrl_SC = uint8(12);
MCUReqSt_PosnCtrl_SC = uint8(13);

%% FMCU fault status
FMCUFltSt_ZeroTq_SC = uint8(1);
FMCUFltSt_Shtdwn_SC = uint8(2);

%% FMCU active discharge status
MCUActvDcgrgSt_Iactv_SC = uint8(0); % inactive
MCUActvDcgrgSt_Cmpl_SC = uint8(1); % Complete
MCUActvDcgrgSt_Actv_SC = uint8(2); % active
MCUActvDcgrgSt_Failr_SC = uint8(3); % Failure

%% RMCU fault status
RMCUFltSt_ZeroTq_SC = uint8(1);
RMCUFltSt_Shtdwn_SC = uint8(2);

%% RMCU pulse heating status
RMCUPlsHeatgSt_NotHeatg_SC = uint8(0);
RMCUPlsHeatgSt_Heatg_SC = uint8(1);
RMCUPlsHeatgSt_HeatgOver_SC = uint8(2);
RMCUPlsHeatgSt_HeatgFaild_SC = uint8(3);

%% RMCU stall heating status
RMCUStalHeatgSt_NotHeatg_SC = uint8(0);
RMCUStalHeatgSt_Heatg_SC = uint8(1);
RMCUStalHeatgSt_HeatgOver_SC = uint8(2);
RMCUStalHeatgSt_HeatgFaild_SC = uint8(3);

%% OBC  states actual
OBCActSt_init = uint8(0);
OBCActSt_disconnected = uint8(1);
OBCActSt_connected = uint8(2);
OBCActSt_charging = uint8(3);
OBCActSt_V2L = uint8(4);
OBCActSt_V2V = uint8(5);
OBCActSt_OverLoad = uint8(6);
OBCActSt_failure = uint8(7);
OBCActSt_V2In = uint8(8);
OBCActSt_V2LAndV2In = uint8(9);

%% Drive gear state
GearLvr_stDrvGearD_SC = uint8(1);
GearLvr_stDrvGearN_SC = uint8(4);
GearLvr_stDrvGearR_SC = uint8(5);
GearLvr_stDrvGearP_SC = uint8(6);

%% the input Drive gear state
GearLvrSt_GearP_SC = uint8(1);
GearLvrSt_GearR_SC = uint8(2);
GearLvrSt_GearN_SC = uint8(3);
GearLvrSt_GearD_SC = uint8(4);

%% the ParkLock's request state from VCU
GearLvr_stPMotReqDisable = uint8(0);
GearLvr_stPMotReqLock = uint8(1);
GearLvr_stPMotReqUnlock = uint8(2);
GearLvr_stPMotReqHold = uint8(3);

%% Epb request
GearLvr_stEPBReqNoReq_SC = uint8(0);
GearLvr_stEPBReqRels_SC = uint8(1);
GearLvr_stEPBReqApply_SC = uint8(2);

%% Drive mode state
DrvMod_Norm_SC = uint8(0);
DrvMod_Eco_SC = uint8(1);
DrvMod_Sport_SC = uint8(2);
DrvMod_Ipedal_SC = uint8(3);
% DrvMod_EcoPlus_SC = uint8(4);
DrvMod_Ind_SC = uint8(6);
DrvMod_Slippery_SC = uint8(4);
DrvMod_Ofrd_SC = uint8(5);
DrvMod_Muddy_SC = uint8(7);
DrvMod_Loose_SC = uint8(8);
DrvMod_Roughness_SC = uint8(9);

%IEBM Drive mode state
DrvMod_IactvIEBM_SC = uint8(0);
DrvMod_StddIEBM_SC = uint8(1);
DrvMod_SportIEBM_SC = uint8(2);
%EPS Drive mode state
DrvMod_IactvEPS_SC = uint8(0);
DrvMod_CmftEPS_SC = uint8(1);
DrvMod_StddEPS_SC = uint8(2);
DrvMod_SportEPS_SC = uint8(3);
%ECC Drive mode state
DrvMod_EcoECC_SC = uint8(1);
DrvMod_CmftECC_SC = uint8(2);
%IDM Drive mode state
DrvMod_IactvIDM_SC = uint8(0);
DrvMod_EcoIDM_SC = uint8(1);
DrvMod_CmftIDM_SC = uint8(2);
DrvMod_SportIDM_SC = uint8(3);
%Drive mode Information
DrvMod_InfoNoReq_SC = uint8(0);
DrvMod_InfoOfrdInhByIEBM_SC = uint8(2);
% Drive RngLev
DrvMod_NoReqRgnLev_SC = uint8(0);
DrvMod_LowRgnLev_SC = uint8(1);
DrvMod_MedRgnLev_SC = uint8(2);
DrvMod_HighRgnLev_SC = uint8(3);

%Energy mode
DrvMod_EgyNoReq_SC = uint8(0);
DrvMod_EgyFrcEV_SC = uint8(1);
DrvMod_EgyEVPrio_SC = uint8(2);
DrvMod_EgyOilAndEV_SC= uint8(3);
DrvMod_EgyOilPrio_SC = uint8(4);
DrvMod_EgyFrcChrg_SC = uint8(5);



%% Torque split state
VehCoorn_InActv = uint8(0);
VehCoorn_Service = uint8(1);
VehCoorn_NeutralIceOff = uint8(2);
VehCoorn_Drv_SC = uint8(3);
VehCoorn_Chrg_SC = uint8(5);
VehCoorn_ElecDrv = uint8(6);


%%
RngPrdn_STBY = uint8(0);
RngPrdn_HVREADY = uint8(2);
RngPrdn_DRV = uint8(3);
RngPrdn_CHRG = uint8(5);

%%
DRVPRGSWT_NORMMODACTV = uint8(0);
DRVPRGSWT_ECOMODACTV = uint8(1);
DRVPRGSWT_SPTMODACTV = uint8(2);
%%
FId_RngPrdnEgyRmn = uint8(0);
FId_RngPrdnRngPrdcAuxPwr = uint8(0);
FId_RngPrdnAuxAvrgT = uint8(0);
FId_RngPrdnAuxAvrgPwr = uint8(0);
FId_RngPrdnAuxAvrgEnvT = uint8(0);
FId_RngPrdnAuxAvrgVehV = uint8(0);
FId_RngPrdnPrpAvrg = uint8(0);

%%
ElSS_HVVAR_SC = uint8(12);% High Voltage Variant of EV Vehicle

%%
Eem_Norm_SC = uint8(10);
Eem_OffReq_SC = uint8(12);

%%
HvGrid_PrioSize_SC = uint8(12);
HvGrid_PrioSizePlus_SC = uint8(132);

%% 
RoadAdhLvl_Hi_SC = uint8(0);
RoadAdhLvl_Mid_SC = uint8(1);
RoadAdhLvl_Lo_SC = uint8(2);
RoadAdhLvl_Ukwn_SC = uint8(3);

%%
VehErrLvl_NoErr_SC = uint8(0);
VehErrLvl_MinorFlt_SC = uint8(3);
VehErrLvl_PwrLim_SC = uint8(5);
VehErrLvl_ZeroTq_SC = uint8(6);
VehErrLvl_ShtdwnDly_SC = uint8(7);
VehErrLvl_ShtdwnEmgy_SC = uint8(8);

%% Vehicle driving type configuration
VehDrvTyp_Init_SC = uint8(0);
VehDrvTyp_FrntDrv_SC = uint8(1);
VehDrvTyp_ReDrv_SC = uint8(2);
VehDrvTyp_AWD4Mot_SC = uint8(3);
VehDrvTyp_AWD2Mot_SC = uint8(4);

VehPwrTyp_EV_SC = uint8(0);
VehPwrTyp_REEV_SC = uint8(1);
VehPwrTyp_1GearP1P3_SC = uint8(2);
VehPwrTyp_2GearP1P3_SC = uint8(3);

%%
VehCfg_stRBCCtrlModeESPCtrlSum_SC=uint8(2);
VehCfg_stRBCCtrlModeESPCtrlSplt_SC=uint8(3);
VehCfg_stRBCCtrlModeVCUCtrl_SC=uint8(1);

%%
BrkPedDevMon_stSurePrs_SC=uint8(2);
BrkPedDevMon_stSureNotPrs_SC=uint8(1);
BrkPedDevMon_stPsblPrs_SC=uint8(0);

%%
CrCtl_stOff_SC=uint8(1);
CrCtl_stCrCtl_SC=uint8(2);
CrCtl_stOvrd_SC=uint8(3);
CrCtl_stStb_SC=uint8(4);
CrCtl_stFail_SC=uint8(5);





%%
Chrg_stImdtMod_SC=uint8(1);
Chrg_stCycleBookMod_SC=uint8(3);
Chrg_stSingleBookMod_SC=uint8(2);


%Global cosntan
Glb_mps2kph_SC=single(3.6);
Glb_rpm2radps_SC=single(2*pi/60);









%Engine state
icems_stEngOff_SC=uint8(0);
icems_stEngReady_SC=uint8(1);
icems_stEngCrank_SC=uint8(2);
icems_stEngRun_SC=uint8(3);
icems_stEngStop_SC=uint8(4);
icems_stEngFinish_SC=uint8(5);
icems_stEngAutoStop_SC=uint8(6);

%ictcu_stTraClu0 state
ictcu_stClu0Initial_SC=uint8(0);
ictcu_stClu0Open_SC=uint8(1);
ictcu_stClu0Closing_SC=uint8(2);
ictcu_stClu0Closed_SC=uint8(3);
ictcu_stClu0Opening_SC=uint8(4);

%ictcu_stTraClu1 state
ictcu_stClu1Initial_SC=uint8(0);
ictcu_stClu1Open_SC=uint8(1);
ictcu_stClu1Closing_SC=uint8(2);
ictcu_stClu1Closed_SC=uint8(3);
ictcu_stClu1Opening_SC=uint8(4);

%HvCoorn_stHVP state
HvCoorn_stSystemReady_SC=uint8(90);
HvCoorn_stHVPShutdownHV_SC=uint8(101);





%HybCoorn_StMod state
HybCoorn_stStandby_SC=uint8(0);
HybCoorn_stP3Drv_SC=uint8(1);
HybCoorn_stSerDrv_SC=uint8(2);
HybCoorn_stIdleChrg_SC=uint8(3);
HybCoorn_stGear1Drv_SC=uint8(4);
HybCoorn_stP1P3Drv_SC=uint8(6);
HybCoorn_stClu0Open_SC=uint8(7);
HybCoorn_stClu0Enge_SC=uint8(8);
HybCoorn_stClu0HndOver_SC=uint8(10);
HybCoorn_stPTOpen_SC=uint8(9);
HybCoorn_stISGStrt_SC=uint8(11);
HybCoorn_stAsstEngStop_SC=uint8(13);
HybCoorn_stClu1Sync_SC=uint8(21);
HybCoorn_stClu1Enge_SC=uint8(22);
HybCoorn_stClu1HndoverDwn_SC=uint8(24);
HybCoorn_stClu1Rls_SC=uint8(25);
HybCoorn_stPureIdle_SC=uint8(26);
HybCoorn_stVoltMod_SC=uint8(27);


%EngStrtStop_stStrtStopTypReq state
EngStrStop_stEngTransDefault_SC=uint8(0);
EngStrStop_stEngTransAutoStop_SC=uint8(1);
EngStrStop_stEngTransISGAssistStop_SC=uint8(2);
EngStrStop_stEngTransDrgStrt_SC=uint8(3);

%icbms_stHvBat state
icbms_stHvBatOnline_SC=uint8(4);


%HybCoorn_stEngStrtTyp state
HybCoorn_stEngStrtTypNoStrt_SC=uint8(0);
HybCoorn_stEngStrtTyp12VStrt_SC=uint8(1);
HybCoorn_stEngStrtTypTrqPreStrt_SC=uint8(2);
HybCoorn_stEngStrtTypISGStrt_SC=uint8(3);

%HybCoorn_stEngModeReq state
HybCoorn_stEngModeReqOff_SC=uint8(0);
HybCoorn_stEngModeReqTrqCtrl_SC=uint8(1);
HybCoorn_stEngModeReqSpdCtrl_SC=uint8(2);

%HybCoorn_stTMModeReq state
HybCoorn_stTMModeReqStb_SC=uint8(0);
HybCoorn_stTMModeReqTrqCtrl_SC=uint8(1);
HybCoorn_stTMModeReqSpdCtrl_SC=uint8(2);
HybCoorn_stTMModeReqActvDchrg_SC=uint8(3);
HybCoorn_stTMModeReqVoltagCtrl_SC=uint8(4);
HybCoorn_stTMModeReqPrechrg_SC=uint8(11);

%HybCoorn_stISGModeReq state
HybCoorn_stISGModeReqStb_SC=uint8(0);
HybCoorn_stISGModeReqTrqCtrl_SC=uint8(1);
HybCoorn_stISGModeReqSpdCtrl_SC=uint8(2);
HybCoorn_stISGModeReqActvDchrg_SC=uint8(3);
HybCoorn_stISGModeReqVoltagCtrl_SC=uint8(4);
HybCoorn_stISGModeReqPrechrg_SC=uint8(11);

%HybCoorn_stClu0ModeReq state
HybCoorn_stClu0ModeReqIni_SC=uint8(0);
HybCoorn_stClu0ModeReqOpen_SC=uint8(1);
HybCoorn_stClu0ModeReqCls_SC=uint8(3);


%HybCoorn_stClu1ModeReq state
HybCoorn_stClu1ModeReqIni_SC=uint8(0);
HybCoorn_stClu1ModeReqOpen_SC=uint8(1);
HybCoorn_stClu1ModeReqCls_SC=uint8(3);


%ved_stVehErrLvl
ved_stVehErrLvl4_SC=uint8(4);
ved_stVehErrLvl3_SC=uint8(3);
ved_stVehErrLvl5_SC=uint8(5);

TaskTime_10ms=single(0.01);
TaskTime_100ms=single(0.1);


Vehcfg_iClu1Ratio=10;
HybTqDistPrep_SOCST_LOW=uint8(3);

EngStrStop_stEngTransNon_SC=uint8(0);
EngStrStop_stEngTransStop_SC=uint8(1);
EngStrStop_stEngTransEmStop_SC=uint8(2);
EngStrStop_stEngTransDrgStrt_SC=uint8(3);

%icobc_stChrgrCnct
OBCChrgrCnctnSt_Dcnct_SC=uint8(0);
OBCChrgrCnctnSt_Cnct_SC=uint8(1);
OBCChrgrCnctnSt_PtlCnct_SC=uint8(2);
OBCDisChrgrCnctnSt_V2L_SC=uint8(3);

%icicm_stRefuReq
icicm_stRefuReqDft_SC=uint8(0);
icicm_stRefuReqOpen_SC=uint8(1);
icicm_stRefuReqCls_SC=uint8(2);

%EngStrtStop_stRefuMod
EngStrtStop_RefuModDft_SC=uint8(0);
EngStrtStop_RefuModStopAPU_SC=uint8(1);
EngStrtStop_RefuModRlsPrss_SC=uint8(2);
EngStrtStop_RefuModRlsPrssFns_SC=uint8(3);
EngStrtStop_RefuModRefueling_SC=uint8(4);
EngStrtStop_RefuModClsFTIV_SC=uint8(5);

%icisg_stMod
ISGModSt_Init_SC=uint8(0);
ISGModSt_LvStb_SC=uint8(1);
ISGModSt_HvStb_SC=uint8(2);
ISGModSt_TqCtrl_SC=uint8(3);
ISGModSt_VoltCtrl_SC=uint8(4);
ISGModSt_SpdCtrl_SC=uint8(5);
ISGModSt_Failure_SC=uint8(6);

%EngStrtStop_stOprtgCdnIdn
EngStrtStop_stUrbCdn_SC=uint8(0);
EngStrtStop_stCongsnCdn_SC=uint8(1);
EngStrtStop_stSbnCdn_SC=uint8(2);
EngStrtStop_stHiSpdCdn_SC=uint8(3);

%DrvSlipTqSplt_stFrntAxlePICtrlSt &DrvSlipTqSplt_stReAxlePICtrlSt
DrvSlipCtrlActSt_Dft_SC=uint8(0);
DrvSlipCtrlActSt_OnRef_SC=uint8(1);
DrvSlipCtrlActSt_TakeOff_SC=uint8(2);
DrvSlipCtrlActSt_Neg_SC=uint8(3);
DrvSlipCtrlActSt_Stdy_SC=uint8(4);

%DrvMod_stDrgMod
DrgMod_stInactv_SC=uint8(0);
DrgMod_st750Actv_SC=uint8(1);
DrgMod_st1600Actv_SC=uint8(2);


%EngStrtStop_stIdleAnulInsp
EngStrtStop_stInspIdleInactv_SC=uint8(0);
EngStrtStop_stInspIdleLow_SC=uint8(1);
EngStrtStop_stInspIdleHigh_SC=uint8(2);

%VehCfg_stCycCdn
VehCfg_stCycCdnWLTC_SC=uint8(0);
VehCfg_stCycCdnNEDC_SC=uint8(1);

%VehCfg_stPwrTypCfg
VehCfg_stPwrTypEV_SC=uint8(0);
VehCfg_stPwrTypPHEV_SC=uint8(1);
VehCfg_stPwrTypCmn_SC=uint8(2);
VehCfg_stPwrTypHEV_SC=uint8(3);
VehCfg_stPwrTypREEV_SC=uint8(4);

%VehCfg_stREEVBatDrvRngCfg
VehCfg_stREEVBatRng200_SC=uint8(0);
VehCfg_stREEVBatRng300_SC=uint8(1);
VehCfg_stREEVBatRng120_SC=uint8(2);

%DrvMod_stWashMod
WashMod_stOff_SC=uint8(0);
WashMod_stFixed_SC=uint8(1);
WashMod_stMobile_SC=uint8(2);

%VehCfg_stLvBattTyp
LvBattTyp_stNoUse_SC=uint8(0);
LvBattTyp_stLiBatt_SC=uint8(1);
LvBattTyp_stLeadAcidBatt_SC=uint8(2);

%GearLvr_stCmpgMod
CmpgMod_stInactv_SC=uint8(0);
CmpgMod_stOutCarActv_SC=uint8(1);
CmpgMod_stInCarActv_SC=uint8(2);

%GearLvr_stSentilMod
SentilMod_stInactv_SC=uint8(0);
SentilMod_stOpen_SC=uint8(1);
SentilMod_stActv_SC=uint8(2);

%HvCoorn_stVoltMod
VoltMod_stDft_SC=uint8(0);
VoltMod_stEngStrt_SC=uint8(1);
VoltMod_stHvDisb_SC=uint8(2);
VoltMod_stHvDcnct_SC=uint8(3);
VoltMod_stHvReq_SC=uint8(4);
VoltMod_stVoltModRdy_SC=uint8(5);
VoltMod_stHvInitial_SC=uint8(6);
VoltMod_stHvCnt_SC=uint8(7);
VoltMod_stDCBuck_SC=uint8(8);


%EngStrtStop_stPwrIdleChrgPrkg
PrkgChrg_stInactv_SC=uint8(0);
PrkgChrg_stLowIdle_SC=uint8(1);
PrkgChrg_stHighIdle_SC=uint8(2);


