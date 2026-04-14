/*
 * File: Chrg.c
 *
 * Code generated for Simulink model 'Chrg'.
 *
 * Model version                  : 4.245
 * Simulink Coder version         : 9.8 (R2022b) 13-May-2022
 * C/C++ source code generated on : Mon Dec 22 16:12:59 2025
 *
 * Target selection: autosar.tlc
 * Embedded hardware selection: Infineon->TriCore
 * Code generation objectives: Unspecified
 * Validation result: Not run
 */

#include "Chrg.h"
#include "rtwtypes.h"
#include <math.h>
#include "Chrg_calibration.h"
#include "Wdgm_PFC_Swadp.h"

/* Named constants for Chart: '<S3>/A02_BookChrgModSt' */
#define Chrg_Chrg_stCycleBookMod_SC    ((uint8)3U)
#define Chrg_Chrg_stImdtMod_SC         ((uint8)1U)
#define Chrg_Chrg_stSingleBookMod_SC   ((uint8)2U)
#define Chrg_IN_Cycle                  ((uint8)1U)
#define Chrg_IN_Imdt                   ((uint8)2U)
#define Chrg_IN_Ini                    ((uint8)3U)
#define Chrg_IN_NO_ACTIVE_CHILD        ((uint8)0U)
#define Chrg_IN_Single                 ((uint8)4U)

/* Named constants for Chart: '<S3>/A15_ChargeControlStatus' */
#define Chrg_IN_ACCharging             ((uint8)1U)
#define Chrg_IN_ACChargingEna          ((uint8)1U)
#define Chrg_IN_ACChargingReq          ((uint8)2U)
#define Chrg_IN_ChargeMode             ((uint8)1U)
#define Chrg_IN_ChargingCompleted      ((uint8)1U)
#define Chrg_IN_ChargingErr            ((uint8)2U)
#define Chrg_IN_ChargingExit           ((uint8)3U)
#define Chrg_IN_ChargingExitIni        ((uint8)2U)
#define Chrg_IN_ChargingForeverErr     ((uint8)1U)
#define Chrg_IN_ChargingFull           ((uint8)4U)
#define Chrg_IN_ChargingTemporaryErr   ((uint8)2U)
#define Chrg_IN_ChrgWatchDog           ((uint8)2U)
#define Chrg_IN_DCCharging             ((uint8)5U)
#define Chrg_IN_DCChargingEna          ((uint8)1U)
#define Chrg_IN_DCChargingReq          ((uint8)2U)
#ifndef UCHAR_MAX
#include <limits.h>
#endif

#if ( UCHAR_MAX != (0xFFU) ) || ( SCHAR_MAX != (0x7F) )
#error Code was generated for compiler with different sized uchar/char. \
Consider adjusting Test hardware word size settings on the \
Hardware Implementation pane to match your compiler word sizes as \
defined in limits.h of the compiler. Alternatively, you can \
select the Test hardware is the same as production hardware option and \
select the Enable portable word sizes option on the Code Generation > \
Verification pane for ERT based targets, which will disable the \
preprocessor word size checks.
#endif

#if ( USHRT_MAX != (0xFFFFU) ) || ( SHRT_MAX != (0x7FFF) )
#error Code was generated for compiler with different sized ushort/short. \
Consider adjusting Test hardware word size settings on the \
Hardware Implementation pane to match your compiler word sizes as \
defined in limits.h of the compiler. Alternatively, you can \
select the Test hardware is the same as production hardware option and \
select the Enable portable word sizes option on the Code Generation > \
Verification pane for ERT based targets, which will disable the \
preprocessor word size checks.
#endif

#if ( UINT_MAX != (0xFFFFFFFFU) ) || ( INT_MAX != (0x7FFFFFFF) )
#error Code was generated for compiler with different sized uint/int. \
Consider adjusting Test hardware word size settings on the \
Hardware Implementation pane to match your compiler word sizes as \
defined in limits.h of the compiler. Alternatively, you can \
select the Test hardware is the same as production hardware option and \
select the Enable portable word sizes option on the Code Generation > \
Verification pane for ERT based targets, which will disable the \
preprocessor word size checks.
#endif

#if ( ULONG_MAX != (0xFFFFFFFFU) ) || ( LONG_MAX != (0x7FFFFFFF) )
#error Code was generated for compiler with different sized ulong/long. \
Consider adjusting Test hardware word size settings on the \
Hardware Implementation pane to match your compiler word sizes as \
defined in limits.h of the compiler. Alternatively, you can \
select the Test hardware is the same as production hardware option and \
select the Enable portable word sizes option on the Code Generation > \
Verification pane for ERT based targets, which will disable the \
preprocessor word size checks.
#endif

/* Invariant block signals (default storage) */
const ConstB_Chrg_T Chrg_ConstB = {
  0.01F,                               /* '<S57>/Max' */
  0.01F,                               /* '<S78>/Max' */
  0.01F,                               /* '<S79>/Max' */
  0.01F,                               /* '<S80>/Max' */
  0.01F,                               /* '<S81>/Max' */
  0.01F,                               /* '<S84>/Max' */
  0.01F,                               /* '<S87>/Max' */
  0.01F,                               /* '<S91>/Max' */
  0.01F,                               /* '<S92>/Max' */
  0.01F,                               /* '<S95>/Max' */
  0.01F,                               /* '<S96>/Max' */
  0.01F,                               /* '<S100>/Max' */
  0.01F,                               /* '<S101>/Max' */
  0.01F,                               /* '<S102>/Max' */
  0.01F,                               /* '<S113>/Max' */
  0.0F,                                /* '<S118>/Product2' */
  0.01F,                               /* '<S121>/Max' */
  200.0F,                              /* '<S119>/MinMax4' */
  0.01F,                               /* '<S126>/Max' */
  600.0F                               /* '<S120>/Max' */
};

/* PublicStructure Variables for Internal Data */
ARID_DEF_Chrg_T Chrg_ARID_DEF;         /* '<S105>/Unit Delay1' */

/* Model step function for TID1 */
void fc_Chrg(void)                     /* Explicit Task: fc_Chrg */
{
fc_Chrg_PFC_Start;
  sint32 rtb_Switch_lt;
  sint32 tmp;
  sint32 tmp_1;
  sint32 idxDelay;
  float32 rtb_Add6;
  float32 rtb_MinMax5;
  float32 rtb_Switch2;
  float32 rtb_TmpSignalConversionAticb_cr;
  float32 rtb_TmpSignalConversionAticbm_a;
  float32 rtb_TmpSignalConversionAticbms_;
  float32 rtb_TmpSignalConversionAticobc_;
  float32 tmpRead_4;
  float32 u;
  float32 v;
  uint8 rtb_Add5;
  uint8 rtb_Add6_c;
  uint8 rtb_MultiportSwitch;
  uint8 rtb_Switch3_f;
  uint8 rtb_Switch3_m;
  uint8 rtb_TmpSignalConversionAticbm_k;
  uint8 rtb_TmpSignalConversionAticbm_o;
  uint8 rtb_TmpSignalConversionAticfm_s;
  uint8 rtb_TmpSignalConversionAtici_bu;
  uint8 rtb_TmpSignalConversionAticic_c;
  uint8 rtb_TmpSignalConversionAticic_e;
  uint8 rtb_TmpSignalConversionAticic_f;
  uint8 rtb_TmpSignalConversionAticicm_;
  uint8 rtb_TmpSignalConversionAticob_c;
  uint8 rtb_TmpSignalConversionAticrm_s;
  uint8 rtb_TmpSignalConversionAtict_ac;
  uint8 rtb_TmpSignalConversionAtict_br;
  uint8 rtb_TmpSignalConversionAtict_j2;
  uint8 rtb_TmpSignalConversionAtictc_c;
  uint8 rtb_TmpSignalConversionAtictc_h;
  uint8 rtb_TmpSignalConversionAtictc_l;
  uint8 rtb_TmpSignalConversionAtictc_o;
  uint8 rtb_TmpSignalConversionAtictcp_;
  uint8 rtb_UnitDelay1_p;
  uint8 rtb_signal1_j_idx_1;
  uint8 rtb_signal1_j_idx_2;
  uint8 tmpRead;
  uint8 tmpRead_0;
  uint8 tmpRead_1;
  uint8 tmpRead_2;
  uint8 tmpRead_3;
  uint8 tmpRead_5;
  uint8 tmpRead_8;
  uint8 tmpRead_9;
  boolean Chrg_bChrgStopBySOCLim_tmp;
  boolean rtb_AND1_n;
  boolean rtb_AND4;
  boolean rtb_AND4_a;
  boolean rtb_AND4_i;
  boolean rtb_AND4_mb;
  boolean rtb_Delay_k;
  boolean rtb_Equal2;
  boolean rtb_Equal3;
  boolean rtb_LogicalOperator10_ex;
  boolean rtb_LogicalOperator16;
  boolean rtb_LogicalOperator1_is;
  boolean rtb_LogicalOperator2_e0;
  boolean rtb_LogicalOperator2_hm;
  boolean rtb_LogicalOperator2_ja;
  boolean rtb_LogicalOperator37;
  boolean rtb_LogicalOperator4_i;
  boolean rtb_LogicalOperator8_i;
  boolean rtb_Logical_Operator4;
  boolean rtb_Logical_Operator4_du;
  boolean rtb_Logical_Operator4_tmp;
  boolean rtb_OR1_p;
  boolean rtb_RelationalOperator1_e;
  boolean rtb_RelationalOperator1_lk;
  boolean rtb_RelationalOperator1_pn;
  boolean rtb_RelationalOperator_j;
  boolean rtb_TmpSignalConversionAtHvCo_e;
  boolean rtb_TmpSignalConversionAtHvCo_i;
  boolean rtb_TmpSignalConversionAtHvCo_k;
  boolean rtb_TmpSignalConversionAtHvCoor;
  boolean rtb_TmpSignalConversionAticb_ft;
  boolean rtb_TmpSignalConversionAticbm_l;
  boolean rtb_TmpSignalConversionAtici_n1;
  boolean rtb_TmpSignalConversionAticic_m;
  boolean rtb_TmpSignalConversionAticob_n;
  boolean rtb_TmpSignalConversionAtictc_n;
  boolean rtb_bDcChging;
  boolean tmpRead_6;
  boolean tmpRead_7;
  boolean tmp_0;

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* SignalConversion generated from: '<S1>/icicm_stChrgModSet' incorporates:
   *  Inport: '<Root>/icicm_stChrgModSet'
   */
  (void)Rte_Read_icicm_stChrgModSet_Value(&rtb_TmpSignalConversionAticicm_);

  /* RelationalOperator: '<S4>/Equal2' incorporates:
   *  Constant: '<S4>/uint8'
   */
  rtb_Equal2 = (rtb_TmpSignalConversionAticicm_ != ((uint8)0U));

  /* SignalConversion generated from: '<S1>/ictcp_stChrgModSet' incorporates:
   *  Inport: '<Root>/ictcp_stChrgModSet'
   */
  (void)Rte_Read_ictcp_stChrgModSet_Value(&rtb_TmpSignalConversionAtictcp_);

  /* RelationalOperator: '<S4>/Equal3' incorporates:
   *  Constant: '<S4>/uint1'
   */
  rtb_Equal3 = (rtb_TmpSignalConversionAtictcp_ != ((uint8)0U));

  /* Switch: '<S4>/Switch' incorporates:
   *  Logic: '<S27>/Logical Operator'
   *  Logic: '<S27>/Logical Operator1'
   *  Logic: '<S28>/Logical Operator'
   *  Logic: '<S28>/Logical Operator1'
   *  Switch: '<S4>/Switch1'
   *  UnitDelay: '<S27>/Unit Delay2'
   *  UnitDelay: '<S28>/Unit Delay2'
   */
  if (rtb_Equal2 && (!Chrg_ARID_DEF.UnitDelay2_DSTATE_pq)) {
    /* Switch: '<S4>/Switch' */
    Chrg_stChrgModSet = rtb_TmpSignalConversionAticicm_;
  } else if (rtb_Equal3 && (!Chrg_ARID_DEF.UnitDelay2_DSTATE_b4)) {
    /* Switch: '<S4>/Switch1' incorporates:
     *  Switch: '<S4>/Switch'
     */
    Chrg_stChrgModSet = rtb_TmpSignalConversionAtictcp_;
  } else {
    /* Switch: '<S4>/Switch' incorporates:
     *  Constant: '<S4>/uint2'
     *  Switch: '<S4>/Switch1'
     */
    Chrg_stChrgModSet = ((uint8)0U);
  }

  /* End of Switch: '<S4>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* SignalConversion: '<S1>/Signal Copy' incorporates:
   *  Inport: '<Root>/Chrg_stCycBookChrgEER'
   */
  (void)Rte_Read_Chrg_stCycBookChrgEER_Value((uint8 *)&Chrg_stCycBookChrgEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Delay: '<S3>/Delay' incorporates:
   *  Constant: '<S3>/Calibration1'
   *
   * Block description for '<S3>/Calibration1':
   *  [10]
   */
  if (Chrg_rEEReadDly_C <= 0) {
    /* Delay: '<S3>/Delay' incorporates:
     *  Constant: '<S3>/TRUE'
     *
     * Block description for '<S3>/TRUE':
     *  TRUE
     */
    rtb_Delay_k = true;
  } else {
    if (Chrg_rEEReadDly_C > 100) {
      rtb_TmpSignalConversionAticicm_ = 100U;
    } else {
      rtb_TmpSignalConversionAticicm_ = Chrg_rEEReadDly_C;
    }

    /* Delay: '<S3>/Delay' */
    rtb_Delay_k = Chrg_ARID_DEF.Delay_DSTATE_k[(uint8)(100U -
      rtb_TmpSignalConversionAticicm_)];
  }

  /* End of Delay: '<S3>/Delay' */

  /* Chart: '<S3>/A02_BookChrgModSt' incorporates:
   *  UnitDelay: '<S3>/UnitDelay'
   *  UnitDelay: '<S3>/UnitDelay1'
   */
  /* Gateway: Chrg/Chrg_ChargeProcedureControl/A02_BookChrgModSt */
  /* During: Chrg/Chrg_ChargeProcedureControl/A02_BookChrgModSt */
  if (Chrg_ARID_DEF.is_active_c3_Chrg == 0U) {
    /* Entry: Chrg/Chrg_ChargeProcedureControl/A02_BookChrgModSt */
    Chrg_ARID_DEF.is_active_c3_Chrg = 1U;

    /* Entry Internal: Chrg/Chrg_ChargeProcedureControl/A02_BookChrgModSt */
    /* Transition: '<S5>:2' */
    Chrg_ARID_DEF.is_c3_Chrg = Chrg_IN_Ini;

    /* Entry 'Ini': '<S5>:31' */
    Chrg_stBookChrgMod = 0U;
  } else {
    switch (Chrg_ARID_DEF.is_c3_Chrg) {
     case Chrg_IN_Cycle:
      Chrg_stBookChrgMod = Chrg_Chrg_stCycleBookMod_SC;

      /* During 'Cycle': '<S5>:9' */
      switch (Chrg_stChrgModSet) {
       case 2:
        /* Transition: '<S5>:11' */
        Chrg_ARID_DEF.is_c3_Chrg = Chrg_IN_Single;

        /* Entry 'Single': '<S5>:7' */
        Chrg_stBookChrgMod = Chrg_Chrg_stSingleBookMod_SC;
        break;

       case 1:
        /* Transition: '<S5>:13' */
        Chrg_ARID_DEF.is_c3_Chrg = Chrg_IN_Imdt;

        /* Entry 'Imdt': '<S5>:1' */
        Chrg_stBookChrgMod = Chrg_Chrg_stImdtMod_SC;
        break;
      }
      break;

     case Chrg_IN_Imdt:
      Chrg_stBookChrgMod = Chrg_Chrg_stImdtMod_SC;

      /* During 'Imdt': '<S5>:1' */
      switch (Chrg_stChrgModSet) {
       case 3:
        /* Transition: '<S5>:14' */
        Chrg_ARID_DEF.is_c3_Chrg = Chrg_IN_Cycle;

        /* Entry 'Cycle': '<S5>:9' */
        Chrg_stBookChrgMod = Chrg_Chrg_stCycleBookMod_SC;
        break;

       case 2:
        /* Transition: '<S5>:15' */
        Chrg_ARID_DEF.is_c3_Chrg = Chrg_IN_Single;

        /* Entry 'Single': '<S5>:7' */
        Chrg_stBookChrgMod = Chrg_Chrg_stSingleBookMod_SC;
        break;
      }
      break;

     case Chrg_IN_Ini:
      Chrg_stBookChrgMod = 0U;

      /* During 'Ini': '<S5>:31' */
      if ((Chrg_stCycBookChrgEER == 3) && rtb_Delay_k) {
        /* Transition: '<S5>:34' */
        Chrg_ARID_DEF.is_c3_Chrg = Chrg_IN_Cycle;

        /* Entry 'Cycle': '<S5>:9' */
        Chrg_stBookChrgMod = Chrg_Chrg_stCycleBookMod_SC;
      } else if ((Chrg_stCycBookChrgEER == 2) && rtb_Delay_k &&
                 (!Chrg_bSngBookChrgOverTi)) {
        /* Transition: '<S5>:38' */
        Chrg_ARID_DEF.is_c3_Chrg = Chrg_IN_Single;

        /* Entry 'Single': '<S5>:7' */
        Chrg_stBookChrgMod = Chrg_Chrg_stSingleBookMod_SC;
      } else if (rtb_Delay_k) {
        /* Transition: '<S5>:33' */
        Chrg_ARID_DEF.is_c3_Chrg = Chrg_IN_Imdt;

        /* Entry 'Imdt': '<S5>:1' */
        Chrg_stBookChrgMod = Chrg_Chrg_stImdtMod_SC;
      }
      break;

     default:
      Chrg_stBookChrgMod = Chrg_Chrg_stSingleBookMod_SC;

      /* During 'Single': '<S5>:7' */
      if ((Chrg_stChrgModSet == 1) || Chrg_bBookChrgCmpl) {
        /* Transition: '<S5>:10' */
        Chrg_ARID_DEF.is_c3_Chrg = Chrg_IN_Imdt;

        /* Entry 'Imdt': '<S5>:1' */
        Chrg_stBookChrgMod = Chrg_Chrg_stImdtMod_SC;
      } else if (Chrg_stChrgModSet == 3) {
        /* Transition: '<S5>:12' */
        Chrg_ARID_DEF.is_c3_Chrg = Chrg_IN_Cycle;

        /* Entry 'Cycle': '<S5>:9' */
        Chrg_stBookChrgMod = Chrg_Chrg_stCycleBookMod_SC;
      }
      break;
    }
  }

  /* End of Chart: '<S3>/A02_BookChrgModSt' */

  /* SignalConversion generated from: '<S1>/icicm_noBookChrgStrtHr' incorporates:
   *  Inport: '<Root>/icicm_noBookChrgStrtHr'
   */
  (void)Rte_Read_icicm_noBookChrgStrtHr_Value(&rtb_TmpSignalConversionAticic_f);

  /* Logic: '<S34>/AND4' incorporates:
   *  Constant: '<S29>/Constant'
   *  Constant: '<S34>/single'
   *  RelationalOperator: '<S34>/Equal2'
   *  RelationalOperator: '<S34>/Equal4'
   *  UnitDelay: '<S34>/Unit Delay1'
   */
  rtb_AND4 = ((rtb_TmpSignalConversionAticic_f !=
               Chrg_ARID_DEF.UnitDelay1_DSTATE_p) &&
              (rtb_TmpSignalConversionAticic_f != ((uint8)30U)) && true);

  /* SignalConversion generated from: '<S1>/ictcp_noBookChrgStrtHr' incorporates:
   *  Inport: '<Root>/ictcp_noBookChrgStrtHr'
   */
  (void)Rte_Read_ictcp_noBookChrgStrtHr_Value(&rtb_TmpSignalConversionAtictc_h);

  /* Logic: '<S34>/AND1' incorporates:
   *  Constant: '<S29>/Constant1'
   *  Constant: '<S34>/single1'
   *  Logic: '<S34>/AND2'
   *  RelationalOperator: '<S34>/Equal1'
   *  RelationalOperator: '<S34>/Equal3'
   *  UnitDelay: '<S34>/Unit Delay3'
   */
  rtb_AND1_n = (rtb_AND4 || ((rtb_TmpSignalConversionAtictc_h !=
    Chrg_ARID_DEF.UnitDelay3_DSTATE) && (rtb_TmpSignalConversionAtictc_h !=
    ((uint8)30U)) && true));

  /* Logic: '<S42>/Logical Operator1' incorporates:
   *  Constant: '<S34>/FALSE'
   *  Logic: '<S43>/Logical Operator1'
   *  Logic: '<S44>/Logical Operator1'
   *  Logic: '<S45>/Logical Operator1'
   *  Logic: '<S48>/Not1'
   *  Switch: '<S48>/Switch13'
   *  Switch: '<S48>/Switch16'
   *  Switch: '<S48>/Switch17'
   *
   * Block description for '<S34>/FALSE':
   *  FALSE
   */
  rtb_Logical_Operator4_tmp = !false;

  /* Logic: '<S42>/Logical_Operator4' incorporates:
   *  Logic: '<S42>/Logical Operator1'
   *  Logic: '<S42>/Logical_Operator5'
   *  UnitDelay: '<S42>/Unit Delay'
   */
  rtb_Logical_Operator4 = (rtb_Logical_Operator4_tmp && (rtb_AND1_n ||
    Chrg_ARID_DEF.UnitDelay_DSTATE_ln));

  /* Switch: '<S34>/Switch3' */
  if (rtb_AND1_n) {
    /* Switch: '<S34>/Switch' */
    if (rtb_AND4) {
      /* Switch: '<S34>/Switch3' */
      rtb_TmpSignalConversionAticicm_ = rtb_TmpSignalConversionAticic_f;
    } else {
      /* Switch: '<S34>/Switch3' */
      rtb_TmpSignalConversionAticicm_ = rtb_TmpSignalConversionAtictc_h;
    }

    /* End of Switch: '<S34>/Switch' */
  } else {
    /* Switch: '<S34>/Switch3' incorporates:
     *  UnitDelay: '<S34>/Unit Delay2'
     */
    rtb_TmpSignalConversionAticicm_ = Chrg_ARID_DEF.UnitDelay2_DSTATE_h;
  }

  /* End of Switch: '<S34>/Switch3' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* SignalConversion: '<S1>/Signal Copy2' incorporates:
   *  Inport: '<Root>/Chrg_noBookChrgStrtHrEER'
   */
  (void)Rte_Read_Chrg_noBookChrgStrtHrEER_Value((uint8 *)
    &Chrg_noBookChrgStrtHrEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Switch: '<S34>/Switch2' incorporates:
   *  Constant: '<S23>/uint8'
   *  RelationalOperator: '<S23>/Equal'
   *  Switch: '<S23>/Switch'
   */
  if (rtb_Logical_Operator4) {
    /* Switch: '<S34>/Switch2' */
    Chrg_noBookChrgStrtHrEEW = rtb_TmpSignalConversionAticicm_;
  } else if (Chrg_noBookChrgStrtHrEER >= ((uint8)24U)) {
    /* Switch: '<S23>/Switch' incorporates:
     *  Constant: '<S23>/uint1'
     *  Switch: '<S34>/Switch2'
     */
    Chrg_noBookChrgStrtHrEEW = ((uint8)23U);
  } else {
    /* Switch: '<S34>/Switch2' incorporates:
     *  Switch: '<S23>/Switch'
     */
    Chrg_noBookChrgStrtHrEEW = Chrg_noBookChrgStrtHrEER;
  }

  /* End of Switch: '<S34>/Switch2' */

  /* SignalConversion generated from: '<S1>/icicm_noBookChrgStrtMint' incorporates:
   *  Inport: '<Root>/icicm_noBookChrgStrtMint'
   */
  (void)Rte_Read_icicm_noBookChrgStrtMint_Value(&rtb_TmpSignalConversionAtici_bu);

  /* Logic: '<S35>/AND4' incorporates:
   *  Constant: '<S29>/Constant'
   *  Constant: '<S35>/single'
   *  RelationalOperator: '<S35>/Equal2'
   *  RelationalOperator: '<S35>/Equal4'
   *  UnitDelay: '<S35>/Unit Delay1'
   */
  rtb_AND4_a = ((rtb_TmpSignalConversionAtici_bu !=
                 Chrg_ARID_DEF.UnitDelay1_DSTATE_b) &&
                (rtb_TmpSignalConversionAtici_bu != ((uint8)62U)) && true);

  /* SignalConversion generated from: '<S1>/ictcp_noBookChrgStrtMint' incorporates:
   *  Inport: '<Root>/ictcp_noBookChrgStrtMint'
   */
  (void)Rte_Read_ictcp_noBookChrgStrtMint_Value(&rtb_TmpSignalConversionAtictc_o);

  /* RelationalOperator: '<S12>/Relational Operator1' incorporates:
   *  Constant: '<S29>/Constant1'
   *  Constant: '<S35>/single1'
   *  Logic: '<S35>/AND1'
   *  Logic: '<S35>/AND2'
   *  RelationalOperator: '<S35>/Equal1'
   *  RelationalOperator: '<S35>/Equal3'
   *  UnitDelay: '<S35>/Unit Delay3'
   */
  rtb_RelationalOperator1_lk = (rtb_AND4_a || ((rtb_TmpSignalConversionAtictc_o
    != Chrg_ARID_DEF.UnitDelay3_DSTATE_o) && (rtb_TmpSignalConversionAtictc_o !=
    ((uint8)62U)) && true));

  /* Logic: '<S43>/Logical_Operator4' incorporates:
   *  Logic: '<S43>/Logical_Operator5'
   *  UnitDelay: '<S43>/Unit Delay'
   */
  rtb_AND4 = (rtb_Logical_Operator4_tmp && (rtb_RelationalOperator1_lk ||
    Chrg_ARID_DEF.UnitDelay_DSTATE_az));

  /* Switch: '<S35>/Switch3' */
  if (rtb_RelationalOperator1_lk) {
    /* Switch: '<S35>/Switch' */
    if (rtb_AND4_a) {
      /* Switch: '<S35>/Switch3' */
      rtb_TmpSignalConversionAtictcp_ = rtb_TmpSignalConversionAtici_bu;
    } else {
      /* Switch: '<S35>/Switch3' */
      rtb_TmpSignalConversionAtictcp_ = rtb_TmpSignalConversionAtictc_o;
    }

    /* End of Switch: '<S35>/Switch' */
  } else {
    /* Switch: '<S35>/Switch3' incorporates:
     *  UnitDelay: '<S35>/Unit Delay2'
     */
    rtb_TmpSignalConversionAtictcp_ = Chrg_ARID_DEF.UnitDelay2_DSTATE_p;
  }

  /* End of Switch: '<S35>/Switch3' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* SignalConversion: '<S1>/Signal Copy1' incorporates:
   *  Inport: '<Root>/Chrg_noBookChrgStrtMintEER'
   */
  (void)Rte_Read_Chrg_noBookChrgStrtMintEER_Value((uint8 *)
    &Chrg_noBookChrgStrtMintEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Switch: '<S35>/Switch2' incorporates:
   *  Constant: '<S22>/uint8'
   *  RelationalOperator: '<S22>/Equal'
   *  Switch: '<S22>/Switch'
   */
  if (rtb_AND4) {
    /* Switch: '<S35>/Switch2' */
    Chrg_noBookChrgStrtMintEEW = rtb_TmpSignalConversionAtictcp_;
  } else if (Chrg_noBookChrgStrtMintEER >= ((uint8)60U)) {
    /* Switch: '<S22>/Switch' incorporates:
     *  Constant: '<S22>/uint1'
     *  Switch: '<S35>/Switch2'
     */
    Chrg_noBookChrgStrtMintEEW = ((uint8)0U);
  } else {
    /* Switch: '<S35>/Switch2' incorporates:
     *  Switch: '<S22>/Switch'
     */
    Chrg_noBookChrgStrtMintEEW = Chrg_noBookChrgStrtMintEER;
  }

  /* End of Switch: '<S35>/Switch2' */

  /* SignalConversion generated from: '<S1>/icicm_noBookChrgSEndHr' incorporates:
   *  Inport: '<Root>/icicm_noBookChrgSEndHr'
   */
  (void)Rte_Read_icicm_noBookChrgSEndHr_Value(&rtb_TmpSignalConversionAticic_c);

  /* Logic: '<S36>/AND4' incorporates:
   *  Constant: '<S29>/Constant'
   *  Constant: '<S36>/single'
   *  RelationalOperator: '<S36>/Equal2'
   *  RelationalOperator: '<S36>/Equal4'
   *  UnitDelay: '<S36>/Unit Delay1'
   */
  rtb_AND4_mb = ((rtb_TmpSignalConversionAticic_c !=
                  Chrg_ARID_DEF.UnitDelay1_DSTATE_c) &&
                 (rtb_TmpSignalConversionAticic_c != ((uint8)30U)) && true);

  /* SignalConversion generated from: '<S1>/ictcp_noBookChrgSEndHr' incorporates:
   *  Inport: '<Root>/ictcp_noBookChrgSEndHr'
   */
  (void)Rte_Read_ictcp_noBookChrgSEndHr_Value(&rtb_TmpSignalConversionAtict_j2);

  /* Logic: '<S121>/Logical Operator2' incorporates:
   *  Constant: '<S29>/Constant1'
   *  Constant: '<S36>/single1'
   *  Logic: '<S36>/AND1'
   *  Logic: '<S36>/AND2'
   *  RelationalOperator: '<S36>/Equal1'
   *  RelationalOperator: '<S36>/Equal3'
   *  UnitDelay: '<S36>/Unit Delay3'
   */
  rtb_LogicalOperator2_e0 = (rtb_AND4_mb || ((rtb_TmpSignalConversionAtict_j2 !=
    Chrg_ARID_DEF.UnitDelay3_DSTATE_l) && (rtb_TmpSignalConversionAtict_j2 !=
    ((uint8)30U)) && true));

  /* Logic: '<S44>/Logical_Operator4' incorporates:
   *  Logic: '<S44>/Logical_Operator5'
   *  UnitDelay: '<S44>/Unit Delay'
   */
  rtb_AND4_a = (rtb_Logical_Operator4_tmp && (rtb_LogicalOperator2_e0 ||
    Chrg_ARID_DEF.UnitDelay_DSTATE_do));

  /* Switch: '<S36>/Switch3' */
  if (rtb_LogicalOperator2_e0) {
    /* Switch: '<S36>/Switch' */
    if (rtb_AND4_mb) {
      /* Switch: '<S36>/Switch3' */
      rtb_Switch3_f = rtb_TmpSignalConversionAticic_c;
    } else {
      /* Switch: '<S36>/Switch3' */
      rtb_Switch3_f = rtb_TmpSignalConversionAtict_j2;
    }

    /* End of Switch: '<S36>/Switch' */
  } else {
    /* Switch: '<S36>/Switch3' incorporates:
     *  UnitDelay: '<S36>/Unit Delay2'
     */
    rtb_Switch3_f = Chrg_ARID_DEF.UnitDelay2_DSTATE_b;
  }

  /* End of Switch: '<S36>/Switch3' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* SignalConversion: '<S1>/Signal Copy3' incorporates:
   *  Inport: '<Root>/Chrg_noBookChrgSEndHrEER'
   */
  (void)Rte_Read_Chrg_noBookChrgSEndHrEER_Value((uint8 *)
    &Chrg_noBookChrgSEndHrEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Switch: '<S36>/Switch2' incorporates:
   *  Constant: '<S25>/uint8'
   *  RelationalOperator: '<S25>/Equal'
   *  Switch: '<S25>/Switch'
   */
  if (rtb_AND4_a) {
    /* Switch: '<S36>/Switch2' */
    Chrg_noBookChrgEndHrEEW = rtb_Switch3_f;
  } else if (Chrg_noBookChrgSEndHrEER >= ((uint8)24U)) {
    /* Switch: '<S25>/Switch' incorporates:
     *  Constant: '<S25>/uint1'
     *  Switch: '<S36>/Switch2'
     */
    Chrg_noBookChrgEndHrEEW = ((uint8)8U);
  } else {
    /* Switch: '<S36>/Switch2' incorporates:
     *  Switch: '<S25>/Switch'
     */
    Chrg_noBookChrgEndHrEEW = Chrg_noBookChrgSEndHrEER;
  }

  /* End of Switch: '<S36>/Switch2' */

  /* SignalConversion generated from: '<S1>/icicm_noBookChrgEndMint' incorporates:
   *  Inport: '<Root>/icicm_noBookChrgEndMint'
   */
  (void)Rte_Read_icicm_noBookChrgEndMint_Value(&rtb_TmpSignalConversionAticic_e);

  /* Logic: '<S37>/AND4' incorporates:
   *  Constant: '<S29>/Constant'
   *  Constant: '<S37>/single'
   *  RelationalOperator: '<S37>/Equal2'
   *  RelationalOperator: '<S37>/Equal4'
   *  UnitDelay: '<S37>/Unit Delay1'
   */
  rtb_AND4_i = ((rtb_TmpSignalConversionAticic_e !=
                 Chrg_ARID_DEF.UnitDelay1_DSTATE_e) &&
                (rtb_TmpSignalConversionAticic_e != ((uint8)62U)) && true);

  /* SignalConversion generated from: '<S1>/ictcp_noBookChrgEndMint' incorporates:
   *  Inport: '<Root>/ictcp_noBookChrgEndMint'
   */
  (void)Rte_Read_ictcp_noBookChrgEndMint_Value(&rtb_TmpSignalConversionAtictc_l);

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S29>/Constant1'
   *  Constant: '<S37>/single1'
   *  Logic: '<S37>/AND1'
   *  Logic: '<S37>/AND2'
   *  RelationalOperator: '<S37>/Equal1'
   *  RelationalOperator: '<S37>/Equal3'
   *  UnitDelay: '<S37>/Unit Delay3'
   */
  rtb_bDcChging = (rtb_AND4_i || ((rtb_TmpSignalConversionAtictc_l !=
    Chrg_ARID_DEF.UnitDelay3_DSTATE_b) && (rtb_TmpSignalConversionAtictc_l !=
    ((uint8)62U)) && true));

  /* Logic: '<S45>/Logical_Operator4' incorporates:
   *  Logic: '<S45>/Logical_Operator5'
   *  UnitDelay: '<S45>/Unit Delay'
   */
  rtb_AND4_mb = (rtb_Logical_Operator4_tmp && (rtb_bDcChging ||
    Chrg_ARID_DEF.UnitDelay_DSTATE_hq));

  /* Switch: '<S37>/Switch3' */
  if (rtb_bDcChging) {
    /* Switch: '<S37>/Switch' */
    if (rtb_AND4_i) {
      /* Switch: '<S37>/Switch3' */
      rtb_Switch3_m = rtb_TmpSignalConversionAticic_e;
    } else {
      /* Switch: '<S37>/Switch3' */
      rtb_Switch3_m = rtb_TmpSignalConversionAtictc_l;
    }

    /* End of Switch: '<S37>/Switch' */
  } else {
    /* Switch: '<S37>/Switch3' incorporates:
     *  UnitDelay: '<S37>/Unit Delay2'
     */
    rtb_Switch3_m = Chrg_ARID_DEF.UnitDelay2_DSTATE_c;
  }

  /* End of Switch: '<S37>/Switch3' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* SignalConversion: '<S1>/Signal Copy4' incorporates:
   *  Inport: '<Root>/Chrg_noBookChrgEndMintEER'
   */
  (void)Rte_Read_Chrg_noBookChrgEndMintEER_Value((uint8 *)
    &Chrg_noBookChrgEndMintEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Switch: '<S37>/Switch2' incorporates:
   *  Constant: '<S24>/uint8'
   *  RelationalOperator: '<S24>/Equal'
   *  Switch: '<S24>/Switch'
   */
  if (rtb_AND4_mb) {
    /* Switch: '<S37>/Switch2' */
    Chrg_noBookChrgEndMintEEW = rtb_Switch3_m;
  } else if (Chrg_noBookChrgEndMintEER >= ((uint8)60U)) {
    /* Switch: '<S24>/Switch' incorporates:
     *  Constant: '<S24>/uint1'
     *  Switch: '<S37>/Switch2'
     */
    Chrg_noBookChrgEndMintEEW = ((uint8)0U);
  } else {
    /* Switch: '<S37>/Switch2' incorporates:
     *  Switch: '<S24>/Switch'
     */
    Chrg_noBookChrgEndMintEEW = Chrg_noBookChrgEndMintEER;
  }

  /* End of Switch: '<S37>/Switch2' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/ictcp_noTiSyncMint' */
  (void)Rte_Read_ictcp_noTiSyncMint_Value(&rtb_Add6_c);

  /* Inport: '<Root>/ictcp_noTiSyncHr' */
  (void)Rte_Read_ictcp_noTiSyncHr_Value(&rtb_Add5);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Sum: '<S38>/Add2' incorporates:
   *  DataTypeConversion: '<S38>/Data Type Conversion'
   *  DataTypeConversion: '<S38>/Data Type Conversion1'
   *  Gain: '<S38>/Gain'
   */
  Chrg_minBookChrgStrt = (uint16)((((uint32)((uint8)240U) *
    Chrg_noBookChrgStrtHrEEW) >> 2) + Chrg_noBookChrgStrtMintEEW);

  /* Sum: '<S39>/Add3' incorporates:
   *  DataTypeConversion: '<S39>/Data Type Conversion2'
   *  DataTypeConversion: '<S39>/Data Type Conversion6'
   *  Gain: '<S39>/Gain1'
   */
  Chrg_minBookChrgEnd = (uint16)((((uint32)((uint8)240U) *
    Chrg_noBookChrgEndHrEEW) >> 2) + Chrg_noBookChrgEndMintEEW);

  /* Logic: '<S40>/OR' */
  rtb_AND4_i = (rtb_AND1_n || rtb_RelationalOperator1_lk ||
                rtb_LogicalOperator2_e0 || rtb_bDcChging);

  /* Sum: '<S41>/Add4' incorporates:
   *  DataTypeConversion: '<S41>/Data Type Conversion3'
   *  DataTypeConversion: '<S41>/Data Type Conversion4'
   *  Gain: '<S41>/Gain2'
   */
  Chrg_minNow = (uint16)((((uint32)((uint8)240U) * rtb_Add5) >> 2) + rtb_Add6_c);

  /* SignalConversion generated from: '<S1>/ictcp_noTiSyncDay' incorporates:
   *  Inport: '<Root>/ictcp_noTiSyncDay'
   */
  (void)Rte_Read_ictcp_noTiSyncDay_Value(&rtb_TmpSignalConversionAtict_br);

  /* Sum: '<S46>/Add5' incorporates:
   *  Constant: '<S46>/uint21'
   *  Sum: '<S47>/Add5'
   *  Switch generated from: '<S48>/Switch3'
   *  Switch generated from: '<S48>/Switch4'
   *  Switch generated from: '<S48>/Switch5'
   */
  rtb_Switch_lt = (sint32)((uint32)rtb_TmpSignalConversionAtict_br + ((uint8)1U));
  idxDelay = rtb_Switch_lt;
  if ((uint32)rtb_Switch_lt > 255U) {
    idxDelay = 255;
  }

  /* Sum: '<S46>/Add5' */
  rtb_Add5 = (uint8)idxDelay;

  /* SignalConversion generated from: '<S1>/ictcp_noTiSyncMth' incorporates:
   *  Inport: '<Root>/ictcp_noTiSyncMth'
   */
  (void)Rte_Read_ictcp_noTiSyncMth_Value(&rtb_TmpSignalConversionAtictc_c);

  /* Sum: '<S46>/Add6' incorporates:
   *  Constant: '<S46>/uint22'
   *  Sum: '<S47>/Add6'
   *  Switch generated from: '<S48>/Switch3'
   *  Switch generated from: '<S48>/Switch4'
   *  Switch generated from: '<S48>/Switch5'
   */
  tmp_1 = (sint32)((uint32)rtb_TmpSignalConversionAtictc_c + ((uint8)1U));
  tmp = tmp_1;
  if ((uint32)tmp_1 > 255U) {
    tmp = 255;
  }

  /* Sum: '<S46>/Add6' */
  rtb_Add6_c = (uint8)tmp;

  /* SignalConversion generated from: '<S1>/ictcp_noTiSyncYear' incorporates:
   *  Inport: '<Root>/ictcp_noTiSyncYear'
   */
  (void)Rte_Read_ictcp_noTiSyncYear_Value(&rtb_TmpSignalConversionAtict_ac);

  /* MultiPortSwitch: '<S46>/Multiport Switch' */
  switch (rtb_TmpSignalConversionAtictc_c) {
   case 1:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint10'
     */
    rtb_MultiportSwitch = ((uint8)31U);
    break;

   case 2:
    /* Math: '<S46>/Mod' incorporates:
     *  Constant: '<S46>/uint5'
     */
    if (((uint8)4U) == 0) {
      rtb_MultiportSwitch = rtb_TmpSignalConversionAtict_ac;
    } else {
      rtb_MultiportSwitch = (uint8)(rtb_TmpSignalConversionAtict_ac % ((uint8)4U));
    }

    /* End of Math: '<S46>/Mod' */

    /* Switch: '<S46>/Switch5' incorporates:
     *  Constant: '<S46>/uint6'
     *  RelationalOperator: '<S46>/Equal8'
     */
    if (rtb_MultiportSwitch == ((uint8)0U)) {
      /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
       *  Constant: '<S46>/uint7'
       */
      rtb_MultiportSwitch = ((uint8)29U);
    } else {
      /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
       *  Constant: '<S46>/uint9'
       */
      rtb_MultiportSwitch = ((uint8)28U);
    }

    /* End of Switch: '<S46>/Switch5' */
    break;

   case 3:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint11'
     */
    rtb_MultiportSwitch = ((uint8)31U);
    break;

   case 4:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint12'
     */
    rtb_MultiportSwitch = ((uint8)30U);
    break;

   case 5:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint13'
     */
    rtb_MultiportSwitch = ((uint8)31U);
    break;

   case 6:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint14'
     */
    rtb_MultiportSwitch = ((uint8)30U);
    break;

   case 7:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint15'
     */
    rtb_MultiportSwitch = ((uint8)31U);
    break;

   case 8:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint16'
     */
    rtb_MultiportSwitch = ((uint8)31U);
    break;

   case 9:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint17'
     */
    rtb_MultiportSwitch = ((uint8)30U);
    break;

   case 10:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint18'
     */
    rtb_MultiportSwitch = ((uint8)31U);
    break;

   case 11:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint20'
     */
    rtb_MultiportSwitch = ((uint8)30U);
    break;

   default:
    /* MultiPortSwitch: '<S46>/Multiport Switch' incorporates:
     *  Constant: '<S46>/uint19'
     */
    rtb_MultiportSwitch = ((uint8)31U);
    break;
  }

  /* End of MultiPortSwitch: '<S46>/Multiport Switch' */

  /* RelationalOperator: '<S46>/Equal13' incorporates:
   *  Sum: '<S46>/Add5'
   */
  rtb_AND1_n = ((uint8)idxDelay > rtb_MultiportSwitch);

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S46>/uint23'
   *  RelationalOperator: '<S46>/Equal14'
   *  Sum: '<S46>/Add6'
   */
  rtb_bDcChging = ((uint8)tmp > ((uint8)12U));

  /* Switch: '<S46>/Switch7' incorporates:
   *  Switch: '<S46>/Switch6'
   */
  if (rtb_bDcChging) {
    /* Switch: '<S46>/Switch7' incorporates:
     *  Constant: '<S46>/uint24'
     */
    rtb_Add6_c = ((uint8)1U);
  } else if (!rtb_AND1_n) {
    /* Switch: '<S46>/Switch7' incorporates:
     *  Switch: '<S46>/Switch6'
     */
    rtb_Add6_c = rtb_TmpSignalConversionAtictc_c;
  }

  /* End of Switch: '<S46>/Switch7' */

  /* Switch: '<S46>/Switch8' */
  if (rtb_AND1_n) {
    /* Switch: '<S46>/Switch8' incorporates:
     *  Constant: '<S46>/uint25'
     */
    rtb_Add5 = ((uint8)1U);
  }

  /* End of Switch: '<S46>/Switch8' */

  /* Switch: '<S46>/Switch9' */
  if (rtb_bDcChging) {
    /* Sum: '<S46>/Add7' incorporates:
     *  Constant: '<S46>/uint26'
     */
    idxDelay = (sint32)((uint32)rtb_TmpSignalConversionAtict_ac + ((uint8)1U));
    if ((uint32)idxDelay > 255U) {
      idxDelay = 255;
    }

    /* Switch: '<S46>/Switch9' incorporates:
     *  Sum: '<S46>/Add7'
     */
    rtb_MultiportSwitch = (uint8)idxDelay;
  } else {
    /* Switch: '<S46>/Switch9' */
    rtb_MultiportSwitch = rtb_TmpSignalConversionAtict_ac;
  }

  /* End of Switch: '<S46>/Switch9' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* SignalConversion: '<S1>/Signal Copy8' incorporates:
   *  Inport: '<Root>/Chrg_noSngBookStrtDayEER'
   */
  (void)Rte_Read_Chrg_noSngBookStrtDayEER_Value((uint8 *)
    &Chrg_noSngBookStrtDayEER);

  /* SignalConversion: '<S1>/Signal Copy7' incorporates:
   *  Inport: '<Root>/Chrg_noSngBookStrtMthEER'
   */
  (void)Rte_Read_Chrg_noSngBookStrtMthEER_Value((uint8 *)
    &Chrg_noSngBookStrtMthEER);

  /* SignalConversion: '<S1>/Signal Copy6' incorporates:
   *  Inport: '<Root>/Chrg_noSngBookStrtYearEER'
   */
  (void)Rte_Read_Chrg_noSngBookStrtYearEER_Value((uint8 *)
    &Chrg_noSngBookStrtYearEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S48>/TaskTime_s7'
   *  RelationalOperator: '<S48>/Equal18'
   *
   * Block description for '<S48>/TaskTime_s7':
   *  [2]
   */
  rtb_bDcChging = (Chrg_stBookChrgMod == ((uint8)2U));

  /* Logic: '<S48>/AND7' incorporates:
   *  RelationalOperator: '<S48>/Equal10'
   *  RelationalOperator: '<S48>/Equal9'
   */
  rtb_AND1_n = ((Chrg_minBookChrgStrt < Chrg_minBookChrgEnd) &&
                (Chrg_minBookChrgEnd <= Chrg_minNow));

  /* UnitDelay: '<S48>/Unit Delay1' */
  rtb_UnitDelay1_p = Chrg_ARID_DEF.UnitDelay1_DSTATE_jt;

  /* Logic: '<S121>/Logical Operator2' incorporates:
   *  Constant: '<S48>/TaskTime_s3'
   *  Constant: '<S48>/TaskTime_s4'
   *  Constant: '<S48>/TaskTime_s5'
   *  Logic: '<S48>/AND10'
   *  Logic: '<S48>/OR3'
   *  Logic: '<S48>/OR4'
   *  RelationalOperator: '<S48>/Equal11'
   *  RelationalOperator: '<S48>/Equal12'
   *  RelationalOperator: '<S48>/Equal13'
   *
   * Block description for '<S48>/TaskTime_s3':
   *  [3]
   *
   * Block description for '<S48>/TaskTime_s4':
   *  [2]
   *
   * Block description for '<S48>/TaskTime_s5':
   *  [1]
   */
  rtb_LogicalOperator2_e0 = (((rtb_UnitDelay1_p == ((uint8)3U)) ||
    (rtb_UnitDelay1_p == ((uint8)1U)) || rtb_AND4_i) && (Chrg_stBookChrgMod ==
    ((uint8)2U)));

  /* Logic: '<S48>/Not' */
  rtb_Delay_k = !rtb_Delay_k;

  /* Switch generated from: '<S48>/Switch3' incorporates:
   *  Switch generated from: '<S48>/Switch'
   */
  if (rtb_LogicalOperator2_e0) {
    /* Switch generated from: '<S48>/Switch4' */
    if (rtb_AND1_n) {
      /* Switch generated from: '<S48>/Switch3' incorporates:
       *  Switch generated from: '<S48>/Switch4'
       */
      rtb_UnitDelay1_p = rtb_MultiportSwitch;
      rtb_signal1_j_idx_1 = rtb_Add6_c;
      rtb_signal1_j_idx_2 = rtb_Add5;
    } else {
      /* Switch generated from: '<S48>/Switch3' incorporates:
       *  Switch generated from: '<S48>/Switch4'
       *  Switch generated from: '<S48>/Switch5'
       */
      rtb_UnitDelay1_p = rtb_TmpSignalConversionAtict_ac;
      rtb_signal1_j_idx_1 = rtb_TmpSignalConversionAtictc_c;
      rtb_signal1_j_idx_2 = rtb_TmpSignalConversionAtict_br;
    }
  } else if (rtb_Delay_k) {
    /* Switch generated from: '<S48>/Switch' incorporates:
     *  Switch generated from: '<S48>/Switch3'
     */
    rtb_UnitDelay1_p = Chrg_noSngBookStrtYearEER;
    rtb_signal1_j_idx_1 = Chrg_noSngBookStrtMthEER;
    rtb_signal1_j_idx_2 = Chrg_noSngBookStrtDayEER;
  } else {
    /* Switch generated from: '<S48>/Switch3' incorporates:
     *  UnitDelay generated from: '<S48>/Unit Delay'
     */
    rtb_UnitDelay1_p = Chrg_ARID_DEF.UnitDelay_1_DSTATE[0];
    rtb_signal1_j_idx_1 = Chrg_ARID_DEF.UnitDelay_1_DSTATE[1];
    rtb_signal1_j_idx_2 = Chrg_ARID_DEF.UnitDelay_1_DSTATE[2];
  }

  /* SignalConversion: '<S48>/Signal Copy1' */
  Chrg_noSngBookStrtYearEEW = rtb_UnitDelay1_p;

  /* SignalConversion: '<S48>/Signal Copy2' */
  Chrg_noSngBookStrtMthEEW = rtb_signal1_j_idx_1;

  /* SignalConversion: '<S48>/Signal Copy3' */
  Chrg_noSngBookStrtDayEEW = rtb_signal1_j_idx_2;

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* SignalConversion: '<S1>/Signal Copy11' incorporates:
   *  Inport: '<Root>/Chrg_noSngBookStopDayEER'
   */
  (void)Rte_Read_Chrg_noSngBookStopDayEER_Value((uint8 *)
    &Chrg_noSngBookStopDayEER);

  /* SignalConversion: '<S1>/Signal Copy10' incorporates:
   *  Inport: '<Root>/Chrg_noSngBookStopMthEER'
   */
  (void)Rte_Read_Chrg_noSngBookStopMthEER_Value((uint8 *)
    &Chrg_noSngBookStopMthEER);

  /* SignalConversion: '<S1>/Signal Copy9' incorporates:
   *  Inport: '<Root>/Chrg_noSngBookStopYearEER'
   */
  (void)Rte_Read_Chrg_noSngBookStopYearEER_Value((uint8 *)
    &Chrg_noSngBookStopYearEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Switch: '<S48>/Switch1' incorporates:
   *  RelationalOperator: '<S48>/Equal'
   *  RelationalOperator: '<S48>/Equal16'
   *  RelationalOperator: '<S48>/Equal4'
   *  RelationalOperator: '<S48>/Equal5'
   *  Switch: '<S48>/Switch6'
   *  Switch: '<S48>/Switch7'
   */
  if (rtb_TmpSignalConversionAtict_ac != Chrg_noSngBookStrtYearEEW) {
    /* Switch: '<S48>/Switch2' incorporates:
     *  Constant: '<S48>/FALSE'
     *  Constant: '<S48>/TRUE'
     *  RelationalOperator: '<S48>/Equal3'
     *
     * Block description for '<S48>/FALSE':
     *  FALSE
     *
     * Block description for '<S48>/TRUE':
     *  TRUE
     */
    if (rtb_TmpSignalConversionAtict_ac < Chrg_noSngBookStrtYearEEW) {
      tmp_0 = true;
    } else {
      tmp_0 = false;
    }

    /* End of Switch: '<S48>/Switch2' */
  } else if (rtb_TmpSignalConversionAtictc_c != Chrg_noSngBookStrtMthEEW) {
    /* Switch: '<S48>/Switch8' incorporates:
     *  Constant: '<S48>/FALSE1'
     *  Constant: '<S48>/TRUE1'
     *  RelationalOperator: '<S48>/Equal6'
     *  Switch: '<S48>/Switch6'
     *
     * Block description for '<S48>/FALSE1':
     *  FALSE
     *
     * Block description for '<S48>/TRUE1':
     *  TRUE
     */
    if (rtb_TmpSignalConversionAtictc_c < Chrg_noSngBookStrtMthEEW) {
      tmp_0 = true;
    } else {
      tmp_0 = false;
    }

    /* End of Switch: '<S48>/Switch8' */
  } else if (rtb_TmpSignalConversionAtict_br != Chrg_noSngBookStrtDayEEW) {
    /* Switch: '<S48>/Switch12' incorporates:
     *  Constant: '<S48>/FALSE2'
     *  Constant: '<S48>/TRUE2'
     *  RelationalOperator: '<S48>/Equal7'
     *  Switch: '<S48>/Switch6'
     *  Switch: '<S48>/Switch7'
     *
     * Block description for '<S48>/FALSE2':
     *  FALSE
     *
     * Block description for '<S48>/TRUE2':
     *  TRUE
     */
    if (rtb_TmpSignalConversionAtict_br < Chrg_noSngBookStrtDayEEW) {
      tmp_0 = true;
    } else {
      tmp_0 = false;
    }

    /* End of Switch: '<S48>/Switch12' */
  } else {
    tmp_0 = (Chrg_minNow < Chrg_minBookChrgStrt);
  }

  /* Logic: '<S48>/AND' incorporates:
   *  Switch: '<S48>/Switch1'
   */
  Chrg_bSglBookChrgNotStrt = (rtb_bDcChging && tmp_0);

  /* Switch generated from: '<S48>/Switch3' incorporates:
   *  Switch generated from: '<S48>/Switch'
   */
  if (rtb_LogicalOperator2_e0) {
    /* Switch generated from: '<S48>/Switch4' */
    if (!rtb_AND1_n) {
      /* Switch generated from: '<S48>/Switch5' incorporates:
       *  RelationalOperator: '<S48>/Equal8'
       */
      if (Chrg_minBookChrgEnd <= Chrg_minBookChrgStrt) {
        /* Sum: '<S47>/Add6' */
        if ((uint32)tmp_1 > 255U) {
          tmp_1 = 255;
        }

        /* Switch generated from: '<S48>/Switch3' incorporates:
         *  Sum: '<S47>/Add6'
         */
        rtb_Add6_c = (uint8)tmp_1;

        /* MultiPortSwitch: '<S47>/Multiport Switch' */
        switch (rtb_TmpSignalConversionAtictc_c) {
         case 1:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint10'
           */
          rtb_MultiportSwitch = ((uint8)31U);
          break;

         case 2:
          /* Math: '<S47>/Mod' incorporates:
           *  Constant: '<S47>/uint5'
           */
          if (((uint8)4U) == 0) {
            rtb_MultiportSwitch = rtb_TmpSignalConversionAtict_ac;
          } else {
            rtb_MultiportSwitch = (uint8)(rtb_TmpSignalConversionAtict_ac %
              ((uint8)4U));
          }

          /* End of Math: '<S47>/Mod' */

          /* Switch: '<S47>/Switch5' incorporates:
           *  Constant: '<S47>/uint6'
           *  RelationalOperator: '<S47>/Equal8'
           */
          if (rtb_MultiportSwitch == ((uint8)0U)) {
            /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
             *  Constant: '<S47>/uint7'
             */
            rtb_MultiportSwitch = ((uint8)29U);
          } else {
            /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
             *  Constant: '<S47>/uint9'
             */
            rtb_MultiportSwitch = ((uint8)28U);
          }

          /* End of Switch: '<S47>/Switch5' */
          break;

         case 3:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint11'
           */
          rtb_MultiportSwitch = ((uint8)31U);
          break;

         case 4:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint12'
           */
          rtb_MultiportSwitch = ((uint8)30U);
          break;

         case 5:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint13'
           */
          rtb_MultiportSwitch = ((uint8)31U);
          break;

         case 6:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint14'
           */
          rtb_MultiportSwitch = ((uint8)30U);
          break;

         case 7:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint15'
           */
          rtb_MultiportSwitch = ((uint8)31U);
          break;

         case 8:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint16'
           */
          rtb_MultiportSwitch = ((uint8)31U);
          break;

         case 9:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint17'
           */
          rtb_MultiportSwitch = ((uint8)30U);
          break;

         case 10:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint18'
           */
          rtb_MultiportSwitch = ((uint8)31U);
          break;

         case 11:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint20'
           */
          rtb_MultiportSwitch = ((uint8)30U);
          break;

         default:
          /* MultiPortSwitch: '<S47>/Multiport Switch' incorporates:
           *  Constant: '<S47>/uint19'
           */
          rtb_MultiportSwitch = ((uint8)31U);
          break;
        }

        /* End of MultiPortSwitch: '<S47>/Multiport Switch' */

        /* Sum: '<S47>/Add5' */
        if ((uint32)rtb_Switch_lt > 255U) {
          rtb_Switch_lt = 255;
        }

        /* RelationalOperator: '<S47>/Equal13' incorporates:
         *  Sum: '<S47>/Add5'
         */
        rtb_Delay_k = ((uint8)rtb_Switch_lt > rtb_MultiportSwitch);

        /* Switch: '<S47>/Switch7' incorporates:
         *  Constant: '<S47>/uint23'
         *  RelationalOperator: '<S47>/Equal14'
         *  Sum: '<S47>/Add6'
         *  Switch: '<S47>/Switch6'
         *  Switch: '<S47>/Switch9'
         */
        if ((uint8)tmp_1 > ((uint8)12U)) {
          /* Switch generated from: '<S48>/Switch3' incorporates:
           *  Constant: '<S47>/uint24'
           *  Switch: '<S47>/Switch7'
           */
          rtb_Add6_c = ((uint8)1U);

          /* Sum: '<S47>/Add7' incorporates:
           *  Constant: '<S47>/uint26'
           */
          idxDelay = (sint32)((uint32)rtb_TmpSignalConversionAtict_ac + ((uint8)
            1U));
          if ((uint32)idxDelay > 255U) {
            idxDelay = 255;
          }

          /* Switch generated from: '<S48>/Switch3' incorporates:
           *  Sum: '<S47>/Add7'
           *  Switch: '<S47>/Switch9'
           */
          rtb_MultiportSwitch = (uint8)idxDelay;
        } else {
          if (!rtb_Delay_k) {
            /* Switch generated from: '<S48>/Switch3' incorporates:
             *  Switch: '<S47>/Switch6'
             *  Switch: '<S47>/Switch7'
             */
            rtb_Add6_c = rtb_TmpSignalConversionAtictc_c;
          }

          /* Switch generated from: '<S48>/Switch3' incorporates:
           *  Switch: '<S47>/Switch9'
           */
          rtb_MultiportSwitch = rtb_TmpSignalConversionAtict_ac;
        }

        /* End of Switch: '<S47>/Switch7' */

        /* Switch: '<S47>/Switch8' */
        if (rtb_Delay_k) {
          /* Switch generated from: '<S48>/Switch3' incorporates:
           *  Constant: '<S47>/uint25'
           *  Switch generated from: '<S48>/Switch5'
           */
          rtb_Add5 = ((uint8)1U);
        } else {
          /* Switch generated from: '<S48>/Switch3' incorporates:
           *  Sum: '<S47>/Add5'
           *  Switch generated from: '<S48>/Switch5'
           */
          rtb_Add5 = (uint8)rtb_Switch_lt;
        }

        /* End of Switch: '<S47>/Switch8' */
      } else {
        /* Switch generated from: '<S48>/Switch3' incorporates:
         *  Switch generated from: '<S48>/Switch5'
         */
        rtb_MultiportSwitch = rtb_TmpSignalConversionAtict_ac;
        rtb_Add6_c = rtb_TmpSignalConversionAtictc_c;
        rtb_Add5 = rtb_TmpSignalConversionAtict_br;
      }
    }
  } else if (rtb_Delay_k) {
    /* Switch generated from: '<S48>/Switch' incorporates:
     *  Switch generated from: '<S48>/Switch3'
     */
    rtb_MultiportSwitch = Chrg_noSngBookStopYearEER;
    rtb_Add6_c = Chrg_noSngBookStopMthEER;
    rtb_Add5 = Chrg_noSngBookStopDayEER;
  } else {
    /* Switch generated from: '<S48>/Switch3' incorporates:
     *  UnitDelay generated from: '<S48>/Unit Delay'
     */
    rtb_MultiportSwitch = Chrg_ARID_DEF.UnitDelay_2_DSTATE[0];
    rtb_Add6_c = Chrg_ARID_DEF.UnitDelay_2_DSTATE[1];
    rtb_Add5 = Chrg_ARID_DEF.UnitDelay_2_DSTATE[2];
  }

  /* SignalConversion: '<S48>/Signal Copy4' */
  Chrg_noSngBookStopYearEEW = rtb_MultiportSwitch;

  /* SignalConversion: '<S48>/Signal Copy5' */
  Chrg_noSngBookStopMthEEW = rtb_Add6_c;

  /* SignalConversion: '<S48>/Signal Copy6' */
  Chrg_noSngBookStopDayEEW = rtb_Add5;

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/ictcp_pctBookChrgSocSet' */
  (void)Rte_Read_ictcp_pctBookChrgSocSet_Value(&rtb_Switch2);

  /* Inport: '<Root>/icicm_pctBookChrgSocSet' */
  (void)Rte_Read_icicm_pctBookChrgSocSet_Value(&rtb_MinMax5);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Switch: '<S48>/Switch13' incorporates:
   *  RelationalOperator: '<S48>/Equal14'
   *  RelationalOperator: '<S48>/Equal22'
   *  RelationalOperator: '<S48>/Equal24'
   *  Switch: '<S48>/Switch16'
   *  Switch: '<S48>/Switch17'
   */
  if (rtb_TmpSignalConversionAtict_ac != Chrg_noSngBookStopYearEEW) {
    /* Switch: '<S48>/Switch15' incorporates:
     *  RelationalOperator: '<S48>/Equal17'
     */
    if (rtb_TmpSignalConversionAtict_ac < Chrg_noSngBookStopYearEEW) {
      /* Logic: '<S48>/Not1' incorporates:
       *  Constant: '<S48>/TRUE3'
       *
       * Block description for '<S48>/TRUE3':
       *  TRUE
       */
      Chrg_bSngBookChrgOverTi = !true;
    } else {
      /* Logic: '<S48>/Not1' */
      Chrg_bSngBookChrgOverTi = rtb_Logical_Operator4_tmp;
    }

    /* End of Switch: '<S48>/Switch15' */
  } else if (rtb_TmpSignalConversionAtictc_c != Chrg_noSngBookStopMthEEW) {
    /* Switch: '<S48>/Switch18' incorporates:
     *  RelationalOperator: '<S48>/Equal25'
     *  Switch: '<S48>/Switch16'
     */
    if (rtb_TmpSignalConversionAtictc_c < Chrg_noSngBookStopMthEEW) {
      /* Logic: '<S48>/Not1' incorporates:
       *  Constant: '<S48>/TRUE4'
       *
       * Block description for '<S48>/TRUE4':
       *  TRUE
       */
      Chrg_bSngBookChrgOverTi = !true;
    } else {
      /* Logic: '<S48>/Not1' */
      Chrg_bSngBookChrgOverTi = rtb_Logical_Operator4_tmp;
    }

    /* End of Switch: '<S48>/Switch18' */
  } else if (rtb_TmpSignalConversionAtict_br != Chrg_noSngBookStopDayEEW) {
    /* Switch: '<S48>/Switch14' incorporates:
     *  RelationalOperator: '<S48>/Equal26'
     *  Switch: '<S48>/Switch16'
     *  Switch: '<S48>/Switch17'
     */
    if (rtb_TmpSignalConversionAtict_br < Chrg_noSngBookStopDayEEW) {
      /* Logic: '<S48>/Not1' incorporates:
       *  Constant: '<S48>/TRUE5'
       *
       * Block description for '<S48>/TRUE5':
       *  TRUE
       */
      Chrg_bSngBookChrgOverTi = !true;
    } else {
      /* Logic: '<S48>/Not1' */
      Chrg_bSngBookChrgOverTi = rtb_Logical_Operator4_tmp;
    }

    /* End of Switch: '<S48>/Switch14' */
  } else {
    /* Logic: '<S48>/Not1' incorporates:
     *  RelationalOperator: '<S48>/Equal15'
     *  Switch: '<S48>/Switch16'
     *  Switch: '<S48>/Switch17'
     */
    Chrg_bSngBookChrgOverTi = (Chrg_minNow >= Chrg_minBookChrgEnd);
  }

  /* Logic: '<S48>/AND1' */
  rtb_AND4_i = (rtb_bDcChging && Chrg_bSngBookChrgOverTi);

  /* SignalConversion generated from: '<S1>/HvCoorn_bACChrgLink' incorporates:
   *  Inport: '<Root>/HvCoorn_bACChrgLink'
   */
  (void)Rte_Read_HvCoorn_bACChrgLink_Value(&rtb_TmpSignalConversionAtHvCoor);

  /* RelationalOperator: '<S48>/Equal1' incorporates:
   *  Constant: '<S48>/TaskTime_s1'
   *
   * Block description for '<S48>/TaskTime_s1':
   *  [3]
   */
  rtb_Delay_k = (Chrg_stBookChrgMod == ((uint8)3U));

  /* RelationalOperator: '<S48>/Equal2' incorporates:
   *  Constant: '<S48>/TaskTime_s2'
   *
   * Block description for '<S48>/TaskTime_s2':
   *  [2]
   */
  rtb_AND1_n = (Chrg_stBookChrgMod == ((uint8)2U));

  /* SignalConversion generated from: '<S1>/icbms_pctHVBatSOCDisp' incorporates:
   *  Inport: '<Root>/icbms_pctHVBatSOCDisp'
   */
  (void)Rte_Read_icbms_pctHVBatSOCDisp_Value(&rtb_TmpSignalConversionAticbms_);

  /* DataTypeConversion: '<S54>/Data Type Conversion' */
  rtb_TmpSignalConversionAtict_br = (uint8)rtb_MinMax5;

  /* Logic: '<S54>/AND4' incorporates:
   *  Constant: '<S32>/TRUE'
   *  Constant: '<S54>/single'
   *  DataTypeConversion: '<S54>/Data Type Conversion'
   *  RelationalOperator: '<S54>/Equal2'
   *  RelationalOperator: '<S54>/Equal4'
   *  UnitDelay: '<S54>/Unit Delay1'
   *
   * Block description for '<S32>/TRUE':
   *  TRUE
   */
  rtb_LogicalOperator2_e0 = (((uint8)rtb_MinMax5 !=
    Chrg_ARID_DEF.UnitDelay1_DSTATE_m) && ((uint8)rtb_MinMax5 != ((uint8)112U)) &&
    true);

  /* DataTypeConversion: '<S54>/Data Type Conversion1' */
  rtb_TmpSignalConversionAtictc_c = (uint8)rtb_Switch2;

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S32>/TRUE1'
   *  Constant: '<S54>/single1'
   *  DataTypeConversion: '<S54>/Data Type Conversion1'
   *  Logic: '<S54>/AND1'
   *  Logic: '<S54>/AND2'
   *  RelationalOperator: '<S54>/Equal1'
   *  RelationalOperator: '<S54>/Equal3'
   *  UnitDelay: '<S54>/Unit Delay3'
   *
   * Block description for '<S32>/TRUE1':
   *  TRUE
   */
  rtb_bDcChging = (rtb_LogicalOperator2_e0 || (((uint8)rtb_Switch2 !=
    Chrg_ARID_DEF.UnitDelay3_DSTATE_j) && ((uint8)rtb_Switch2 != ((uint8)112U)) &&
    true));

  /* Switch: '<S54>/Switch3' */
  if (rtb_bDcChging) {
    /* Switch: '<S54>/Switch' */
    if (rtb_LogicalOperator2_e0) {
      /* Switch: '<S54>/Switch3' incorporates:
       *  DataTypeConversion: '<S54>/Data Type Conversion'
       */
      rtb_TmpSignalConversionAtict_ac = (uint8)rtb_MinMax5;
    } else {
      /* Switch: '<S54>/Switch3' incorporates:
       *  DataTypeConversion: '<S54>/Data Type Conversion1'
       */
      rtb_TmpSignalConversionAtict_ac = (uint8)rtb_Switch2;
    }

    /* End of Switch: '<S54>/Switch' */
  } else {
    /* Switch: '<S54>/Switch3' incorporates:
     *  UnitDelay: '<S54>/Unit Delay2'
     */
    rtb_TmpSignalConversionAtict_ac = Chrg_ARID_DEF.UnitDelay2_DSTATE_j;
  }

  /* End of Switch: '<S54>/Switch3' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* SignalConversion: '<S1>/Signal Copy5' incorporates:
   *  Inport: '<Root>/Chrg_pctBookChrgSocSetEER'
   */
  (void)Rte_Read_Chrg_pctBookChrgSocSetEER_Value((float32 *)
    &Chrg_pctBookChrgSocSetEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* RelationalOperator: '<S57>/Relational Operator' incorporates:
   *  Constant: '<S57>/single4'
   *  UnitDelay: '<S57>/Unit Delay'
   */
  rtb_LogicalOperator2_e0 = (Chrg_ARID_DEF.UnitDelay_DSTATE_c > 0);

  /* Logic: '<S56>/Logical_Operator4' incorporates:
   *  Logic: '<S56>/Logical Operator1'
   *  Logic: '<S56>/Logical_Operator5'
   *  Logic: '<S57>/Logical Operator2'
   *  UnitDelay: '<S54>/UnitDelay'
   *  UnitDelay: '<S56>/Unit Delay'
   */
  Chrg_bBookChrgSocSetEna = ((!rtb_LogicalOperator2_e0) &&
    (!Chrg_ARID_DEF.UnitDelay_DSTATE_il) && (rtb_bDcChging ||
    Chrg_bBookChrgSocSetEna));

  /* Switch: '<S54>/Switch2' incorporates:
   *  Constant: '<S26>/uint2'
   *  Constant: '<S26>/uint8'
   *  Logic: '<S26>/OR'
   *  RelationalOperator: '<S26>/Equal'
   *  RelationalOperator: '<S26>/Equal1'
   *  Switch: '<S26>/Switch'
   */
  if (Chrg_bBookChrgSocSetEna) {
    /* Switch: '<S54>/Switch2' incorporates:
     *  DataTypeConversion: '<S54>/Data Type Conversion2'
     */
    Chrg_pctBookChrgSocSetEEW = (float32)rtb_TmpSignalConversionAtict_ac;
  } else if ((Chrg_pctBookChrgSocSetEER > 100.0F) || (Chrg_pctBookChrgSocSetEER <
              50.0F)) {
    /* Switch: '<S26>/Switch' incorporates:
     *  Constant: '<S26>/uint1'
     *  Switch: '<S54>/Switch2'
     */
    Chrg_pctBookChrgSocSetEEW = 100.0F;
  } else {
    /* Switch: '<S54>/Switch2' incorporates:
     *  Switch: '<S26>/Switch'
     */
    Chrg_pctBookChrgSocSetEEW = Chrg_pctBookChrgSocSetEER;
  }

  /* End of Switch: '<S54>/Switch2' */

  /* SignalConversion generated from: '<S1>/HvCoorn_bDCChrgLink' incorporates:
   *  Inport: '<Root>/HvCoorn_bDCChrgLink'
   */
  (void)Rte_Read_HvCoorn_bDCChrgLink_Value(&rtb_TmpSignalConversionAtHvCo_i);

  /* Logic: '<S58>/Logical Operator' incorporates:
   *  Logic: '<S19>/OR'
   *  Logic: '<S70>/Logical Operator'
   *  Logic: '<S9>/Logical Operator3'
   *  Switch: '<S19>/Switch'
   */
  rtb_Logical_Operator4_tmp = !rtb_TmpSignalConversionAtHvCoor;

  /* Logic: '<S59>/Logical Operator' incorporates:
   *  Logic: '<S19>/OR'
   *  Logic: '<S74>/Logical Operator'
   *  Logic: '<S9>/Logical Operator14'
   *  Switch: '<S19>/Switch'
   */
  Chrg_bChrgStopBySOCLim_tmp = !rtb_TmpSignalConversionAtHvCo_i;

  /* Logic: '<S60>/Logical_Operator4' incorporates:
   *  Constant: '<S55>/Calibration4'
   *  Logic: '<S55>/OR'
   *  Logic: '<S58>/Logical Operator'
   *  Logic: '<S59>/Logical Operator'
   *  Logic: '<S60>/Logical Operator1'
   *  Logic: '<S60>/Logical_Operator5'
   *  RelationalOperator: '<S55>/Equal'
   *  RelationalOperator: '<S55>/Equal1'
   *  Sum: '<S55>/Add1'
   *  UnitDelay: '<S58>/Unit Delay2'
   *  UnitDelay: '<S59>/Unit Delay2'
   *  UnitDelay: '<S60>/Unit Delay'
   *
   * Block description for '<S55>/Calibration4':
   *  [1]
   */
  Chrg_bChrgStopBySOCLim = ((rtb_TmpSignalConversionAticbms_ >
    Chrg_pctBookChrgSocSetEEW - Chrg_pctChrgRstrtSoc_C) &&
    (rtb_Logical_Operator4_tmp || Chrg_ARID_DEF.UnitDelay2_DSTATE_m) &&
    (Chrg_bChrgStopBySOCLim_tmp || Chrg_ARID_DEF.UnitDelay2_DSTATE_f) &&
    ((rtb_TmpSignalConversionAticbms_ >= Chrg_pctBookChrgSocSetEEW) ||
     Chrg_bChrgStopBySOCLim));

  /* SignalConversion generated from: '<S1>/icicm_bBookChrgUpLimReq' incorporates:
   *  Inport: '<Root>/icicm_bBookChrgUpLimReq'
   */
  (void)Rte_Read_icicm_bBookChrgUpLimReq_Value(&rtb_TmpSignalConversionAticic_m);

  /* SignalConversion generated from: '<S1>/ictcp_bBookChrgUpLimReq' incorporates:
   *  Inport: '<Root>/ictcp_bBookChrgUpLimReq'
   */
  (void)Rte_Read_ictcp_bBookChrgUpLimReq_Value(&rtb_TmpSignalConversionAtictc_n);

  /* Logic: '<S52>/Logical_Operator4' incorporates:
   *  Logic: '<S48>/OR'
   *  Logic: '<S50>/Logical Operator'
   *  Logic: '<S51>/Logical Operator'
   *  Logic: '<S52>/Logical Operator1'
   *  Logic: '<S52>/Logical_Operator5'
   *  RelationalOperator: '<S49>/Relational Operator'
   *  UnitDelay: '<S49>/Unit Delay2'
   *  UnitDelay: '<S50>/Unit Delay2'
   *  UnitDelay: '<S51>/Unit Delay2'
   *  UnitDelay: '<S52>/Unit Delay'
   */
  rtb_AND4_i = (((!rtb_Delay_k) || Chrg_ARID_DEF.UnitDelay2_DSTATE_cw) &&
                ((!rtb_AND1_n) || Chrg_ARID_DEF.UnitDelay2_DSTATE_e) &&
                (rtb_TmpSignalConversionAtHvCoor ==
                 Chrg_ARID_DEF.UnitDelay2_DSTATE_hs) && (rtb_AND4_i ||
    Chrg_ARID_DEF.UnitDelay_DSTATE_kx));

  /* Switch: '<S48>/Switch9' incorporates:
   *  Logic: '<S48>/OR2'
   */
  if (rtb_TmpSignalConversionAticic_m || rtb_TmpSignalConversionAtictc_n) {
    /* Switch: '<S48>/Switch9' */
    Chrg_bBookChrgCmpl = Chrg_bChrgStopBySOCLim;
  } else {
    /* Switch: '<S48>/Switch9' */
    Chrg_bBookChrgCmpl = rtb_AND4_i;
  }

  /* End of Switch: '<S48>/Switch9' */

  /* Switch: '<S31>/Switch2' incorporates:
   *  RelationalOperator: '<S31>/Equal'
   */
  if (Chrg_minBookChrgStrt < Chrg_minBookChrgEnd) {
    /* Switch: '<S31>/Switch2' incorporates:
     *  Logic: '<S31>/AND6'
     *  RelationalOperator: '<S31>/Equal3'
     *  RelationalOperator: '<S31>/Equal4'
     */
    rtb_RelationalOperator1_lk = ((Chrg_minBookChrgStrt <= Chrg_minNow) &&
      (Chrg_minNow < Chrg_minBookChrgEnd));
  } else {
    /* Switch: '<S31>/Switch2' incorporates:
     *  Logic: '<S31>/AND2'
     *  RelationalOperator: '<S31>/Equal5'
     *  RelationalOperator: '<S31>/Equal6'
     */
    rtb_RelationalOperator1_lk = ((Chrg_minNow >= Chrg_minBookChrgStrt) ||
      (Chrg_minNow < Chrg_minBookChrgEnd));
  }

  /* End of Switch: '<S31>/Switch2' */

  /* Switch: '<S31>/Switch' incorporates:
   *  Logic: '<S31>/AND3'
   *  Logic: '<S31>/OR'
   *  Logic: '<S31>/OR1'
   *  RelationalOperator: '<S31>/Equal1'
   *  UnitDelay: '<S31>/UnitDelay'
   */
  if (rtb_TmpSignalConversionAticic_m || rtb_TmpSignalConversionAtictc_n) {
    tmp_0 = ((Chrg_minBookChrgStrt != Chrg_ARID_DEF.UnitDelay_DSTATE_d) ||
             Chrg_bChrgStopBySOCLim);
  } else {
    tmp_0 = !rtb_RelationalOperator1_lk;
  }

  /* Logic: '<S53>/Logical_Operator4' incorporates:
   *  Logic: '<S53>/Logical Operator1'
   *  Logic: '<S53>/Logical_Operator5'
   *  Switch: '<S31>/Switch'
   *  UnitDelay: '<S53>/Unit Delay'
   */
  Chrg_bCycleBookChrgStopBef = ((!tmp_0) && (rtb_RelationalOperator1_lk ||
    Chrg_bCycleBookChrgStopBef));

  /* Logic: '<S31>/AND4' incorporates:
   *  Constant: '<S31>/TaskTime_s8'
   *  Logic: '<S31>/AND1'
   *  RelationalOperator: '<S31>/Equal22'
   *
   * Block description for '<S31>/TaskTime_s8':
   *  [3]
   */
  rtb_bDcChging = ((Chrg_stBookChrgMod == ((uint8)3U)) &&
                   (!Chrg_bCycleBookChrgStopBef));

  /* Switch: '<S57>/Switch' incorporates:
   *  Switch: '<S57>/Switch1'
   *  UnitDelay: '<S54>/UnitDelay'
   */
  if (Chrg_ARID_DEF.UnitDelay_DSTATE_il) {
    /* Product: '<S57>/Divide' incorporates:
     *  Constant: '<S54>/Calibration3'
     *
     * Block description for '<S54>/Calibration3':
     *  [0.1]
     */
    u = Chrg_tiBookChrgSocEEEna_C / Chrg_ConstB.Max;

    /* DataTypeConversion: '<S57>/DataTypeConversion' */
    v = fabsf(u);
    if (v < 8.388608E+6F) {
      if (v >= 0.5F) {
        /* Update for UnitDelay: '<S57>/Unit Delay' incorporates:
         *  Saturate: '<S57>/Saturation2'
         *  Switch: '<S126>/Switch'
         */
        Chrg_ARID_DEF.UnitDelay_DSTATE_c = (sint32)floorf(u + 0.5F);
      } else {
        /* Update for UnitDelay: '<S57>/Unit Delay' incorporates:
         *  Saturate: '<S57>/Saturation2'
         *  Switch: '<S126>/Switch'
         */
        Chrg_ARID_DEF.UnitDelay_DSTATE_c = 0;
      }
    } else {
      /* Update for UnitDelay: '<S57>/Unit Delay' incorporates:
       *  Saturate: '<S57>/Saturation2'
       *  Switch: '<S126>/Switch'
       */
      Chrg_ARID_DEF.UnitDelay_DSTATE_c = (sint32)u;
    }

    /* End of DataTypeConversion: '<S57>/DataTypeConversion' */
  } else if (rtb_LogicalOperator2_e0) {
    /* Update for UnitDelay: '<S57>/Unit Delay' incorporates:
     *  Constant: '<S57>/single5'
     *  Saturate: '<S57>/Saturation2'
     *  Sum: '<S57>/Subtract'
     *  Switch: '<S57>/Switch1'
     */
    Chrg_ARID_DEF.UnitDelay_DSTATE_c -= 1;
  }

  /* End of Switch: '<S57>/Switch' */

  /* Logic: '<S61>/Logical_Operator4' incorporates:
   *  Constant: '<S55>/Calibration1'
   *  Constant: '<S55>/Calibration2'
   *  Constant: '<S55>/Calibration3'
   *  Constant: '<S55>/Calibration5'
   *  Logic: '<S55>/AND'
   *  Logic: '<S55>/OR1'
   *  Logic: '<S61>/Logical Operator1'
   *  Logic: '<S61>/Logical_Operator5'
   *  RelationalOperator: '<S55>/Equal2'
   *  RelationalOperator: '<S55>/Equal3'
   *  RelationalOperator: '<S55>/Equal4'
   *  RelationalOperator: '<S55>/Equal5'
   *  UnitDelay: '<S61>/Unit Delay'
   *
   * Block description for '<S55>/Calibration1':
   *  [2]
   *
   * Block description for '<S55>/Calibration2':
   *  [11]
   *
   * Block description for '<S55>/Calibration3':
   *  [1]
   *
   * Block description for '<S55>/Calibration5':
   *  [3]
   */
  Chrg_bChrg4LowSoc = ((rtb_TmpSignalConversionAticbms_ <
                        Chrg_pctBookChrgRstrtSocHiTrs_C) &&
                       (((rtb_TmpSignalConversionAticbms_ <=
    Chrg_pctBookChrgRstrtSocLowTrs_C) && ((Chrg_stBookChrgMod == ((uint8)3U)) ||
    (Chrg_stBookChrgMod == ((uint8)2U)))) || Chrg_bChrg4LowSoc));

  /* Logic: '<S33>/OR2' incorporates:
   *  Constant: '<S33>/Calibration5'
   *  Logic: '<S33>/Not'
   *  Logic: '<S33>/OR'
   *  Logic: '<S33>/OR1'
   *  Logic: '<S48>/OR1'
   *
   * Block description for '<S33>/Calibration5':
   *  [0]
   */
  Chrg_bBookChrgStop = ((rtb_bDcChging || (Chrg_bSglBookChrgNotStrt ||
    Chrg_bBookChrgCmpl)) && (!Chrg_bChrg4LowSoc) &&
                        (rtb_TmpSignalConversionAtHvCoor ||
    Chrg_bACBookChrgStopByp_C));

  /* Switch: '<S33>/Switch' incorporates:
   *  Constant: '<S33>/TaskTime_s1'
   *  Constant: '<S33>/TaskTime_s2'
   *  Logic: '<S33>/AND'
   *  Logic: '<S33>/OR7'
   *  RelationalOperator: '<S33>/Equal1'
   *  RelationalOperator: '<S33>/Equal2'
   *
   * Block description for '<S33>/TaskTime_s1':
   *  [3]
   *
   * Block description for '<S33>/TaskTime_s2':
   *  [2]
   */
  if (rtb_TmpSignalConversionAtHvCoor && ((Chrg_stBookChrgMod == ((uint8)3U)) ||
       (Chrg_stBookChrgMod == ((uint8)2U)))) {
    /* Switch: '<S33>/Switch1' */
    if (Chrg_bBookChrgStop) {
      /* Switch: '<S33>/Switch' incorporates:
       *  Constant: '<S33>/uint1'
       */
      Chrg_stBookChrg = ((uint8)1U);
    } else {
      /* Switch: '<S33>/Switch' incorporates:
       *  Constant: '<S33>/uint2'
       */
      Chrg_stBookChrg = ((uint8)2U);
    }

    /* End of Switch: '<S33>/Switch1' */
  } else {
    /* Switch: '<S33>/Switch' incorporates:
     *  Constant: '<S33>/uint8'
     */
    Chrg_stBookChrg = ((uint8)0U);
  }

  /* End of Switch: '<S33>/Switch' */

  /* Switch: '<S33>/Switch2' incorporates:
   *  Logic: '<S33>/OR3'
   *  Switch: '<S33>/Switch3'
   */
  if (Chrg_bBookChrgCmpl) {
    /* Switch: '<S33>/Switch2' incorporates:
     *  Constant: '<S33>/uint3'
     */
    Chrg_stBookChrgStop = ((uint8)2U);
  } else if (Chrg_bSglBookChrgNotStrt || rtb_bDcChging) {
    /* Switch: '<S33>/Switch3' incorporates:
     *  Constant: '<S33>/uint4'
     *  Switch: '<S33>/Switch2'
     */
    Chrg_stBookChrgStop = ((uint8)1U);
  } else {
    /* Switch: '<S33>/Switch2' incorporates:
     *  Constant: '<S33>/uint5'
     *  Switch: '<S33>/Switch3'
     */
    Chrg_stBookChrgStop = ((uint8)0U);
  }

  /* End of Switch: '<S33>/Switch2' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/ipf_bPCAN0x130Vld' */
  (void)Rte_Read_ipf_bPCAN0x130Vld_Value(&rtb_LogicalOperator16);

  /* Inport: '<Root>/DTC_bDiagEnaCdnWkupSho' */
  (void)Rte_Read_DTC_bDiagEnaCdnWkupSho_Value(&tmpRead_7);

  /* Inport: '<Root>/DTC_bDiagRst' */
  (void)Rte_Read_DTC_bDiagRst_Value(&tmpRead_6);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Logic: '<S7>/AND2' incorporates:
   *  Logic: '<S15>/Logical Operator13'
   *  Logic: '<S99>/Logical Operator1'
   */
  rtb_RelationalOperator1_lk = (rtb_TmpSignalConversionAtHvCoor ||
    rtb_TmpSignalConversionAtHvCo_i);

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Logic: '<S7>/AND1'
   *  Logic: '<S7>/AND2'
   */
  rtb_bDcChging = (tmpRead_7 && rtb_LogicalOperator16 &&
                   rtb_RelationalOperator1_lk);

  /* Logic: '<S7>/AND6' incorporates:
   *  Logic: '<S7>/Logical Operator4'
   */
  rtb_LogicalOperator2_e0 = (tmpRead_6 || (!rtb_bDcChging));

  /* SignalConversion generated from: '<S1>/icbms_stChrgFltLvl' incorporates:
   *  Inport: '<Root>/icbms_stChrgFltLvl'
   */
  (void)Rte_Read_icbms_stChrgFltLvl_Value(&rtb_TmpSignalConversionAticbm_k);

  /* Logic: '<S7>/Logical Operator16' incorporates:
   *  Constant: '<S7>/ConstOne1'
   *  Constant: '<S7>/ConstOne5'
   *  RelationalOperator: '<S7>/Relational Operator1'
   *  RelationalOperator: '<S7>/Relational Operator4'
   */
  rtb_LogicalOperator16 = ((rtb_TmpSignalConversionAticbm_k == ((uint8)5U)) ||
    (rtb_TmpSignalConversionAticbm_k == ((uint8)6U)));

  /* Outputs for Enabled SubSystem: '<S62>/Debounce_OBD' incorporates:
   *  EnablePort: '<S64>/Enable'
   */
  /* Logic: '<S63>/Logical Operator' incorporates:
   *  Logic: '<S63>/Logical Operator1'
   *  Logic: '<S63>/Logical Operator2'
   *  Logic: '<S63>/Logical Operator3'
   *  RelationalOperator: '<S63>/Relational Operator'
   *  UnitDelay: '<S62>/Unit Delay1'
   *  UnitDelay: '<S62>/Unit Delay2'
   */
  if ((((!Chrg_ARID_DEF.outRanged) || (Chrg_ARID_DEF.UnitDelay1_DSTATE_l !=
         rtb_LogicalOperator16)) && rtb_bDcChging) || rtb_LogicalOperator2_e0) {
    sint16 rtb_Saturation2_h;
    sint16 rtb_Switch2_p;

    /* Switch: '<S64>/Switch2' incorporates:
     *  Constant: '<S64>/int1'
     *  Logic: '<S64>/Logical Operator'
     *  Logic: '<S65>/Logical Operator'
     *  Logic: '<S65>/Logical Operator1'
     *  RelationalOperator: '<S64>/Relational Operator'
     *  Switch: '<S64>/Switch'
     *  UnitDelay: '<S64>/Unit Delay'
     *  UnitDelay: '<S65>/Unit Delay2'
     */
    if (rtb_LogicalOperator2_e0) {
      /* Switch: '<S64>/Switch2' incorporates:
       *  Constant: '<S64>/int16'
       */
      rtb_Switch2_p = 0;
    } else if (rtb_LogicalOperator16 && (!Chrg_ARID_DEF.UnitDelay2_DSTATE_n) &&
               (Chrg_ARID_DEF.UnitDelay_DSTATE_ag < 0)) {
      /* Switch: '<S64>/Switch' incorporates:
       *  Constant: '<S64>/int16'
       *  Switch: '<S64>/Switch2'
       */
      rtb_Switch2_p = 0;
    } else {
      /* Switch: '<S64>/Switch2' incorporates:
       *  UnitDelay: '<S64>/Unit Delay'
       */
      rtb_Switch2_p = Chrg_ARID_DEF.UnitDelay_DSTATE_ag;
    }

    /* End of Switch: '<S64>/Switch2' */

    /* Switch: '<S64>/Switch4' */
    if (rtb_LogicalOperator16) {
      /* Sum: '<S64>/Sum1' incorporates:
       *  Constant: '<S7>/int9'
       */
      rtb_Switch_lt = 1 + rtb_Switch2_p;
      if (rtb_Switch_lt > 32767) {
        rtb_Switch_lt = 32767;
      } else if (rtb_Switch_lt < -32768) {
        rtb_Switch_lt = -32768;
      }

      /* Saturate: '<S64>/Saturation2' incorporates:
       *  Sum: '<S64>/Sum1'
       */
      rtb_Saturation2_h = (sint16)rtb_Switch_lt;
    } else {
      /* Sum: '<S64>/Sum2' incorporates:
       *  Constant: '<S7>/int8'
       */
      rtb_Switch_lt = (-1) + rtb_Switch2_p;
      if (rtb_Switch_lt > 32767) {
        rtb_Switch_lt = 32767;
      } else if (rtb_Switch_lt < -32768) {
        rtb_Switch_lt = -32768;
      }

      /* Saturate: '<S64>/Saturation2' incorporates:
       *  Sum: '<S64>/Sum2'
       */
      rtb_Saturation2_h = (sint16)rtb_Switch_lt;
    }

    /* End of Switch: '<S64>/Switch4' */

    /* Saturate: '<S64>/Saturation2' */
    if (rtb_Saturation2_h > 32766) {
      /* Saturate: '<S64>/Saturation2' */
      rtb_Saturation2_h = 32766;
    } else if (rtb_Saturation2_h < (-32767)) {
      /* Saturate: '<S64>/Saturation2' */
      rtb_Saturation2_h = (-32767);
    }

    /* End of Saturate: '<S64>/Saturation2' */

    /* RelationalOperator: '<S64>/ROUpLim' incorporates:
     *  Constant: '<S7>/Calibration3'
     *
     * Block description for '<S7>/Calibration3':
     *  [1]
     */
    Chrg_ARID_DEF.outRanged = (Chrg_rBMSChrgFailThd_C < rtb_Saturation2_h);

    /* Sum: '<S7>/Subtract4' incorporates:
     *  Constant: '<S7>/Calibration3'
     *  Constant: '<S7>/Calibration4'
     *
     * Block description for '<S7>/Calibration3':
     *  [1]
     *
     * Block description for '<S7>/Calibration4':
     *  [2]
     */
    rtb_Switch_lt = Chrg_rBMSChrgFailThd_C - Chrg_rBMSChrgFailRcv_C;
    if (rtb_Switch_lt > 32767) {
      rtb_Switch_lt = 32767;
    } else if (rtb_Switch_lt < -32768) {
      rtb_Switch_lt = -32768;
    }

    /* Logic: '<S66>/Logical_Operator4' incorporates:
     *  Logic: '<S64>/LORelay1'
     *  Logic: '<S66>/Logical Operator1'
     *  Logic: '<S66>/Logical_Operator5'
     *  RelationalOperator: '<S64>/ROLoLim'
     *  Sum: '<S7>/Subtract4'
     *  UnitDelay: '<S66>/Unit Delay'
     */
    Chrg_bBMSChrgErr = ((rtb_Saturation2_h >= rtb_Switch_lt) &&
                        (!rtb_LogicalOperator2_e0) && (Chrg_ARID_DEF.outRanged ||
      Chrg_ARID_DEF.UnitDelay_DSTATE_hs));

    /* Update for UnitDelay: '<S65>/Unit Delay2' */
    Chrg_ARID_DEF.UnitDelay2_DSTATE_n = rtb_LogicalOperator16;

    /* Switch: '<S64>/Switch3' */
    if (Chrg_ARID_DEF.outRanged) {
      /* Update for UnitDelay: '<S64>/Unit Delay' */
      Chrg_ARID_DEF.UnitDelay_DSTATE_ag = rtb_Switch2_p;
    } else {
      /* Update for UnitDelay: '<S64>/Unit Delay' */
      Chrg_ARID_DEF.UnitDelay_DSTATE_ag = rtb_Saturation2_h;
    }

    /* End of Switch: '<S64>/Switch3' */

    /* Update for UnitDelay: '<S66>/Unit Delay' */
    Chrg_ARID_DEF.UnitDelay_DSTATE_hs = Chrg_bBMSChrgErr;
  }

  /* End of Logic: '<S63>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S62>/Debounce_OBD' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/VehCfg_bFrntMotByp' */
  (void)Rte_Read_VehCfg_bFrntMotByp_Value(&rtb_RelationalOperator1_pn);

  /* Inport: '<Root>/HvCoorn_bRMCUStalHeatgReq' */
  (void)Rte_Read_HvCoorn_bRMCUStalHeatgReq_Value(&rtb_RelationalOperator1_e);

  /* Inport: '<Root>/HvCoorn_bDCChrgEna' */
  (void)Rte_Read_HvCoorn_bDCChrgEna_Value(&rtb_LogicalOperator2_hm);

  /* Inport: '<Root>/HvCoorn_bACChrgEna' */
  (void)Rte_Read_HvCoorn_bACChrgEna_Value(&rtb_RelationalOperator_j);

  /* Inport: '<Root>/VehSpd_vVeh' */
  (void)Rte_Read_VehSpd_vVeh_Value(&tmpRead_4);

  /* Inport: '<Root>/icdc_stMode' */
  (void)Rte_Read_icdc_stMode_Value(&tmpRead_1);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Abs: '<S8>/Abs1'
   *  Constant: '<S8>/chc_vVehChgAllowed_C'
   *  Constant: '<S8>/chc_vVehChgAllowed_C1'
   *  Constant: '<S8>/icdc_buckDcdc'
   *  Logic: '<S8>/Logical Operator11'
   *  Logic: '<S8>/Logical Operator12'
   *  Logic: '<S8>/Logical Operator9'
   *  RelationalOperator: '<S8>/Relational Operator2'
   *  RelationalOperator: '<S8>/Relational Operator3'
   *
   * Block description for '<S8>/chc_vVehChgAllowed_C':
   *  [3]
   *
   * Block description for '<S8>/chc_vVehChgAllowed_C1':
   *  [1]
   *
   * Block description for '<S8>/icdc_buckDcdc':
   *  [3]
   */
  rtb_bDcChging = ((!Chrg_bBMSChrgErr) && (fabsf(tmpRead_4) <
    Chrg_vVehChrgAllwd_C) && ((tmpRead_1 == ((uint8)3U)) ||
    Chrg_bChrgReqBypDcdcMod_C));

  /* SignalConversion generated from: '<S1>/icfm_stMode' incorporates:
   *  Inport: '<Root>/icfm_stMode'
   */
  (void)Rte_Read_icfm_stMode_Value(&rtb_TmpSignalConversionAticfm_s);

  /* SignalConversion generated from: '<S1>/icrm_stMode' incorporates:
   *  Inport: '<Root>/icrm_stMode'
   */
  (void)Rte_Read_icrm_stMode_Value(&rtb_TmpSignalConversionAticrm_s);

  /* Logic: '<S121>/Logical Operator2' incorporates:
   *  Constant: '<S8>/chc_bMotStNoChkMan_C'
   *  Constant: '<S8>/icm_trqCtrl'
   *  Constant: '<S8>/icm_trqCtrl1'
   *  Constant: '<S8>/icm_trqCtrl2'
   *  Constant: '<S8>/icm_trqCtrl3'
   *  Logic: '<S8>/Logical Operator2'
   *  Logic: '<S8>/Logical Operator5'
   *  Logic: '<S8>/Logical Operator6'
   *  Logic: '<S8>/Logical Operator7'
   *  Logic: '<S8>/Logical Operator8'
   *  RelationalOperator: '<S8>/Relational Operator1'
   *  RelationalOperator: '<S8>/Relational Operator4'
   *  RelationalOperator: '<S8>/Relational Operator5'
   *  RelationalOperator: '<S8>/Relational Operator6'
   *
   * Block description for '<S8>/chc_bMotStNoChkMan_C':
   *  [1]
   *
   * Block description for '<S8>/icm_trqCtrl':
   *  [4]
   *
   * Block description for '<S8>/icm_trqCtrl1':
   *  [5]
   *
   * Block description for '<S8>/icm_trqCtrl2':
   *  [4]
   *
   * Block description for '<S8>/icm_trqCtrl3':
   *  [5]
   */
  rtb_LogicalOperator2_e0 = (((((rtb_TmpSignalConversionAticfm_s != ((uint8)4U))
    && (rtb_TmpSignalConversionAticfm_s != ((uint8)5U))) ||
    rtb_RelationalOperator1_pn) && ((rtb_TmpSignalConversionAticrm_s != ((uint8)
    4U)) && (rtb_TmpSignalConversionAticrm_s != ((uint8)5U)))) ||
    Chrg_bMotStNoChkMan_C);

  /* Logic: '<S8>/Logical Operator1' incorporates:
   *  Logic: '<S8>/Logical Operator13'
   */
  Chrg_bACChrgReq = (rtb_RelationalOperator_j && (rtb_bDcChging &&
    rtb_LogicalOperator2_e0));

  /* Switch: '<S8>/Switch' incorporates:
   *  Constant: '<S8>/TRUE'
   *
   * Block description for '<S8>/TRUE':
   *  TRUE
   */
  if (rtb_RelationalOperator1_e) {
    rtb_LogicalOperator2_e0 = true;
  }

  /* Logic: '<S8>/Logical Operator4' incorporates:
   *  Constant: '<S8>/icdc_buckDcdc1'
   *  Logic: '<S8>/Logical Operator10'
   *  Switch: '<S8>/Switch'
   *
   * Block description for '<S8>/icdc_buckDcdc1':
   *  [1]
   */
  Chrg_bDCChrgReq = (rtb_bDcChging && rtb_LogicalOperator2_e0 &&
                     rtb_LogicalOperator2_hm && Chrg_bDCChrgFctMan_C);

  /* Logic: '<S9>/Logical Operator1' incorporates:
   *  Logic: '<S9>/Logical Operator10'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  tmp_0 = !Chrg_ARID_DEF.UnitDelay2_DSTATE_bf;

  /* Switch: '<S78>/Switch' incorporates:
   *  Constant: '<S9>/chc_tiTboxChgStpDly_C1'
   *  Logic: '<S9>/Logical Operator1'
   *  Logic: '<S9>/Logical Operator13'
   *  Logic: '<S9>/Logical Operator5'
   *  RelationalOperator: '<S9>/Equal'
   *  UnitDelay: '<S9>/Unit Delay2'
   *
   * Block description for '<S9>/chc_tiTboxChgStpDly_C1':
   *  [1]
   */
  if (tmp_0 && (!Chrg_bACChrgCmpl) && (Chrg_stBookChrgMod == ((uint8)1U)) &&
      rtb_TmpSignalConversionAtHvCoor) {
    /* Sum: '<S78>/Subtract1' incorporates:
     *  Constant: '<S78>/single1'
     *  UnitDelay: '<S78>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_e < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_e)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_e > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_e)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_e + 1;
    }

    /* End of Sum: '<S78>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S78>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S78>/Switch' */

  /* Update for UnitDelay: '<S78>/Unit Delay' incorporates:
   *  Saturate: '<S78>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_e = rtb_Switch_lt;

  /* Product: '<S78>/Divide' incorporates:
   *  Constant: '<S9>/chc_tiAcChgFinishDly_C'
   *
   * Block description for '<S9>/chc_tiAcChgFinishDly_C':
   *  [610]
   */
  u = Chrg_tiACChrgCmplDly_C / Chrg_ConstB.Max_o;

  /* DataTypeConversion: '<S78>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* RelationalOperator: '<S78>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S78>/DataTypeConversion'
   *  Saturate: '<S78>/Saturation2'
   */
  rtb_LogicalOperator2_e0 = (rtb_Switch_lt > (sint32)u);

  /* Switch: '<S79>/Switch' incorporates:
   *  Logic: '<S9>/Logical Operator16'
   *  Logic: '<S9>/Logical Operator8'
   *  UnitDelay: '<S9>/Unit Delay3'
   */
  if (rtb_TmpSignalConversionAtHvCo_i && tmp_0 && (!Chrg_bDCChrgCmpl)) {
    /* Sum: '<S79>/Subtract1' incorporates:
     *  Constant: '<S79>/single1'
     *  UnitDelay: '<S79>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_k < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_k)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_k > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_k)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_k + 1;
    }

    /* End of Sum: '<S79>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S79>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S79>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/icbms_stDcChrg' */
  (void)Rte_Read_icbms_stDcChrg_Value(&tmpRead);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Update for UnitDelay: '<S79>/Unit Delay' incorporates:
   *  Saturate: '<S79>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_k = rtb_Switch_lt;

  /* Product: '<S79>/Divide' incorporates:
   *  Constant: '<S9>/chc_tiAcChgFinishDly_C1'
   *
   * Block description for '<S9>/chc_tiAcChgFinishDly_C1':
   *  [610]
   */
  u = Chrg_tiDCChrgCmplDly_C / Chrg_ConstB.Max_g;

  /* DataTypeConversion: '<S79>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* RelationalOperator: '<S79>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S79>/DataTypeConversion'
   *  Saturate: '<S79>/Saturation2'
   */
  rtb_RelationalOperator1_pn = (rtb_Switch_lt > (sint32)u);

  /* Switch: '<S80>/Switch' incorporates:
   *  Constant: '<S9>/uint8'
   *  RelationalOperator: '<S9>/Relational Operator3'
   */
  if (tmpRead == ((uint8)3U)) {
    /* Sum: '<S80>/Subtract1' incorporates:
     *  Constant: '<S80>/single1'
     *  UnitDelay: '<S80>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_m < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_m)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_m > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_m)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_m + 1;
    }

    /* End of Sum: '<S80>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S80>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S80>/Switch' */

  /* Update for UnitDelay: '<S80>/Unit Delay' incorporates:
   *  Saturate: '<S80>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_m = rtb_Switch_lt;

  /* Product: '<S80>/Divide' incorporates:
   *  Constant: '<S9>/chc_tiAcChgFinishDly_C4'
   *
   * Block description for '<S9>/chc_tiAcChgFinishDly_C4':
   *  [0.1]
   */
  u = Chrg_tiDCChrgFailCmplDly_C / Chrg_ConstB.Max_a;

  /* DataTypeConversion: '<S80>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* RelationalOperator: '<S80>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S80>/DataTypeConversion'
   *  Saturate: '<S80>/Saturation2'
   */
  rtb_RelationalOperator1_e = (rtb_Switch_lt > (sint32)u);

  /* SignalConversion generated from: '<S1>/icobc_bChrgrCtrlSigCnct' incorporates:
   *  Inport: '<Root>/icobc_bChrgrCtrlSigCnct'
   */
  (void)Rte_Read_icobc_bChrgrCtrlSigCnct_Value(&rtb_TmpSignalConversionAticob_n);

  /* SignalConversion generated from: '<S1>/HvCoorn_bACChrgLinkOk' incorporates:
   *  Inport: '<Root>/HvCoorn_bACChrgLinkOk'
   */
  (void)Rte_Read_HvCoorn_bACChrgLinkOk_Value(&rtb_TmpSignalConversionAtHvCo_e);

  /* SignalConversion generated from: '<S1>/icbms_bDcChrgWkup' incorporates:
   *  Inport: '<Root>/icbms_bDcChrgWkup'
   */
  (void)Rte_Read_icbms_bDcChrgWkup_Value(&rtb_TmpSignalConversionAticb_ft);

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S9>/ChargingFinish'
   *  RelationalOperator: '<S9>/Relational Operator20'
   *  UnitDelay: '<S3>/Unit Delay1'
   *
   * Block description for '<S9>/ChargingFinish':
   *  ChargingCompleted
   */
  rtb_bDcChging = (Chrg_ARID_DEF.UnitDelay1_DSTATE_a == ((uint8)50U));

  /* Switch: '<S81>/Switch' incorporates:
   *  Logic: '<S9>/Logical Operator6'
   */
  if (!rtb_TmpSignalConversionAticob_n) {
    /* Sum: '<S81>/Subtract1' incorporates:
     *  Constant: '<S81>/single1'
     *  UnitDelay: '<S81>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_g < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_g)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_g > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_g)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_g + 1;
    }

    /* End of Sum: '<S81>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S81>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S81>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/icbms_stFltLvl' */
  (void)Rte_Read_icbms_stFltLvl_Value(&tmpRead_0);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Update for UnitDelay: '<S81>/Unit Delay' incorporates:
   *  Saturate: '<S81>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_g = rtb_Switch_lt;

  /* Product: '<S81>/Divide' incorporates:
   *  Constant: '<S9>/chc_tiAcChgFinishDly_C6'
   *
   * Block description for '<S9>/chc_tiAcChgFinishDly_C6':
   *  [0.03]
   */
  u = Chrg_tiACWakeupdisDly_C / Chrg_ConstB.Max_h;

  /* DataTypeConversion: '<S81>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* Logic: '<S76>/Logical_Operator4' incorporates:
   *  Constant: '<S9>/chc_tiAcChgFinishDly_C2'
   *  DataTypeConversion: '<S81>/DataTypeConversion'
   *  Logic: '<S70>/Logical Operator'
   *  Logic: '<S71>/Logical Operator'
   *  Logic: '<S73>/Logical Operator'
   *  Logic: '<S76>/Logical Operator1'
   *  Logic: '<S76>/Logical_Operator5'
   *  Logic: '<S9>/AND'
   *  Logic: '<S9>/Logical Operator11'
   *  Logic: '<S9>/Logical Operator15'
   *  Logic: '<S9>/Logical Operator2'
   *  RelationalOperator: '<S81>/Relational Operator1'
   *  Saturate: '<S81>/Saturation2'
   *  UnitDelay: '<S70>/Unit Delay2'
   *  UnitDelay: '<S71>/Unit Delay2'
   *  UnitDelay: '<S73>/Unit Delay2'
   *  UnitDelay: '<S76>/Unit Delay'
   *
   * Block description for '<S9>/chc_tiAcChgFinishDly_C2':
   *  [0]
   */
  Chrg_bACChrgCmpl = ((rtb_Logical_Operator4_tmp ||
                       Chrg_ARID_DEF.UnitDelay2_DSTATE_l) &&
                      ((!rtb_TmpSignalConversionAticob_n) ||
                       Chrg_ARID_DEF.UnitDelay2_DSTATE_d) &&
                      ((!rtb_TmpSignalConversionAtHvCo_e) ||
                       Chrg_ARID_DEF.UnitDelay2_DSTATE_fl) &&
                      ((rtb_LogicalOperator2_e0 && Chrg_bACChrgCmplByTiEna_C) ||
                       rtb_Logical_Operator4_tmp ||
                       (rtb_TmpSignalConversionAtHvCoor && rtb_bDcChging) ||
                       (rtb_Switch_lt > (sint32)u) || Chrg_bACChrgCmpl));

  /* Logic: '<S75>/Logical Operator' incorporates:
   *  Logic: '<S9>/Logical Operator4'
   */
  rtb_LogicalOperator16 = !rtb_TmpSignalConversionAticb_ft;

  /* Logic: '<S77>/Logical_Operator4' incorporates:
   *  Constant: '<S1>/TRUE'
   *  Constant: '<S9>/chc_tiAcChgFinishDly_C3'
   *  Constant: '<S9>/chc_tiAcChgFinishDly_C5'
   *  Logic: '<S72>/Logical Operator'
   *  Logic: '<S74>/Logical Operator'
   *  Logic: '<S75>/Logical Operator'
   *  Logic: '<S77>/Logical Operator1'
   *  Logic: '<S77>/Logical_Operator5'
   *  Logic: '<S9>/AND1'
   *  Logic: '<S9>/AND2'
   *  Logic: '<S9>/Logical Operator12'
   *  Logic: '<S9>/Logical Operator21'
   *  Logic: '<S9>/Logical Operator7'
   *  UnitDelay: '<S72>/Unit Delay2'
   *  UnitDelay: '<S74>/Unit Delay2'
   *  UnitDelay: '<S75>/Unit Delay2'
   *  UnitDelay: '<S77>/Unit Delay'
   *
   * Block description for '<S1>/TRUE':
   *  TRUE
   *
   * Block description for '<S9>/chc_tiAcChgFinishDly_C3':
   *  [0]
   *
   * Block description for '<S9>/chc_tiAcChgFinishDly_C5':
   *  [1]
   */
  Chrg_bDCChrgCmpl = ((rtb_LogicalOperator16 ||
                       Chrg_ARID_DEF.UnitDelay2_DSTATE_fg) &&
                      (Chrg_bChrgStopBySOCLim_tmp ||
                       Chrg_ARID_DEF.UnitDelay2_DSTATE_mv) && ((!true) ||
    Chrg_ARID_DEF.UnitDelay2_DSTATE_bi) && ((rtb_RelationalOperator1_e &&
    Chrg_bDCChrgFailCmplEna_C) || (rtb_bDcChging &&
    rtb_TmpSignalConversionAtHvCo_i) || Chrg_bChrgStopBySOCLim_tmp ||
    (rtb_RelationalOperator1_pn && Chrg_bDCChrgCmplByTiEna_C) ||
    rtb_LogicalOperator16 || Chrg_bDCChrgCmpl));

  /* Switch: '<S101>/Switch' incorporates:
   *  Constant: '<S15>/ConstOne4'
   *  RelationalOperator: '<S15>/Relational Operator2'
   */
  if (tmpRead_0 >= ((uint8)4U)) {
    /* Sum: '<S101>/Subtract1' incorporates:
     *  Constant: '<S101>/single1'
     *  UnitDelay: '<S101>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_p < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_p)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_p > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_p)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_p + 1;
    }

    /* End of Sum: '<S101>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S101>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S101>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/HvCoorn_bParked4ChDchg' */
  (void)Rte_Read_HvCoorn_bParked4ChDchg_Value(&rtb_LogicalOperator37);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Update for UnitDelay: '<S101>/Unit Delay' incorporates:
   *  Saturate: '<S101>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_p = rtb_Switch_lt;

  /* Product: '<S101>/Divide' incorporates:
   *  Constant: '<S15>/chc_tiWait4BMSErr_C'
   *
   * Block description for '<S15>/chc_tiWait4BMSErr_C':
   *  [0.01]
   */
  u = Chrg_tiWait4BMSErr_C / Chrg_ConstB.Max_oz;

  /* DataTypeConversion: '<S101>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S15>/chc_tiWait4BMSErr_C1'
   *  DataTypeConversion: '<S101>/DataTypeConversion'
   *  Logic: '<S15>/Logical Operator9'
   *  RelationalOperator: '<S101>/Relational Operator1'
   *  Saturate: '<S101>/Saturation2'
   *
   * Block description for '<S15>/chc_tiWait4BMSErr_C1':
   *  [0]
   */
  rtb_bDcChging = ((rtb_Switch_lt > (sint32)u) && Chrg_bEnaBMSDischErr_C);

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/idi_bKeyOn' */
  (void)Rte_Read_idi_bKeyOn_Value(&rtb_LogicalOperator4_i);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Switch: '<S102>/Switch' */
  if (rtb_LogicalOperator4_i) {
    /* Sum: '<S102>/Subtract1' incorporates:
     *  Constant: '<S102>/single1'
     *  UnitDelay: '<S102>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_c0 < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_c0)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_c0 > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_c0)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_c0 + 1;
    }

    /* End of Sum: '<S102>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S102>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S102>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/HvCoorn_bDCLinkTempErr' */
  (void)Rte_Read_HvCoorn_bDCLinkTempErr_Value(&rtb_LogicalOperator10_ex);

  /* Inport: '<Root>/icobc_stErrLvl' */
  (void)Rte_Read_icobc_stErrLvl_Value(&tmpRead_2);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Update for UnitDelay: '<S102>/Unit Delay' incorporates:
   *  Saturate: '<S102>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_c0 = rtb_Switch_lt;

  /* Product: '<S102>/Divide' incorporates:
   *  Constant: '<S15>/chc_tiKeyOnDelay4GearChk_C'
   *
   * Block description for '<S15>/chc_tiKeyOnDelay4GearChk_C':
   *  [0.5]
   */
  u = Chrg_tiKeyOnDly4GearChk_C / Chrg_ConstB.Max_b;

  /* DataTypeConversion: '<S102>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* Logic: '<S121>/Logical Operator2' incorporates:
   *  DataTypeConversion: '<S102>/DataTypeConversion'
   *  Logic: '<S15>/Logical Operator1'
   *  Logic: '<S15>/Logical Operator2'
   *  RelationalOperator: '<S102>/Relational Operator1'
   *  Saturate: '<S102>/Saturation2'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  rtb_LogicalOperator2_e0 = (Chrg_ARID_DEF.UnitDelay2_DSTATE_bf &&
    (!rtb_LogicalOperator37) && (rtb_Switch_lt > (sint32)u));

  /* Switch: '<S100>/Switch' incorporates:
   *  Constant: '<S15>/ConstOne3'
   *  RelationalOperator: '<S15>/Relational Operator13'
   */
  if (tmpRead_2 == ((uint8)1U)) {
    /* Sum: '<S100>/Subtract1' incorporates:
     *  Constant: '<S100>/single1'
     *  UnitDelay: '<S100>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_mt < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_mt)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_mt > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_mt)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_mt + 1;
    }

    /* End of Sum: '<S100>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S100>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S100>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/HvCoorn_stHVP' */
  (void)Rte_Read_HvCoorn_stHVP_Value(&tmpRead_5);

  /* Inport: '<Root>/HvCoorn_bACLinkTempErr' */
  (void)Rte_Read_HvCoorn_bACLinkTempErr_Value(&rtb_LogicalOperator2_ja);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Update for UnitDelay: '<S100>/Unit Delay' incorporates:
   *  Saturate: '<S100>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_mt = rtb_Switch_lt;

  /* Product: '<S100>/Divide' incorporates:
   *  Constant: '<S15>/chc_tiWait4OBCErr_C'
   *
   * Block description for '<S15>/chc_tiWait4OBCErr_C':
   *  [0.01]
   */
  u = Chrg_tiWait4OBCErr_C / Chrg_ConstB.Max_d;

  /* DataTypeConversion: '<S100>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* Logic: '<S99>/Logical_Operator4' incorporates:
   *  Constant: '<S15>/chc_bChgErrDisableMan_C'
   *  Constant: '<S15>/chc_bChgErrEnaMan_C'
   *  Constant: '<S15>/chc_tiWait4BMSErr_C2'
   *  Constant: '<S1>/FALSE3'
   *  DataTypeConversion: '<S100>/DataTypeConversion'
   *  Logic: '<S15>/Logical Operator10'
   *  Logic: '<S15>/Logical Operator12'
   *  Logic: '<S15>/Logical Operator14'
   *  Logic: '<S15>/Logical Operator15'
   *  Logic: '<S15>/Logical Operator16'
   *  Logic: '<S15>/Logical Operator23'
   *  Logic: '<S15>/Logical Operator3'
   *  Logic: '<S15>/Logical Operator4'
   *  Logic: '<S15>/Logical Operator7'
   *  Logic: '<S99>/Logical_Operator5'
   *  RelationalOperator: '<S100>/Relational Operator1'
   *  Saturate: '<S100>/Saturation2'
   *  UnitDelay: '<S3>/Unit Delay2'
   *  UnitDelay: '<S99>/Unit Delay'
   *
   * Block description for '<S15>/chc_bChgErrDisableMan_C':
   *  [1]
   *
   * Block description for '<S15>/chc_bChgErrEnaMan_C':
   *  [0]
   *
   * Block description for '<S15>/chc_tiWait4BMSErr_C2':
   *  [0]
   *
   * Block description for '<S1>/FALSE3':
   *  FALSE
   */
  Chrg_bChrgErrForever = (rtb_RelationalOperator1_lk &&
    (((((rtb_LogicalOperator10_ex || Chrg_bBMSChrgErr || false || rtb_bDcChging ||
         rtb_LogicalOperator2_e0) && rtb_TmpSignalConversionAtHvCo_i) ||
       ((rtb_LogicalOperator2_ja || false || ((rtb_Switch_lt > (sint32)u) &&
    Chrg_bEnaOBCDischErr_C) || rtb_bDcChging || Chrg_bBMSChrgErr ||
         rtb_LogicalOperator2_e0) && rtb_TmpSignalConversionAtHvCoor)) &&
      Chrg_ARID_DEF.UnitDelay2_DSTATE_bf && Chrg_bChrgForeverErrChkEna_C) ||
     Chrg_bChrgForeverErrEnaMan_C || Chrg_bChrgErrForever));

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S10>/readywait'
   *  RelationalOperator: '<S10>/Relational Operator1'
   *
   * Block description for '<S10>/readywait':
   *  SystemReadyWait
   */
  rtb_bDcChging = (tmpRead_5 == ((uint8)89U));

  /* Logic: '<S10>/Logical Operator37' incorporates:
   *  Logic: '<S10>/Logical Operator3'
   *  Logic: '<S10>/Logical Operator5'
   */
  rtb_LogicalOperator37 = ((!rtb_bDcChging) || (Chrg_bACChrgCmpl &&
    Chrg_bDCChrgCmpl));

  /* Switch: '<S84>/Switch' */
  if (rtb_bDcChging) {
    /* Sum: '<S84>/Subtract1' incorporates:
     *  Constant: '<S84>/single1'
     *  UnitDelay: '<S84>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_i < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_i)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_i > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_i)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_i + 1;
    }

    /* End of Sum: '<S84>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S84>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S84>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/HvCoorn_bACChrgPause' */
  (void)Rte_Read_HvCoorn_bACChrgPause_Value(&rtb_LogicalOperator8_i);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Update for UnitDelay: '<S84>/Unit Delay' incorporates:
   *  Saturate: '<S84>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_i = rtb_Switch_lt;

  /* Product: '<S84>/Divide' incorporates:
   *  Constant: '<S10>/chc_tiWait4IntoChargeMode_C'
   *
   * Block description for '<S10>/chc_tiWait4IntoChargeMode_C':
   *  [0.03]
   */
  u = Chrg_tiWait4EnterChrgMode_C / Chrg_ConstB.Max_k;

  /* DataTypeConversion: '<S84>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* Logic: '<S10>/Logical Operator1' incorporates:
   *  Logic: '<S12>/Logical Operator5'
   */
  rtb_RelationalOperator1_lk = !Chrg_bChrgErrForever;

  /* Logic: '<S10>/Logical Operator4' incorporates:
   *  DataTypeConversion: '<S84>/DataTypeConversion'
   *  Logic: '<S10>/Logical Operator1'
   *  Logic: '<S10>/Logical Operator2'
   *  RelationalOperator: '<S84>/Relational Operator1'
   *  Saturate: '<S84>/Saturation2'
   */
  rtb_LogicalOperator4_i = ((Chrg_bACChrgReq || Chrg_bDCChrgReq) &&
    rtb_RelationalOperator1_lk && (rtb_Switch_lt > (sint32)u));

  /* Logic: '<S15>/Logical Operator6' incorporates:
   *  Constant: '<S1>/FALSE2'
   *  Logic: '<S15>/Logical Operator5'
   *
   * Block description for '<S1>/FALSE2':
   *  FALSE
   */
  Chrg_bChrgErrTmp = (rtb_TmpSignalConversionAtHvCoor && (rtb_LogicalOperator8_i
    || false));

  /* Logic: '<S12>/Logical Operator5' incorporates:
   *  Logic: '<S16>/Logical Operator3'
   */
  rtb_LogicalOperator2_e0 = !Chrg_bChrgErrTmp;

  /* Logic: '<S12>/Logical Operator10' incorporates:
   *  Logic: '<S12>/Logical Operator3'
   *  Logic: '<S12>/Logical Operator5'
   */
  rtb_LogicalOperator10_ex = (rtb_LogicalOperator2_e0 &&
    rtb_RelationalOperator1_lk);

  /* SignalConversion generated from: '<S1>/icbms_bAcChrgFull' incorporates:
   *  Inport: '<Root>/icbms_bAcChrgFull'
   */
  (void)Rte_Read_icbms_bAcChrgFull_Value(&rtb_TmpSignalConversionAticbm_l);

  /* Switch: '<S87>/Switch' incorporates:
   *  Constant: '<S12>/AcChargingReq1'
   *  Constant: '<S12>/chc_tiTboxChgStpDly_C1'
   *  Logic: '<S12>/AND'
   *  RelationalOperator: '<S12>/Equal'
   *  RelationalOperator: '<S12>/Relational Operator6'
   *  UnitDelay: '<S3>/Unit Delay1'
   *
   * Block description for '<S12>/AcChargingReq1':
   *  ACChargingEna
   *
   * Block description for '<S12>/chc_tiTboxChgStpDly_C1':
   *  [1]
   */
  if ((Chrg_ARID_DEF.UnitDelay1_DSTATE_a == ((uint8)34U)) && (Chrg_stBookChrgMod
       == ((uint8)1U))) {
    /* Sum: '<S87>/Subtract1' incorporates:
     *  Constant: '<S87>/single1'
     *  UnitDelay: '<S87>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_a < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_a)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_a > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_a)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_a + 1;
    }

    /* End of Sum: '<S87>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S87>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S87>/Switch' */

  /* Update for UnitDelay: '<S87>/Unit Delay' incorporates:
   *  Saturate: '<S87>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_a = rtb_Switch_lt;

  /* Product: '<S87>/Divide' incorporates:
   *  Constant: '<S12>/chc_tiWati4BattChargeMode_C'
   *
   * Block description for '<S12>/chc_tiWati4BattChargeMode_C':
   *  [80]
   */
  u = Chrg_tiWait4ACChrgMode_C / Chrg_ConstB.Max_an;

  /* DataTypeConversion: '<S87>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* Logic: '<S12>/Logical Operator2' incorporates:
   *  DataTypeConversion: '<S87>/DataTypeConversion'
   *  RelationalOperator: '<S87>/Relational Operator1'
   *  Saturate: '<S87>/Saturation2'
   */
  rtb_LogicalOperator2_ja = (rtb_LogicalOperator10_ex && (rtb_Switch_lt >
    (sint32)u));

  /* SignalConversion generated from: '<S1>/icobc_uActObcAcSide' incorporates:
   *  Inport: '<Root>/icobc_uActObcAcSide'
   */
  (void)Rte_Read_icobc_uActObcAcSide_Value(&rtb_TmpSignalConversionAticobc_);

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S12>/chc_uAcInputChgMax_C'
   *  Constant: '<S12>/chc_uAcInputChgMin_C'
   *  Logic: '<S12>/Logical Operator11'
   *  RelationalOperator: '<S12>/Relational Operator2'
   *  RelationalOperator: '<S12>/Relational Operator5'
   *
   * Block description for '<S12>/chc_uAcInputChgMax_C':
   *  [1000]
   *
   * Block description for '<S12>/chc_uAcInputChgMin_C':
   *  [0]
   */
  rtb_bDcChging = ((rtb_TmpSignalConversionAticobc_ >= Chrg_uMinACChrgInp_C) &&
                   (rtb_TmpSignalConversionAticobc_ <= Chrg_uMaxACChrgInp_C));

  /* SignalConversion generated from: '<S1>/icbms_stHvBat' incorporates:
   *  Inport: '<Root>/icbms_stHvBat'
   */
  (void)Rte_Read_icbms_stHvBat_Value(&rtb_TmpSignalConversionAticbm_o);

  /* SignalConversion generated from: '<S1>/icobc_stOBCMode' incorporates:
   *  Inport: '<Root>/icobc_stOBCMode'
   */
  (void)Rte_Read_icobc_stOBCMode_Value(&rtb_TmpSignalConversionAticob_c);

  /* Logic: '<S12>/Logical Operator4' incorporates:
   *  Constant: '<S12>/icbms_acCharge'
   *  Constant: '<S12>/icobc_charging'
   *  Logic: '<S12>/Logical Operator8'
   *  RelationalOperator: '<S12>/Relational Operator1'
   *  RelationalOperator: '<S12>/Relational Operator3'
   *
   * Block description for '<S12>/icbms_acCharge':
   *  [9]
   *
   * Block description for '<S12>/icobc_charging':
   *  [3]
   */
  rtb_LogicalOperator8_i = ((rtb_TmpSignalConversionAticbm_o == ((uint8)9U)) &&
    (rtb_TmpSignalConversionAticob_c == ((uint8)3U)));

  /* Logic: '<S12>/Logical Operator4' incorporates:
   *  Logic: '<S12>/Logical Operator6'
   */
  rtb_RelationalOperator1_pn = (rtb_LogicalOperator8_i && (!rtb_bDcChging));

  /* Logic: '<S12>/Logical Operator8' */
  rtb_RelationalOperator1_e = (rtb_LogicalOperator8_i && rtb_bDcChging);

  /* Logic: '<S13>/Logical Operator8' incorporates:
   *  Constant: '<S1>/TRUE'
   *
   * Block description for '<S1>/TRUE':
   *  TRUE
   */
  rtb_LogicalOperator8_i = (true && rtb_TmpSignalConversionAtHvCo_i);

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Logic: '<S90>/Logical Operator'
   *  Logic: '<S90>/Logical Operator1'
   *  UnitDelay: '<S90>/Unit Delay2'
   */
  rtb_bDcChging = ((!rtb_LogicalOperator8_i) &&
                   Chrg_ARID_DEF.UnitDelay2_DSTATE_ca);

  /* Switch: '<S91>/Switch' incorporates:
   *  Constant: '<S13>/DcChargingEna'
   *  RelationalOperator: '<S13>/Relational Operator6'
   *  UnitDelay: '<S3>/Unit Delay1'
   *
   * Block description for '<S13>/DcChargingEna':
   *  DCChargingEna
   */
  if (Chrg_ARID_DEF.UnitDelay1_DSTATE_a == ((uint8)44U)) {
    /* Sum: '<S91>/Subtract1' incorporates:
     *  Constant: '<S91>/single1'
     *  UnitDelay: '<S91>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_b < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_b)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_b > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_b)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_b + 1;
    }

    /* End of Sum: '<S91>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S91>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S91>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/icbms_bDcChrgFull' */
  (void)Rte_Read_icbms_bDcChrgFull_Value(&rtb_LogicalOperator1_is);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Update for UnitDelay: '<S91>/Unit Delay' incorporates:
   *  Saturate: '<S91>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_b = rtb_Switch_lt;

  /* RelationalOperator: '<S92>/Relational Operator' incorporates:
   *  Constant: '<S92>/single4'
   *  UnitDelay: '<S92>/Unit Delay'
   */
  rtb_RelationalOperator_j = (Chrg_ARID_DEF.UnitDelay_DSTATE_k4 > 0);

  /* Product: '<S91>/Divide' incorporates:
   *  Constant: '<S13>/chc_tiWati4DcChgRls_C'
   *
   * Block description for '<S13>/chc_tiWati4DcChgRls_C':
   *  [140]
   */
  u = Chrg_tiWait4DCChrgRels_C / Chrg_ConstB.Max_gg;

  /* DataTypeConversion: '<S91>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* Logic: '<S13>/Logical Operator2' incorporates:
   *  DataTypeConversion: '<S91>/DataTypeConversion'
   *  Logic: '<S10>/Logical Operator1'
   *  Logic: '<S13>/Logical Operator4'
   *  Logic: '<S92>/Logical Operator2'
   *  RelationalOperator: '<S91>/Relational Operator1'
   *  Saturate: '<S91>/Saturation2'
   */
  rtb_LogicalOperator2_hm = (((rtb_Switch_lt > (sint32)u) ||
    (rtb_RelationalOperator_j || rtb_bDcChging)) && rtb_RelationalOperator1_lk);

  /* Logic: '<S13>/Logical Operator1' incorporates:
   *  Logic: '<S10>/Logical Operator1'
   *  Logic: '<S13>/Logical Operator6'
   *  Logic: '<S13>/Logical Operator7'
   */
  rtb_LogicalOperator1_is = ((!rtb_LogicalOperator2_hm) &&
    rtb_RelationalOperator1_lk && (rtb_TmpSignalConversionAtHvCo_i &&
    rtb_LogicalOperator1_is));

  /* Switch: '<S92>/Switch' incorporates:
   *  Switch: '<S92>/Switch1'
   */
  if (rtb_bDcChging) {
    /* Product: '<S92>/Divide' incorporates:
     *  Constant: '<S13>/chc_tiWati4DcChgRls_C1'
     *
     * Block description for '<S13>/chc_tiWati4DcChgRls_C1':
     *  [0.1]
     */
    u = Chrg_tiDCChrgStopDly_C / Chrg_ConstB.Max_kr;

    /* DataTypeConversion: '<S92>/DataTypeConversion' */
    v = fabsf(u);
    if (v < 8.388608E+6F) {
      if (v >= 0.5F) {
        /* Update for UnitDelay: '<S92>/Unit Delay' incorporates:
         *  Saturate: '<S92>/Saturation2'
         *  Switch: '<S126>/Switch'
         */
        Chrg_ARID_DEF.UnitDelay_DSTATE_k4 = (sint32)floorf(u + 0.5F);
      } else {
        /* Update for UnitDelay: '<S92>/Unit Delay' incorporates:
         *  Saturate: '<S92>/Saturation2'
         *  Switch: '<S126>/Switch'
         */
        Chrg_ARID_DEF.UnitDelay_DSTATE_k4 = 0;
      }
    } else {
      /* Update for UnitDelay: '<S92>/Unit Delay' incorporates:
       *  Saturate: '<S92>/Saturation2'
       *  Switch: '<S126>/Switch'
       */
      Chrg_ARID_DEF.UnitDelay_DSTATE_k4 = (sint32)u;
    }

    /* End of DataTypeConversion: '<S92>/DataTypeConversion' */
  } else if (rtb_RelationalOperator_j) {
    /* Update for UnitDelay: '<S92>/Unit Delay' incorporates:
     *  Constant: '<S92>/single5'
     *  Saturate: '<S92>/Saturation2'
     *  Sum: '<S92>/Subtract'
     *  Switch: '<S92>/Switch1'
     */
    Chrg_ARID_DEF.UnitDelay_DSTATE_k4 -= 1;
  }

  /* End of Switch: '<S92>/Switch' */

  /* RelationalOperator: '<S96>/Relational Operator' incorporates:
   *  Constant: '<S96>/single4'
   *  UnitDelay: '<S96>/Unit Delay'
   */
  rtb_RelationalOperator_j = (Chrg_ARID_DEF.UnitDelay_DSTATE_gh > 0);

  /* SignalConversion generated from: '<S1>/HvCoorn_bBattWarmReq' incorporates:
   *  Inport: '<Root>/HvCoorn_bBattWarmReq'
   */
  (void)Rte_Read_HvCoorn_bBattWarmReq_Value(&rtb_TmpSignalConversionAtHvCo_k);

  /* Switch: '<S95>/Switch' incorporates:
   *  Constant: '<S14>/ChargingFull'
   *  RelationalOperator: '<S14>/Relational Operator6'
   *  UnitDelay: '<S3>/Unit Delay1'
   *
   * Block description for '<S14>/ChargingFull':
   *  ChargingFull
   */
  if (Chrg_ARID_DEF.UnitDelay1_DSTATE_a == ((uint8)48U)) {
    /* Sum: '<S95>/Subtract1' incorporates:
     *  Constant: '<S95>/single1'
     *  UnitDelay: '<S95>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_b3 < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_b3)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_b3 > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_b3)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_b3 + 1;
    }

    /* End of Sum: '<S95>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S95>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S95>/Switch' */

  /* Update for UnitDelay: '<S95>/Unit Delay' incorporates:
   *  Saturate: '<S95>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_b3 = rtb_Switch_lt;

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Logic: '<S14>/Logical Operator11'
   *  Logic: '<S14>/Logical Operator9'
   */
  rtb_bDcChging = (rtb_TmpSignalConversionAtHvCo_e &&
                   (!rtb_TmpSignalConversionAticbm_l));

  /* Switch: '<S96>/Switch' incorporates:
   *  Switch: '<S96>/Switch1'
   */
  if (rtb_TmpSignalConversionAtHvCo_k) {
    /* Product: '<S96>/Divide' incorporates:
     *  Constant: '<S14>/chc_tiExitWarmDelay_C'
     *
     * Block description for '<S14>/chc_tiExitWarmDelay_C':
     *  [3]
     */
    u = Chrg_tiExitBatWarmDly_C / Chrg_ConstB.Max_i;

    /* DataTypeConversion: '<S96>/DataTypeConversion' */
    v = fabsf(u);
    if (v < 8.388608E+6F) {
      if (v >= 0.5F) {
        /* Update for UnitDelay: '<S96>/Unit Delay' incorporates:
         *  Switch: '<S126>/Switch'
         */
        Chrg_ARID_DEF.UnitDelay_DSTATE_gh = (sint32)floorf(u + 0.5F);
      } else {
        /* Update for UnitDelay: '<S96>/Unit Delay' incorporates:
         *  Switch: '<S126>/Switch'
         */
        Chrg_ARID_DEF.UnitDelay_DSTATE_gh = 0;
      }
    } else {
      /* Update for UnitDelay: '<S96>/Unit Delay' incorporates:
       *  Switch: '<S126>/Switch'
       */
      Chrg_ARID_DEF.UnitDelay_DSTATE_gh = (sint32)u;
    }

    /* End of DataTypeConversion: '<S96>/DataTypeConversion' */
  } else if (rtb_RelationalOperator_j) {
    /* Update for UnitDelay: '<S96>/Unit Delay' incorporates:
     *  Constant: '<S96>/single5'
     *  Sum: '<S96>/Subtract'
     *  Switch: '<S126>/Switch'
     *  Switch: '<S96>/Switch1'
     */
    Chrg_ARID_DEF.UnitDelay_DSTATE_gh -= 1;
  }

  /* End of Switch: '<S96>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/icbms_stChrgSts' */
  (void)Rte_Read_icbms_stChrgSts_Value(&tmpRead_8);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* RelationalOperator: '<S16>/Relational Operator14' incorporates:
   *  Constant: '<S16>/ChargingFull'
   *  UnitDelay: '<S3>/Unit Delay1'
   *
   * Block description for '<S16>/ChargingFull':
   *  ChargingTemporaryErr
   */
  rtb_LogicalOperator16 = (Chrg_ARID_DEF.UnitDelay1_DSTATE_a == ((uint8)41U));

  /* Switch: '<S105>/Switch1' incorporates:
   *  Logic: '<S16>/Logical Operator56'
   *  Switch: '<S105>/Switch2'
   */
  if (!rtb_LogicalOperator16) {
    /* Switch: '<S105>/Switch2' incorporates:
     *  Constant: '<S105>/Number1'
     */
    rtb_Switch2 = 0.0F;
  } else {
    /* Switch: '<S105>/Switch2' incorporates:
     *  Constant: '<S16>/TaskTime_s1'
     *  Sum: '<S105>/Sum1'
     *  Switch: '<S105>/Switch1'
     *  UnitDelay: '<S105>/Unit Delay1'
     */
    rtb_Switch2 = 0.01F + Chrg_ARID_DEF.UnitDelay1_DSTATE;
  }

  /* End of Switch: '<S105>/Switch1' */

  /* Chart: '<S3>/A15_ChargeControlStatus' incorporates:
   *  Constant: '<S12>/chc_tiWati4BattChargeMode_C1'
   *  Constant: '<S13>/Constant3'
   *  Constant: '<S13>/chc_tiWati4DcChgRls_C2'
   *  Constant: '<S13>/chc_tiWati4DcChgRls_C3'
   *  Constant: '<S16>/ChargingFull1'
   *  Constant: '<S16>/chc_tiWaitOperateCorr_C'
   *  Constant: '<S16>/chc_tiWaitOperateCorr_C1'
   *  Constant: '<S16>/uint4'
   *  Constant: '<S17>/icbms_acCharge'
   *  Constant: '<S17>/icbms_acCharge1'
   *  Constant: '<S17>/icobc_charging'
   *  Constant: '<S1>/single7'
   *  DataTypeConversion: '<S11>/Rescaler2'
   *  DataTypeConversion: '<S95>/DataTypeConversion'
   *  Logic: '<S10>/Logical Operator1'
   *  Logic: '<S10>/Logical Operator6'
   *  Logic: '<S10>/Logical Operator7'
   *  Logic: '<S11>/Logical Operator11'
   *  Logic: '<S12>/Logical Operator10'
   *  Logic: '<S12>/Logical Operator14'
   *  Logic: '<S12>/Logical Operator7'
   *  Logic: '<S12>/OR'
   *  Logic: '<S13>/Logical Operator9'
   *  Logic: '<S13>/OR'
   *  Logic: '<S14>/Logical Operator1'
   *  Logic: '<S14>/Logical Operator10'
   *  Logic: '<S14>/Logical Operator4'
   *  Logic: '<S14>/Logical Operator5'
   *  Logic: '<S14>/Logical Operator7'
   *  Logic: '<S16>/AND'
   *  Logic: '<S16>/Logical Operator1'
   *  Logic: '<S16>/Logical Operator4'
   *  Logic: '<S16>/Logical Operator5'
   *  Logic: '<S16>/Logical Operator6'
   *  Logic: '<S17>/Logical Operator1'
   *  Logic: '<S17>/Logical Operator2'
   *  Logic: '<S17>/Logical Operator3'
   *  Logic: '<S17>/Logical Operator6'
   *  Logic: '<S96>/Logical Operator2'
   *  RelationalOperator: '<S13>/GreaterOrEqual'
   *  RelationalOperator: '<S13>/Relational Operator1'
   *  RelationalOperator: '<S16>/Equal'
   *  RelationalOperator: '<S16>/Relational Operator1'
   *  RelationalOperator: '<S16>/Relational Operator15'
   *  RelationalOperator: '<S17>/Relational Operator1'
   *  RelationalOperator: '<S17>/Relational Operator2'
   *  RelationalOperator: '<S17>/Relational Operator3'
   *  RelationalOperator: '<S95>/Relational Operator1'
   *  Saturate: '<S95>/Saturation2'
   *  UnitDelay: '<S3>/Unit Delay1'
   *
   * Block description for '<S12>/chc_tiWati4BattChargeMode_C1':
   *  [1]
   *
   * Block description for '<S13>/Constant3':
   *  [8]
   *
   * Block description for '<S13>/chc_tiWati4DcChgRls_C2':
   *  [0]
   *
   * Block description for '<S13>/chc_tiWati4DcChgRls_C3':
   *  [1]
   *
   * Block description for '<S16>/ChargingFull1':
   *  ChargingForeverErr
   *
   * Block description for '<S16>/chc_tiWaitOperateCorr_C':
   *  [60]
   *
   * Block description for '<S16>/chc_tiWaitOperateCorr_C1':
   *  [0]
   *
   * Block description for '<S17>/icbms_acCharge':
   *  [9]
   *
   * Block description for '<S17>/icbms_acCharge1':
   *  [8]
   *
   * Block description for '<S17>/icobc_charging':
   *  [3]
   */
  /* Gateway: Chrg/Chrg_ChargeProcedureControl/A15_ChargeControlStatus */
  /* During: Chrg/Chrg_ChargeProcedureControl/A15_ChargeControlStatus */
  if (Chrg_ARID_DEF.is_active_c1_Chrg == 0U) {
    /* Entry: Chrg/Chrg_ChargeProcedureControl/A15_ChargeControlStatus */
    Chrg_ARID_DEF.is_active_c1_Chrg = 1U;

    /* Entry Internal: Chrg/Chrg_ChargeProcedureControl/A15_ChargeControlStatus */
    /* Transition: '<S18>:4' */
    Chrg_ARID_DEF.is_c1_Chrg = Chrg_IN_ChrgWatchDog;

    /* Entry 'ChrgWatchDog': '<S18>:2' */
    rtb_TmpSignalConversionAticbm_k = 31U;
  } else if (Chrg_ARID_DEF.is_c1_Chrg == Chrg_IN_ChargeMode) {
    /* During 'ChargeMode': '<S18>:3' */
    if (rtb_LogicalOperator37) {
      /* Transition: '<S18>:5' */
      /* Exit Internal 'ChargeMode': '<S18>:3' */
      /* Exit Internal 'ACCharging': '<S18>:34' */
      Chrg_ARID_DEF.is_ACCharging = Chrg_IN_NO_ACTIVE_CHILD;

      /* Exit Internal 'ChargingErr': '<S18>:42' */
      Chrg_ARID_DEF.is_ChargingErr = Chrg_IN_NO_ACTIVE_CHILD;

      /* Exit Internal 'ChargingExit': '<S18>:12' */
      Chrg_ARID_DEF.is_ChargingExit = Chrg_IN_NO_ACTIVE_CHILD;

      /* Exit Internal 'DCCharging': '<S18>:38' */
      Chrg_ARID_DEF.is_DCCharging = Chrg_IN_NO_ACTIVE_CHILD;
      Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_NO_ACTIVE_CHILD;
      Chrg_ARID_DEF.is_c1_Chrg = Chrg_IN_ChrgWatchDog;

      /* Entry 'ChrgWatchDog': '<S18>:2' */
      rtb_TmpSignalConversionAticbm_k = 31U;
    } else {
      switch (Chrg_ARID_DEF.is_ChargeMode) {
       case Chrg_IN_ACCharging:
        /* During 'ACCharging': '<S18>:34' */
        if (Chrg_bChrgErrForever) {
          /* Transition: '<S18>:31' */
          /* Exit Internal 'ACCharging': '<S18>:34' */
          Chrg_ARID_DEF.is_ACCharging = Chrg_IN_NO_ACTIVE_CHILD;
          Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ChargingErr;

          /* Entry Internal 'ChargingErr': '<S18>:42' */
          /* Transition: '<S18>:43' */
          Chrg_ARID_DEF.is_ChargingErr = Chrg_IN_ChargingTemporaryErr;

          /* Entry 'ChargingTemporaryErr': '<S18>:35' */
          rtb_TmpSignalConversionAticbm_k = 41U;
        } else if (rtb_LogicalOperator2_ja) {
          /* Transition: '<S18>:26' */
          /* Exit Internal 'ACCharging': '<S18>:34' */
          Chrg_ARID_DEF.is_ACCharging = Chrg_IN_NO_ACTIVE_CHILD;
          Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ChargingExit;

          /* Entry Internal 'ChargingExit': '<S18>:12' */
          /* Transition: '<S18>:17' */
          Chrg_ARID_DEF.is_ChargingExit = Chrg_IN_ChargingExitIni;

          /* Entry 'ChargingExitIni': '<S18>:14' */
          rtb_TmpSignalConversionAticbm_k = 49U;
        } else if (rtb_LogicalOperator10_ex && (rtb_TmpSignalConversionAtHvCo_e &&
                    rtb_TmpSignalConversionAticbm_l)) {
          /* Transition: '<S18>:25' */
          /* Exit Internal 'ACCharging': '<S18>:34' */
          Chrg_ARID_DEF.is_ACCharging = Chrg_IN_NO_ACTIVE_CHILD;
          Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ChargingFull;

          /* Entry 'ChargingFull': '<S18>:6' */
          rtb_TmpSignalConversionAticbm_k = 48U;
        } else if (Chrg_ARID_DEF.is_ACCharging == Chrg_IN_ACChargingEna) {
          rtb_TmpSignalConversionAticbm_k = 34U;

          /* During 'ACChargingEna': '<S18>:7' */
          if (rtb_RelationalOperator1_e || Chrg_bACChrgEna2ACChrgReqByp_C) {
            /* Transition: '<S18>:10' */
            Chrg_ARID_DEF.is_ACCharging = Chrg_IN_ACChargingReq;

            /* Entry 'ACChargingReq': '<S18>:8' */
            rtb_TmpSignalConversionAticbm_k = 35U;
          }
        } else {
          rtb_TmpSignalConversionAticbm_k = 35U;

          /* During 'ACChargingReq': '<S18>:8' */
          if (rtb_RelationalOperator1_pn) {
            /* Transition: '<S18>:11' */
            Chrg_ARID_DEF.is_ACCharging = Chrg_IN_ACChargingEna;

            /* Entry 'ACChargingEna': '<S18>:7' */
            rtb_TmpSignalConversionAticbm_k = 34U;
          }
        }
        break;

       case Chrg_IN_ChargingErr:
        /* During 'ChargingErr': '<S18>:42' */
        if (rtb_TmpSignalConversionAtHvCo_e && rtb_LogicalOperator2_e0 &&
            rtb_RelationalOperator1_lk && rtb_LogicalOperator16) {
          /* Transition: '<S18>:30' */
          /* Exit Internal 'ChargingErr': '<S18>:42' */
          Chrg_ARID_DEF.is_ChargingErr = Chrg_IN_NO_ACTIVE_CHILD;
          Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ACCharging;

          /* Entry Internal 'ACCharging': '<S18>:34' */
          /* Transition: '<S18>:9' */
          Chrg_ARID_DEF.is_ACCharging = Chrg_IN_ACChargingEna;

          /* Entry 'ACChargingEna': '<S18>:7' */
          rtb_TmpSignalConversionAticbm_k = 34U;
        } else if ((Chrg_bWaitOperateCorrEna_C && (rtb_Switch2 >=
                     Chrg_tiWaitOperateCorr_C)) || (rtb_LogicalOperator16 &&
                    (tmpRead_8 == ((uint8)5U))) ||
                   (Chrg_ARID_DEF.UnitDelay1_DSTATE_a == ((uint8)42U))) {
          /* Transition: '<S18>:27' */
          /* Exit Internal 'ChargingErr': '<S18>:42' */
          Chrg_ARID_DEF.is_ChargingErr = Chrg_IN_NO_ACTIVE_CHILD;
          Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ChargingExit;

          /* Entry Internal 'ChargingExit': '<S18>:12' */
          /* Transition: '<S18>:17' */
          Chrg_ARID_DEF.is_ChargingExit = Chrg_IN_ChargingExitIni;

          /* Entry 'ChargingExitIni': '<S18>:14' */
          rtb_TmpSignalConversionAticbm_k = 49U;
        } else if (Chrg_ARID_DEF.is_ChargingErr == Chrg_IN_ChargingForeverErr) {
          rtb_TmpSignalConversionAticbm_k = 42U;

          /* During 'ChargingForeverErr': '<S18>:36' */
        } else {
          rtb_TmpSignalConversionAticbm_k = 41U;

          /* During 'ChargingTemporaryErr': '<S18>:35' */
          if (Chrg_bChrgErrForever && rtb_LogicalOperator16) {
            /* Transition: '<S18>:44' */
            Chrg_ARID_DEF.is_ChargingErr = Chrg_IN_ChargingForeverErr;

            /* Entry 'ChargingForeverErr': '<S18>:36' */
            rtb_TmpSignalConversionAticbm_k = 42U;
          }
        }
        break;

       case Chrg_IN_ChargingExit:
        /* During 'ChargingExit': '<S18>:12' */
        if (Chrg_ARID_DEF.is_ChargingExit == Chrg_IN_ChargingCompleted) {
          rtb_TmpSignalConversionAticbm_k = 50U;

          /* During 'ChargingCompleted': '<S18>:15' */
        } else {
          rtb_TmpSignalConversionAticbm_k = 49U;

          /* During 'ChargingExitIni': '<S18>:14' */
          if ((rtb_TmpSignalConversionAticob_c != ((uint8)3U)) &&
              (rtb_TmpSignalConversionAticbm_o != ((uint8)9U)) &&
              (rtb_TmpSignalConversionAticbm_o != ((uint8)8U))) {
            /* Transition: '<S18>:18' */
            Chrg_ARID_DEF.is_ChargingExit = Chrg_IN_ChargingCompleted;

            /* Entry 'ChargingCompleted': '<S18>:15' */
            rtb_TmpSignalConversionAticbm_k = 50U;
          }
        }
        break;

       case Chrg_IN_ChargingFull:
        rtb_TmpSignalConversionAticbm_k = 48U;

        /* During 'ChargingFull': '<S18>:6' */
        if (Chrg_bChrgErrForever) {
          /* Transition: '<S18>:32' */
          Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ChargingErr;

          /* Entry Internal 'ChargingErr': '<S18>:42' */
          /* Transition: '<S18>:43' */
          Chrg_ARID_DEF.is_ChargingErr = Chrg_IN_ChargingTemporaryErr;

          /* Entry 'ChargingTemporaryErr': '<S18>:35' */
          rtb_TmpSignalConversionAticbm_k = 41U;
        } else if (rtb_bDcChging && rtb_RelationalOperator1_lk) {
          /* Transition: '<S18>:24' */
          Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ACCharging;

          /* Entry Internal 'ACCharging': '<S18>:34' */
          /* Transition: '<S18>:9' */
          Chrg_ARID_DEF.is_ACCharging = Chrg_IN_ACChargingEna;

          /* Entry 'ACChargingEna': '<S18>:7' */
          rtb_TmpSignalConversionAticbm_k = 34U;
        } else {
          /* Product: '<S95>/Divide' incorporates:
           *  Constant: '<S14>/chc_tiWait4WarmingDet_C'
           *
           * Block description for '<S14>/chc_tiWait4WarmingDet_C':
           *  [1]
           */
          u = Chrg_tiWait4WarmingDet_C / Chrg_ConstB.Max_l;

          /* DataTypeConversion: '<S95>/DataTypeConversion' */
          v = fabsf(u);
          if (v < 8.388608E+6F) {
            if (v >= 0.5F) {
              u = floorf(u + 0.5F);
            } else {
              u = 0.0F;
            }
          }

          if (rtb_RelationalOperator1_lk && (!rtb_bDcChging) &&
              ((!rtb_RelationalOperator_j) && (!rtb_TmpSignalConversionAtHvCo_k)
               && (rtb_Switch_lt > (sint32)u))) {
            /* Transition: '<S18>:33' */
            Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ChargingExit;

            /* Entry Internal 'ChargingExit': '<S18>:12' */
            /* Transition: '<S18>:17' */
            Chrg_ARID_DEF.is_ChargingExit = Chrg_IN_ChargingExitIni;

            /* Entry 'ChargingExitIni': '<S18>:14' */
            rtb_TmpSignalConversionAticbm_k = 49U;
          }
        }
        break;

       default:
        /* During 'DCCharging': '<S18>:38' */
        if (Chrg_bChrgErrForever) {
          /* Transition: '<S18>:23' */
          /* Exit Internal 'DCCharging': '<S18>:38' */
          Chrg_ARID_DEF.is_DCCharging = Chrg_IN_NO_ACTIVE_CHILD;
          Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ChargingErr;

          /* Entry Internal 'ChargingErr': '<S18>:42' */
          /* Transition: '<S18>:43' */
          Chrg_ARID_DEF.is_ChargingErr = Chrg_IN_ChargingTemporaryErr;

          /* Entry 'ChargingTemporaryErr': '<S18>:35' */
          rtb_TmpSignalConversionAticbm_k = 41U;
        } else if (rtb_LogicalOperator2_hm) {
          /* Transition: '<S18>:29' */
          /* Exit Internal 'DCCharging': '<S18>:38' */
          Chrg_ARID_DEF.is_DCCharging = Chrg_IN_NO_ACTIVE_CHILD;
          Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ChargingExit;

          /* Entry Internal 'ChargingExit': '<S18>:12' */
          /* Transition: '<S18>:17' */
          Chrg_ARID_DEF.is_ChargingExit = Chrg_IN_ChargingExitIni;

          /* Entry 'ChargingExitIni': '<S18>:14' */
          rtb_TmpSignalConversionAticbm_k = 49U;
        } else if (rtb_LogicalOperator1_is) {
          /* Transition: '<S18>:28' */
          /* Exit Internal 'DCCharging': '<S18>:38' */
          Chrg_ARID_DEF.is_DCCharging = Chrg_IN_NO_ACTIVE_CHILD;
          Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ChargingFull;

          /* Entry 'ChargingFull': '<S18>:6' */
          rtb_TmpSignalConversionAticbm_k = 48U;
        } else if (Chrg_ARID_DEF.is_DCCharging == Chrg_IN_DCChargingEna) {
          rtb_TmpSignalConversionAticbm_k = 44U;

          /* During 'DCChargingEna': '<S18>:39' */
          if ((rtb_LogicalOperator8_i && (rtb_TmpSignalConversionAticbm_o ==
                ((uint8)8U)) && (300.0F >= Chrg_uDCChrgInpMin_C)) ||
              Chrg_bDCChrgEna2DCChrgReqByp_C) {
            /* Transition: '<S18>:40' */
            Chrg_ARID_DEF.is_DCCharging = Chrg_IN_DCChargingReq;

            /* Entry 'DCChargingReq': '<S18>:41' */
            rtb_TmpSignalConversionAticbm_k = 45U;
          }
        } else {
          rtb_TmpSignalConversionAticbm_k = 45U;

          /* During 'DCChargingReq': '<S18>:41' */
        }
        break;
      }
    }
  } else {
    rtb_TmpSignalConversionAticbm_k = 31U;

    /* During 'ChrgWatchDog': '<S18>:2' */
    if (rtb_LogicalOperator4_i && (!rtb_LogicalOperator37)) {
      /* Transition: '<S18>:1' */
      if (Chrg_bDCChrgReq) {
        /* Transition: '<S18>:22' */
        Chrg_ARID_DEF.is_c1_Chrg = Chrg_IN_ChargeMode;
        Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_DCCharging;

        /* Entry Internal 'DCCharging': '<S18>:38' */
        /* Transition: '<S18>:37' */
        Chrg_ARID_DEF.is_DCCharging = Chrg_IN_DCChargingEna;

        /* Entry 'DCChargingEna': '<S18>:39' */
        rtb_TmpSignalConversionAticbm_k = 44U;
      } else if (Chrg_bACChrgReq) {
        /* Transition: '<S18>:21' */
        /* Transition: '<S18>:16' */
        Chrg_ARID_DEF.is_c1_Chrg = Chrg_IN_ChargeMode;
        Chrg_ARID_DEF.is_ChargeMode = Chrg_IN_ACCharging;

        /* Entry Internal 'ACCharging': '<S18>:34' */
        /* Transition: '<S18>:9' */
        Chrg_ARID_DEF.is_ACCharging = Chrg_IN_ACChargingEna;

        /* Entry 'ACChargingEna': '<S18>:7' */
        rtb_TmpSignalConversionAticbm_k = 34U;
      }
    }
  }

  /* End of Chart: '<S3>/A15_ChargeControlStatus' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/icobc_stChrgrCnct' */
  (void)Rte_Read_icobc_stChrgrCnct_Value(&tmpRead_9);

  /* Inport: '<Root>/ictcp_bChrgStopReq' */
  (void)Rte_Read_ictcp_bChrgStopReq_Value(&rtb_OR1_p);

  /* Inport: '<Root>/icicm_bChrgStopReq' */
  (void)Rte_Read_icicm_bChrgStopReq_Value(&rtb_Logical_Operator4_du);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Logic: '<S19>/Logical Operator4' incorporates:
   *  Constant: '<S19>/AcChargingRls'
   *  Constant: '<S19>/AcChargingRls1'
   *  RelationalOperator: '<S19>/Relational Operator1'
   *  RelationalOperator: '<S19>/Relational Operator6'
   *
   * Block description for '<S19>/AcChargingRls':
   *  ACChargingReq
   *
   * Block description for '<S19>/AcChargingRls1':
   *  DCChargingReq
   */
  Chrg_bCharging = ((rtb_TmpSignalConversionAticbm_k == ((uint8)35U)) ||
                    (rtb_TmpSignalConversionAticbm_k == ((uint8)45U)));

  /* RelationalOperator: '<S19>/Equal1' incorporates:
   *  Constant: '<S19>/Constant9'
   *
   * Block description for '<S19>/Constant9':
   *  [0]
   */
  rtb_TmpSignalConversionAtHvCo_k = (tmpRead_9 == ((uint8)0U));

  /* Logic: '<S19>/OR1' */
  rtb_OR1_p = (rtb_Logical_Operator4_du || rtb_OR1_p);

  /* Logic: '<S111>/Logical Operator' incorporates:
   *  Logic: '<S19>/Not'
   */
  rtb_bDcChging = !rtb_TmpSignalConversionAtHvCo_k;

  /* Logic: '<S112>/Logical_Operator4' incorporates:
   *  Logic: '<S110>/Logical Operator'
   *  Logic: '<S110>/Logical Operator1'
   *  Logic: '<S111>/Logical Operator'
   *  Logic: '<S112>/Logical Operator1'
   *  Logic: '<S112>/Logical_Operator5'
   *  UnitDelay: '<S110>/Unit Delay2'
   *  UnitDelay: '<S111>/Unit Delay2'
   *  UnitDelay: '<S112>/Unit Delay'
   */
  rtb_Logical_Operator4_du = ((rtb_bDcChging ||
    Chrg_ARID_DEF.UnitDelay2_DSTATE_my) && ((rtb_OR1_p &&
    (!Chrg_ARID_DEF.UnitDelay2_DSTATE_jb)) || Chrg_ARID_DEF.UnitDelay_DSTATE_mw));

  /* Logic: '<S19>/AND' */
  Chrg_bChrgDrewOutRmnd = (rtb_Logical_Operator4_du && rtb_bDcChging);

  /* SignalConversion generated from: '<S1>/icicm_bOTAOn' incorporates:
   *  Inport: '<Root>/icicm_bOTAOn'
   */
  (void)Rte_Read_icicm_bOTAOn_Value(&rtb_TmpSignalConversionAtici_n1);

  /* Switch: '<S19>/Switch1' incorporates:
   *  Switch: '<S19>/Switch2'
   *  Switch: '<S19>/Switch3'
   */
  if (Chrg_bBookChrgStop) {
    /* Switch: '<S19>/Switch1' incorporates:
     *  Constant: '<S19>/uint8'
     */
    Chrg_stChrgStopReq = ((uint8)3U);
  } else if (Chrg_bChrgStopBySOCLim) {
    /* Switch: '<S19>/Switch2' incorporates:
     *  Constant: '<S19>/uint1'
     *  Switch: '<S19>/Switch1'
     */
    Chrg_stChrgStopReq = ((uint8)2U);
  } else if (rtb_TmpSignalConversionAtici_n1) {
    /* Switch: '<S19>/Switch3' incorporates:
     *  Constant: '<S19>/uint2'
     *  Switch: '<S19>/Switch1'
     *  Switch: '<S19>/Switch2'
     */
    Chrg_stChrgStopReq = ((uint8)1U);
  } else {
    /* Switch: '<S19>/Switch1' incorporates:
     *  Constant: '<S19>/uint3'
     *  Switch: '<S19>/Switch2'
     *  Switch: '<S19>/Switch3'
     */
    Chrg_stChrgStopReq = ((uint8)0U);
  }

  /* End of Switch: '<S19>/Switch1' */

  /* Switch: '<S19>/Switch' incorporates:
   *  Constant: '<S19>/Constant'
   *  Constant: '<S19>/Constant1'
   *  Constant: '<S19>/chc_tiWati4DcChgRls_C2'
   *  Logic: '<S19>/AND3'
   *  Logic: '<S19>/NOT3'
   *  Logic: '<S19>/OR'
   *  Logic: '<S19>/OR2'
   *
   * Block description for '<S19>/Constant':
   *  [0]
   *
   * Block description for '<S19>/Constant1':
   *  [0]
   *
   * Block description for '<S19>/chc_tiWati4DcChgRls_C2':
   *  [0]
   */
  if (Chrg_bChrgStopReqOvrd_C) {
    tmp_0 = Chrg_bChrgStopReqOvrdVal_C;
  } else {
    tmp_0 = ((rtb_Logical_Operator4_tmp && Chrg_bChrgStopBySOCLim_tmp) ||
             Chrg_bBookChrgStop || (rtb_OR1_p && Chrg_bChrgStopReqSwt_C) ||
             rtb_TmpSignalConversionAtici_n1 || Chrg_bChrgStopBySOCLim ||
             Chrg_bBMSChrgErr);
  }

  /* Switch: '<S113>/Switch' incorporates:
   *  Switch: '<S19>/Switch'
   */
  if (tmp_0) {
    /* Sum: '<S113>/Subtract1' incorporates:
     *  Constant: '<S113>/single1'
     *  UnitDelay: '<S113>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_l < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_l)) {
      /* DataTypeConversion: '<S126>/DataTypeConversion' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_l > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_l)) {
      /* DataTypeConversion: '<S126>/DataTypeConversion' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S126>/DataTypeConversion' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_l + 1;
    }

    /* End of Sum: '<S113>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S126>/DataTypeConversion' incorporates:
     *  Constant: '<S113>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S113>/Switch' */

  /* Update for UnitDelay: '<S113>/Unit Delay' incorporates:
   *  Saturate: '<S113>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_l = rtb_Switch_lt;

  /* Product: '<S113>/Divide' incorporates:
   *  Constant: '<S19>/chc_tiWati4DcChgRls_C1'
   *
   * Block description for '<S19>/chc_tiWati4DcChgRls_C1':
   *  [0.1]
   */
  u = Chrg_tiChrgStopReqDly_C / Chrg_ConstB.Max_kl;

  /* DataTypeConversion: '<S113>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* RelationalOperator: '<S113>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S113>/DataTypeConversion'
   *  Saturate: '<S113>/Saturation2'
   */
  Chrg_bChrgStopReq = (rtb_Switch_lt > (sint32)u);

  /* Switch: '<S20>/Switch' incorporates:
   *  Constant: '<S20>/AcChargingRls'
   *  Constant: '<S20>/AcChargingRls2'
   *  Constant: '<S20>/AcChargingRls3'
   *  Constant: '<S20>/chc_tiWaitOperateCorr_C'
   *  Logic: '<S20>/Logical Operator1'
   *  Logic: '<S20>/Logical Operator3'
   *  RelationalOperator: '<S20>/Relational Operator1'
   *  RelationalOperator: '<S20>/Relational Operator4'
   *  RelationalOperator: '<S20>/Relational Operator5'
   *  Switch: '<S20>/Switch1'
   *
   * Block description for '<S20>/AcChargingRls':
   *  ACChargingReq
   *
   * Block description for '<S20>/AcChargingRls2':
   *  ACChargingEna
   *
   * Block description for '<S20>/AcChargingRls3':
   *  ChargingFull
   *
   * Block description for '<S20>/chc_tiWaitOperateCorr_C':
   *  [0]
   */
  if (((rtb_TmpSignalConversionAticbm_k == ((uint8)48U)) ||
       (rtb_TmpSignalConversionAticbm_k == ((uint8)34U)) ||
       (rtb_TmpSignalConversionAticbm_k == ((uint8)35U))) &&
      rtb_TmpSignalConversionAtHvCoor) {
    /* Switch: '<S20>/Switch' incorporates:
     *  Constant: '<S20>/AcChargingRls1'
     *
     * Block description for '<S20>/AcChargingRls1':
     *  Charging
     */
    Chrg_stOBCModeReq = ((uint8)2U);
  } else if (Chrg_bDChrgFctCfg_C) {
    /* Switch: '<S20>/Switch1' incorporates:
     *  Constant: '<S1>/uint8'
     *  Switch: '<S20>/Switch'
     */
    Chrg_stOBCModeReq = ((uint8)0U);
  } else {
    /* Switch: '<S20>/Switch' incorporates:
     *  Constant: '<S20>/AcChargingRls4'
     *  Switch: '<S20>/Switch1'
     *
     * Block description for '<S20>/AcChargingRls4':
     *  Standby
     */
    Chrg_stOBCModeReq = ((uint8)1U);
  }

  /* End of Switch: '<S20>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/HvGrid_pwrLoadAct' */
  (void)Rte_Read_HvGrid_pwrLoadAct_Value(&rtb_Add6);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* MinMax: '<S117>/MinMax1' incorporates:
   *  Constant: '<S117>/chc_uAcChgVoltMaxLim_C'
   *  Constant: '<S1>/single5'
   *
   * Block description for '<S117>/chc_uAcChgVoltMaxLim_C':
   *  [600]
   */
  Chrg_uACChrgReq = fminf(600.0F, Chrg_uACChrgVoltMaxLim_C);

  /* MinMax: '<S117>/MinMax2' incorporates:
   *  Constant: '<S117>/chc_uAcChgVoltMaxLim_C1'
   *  Constant: '<S1>/single6'
   *
   * Block description for '<S117>/chc_uAcChgVoltMaxLim_C1':
   *  [600]
   */
  Chrg_uDCChrgReq = fminf(600.0F, Chrg_uDCChrgVoltMaxLim_C);

  /* RelationalOperator: '<S121>/Relational Operator' incorporates:
   *  Constant: '<S121>/single4'
   *  UnitDelay: '<S121>/Unit Delay'
   */
  rtb_TmpSignalConversionAtici_n1 = (Chrg_ARID_DEF.UnitDelay_DSTATE_h > 0);

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S118>/chc_percHVptcDwnThd_C'
   *  Constant: '<S1>/single'
   *  RelationalOperator: '<S118>/Relational Operator2'
   *  Sum: '<S118>/Add1'
   *  UnitDelay: '<S118>/Unit Delay1'
   *
   * Block description for '<S118>/chc_percHVptcDwnThd_C':
   *  [16]
   */
  rtb_bDcChging = (Chrg_ARID_DEF.UnitDelay1_DSTATE_j - 0.0F >=
                   Chrg_pctEHvhDecThrd_C);

  /* Logic: '<S121>/Logical Operator2' */
  rtb_LogicalOperator2_e0 = (rtb_TmpSignalConversionAtici_n1 || rtb_bDcChging);

  /* SignalConversion generated from: '<S1>/icbms_uHVBat' incorporates:
   *  Inport: '<Root>/icbms_uHVBat'
   */
  (void)Rte_Read_icbms_uHVBat_Value(&rtb_TmpSignalConversionAticbm_a);

  /* MinMax: '<S118>/Max' incorporates:
   *  Constant: '<S118>/single'
   *  MinMax: '<S119>/MinMax3'
   *  Switch: '<S119>/Switch4'
   */
  rtb_MinMax5 = fmaxf(rtb_TmpSignalConversionAticbm_a, 220.0F);

  /* Switch: '<S118>/Switch3' incorporates:
   *  Constant: '<S118>/single1'
   */
  if (rtb_LogicalOperator2_e0) {
    rtb_TmpSignalConversionAticbms_ = Chrg_ConstB.Product2;
  } else {
    rtb_TmpSignalConversionAticbms_ = 0.0F;
  }

  /* Product: '<S118>/Divide' incorporates:
   *  MinMax: '<S118>/Max'
   *  Sum: '<S118>/Subtract1'
   *  Switch: '<S118>/Switch3'
   */
  Chrg_iChrgLoadCurr = (rtb_Add6 - rtb_TmpSignalConversionAticbms_) /
    rtb_MinMax5;

  /* Switch: '<S121>/Switch' incorporates:
   *  Switch: '<S121>/Switch1'
   */
  if (rtb_bDcChging) {
    /* Product: '<S121>/Divide' incorporates:
     *  Constant: '<S118>/chc_tiLoadCurShieldTim_C'
     *
     * Block description for '<S118>/chc_tiLoadCurShieldTim_C':
     *  [5]
     */
    u = Chrg_tiEHVHLoadCurrShd_C / Chrg_ConstB.Max_ht;

    /* DataTypeConversion: '<S121>/DataTypeConversion' */
    v = fabsf(u);
    if (v < 8.388608E+6F) {
      if (v >= 0.5F) {
        /* Update for UnitDelay: '<S121>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S126>/DataTypeConversion'
         */
        Chrg_ARID_DEF.UnitDelay_DSTATE_h = (sint32)floorf(u + 0.5F);
      } else {
        /* Update for UnitDelay: '<S121>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S126>/DataTypeConversion'
         */
        Chrg_ARID_DEF.UnitDelay_DSTATE_h = 0;
      }
    } else {
      /* Update for UnitDelay: '<S121>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S126>/DataTypeConversion'
       */
      Chrg_ARID_DEF.UnitDelay_DSTATE_h = (sint32)u;
    }

    /* End of DataTypeConversion: '<S121>/DataTypeConversion' */
  } else if (rtb_TmpSignalConversionAtici_n1) {
    /* Update for UnitDelay: '<S121>/Unit Delay' incorporates:
     *  Constant: '<S121>/single5'
     *  DataTypeConversion: '<S126>/DataTypeConversion'
     *  Sum: '<S121>/Subtract'
     *  Switch: '<S121>/Switch1'
     */
    Chrg_ARID_DEF.UnitDelay_DSTATE_h -= 1;
  }

  /* End of Switch: '<S121>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */

  /* Inport: '<Root>/icobc_stElecLock' */
  (void)Rte_Read_icobc_stElecLock_Value(&tmpRead_3);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* Switch: '<S119>/Switch1' incorporates:
   *  Logic: '<S119>/Logical Operator6'
   */
  if (!rtb_TmpSignalConversionAticbm_l) {
    /* Sum: '<S119>/Add6' */
    rtb_Add6 = Chrg_ConstB.MinMax4;
  } else {
    /* Sum: '<S119>/Add6' incorporates:
     *  Constant: '<S119>/zero1'
     */
    rtb_Add6 = 0.0F;
  }

  /* End of Switch: '<S119>/Switch1' */

  /* SignalConversion generated from: '<S1>/icbms_iHVBat' incorporates:
   *  Inport: '<Root>/icbms_iHVBat'
   */
  (void)Rte_Read_icbms_iHVBat_Value(&rtb_TmpSignalConversionAticb_cr);

  /* Sum: '<S120>/Add1' incorporates:
   *  Sum: '<S119>/Add3'
   */
  rtb_TmpSignalConversionAticbm_a = rtb_Add6 + rtb_TmpSignalConversionAticb_cr;

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S119>/AcChargingRls'
   *  Constant: '<S119>/AcChargingRls3'
   *  Logic: '<S119>/Logical Operator8'
   *  Logic: '<S119>/Logical Operator9'
   *  RelationalOperator: '<S119>/Relational Operator2'
   *  RelationalOperator: '<S119>/Relational Operator6'
   *
   * Block description for '<S119>/AcChargingRls':
   *  ACChargingReq
   *
   * Block description for '<S119>/AcChargingRls3':
   *  ChargingFull
   */
  rtb_bDcChging = ((rtb_TmpSignalConversionAticbm_k == ((uint8)35U)) ||
                   ((rtb_TmpSignalConversionAticbm_k == ((uint8)48U)) &&
                    rtb_TmpSignalConversionAtHvCoor));

  /* Logic: '<S119>/Logical Operator1' incorporates:
   *  Constant: '<S119>/chc_bAcChgCurrCmpEn_C'
   *  Constant: '<S119>/chc_iAcChgCurrCmpNegThd_C'
   *  RelationalOperator: '<S119>/Relational Operator4'
   *
   * Block description for '<S119>/chc_bAcChgCurrCmpEn_C':
   *  [1]
   *
   * Block description for '<S119>/chc_iAcChgCurrCmpNegThd_C':
   *  [0]
   */
  rtb_TmpSignalConversionAtici_n1 = (Chrg_bACChrgCurrCmpEna_C && rtb_bDcChging &&
    (rtb_TmpSignalConversionAticbm_a < Chrg_iACChrgCurrCmpNegThrd_C));

  /* Logic: '<S119>/Logical Operator5' incorporates:
   *  Logic: '<S119>/Logical Operator13'
   */
  rtb_RelationalOperator1_pn = !rtb_TmpSignalConversionAtici_n1;

  /* Logic: '<S119>/Logical Operator4' incorporates:
   *  Constant: '<S119>/chc_bAcChgCurrCmpEn_C'
   *  Constant: '<S119>/chc_iAcChgCurrCmpPosThd_C'
   *  Logic: '<S119>/Logical Operator5'
   *  RelationalOperator: '<S119>/Relational Operator1'
   *
   * Block description for '<S119>/chc_bAcChgCurrCmpEn_C':
   *  [1]
   *
   * Block description for '<S119>/chc_iAcChgCurrCmpPosThd_C':
   *  [1.5]
   */
  rtb_LogicalOperator1_is = ((rtb_TmpSignalConversionAticbm_a >
    Chrg_iACChrgCurrCmpPosThrd_C) && rtb_bDcChging && Chrg_bACChrgCurrCmpEna_C &&
    rtb_RelationalOperator1_pn);

  /* Sum: '<S119>/Add6' */
  rtb_Add6 += Chrg_iChrgLoadCurr;

  /* Sum: '<S119>/Add10' incorporates:
   *  Constant: '<S119>/zero7'
   */
  rtb_TmpSignalConversionAticbm_a = 0.0F - rtb_Add6;

  /* Logic: '<S125>/Logical_Operator4' incorporates:
   *  Constant: '<S1>/FALSE1'
   *  Logic: '<S119>/Logical Operator14'
   *  Logic: '<S119>/Logical Operator18'
   *  Logic: '<S125>/Logical Operator1'
   *  Logic: '<S125>/Logical_Operator5'
   *  UnitDelay: '<S119>/Unit Delay4'
   *  UnitDelay: '<S125>/Unit Delay'
   *
   * Block description for '<S1>/FALSE1':
   *  FALSE
   */
  rtb_TmpSignalConversionAticbm_l = (rtb_TmpSignalConversionAtHvCoor &&
    (!Chrg_ARID_DEF.UnitDelay4_DSTATE) && (false ||
    Chrg_ARID_DEF.UnitDelay_DSTATE_cr));

  /* Switch: '<S119>/Switch4' incorporates:
   *  Constant: '<S119>/uint8'
   *  Logic: '<S119>/Logical Operator10'
   *  RelationalOperator: '<S119>/Equal1'
   */
  if (rtb_TmpSignalConversionAticbm_l || (tmpRead_3 == ((uint8)0U))) {
    /* Switch: '<S119>/Switch4' incorporates:
     *  Constant: '<S119>/chc_iAcChgCurMaxLim_C'
     *  Constant: '<S119>/chc_iAcChgCurrCmpMax_C'
     *  Constant: '<S119>/chc_pwrAcChgPwr4Unlock_C'
     *  MinMax: '<S119>/MinMax1'
     *  MinMax: '<S119>/MinMax2'
     *  Product: '<S119>/Divide'
     *  Sum: '<S119>/Add1'
     *
     * Block description for '<S119>/chc_iAcChgCurMaxLim_C':
     *  [100]
     *
     * Block description for '<S119>/chc_iAcChgCurrCmpMax_C':
     *  [10]
     *
     * Block description for '<S119>/chc_pwrAcChgPwr4Unlock_C':
     *  [2500]
     */
    Chrg_iACChrgCurrMax = fminf(Chrg_pwrACChrg4Unlock_C / rtb_MinMax5, fminf
      (rtb_Add6 + Chrg_iACChrgCurrCmpMax_C, Chrg_iACChrgCurrMax_C));
  } else {
    /* Switch: '<S119>/Switch4' incorporates:
     *  Constant: '<S119>/chc_iAcChgCurMaxLim_C'
     *  Constant: '<S119>/chc_iAcChgCurrCmpMax_C'
     *  MinMax: '<S119>/MinMax2'
     *  Sum: '<S119>/Add1'
     *
     * Block description for '<S119>/chc_iAcChgCurMaxLim_C':
     *  [100]
     *
     * Block description for '<S119>/chc_iAcChgCurrCmpMax_C':
     *  [10]
     */
    Chrg_iACChrgCurrMax = fminf(rtb_Add6 + Chrg_iACChrgCurrCmpMax_C,
      Chrg_iACChrgCurrMax_C);
  }

  /* MinMax: '<S119>/MinMax5' incorporates:
   *  Constant: '<S119>/AcChargingReq3'
   *  Sum: '<S119>/Add9'
   */
  rtb_MinMax5 = fmaxf(Chrg_iACChrgCurrMax - rtb_Add6, 0.0F);

  /* Switch: '<S119>/switch' incorporates:
   *  Logic: '<S119>/AND2'
   *  Logic: '<S119>/Logical Operator12'
   *  Logic: '<S119>/OR'
   *  Switch: '<S119>/Switch2'
   *  Switch: '<S119>/Switch3'
   */
  if (rtb_LogicalOperator2_e0 || ((!rtb_LogicalOperator1_is) &&
       rtb_RelationalOperator1_pn)) {
    /* Switch: '<S119>/switch' incorporates:
     *  Constant: '<S119>/zero6'
     */
    rtb_TmpSignalConversionAticbms_ = 0.0F;
  } else {
    if (rtb_LogicalOperator1_is) {
      /* Switch: '<S119>/Switch3' incorporates:
       *  Constant: '<S119>/chc_iAcChgCurrCmpUpStep_C'
       *
       * Block description for '<S119>/chc_iAcChgCurrCmpUpStep_C':
       *  [0.005]
       */
      rtb_TmpSignalConversionAticbms_ = Chrg_iACChrgCurrCmpIncStep_C;
    } else if (rtb_TmpSignalConversionAtici_n1) {
      /* Switch: '<S119>/Switch2' incorporates:
       *  Constant: '<S119>/chc_iAcChgCurrCmpDwnStep_C'
       *  Switch: '<S119>/Switch3'
       *
       * Block description for '<S119>/chc_iAcChgCurrCmpDwnStep_C':
       *  [-0.1]
       */
      rtb_TmpSignalConversionAticbms_ = Chrg_iACChrgCurrCmpDecStep_C;
    } else {
      /* Switch: '<S119>/Switch3' incorporates:
       *  Constant: '<S119>/zero8'
       *  Switch: '<S119>/Switch2'
       */
      rtb_TmpSignalConversionAticbms_ = 0.0F;
    }

    /* Switch: '<S119>/switch' incorporates:
     *  Sum: '<S119>/Add7'
     *  Switch: '<S119>/Switch2'
     *  Switch: '<S119>/Switch3'
     *  UnitDelay: '<S119>/Unit Delay2'
     */
    rtb_TmpSignalConversionAticbms_ += Chrg_iACChrgCmpCurr;
  }

  /* End of Switch: '<S119>/switch' */

  /* Switch: '<S124>/Switch' incorporates:
   *  RelationalOperator: '<S124>/GreaterOrEqual'
   */
  if (rtb_MinMax5 >= rtb_TmpSignalConversionAticbm_a) {
    /* Switch: '<S124>/Switch' incorporates:
     *  MinMax: '<S124>/MinMax'
     *  MinMax: '<S124>/MinMax1'
     */
    Chrg_iACChrgCmpCurr = fminf(rtb_MinMax5, fmaxf
      (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbm_a));
  } else {
    /* Switch: '<S124>/Switch' incorporates:
     *  MinMax: '<S124>/MinMax2'
     *  MinMax: '<S124>/MinMax3'
     */
    Chrg_iACChrgCmpCurr = fminf(fmaxf(rtb_TmpSignalConversionAticbms_,
      rtb_MinMax5), rtb_TmpSignalConversionAticbm_a);
  }

  /* End of Switch: '<S124>/Switch' */

  /* Sum: '<S119>/Add5' */
  rtb_TmpSignalConversionAticbm_a = rtb_Add6 + Chrg_iACChrgCmpCurr;

  /* Delay: '<S122>/Delay' */
  if (Chrg_ARID_DEF.icLoad) {
    Chrg_ARID_DEF.Delay_DSTATE = rtb_TmpSignalConversionAticbm_a;
  }

  /* Switch: '<S122>/Switch1' incorporates:
   *  Constant: '<S119>/TRUE'
   *  Logic: '<S119>/Logical Operator7'
   *  Switch: '<S122>/Switch3'
   *
   * Block description for '<S119>/TRUE':
   *  TRUE
   */
  if (!rtb_bDcChging) {
    /* Switch: '<S122>/Switch1' incorporates:
     *  Constant: '<S119>/zero5'
     */
    rtb_Add6 = 0.0F;

    /* Switch: '<S119>/Switch' incorporates:
     *  Constant: '<S119>/zero3'
     */
    Chrg_iACChrgReq = 0.0F;
  } else {
    if (true) {
      /* Switch: '<S122>/Switch3' incorporates:
       *  Delay: '<S122>/Delay'
       */
      rtb_Add6 = Chrg_ARID_DEF.Delay_DSTATE;
    } else {
      /* Switch: '<S122>/Switch3' */
      rtb_Add6 = rtb_TmpSignalConversionAticbm_a;
    }

    /* Switch: '<S122>/Switch1' incorporates:
     *  Constant: '<S119>/TaskTime_s2'
     *  Constant: '<S119>/chc_iGradDec4AcChg_C'
     *  Constant: '<S119>/chc_iGradInc4AcChg_C'
     *  Constant: '<S122>/Number1'
     *  Constant: '<S122>/Number2'
     *  MinMax: '<S122>/MinMax1'
     *  MinMax: '<S122>/MinMax2'
     *  MinMax: '<S122>/MinMax3'
     *  MinMax: '<S122>/MinMax4'
     *  Product: '<S122>/Product'
     *  Product: '<S122>/Product1'
     *  Sum: '<S122>/Sum'
     *  Sum: '<S122>/Sum1'
     *
     * Block description for '<S119>/chc_iGradDec4AcChg_C':
     *  [-5]
     *
     * Block description for '<S119>/chc_iGradInc4AcChg_C':
     *  [1]
     */
    rtb_Add6 += fminf(fmaxf(Chrg_iGrdtInc4ACChrg_C * 0.01F, 0.0F), fmaxf(fminf
      (Chrg_iGrdtDec4ACChrg_C * 0.01F, 0.0F), rtb_TmpSignalConversionAticbm_a -
      rtb_Add6));

    /* Switch: '<S123>/Switch' incorporates:
     *  Constant: '<S119>/TRUE'
     *  Constant: '<S119>/zero4'
     *  RelationalOperator: '<S123>/GreaterOrEqual'
     *  Switch: '<S119>/Switch'
     *  Switch: '<S122>/Switch2'
     *
     * Block description for '<S119>/TRUE':
     *  TRUE
     */
    if (Chrg_iACChrgCurrMax >= 0.0F) {
      /* Switch: '<S122>/Switch2' incorporates:
       *  Constant: '<S119>/TRUE'
       *
       * Block description for '<S119>/TRUE':
       *  TRUE
       */
      if (true) {
        rtb_TmpSignalConversionAticbm_a = rtb_Add6;
      }

      /* Switch: '<S119>/Switch' incorporates:
       *  MinMax: '<S123>/MinMax'
       *  MinMax: '<S123>/MinMax1'
       *  Switch: '<S122>/Switch2'
       *  Switch: '<S123>/Switch'
       */
      Chrg_iACChrgReq = fminf(Chrg_iACChrgCurrMax, fmaxf
        (rtb_TmpSignalConversionAticbm_a, 0.0F));
    } else {
      if (true) {
        /* Switch: '<S122>/Switch2' */
        rtb_TmpSignalConversionAticbm_a = rtb_Add6;
      }

      /* Switch: '<S119>/Switch' incorporates:
       *  MinMax: '<S123>/MinMax2'
       *  MinMax: '<S123>/MinMax3'
       *  Switch: '<S122>/Switch2'
       *  Switch: '<S123>/Switch'
       */
      Chrg_iACChrgReq = fminf(fmaxf(rtb_TmpSignalConversionAticbm_a,
        Chrg_iACChrgCurrMax), 0.0F);
    }

    /* End of Switch: '<S123>/Switch' */
  }

  /* End of Switch: '<S122>/Switch1' */

  /* Switch: '<S126>/Switch' */
  if (rtb_TmpSignalConversionAticbm_l) {
    /* Sum: '<S126>/Subtract1' incorporates:
     *  Constant: '<S126>/single1'
     *  UnitDelay: '<S126>/Unit Delay'
     */
    if ((Chrg_ARID_DEF.UnitDelay_DSTATE_f < 0) && (1 < MIN_int32_T
         - Chrg_ARID_DEF.UnitDelay_DSTATE_f)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MIN_int32_T;
    } else if ((Chrg_ARID_DEF.UnitDelay_DSTATE_f > 0) && (1 > MAX_int32_T
                - Chrg_ARID_DEF.UnitDelay_DSTATE_f)) {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = MAX_int32_T;
    } else {
      /* Switch: '<S126>/Switch' */
      rtb_Switch_lt = Chrg_ARID_DEF.UnitDelay_DSTATE_f + 1;
    }

    /* End of Sum: '<S126>/Subtract1' */
  } else {
    /* Switch: '<S126>/Switch' incorporates:
     *  Constant: '<S126>/single2'
     */
    rtb_Switch_lt = 0;
  }

  /* End of Switch: '<S126>/Switch' */

  /* RelationalOperator: '<S120>/Equal1' incorporates:
   *  Constant: '<S120>/AcChargingRls1'
   *
   * Block description for '<S120>/AcChargingRls1':
   *  DCChargingReq
   */
  rtb_bDcChging = (rtb_TmpSignalConversionAticbm_k == ((uint8)45U));

  /* Sum: '<S120>/Add1' */
  rtb_TmpSignalConversionAticbm_a = Chrg_ConstB.Max_c +
    rtb_TmpSignalConversionAticb_cr;

  /* Logic: '<S120>/AND' incorporates:
   *  Constant: '<S120>/Constant'
   *  Constant: '<S120>/Constant2'
   *  RelationalOperator: '<S120>/Lower'
   *
   * Block description for '<S120>/Constant':
   *  [1]
   *
   * Block description for '<S120>/Constant2':
   *  [0]
   */
  rtb_TmpSignalConversionAtici_n1 = (Chrg_bDCChrgCurrCmpEna_C && rtb_bDcChging &&
    (rtb_TmpSignalConversionAticbm_a < Chrg_iDCChrgCurrCmpNegThrd_C));

  /* Logic: '<S120>/Logical Operator9' incorporates:
   *  Logic: '<S120>/Logical Operator4'
   */
  rtb_RelationalOperator1_pn = !rtb_TmpSignalConversionAtici_n1;

  /* Logic: '<S120>/AND1' incorporates:
   *  Constant: '<S120>/Constant'
   *  Constant: '<S120>/Constant1'
   *  Logic: '<S120>/Logical Operator9'
   *  RelationalOperator: '<S120>/Greater'
   *
   * Block description for '<S120>/Constant':
   *  [1]
   *
   * Block description for '<S120>/Constant1':
   *  [1.5]
   */
  rtb_LogicalOperator1_is = ((rtb_TmpSignalConversionAticbm_a >
    Chrg_iDCChrgCurrCmpPosThrd_C) && rtb_bDcChging && Chrg_bDCChrgCurrCmpEna_C &&
    rtb_RelationalOperator1_pn);

  /* Switch: '<S120>/Switch1' incorporates:
   *  Logic: '<S120>/AND2'
   *  Logic: '<S120>/Logical Operator2'
   *  Logic: '<S120>/OR'
   *  Switch: '<S120>/Switch2'
   *  Switch: '<S120>/Switch3'
   */
  if (rtb_LogicalOperator2_e0 || ((!rtb_LogicalOperator1_is) &&
       rtb_RelationalOperator1_pn)) {
    /* Switch: '<S120>/Switch1' incorporates:
     *  Constant: '<S120>/single4'
     */
    rtb_TmpSignalConversionAticb_cr = 0.0F;
  } else {
    if (rtb_LogicalOperator1_is) {
      /* Switch: '<S120>/Switch3' incorporates:
       *  Constant: '<S120>/Constant3'
       *
       * Block description for '<S120>/Constant3':
       *  [0.005]
       */
      rtb_TmpSignalConversionAticbms_ = Chrg_iDCChrgCurrCmpIncStep_C;
    } else if (rtb_TmpSignalConversionAtici_n1) {
      /* Switch: '<S120>/Switch2' incorporates:
       *  Constant: '<S120>/Constant4'
       *  Switch: '<S120>/Switch3'
       *
       * Block description for '<S120>/Constant4':
       *  [-0.1]
       */
      rtb_TmpSignalConversionAticbms_ = Chrg_iDCChrgCurrCmpDecStep_C;
    } else {
      /* Switch: '<S120>/Switch3' incorporates:
       *  Constant: '<S120>/single5'
       *  Switch: '<S120>/Switch2'
       */
      rtb_TmpSignalConversionAticbms_ = 0.0F;
    }

    /* Switch: '<S120>/Switch1' incorporates:
     *  Sum: '<S120>/Add3'
     *  Switch: '<S120>/Switch2'
     *  Switch: '<S120>/Switch3'
     *  UnitDelay: '<S120>/Unit Delay'
     */
    rtb_TmpSignalConversionAticb_cr = rtb_TmpSignalConversionAticbms_ +
      Chrg_ARID_DEF.UnitDelay_DSTATE;
  }

  /* End of Switch: '<S120>/Switch1' */

  /* Switch: '<S129>/Switch' incorporates:
   *  Constant: '<S120>/Constant5'
   *  Constant: '<S120>/Constant6'
   *  RelationalOperator: '<S129>/GreaterOrEqual'
   *
   * Block description for '<S120>/Constant5':
   *  [10]
   *
   * Block description for '<S120>/Constant6':
   *  [-15]
   */
  if (Chrg_iDCChrgCurrCmpMax_C >= Chrg_iDCChrgCurrCmpMin_C) {
    /* Switch: '<S129>/Switch' incorporates:
     *  MinMax: '<S129>/MinMax'
     *  MinMax: '<S129>/MinMax1'
     */
    Chrg_iDCChrgCmpCurr = fminf(Chrg_iDCChrgCurrCmpMax_C, fmaxf
      (rtb_TmpSignalConversionAticb_cr, Chrg_iDCChrgCurrCmpMin_C));
  } else {
    /* Switch: '<S129>/Switch' incorporates:
     *  MinMax: '<S129>/MinMax2'
     *  MinMax: '<S129>/MinMax3'
     */
    Chrg_iDCChrgCmpCurr = fminf(fmaxf(rtb_TmpSignalConversionAticb_cr,
      Chrg_iDCChrgCurrCmpMax_C), Chrg_iDCChrgCurrCmpMin_C);
  }

  /* End of Switch: '<S129>/Switch' */

  /* Sum: '<S120>/Add2' incorporates:
   *  Sum: '<S120>/Add'
   */
  rtb_TmpSignalConversionAticbm_a = (Chrg_iChrgLoadCurr + Chrg_ConstB.Max_c) +
    Chrg_iDCChrgCmpCurr;

  /* Delay: '<S127>/Delay' */
  if (Chrg_ARID_DEF.icLoad_e) {
    Chrg_ARID_DEF.Delay_DSTATE_o = rtb_TmpSignalConversionAticbm_a;
  }

  /* Switch: '<S127>/Switch1' incorporates:
   *  Constant: '<S120>/TRUE'
   *  Logic: '<S120>/Logical Operator1'
   *  Switch: '<S127>/Switch3'
   *
   * Block description for '<S120>/TRUE':
   *  TRUE
   */
  if (!rtb_bDcChging) {
    /* Switch: '<S127>/Switch1' incorporates:
     *  Constant: '<S120>/single3'
     */
    rtb_MinMax5 = 0.0F;

    /* Switch: '<S120>/Switch4' incorporates:
     *  Constant: '<S120>/single2'
     */
    Chrg_iDCChrgReq = 0.0F;
  } else {
    if (true) {
      /* Switch: '<S127>/Switch3' incorporates:
       *  Delay: '<S127>/Delay'
       */
      rtb_MinMax5 = Chrg_ARID_DEF.Delay_DSTATE_o;
    } else {
      /* Switch: '<S127>/Switch3' */
      rtb_MinMax5 = rtb_TmpSignalConversionAticbm_a;
    }

    /* Switch: '<S127>/Switch1' incorporates:
     *  Constant: '<S120>/Constant7'
     *  Constant: '<S120>/Constant8'
     *  Constant: '<S120>/TaskTime_s2'
     *  Constant: '<S127>/Number1'
     *  Constant: '<S127>/Number2'
     *  MinMax: '<S127>/MinMax1'
     *  MinMax: '<S127>/MinMax2'
     *  MinMax: '<S127>/MinMax3'
     *  MinMax: '<S127>/MinMax4'
     *  Product: '<S127>/Product'
     *  Product: '<S127>/Product1'
     *  Sum: '<S127>/Sum'
     *  Sum: '<S127>/Sum1'
     *
     * Block description for '<S120>/Constant7':
     *  [-5]
     *
     * Block description for '<S120>/Constant8':
     *  [1]
     */
    rtb_MinMax5 += fminf(fmaxf(Chrg_iGrdtInc4DCChrg_C * 0.01F, 0.0F), fmaxf
                         (fminf(Chrg_iGrdtDec4DCChrg_C * 0.01F, 0.0F),
                          rtb_TmpSignalConversionAticbm_a - rtb_MinMax5));

    /* Switch: '<S128>/Switch' incorporates:
     *  Constant: '<S120>/Constant9'
     *  Constant: '<S120>/TRUE'
     *  Constant: '<S120>/single1'
     *  RelationalOperator: '<S128>/GreaterOrEqual'
     *  Switch: '<S120>/Switch4'
     *  Switch: '<S127>/Switch2'
     *
     * Block description for '<S120>/Constant9':
     *  [1000]
     *
     * Block description for '<S120>/TRUE':
     *  TRUE
     */
    if (Chrg_iDCChrgCurrMax_C >= 0.0F) {
      /* Switch: '<S127>/Switch2' incorporates:
       *  Constant: '<S120>/TRUE'
       *
       * Block description for '<S120>/TRUE':
       *  TRUE
       */
      if (true) {
        rtb_TmpSignalConversionAticbm_a = rtb_MinMax5;
      }

      /* Switch: '<S120>/Switch4' incorporates:
       *  MinMax: '<S128>/MinMax'
       *  MinMax: '<S128>/MinMax1'
       *  Switch: '<S127>/Switch2'
       *  Switch: '<S128>/Switch'
       */
      Chrg_iDCChrgReq = fminf(Chrg_iDCChrgCurrMax_C, fmaxf
        (rtb_TmpSignalConversionAticbm_a, 0.0F));
    } else {
      if (true) {
        /* Switch: '<S127>/Switch2' */
        rtb_TmpSignalConversionAticbm_a = rtb_MinMax5;
      }

      /* Switch: '<S120>/Switch4' incorporates:
       *  MinMax: '<S128>/MinMax2'
       *  MinMax: '<S128>/MinMax3'
       *  Switch: '<S127>/Switch2'
       *  Switch: '<S128>/Switch'
       */
      Chrg_iDCChrgReq = fminf(fmaxf(rtb_TmpSignalConversionAticbm_a,
        Chrg_iDCChrgCurrMax_C), 0.0F);
    }

    /* End of Switch: '<S128>/Switch' */
  }

  /* End of Switch: '<S127>/Switch1' */

  /* SignalConversion: '<S3>/Signal Copy' */
  Chrg_stChrg = rtb_TmpSignalConversionAticbm_k;

  /* SignalConversion: '<S3>/Signal Copy1' */
  Chrg_stCycBookChrgEEW = Chrg_stBookChrgMod;

  /* Outport: '<Root>/Chrg_stChrg' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion'
   */
  (void)Rte_Write_Chrg_stChrg_Value(Chrg_stChrg);

  /* Outport: '<Root>/Chrg_bCharging' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion1'
   */
  (void)Rte_Write_Chrg_bCharging_Value(Chrg_bCharging);

  /* Outport: '<Root>/Chrg_iDCChrgReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion10'
   */
  (void)Rte_Write_Chrg_iDCChrgReq_Value(Chrg_iDCChrgReq);

  /* Outport: '<Root>/Chrg_iChrgLoadCurr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion11'
   */
  (void)Rte_Write_Chrg_iChrgLoadCurr_Value(Chrg_iChrgLoadCurr);

  /* Outport: '<Root>/Chrg_bChrgStopReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion12'
   */
  (void)Rte_Write_Chrg_bChrgStopReq_Value(Chrg_bChrgStopReq);

  /* Outport: '<Root>/Chrg_stCycBookChrgEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion13'
   */
  (void)Rte_Write_Chrg_stCycBookChrgEEW_Value(Chrg_stCycBookChrgEEW);

  /* Outport: '<Root>/Chrg_noBookChrgStrtHrEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion14'
   */
  (void)Rte_Write_Chrg_noBookChrgStrtHrEEW_Value(Chrg_noBookChrgStrtHrEEW);

  /* Outport: '<Root>/Chrg_noBookChrgEndHrEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion15'
   */
  (void)Rte_Write_Chrg_noBookChrgEndHrEEW_Value(Chrg_noBookChrgEndHrEEW);

  /* Outport: '<Root>/Chrg_noBookChrgStrtMintEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion16'
   */
  (void)Rte_Write_Chrg_noBookChrgStrtMintEEW_Value(Chrg_noBookChrgStrtMintEEW);

  /* Outport: '<Root>/Chrg_noBookChrgEndMintEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion17'
   */
  (void)Rte_Write_Chrg_noBookChrgEndMintEEW_Value(Chrg_noBookChrgEndMintEEW);

  /* Outport: '<Root>/Chrg_pctBookChrgSocSetEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion18'
   */
  (void)Rte_Write_Chrg_pctBookChrgSocSetEEW_Value(Chrg_pctBookChrgSocSetEEW);

  /* Outport: '<Root>/Chrg_stBookChrgMod' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion19'
   */
  (void)Rte_Write_Chrg_stBookChrgMod_Value(Chrg_stBookChrgMod);

  /* Outport: '<Root>/Chrg_stOBCModeReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion2'
   */
  (void)Rte_Write_Chrg_stOBCModeReq_Value(Chrg_stOBCModeReq);

  /* Outport: '<Root>/Chrg_stBookChrg' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion20'
   */
  (void)Rte_Write_Chrg_stBookChrg_Value(Chrg_stBookChrg);

  /* Outport: '<Root>/Chrg_bBookChrgStop' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion21'
   */
  (void)Rte_Write_Chrg_bBookChrgStop_Value(Chrg_bBookChrgStop);

  /* Outport: '<Root>/Chrg_bBookChrgCmpl' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion22'
   */
  (void)Rte_Write_Chrg_bBookChrgCmpl_Value(Chrg_bBookChrgCmpl);

  /* Outport: '<Root>/Chrg_bBMSChrgErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion23'
   */
  (void)Rte_Write_Chrg_bBMSChrgErr_Value(Chrg_bBMSChrgErr);

  /* Outport: '<Root>/Chrg_bChrgStopBySOCLim' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion24'
   */
  (void)Rte_Write_Chrg_bChrgStopBySOCLim_Value(Chrg_bChrgStopBySOCLim);

  /* Outport: '<Root>/Chrg_noSngBookStrtYearEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion25'
   */
  (void)Rte_Write_Chrg_noSngBookStrtYearEEW_Value(Chrg_noSngBookStrtYearEEW);

  /* Outport: '<Root>/Chrg_noSngBookStrtMthEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion26'
   */
  (void)Rte_Write_Chrg_noSngBookStrtMthEEW_Value(Chrg_noSngBookStrtMthEEW);

  /* Outport: '<Root>/Chrg_noSngBookStrtDayEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion27'
   */
  (void)Rte_Write_Chrg_noSngBookStrtDayEEW_Value(Chrg_noSngBookStrtDayEEW);

  /* Outport: '<Root>/Chrg_noSngBookStopYearEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion28'
   */
  (void)Rte_Write_Chrg_noSngBookStopYearEEW_Value(Chrg_noSngBookStopYearEEW);

  /* Outport: '<Root>/Chrg_noSngBookStopMthEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion29'
   */
  (void)Rte_Write_Chrg_noSngBookStopMthEEW_Value(Chrg_noSngBookStopMthEEW);

  /* Outport: '<Root>/Chrg_bChrgErrTmp' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion3'
   */
  (void)Rte_Write_Chrg_bChrgErrTmp_Value(Chrg_bChrgErrTmp);

  /* Outport: '<Root>/Chrg_noSngBookStopDayEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion30'
   */
  (void)Rte_Write_Chrg_noSngBookStopDayEEW_Value(Chrg_noSngBookStopDayEEW);

  /* Outport: '<Root>/Chrg_stChrgStopReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion31'
   */
  (void)Rte_Write_Chrg_stChrgStopReq_Value(Chrg_stChrgStopReq);

  /* Outport: '<Root>/Chrg_stBookChrgStop' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion32'
   */
  (void)Rte_Write_Chrg_stBookChrgStop_Value(Chrg_stBookChrgStop);

  /* Outport: '<Root>/Chrg_bChrgDrewOutRmnd' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion33'
   */
  (void)Rte_Write_Chrg_bChrgDrewOutRmnd_Value(Chrg_bChrgDrewOutRmnd);

  /* Outport: '<Root>/Chrg_bChrgErrForever' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion4'
   */
  (void)Rte_Write_Chrg_bChrgErrForever_Value(Chrg_bChrgErrForever);

  /* Outport: '<Root>/Chrg_bACChrgCmpl' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion5'
   */
  (void)Rte_Write_Chrg_bACChrgCmpl_Value(Chrg_bACChrgCmpl);

  /* Outport: '<Root>/Chrg_bDCChrgCmpl' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion6'
   */
  (void)Rte_Write_Chrg_bDCChrgCmpl_Value(Chrg_bDCChrgCmpl);

  /* Outport: '<Root>/Chrg_uACChrgReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion7'
   */
  (void)Rte_Write_Chrg_uACChrgReq_Value(Chrg_uACChrgReq);

  /* Outport: '<Root>/Chrg_iACChrgReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion8'
   */
  (void)Rte_Write_Chrg_iACChrgReq_Value(Chrg_iACChrgReq);

  /* Outport: '<Root>/Chrg_uDCChrgReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion9'
   */
  (void)Rte_Write_Chrg_uDCChrgReq_Value(Chrg_uDCChrgReq);

  /* Constant: '<S1>/uint32' */
  Chrg_Version = 10010208U;

  /* Update for UnitDelay: '<S27>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_pq = rtb_Equal2;

  /* Update for UnitDelay: '<S28>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_b4 = rtb_Equal3;

  /* Update for Delay: '<S3>/Delay' incorporates:
   *  Constant: '<S3>/TRUE'
   *
   * Block description for '<S3>/TRUE':
   *  TRUE
   */
  for (idxDelay = 0; idxDelay < 99; idxDelay++) {
    Chrg_ARID_DEF.Delay_DSTATE_k[idxDelay] =
      Chrg_ARID_DEF.Delay_DSTATE_k[idxDelay + 1];
  }

  Chrg_ARID_DEF.Delay_DSTATE_k[99] = true;

  /* End of Update for Delay: '<S3>/Delay' */

  /* Update for UnitDelay: '<S34>/Unit Delay1' */
  Chrg_ARID_DEF.UnitDelay1_DSTATE_p = rtb_TmpSignalConversionAticic_f;

  /* Update for UnitDelay: '<S34>/Unit Delay3' */
  Chrg_ARID_DEF.UnitDelay3_DSTATE = rtb_TmpSignalConversionAtictc_h;

  /* Update for UnitDelay: '<S42>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_DSTATE_ln = rtb_Logical_Operator4;

  /* Update for UnitDelay: '<S34>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_h = rtb_TmpSignalConversionAticicm_;

  /* Update for UnitDelay: '<S35>/Unit Delay1' */
  Chrg_ARID_DEF.UnitDelay1_DSTATE_b = rtb_TmpSignalConversionAtici_bu;

  /* Update for UnitDelay: '<S35>/Unit Delay3' */
  Chrg_ARID_DEF.UnitDelay3_DSTATE_o = rtb_TmpSignalConversionAtictc_o;

  /* Update for UnitDelay: '<S43>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_DSTATE_az = rtb_AND4;

  /* Update for UnitDelay: '<S35>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_p = rtb_TmpSignalConversionAtictcp_;

  /* Update for UnitDelay: '<S36>/Unit Delay1' */
  Chrg_ARID_DEF.UnitDelay1_DSTATE_c = rtb_TmpSignalConversionAticic_c;

  /* Update for UnitDelay: '<S36>/Unit Delay3' */
  Chrg_ARID_DEF.UnitDelay3_DSTATE_l = rtb_TmpSignalConversionAtict_j2;

  /* Update for UnitDelay: '<S44>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_DSTATE_do = rtb_AND4_a;

  /* Update for UnitDelay: '<S36>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_b = rtb_Switch3_f;

  /* Update for UnitDelay: '<S37>/Unit Delay1' */
  Chrg_ARID_DEF.UnitDelay1_DSTATE_e = rtb_TmpSignalConversionAticic_e;

  /* Update for UnitDelay: '<S37>/Unit Delay3' */
  Chrg_ARID_DEF.UnitDelay3_DSTATE_b = rtb_TmpSignalConversionAtictc_l;

  /* Update for UnitDelay: '<S45>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_DSTATE_hq = rtb_AND4_mb;

  /* Update for UnitDelay: '<S37>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_c = rtb_Switch3_m;

  /* Update for UnitDelay: '<S48>/Unit Delay1' */
  Chrg_ARID_DEF.UnitDelay1_DSTATE_jt = Chrg_stBookChrgMod;

  /* Update for UnitDelay generated from: '<S48>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_1_DSTATE[0] = rtb_UnitDelay1_p;

  /* Update for UnitDelay generated from: '<S48>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_2_DSTATE[0] = rtb_MultiportSwitch;

  /* Update for UnitDelay generated from: '<S48>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_1_DSTATE[1] = rtb_signal1_j_idx_1;

  /* Update for UnitDelay generated from: '<S48>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_2_DSTATE[1] = rtb_Add6_c;

  /* Update for UnitDelay generated from: '<S48>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_1_DSTATE[2] = rtb_signal1_j_idx_2;

  /* Update for UnitDelay generated from: '<S48>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_2_DSTATE[2] = rtb_Add5;

  /* Update for UnitDelay: '<S49>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_hs = rtb_TmpSignalConversionAtHvCoor;

  /* Update for UnitDelay: '<S50>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_cw = rtb_Delay_k;

  /* Update for UnitDelay: '<S51>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_e = rtb_AND1_n;

  /* Update for UnitDelay: '<S54>/Unit Delay1' incorporates:
   *  DataTypeConversion: '<S54>/Data Type Conversion'
   */
  Chrg_ARID_DEF.UnitDelay1_DSTATE_m = rtb_TmpSignalConversionAtict_br;

  /* Update for UnitDelay: '<S54>/Unit Delay3' incorporates:
   *  DataTypeConversion: '<S54>/Data Type Conversion1'
   */
  Chrg_ARID_DEF.UnitDelay3_DSTATE_j = rtb_TmpSignalConversionAtictc_c;

  /* Update for UnitDelay: '<S54>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_j = rtb_TmpSignalConversionAtict_ac;

  /* Update for UnitDelay: '<S54>/UnitDelay' incorporates:
   *  Constant: '<S54>/FALSE'
   *
   * Block description for '<S54>/FALSE':
   *  FALSE
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_il = false;

  /* Update for UnitDelay: '<S58>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_m = rtb_TmpSignalConversionAtHvCoor;

  /* Update for UnitDelay: '<S59>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_f = rtb_TmpSignalConversionAtHvCo_i;

  /* Update for UnitDelay: '<S52>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_DSTATE_kx = rtb_AND4_i;

  /* Update for UnitDelay: '<S31>/UnitDelay' */
  Chrg_ARID_DEF.UnitDelay_DSTATE_d = Chrg_minBookChrgStrt;

  /* Update for UnitDelay: '<S62>/Unit Delay1' */
  Chrg_ARID_DEF.UnitDelay1_DSTATE_l = Chrg_bBMSChrgErr;

  /* Update for UnitDelay: '<S3>/Unit Delay2' incorporates:
   *  Constant: '<S19>/AcChargingRls2'
   *  Constant: '<S19>/AcChargingRls3'
   *  Logic: '<S19>/Logical Operator13'
   *  RelationalOperator: '<S19>/Relational Operator2'
   *  RelationalOperator: '<S19>/Relational Operator4'
   *
   * Block description for '<S19>/AcChargingRls2':
   *  ACChargingEna
   *
   * Block description for '<S19>/AcChargingRls3':
   *  ChargingFull
   */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_bf = ((rtb_TmpSignalConversionAticbm_k >=
    ((uint8)34U)) && (rtb_TmpSignalConversionAticbm_k <= ((uint8)48U)));

  /* Update for UnitDelay: '<S70>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_l = rtb_TmpSignalConversionAtHvCoor;

  /* Update for UnitDelay: '<S71>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_d = rtb_TmpSignalConversionAticob_n;

  /* Update for UnitDelay: '<S72>/Unit Delay2' incorporates:
   *  Constant: '<S1>/TRUE'
   *
   * Block description for '<S1>/TRUE':
   *  TRUE
   */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_bi = true;

  /* Update for UnitDelay: '<S73>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_fl = rtb_TmpSignalConversionAtHvCo_e;

  /* Update for UnitDelay: '<S74>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_mv = rtb_TmpSignalConversionAtHvCo_i;

  /* Update for UnitDelay: '<S75>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_fg = rtb_TmpSignalConversionAticb_ft;

  /* Update for UnitDelay: '<S3>/Unit Delay1' */
  Chrg_ARID_DEF.UnitDelay1_DSTATE_a = rtb_TmpSignalConversionAticbm_k;

  /* Update for UnitDelay: '<S90>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_ca = rtb_LogicalOperator8_i;

  /* Update for UnitDelay: '<S105>/Unit Delay1' */
  Chrg_ARID_DEF.UnitDelay1_DSTATE = rtb_Switch2;

  /* Update for UnitDelay: '<S111>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_my = rtb_TmpSignalConversionAtHvCo_k;

  /* Update for UnitDelay: '<S110>/Unit Delay2' */
  Chrg_ARID_DEF.UnitDelay2_DSTATE_jb = rtb_OR1_p;

  /* Update for UnitDelay: '<S112>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_DSTATE_mw = rtb_Logical_Operator4_du;

  /* Update for UnitDelay: '<S118>/Unit Delay1' incorporates:
   *  Constant: '<S1>/single'
   */
  Chrg_ARID_DEF.UnitDelay1_DSTATE_j = 0.0F;

  /* Product: '<S126>/Divide' incorporates:
   *  Constant: '<S119>/chc_tiEUnlockTim_C'
   *
   * Block description for '<S119>/chc_tiEUnlockTim_C':
   *  [10]
   */
  u = Chrg_tiWait4EUnlock_C / Chrg_ConstB.Max_e;

  /* DataTypeConversion: '<S126>/DataTypeConversion' */
  v = fabsf(u);
  if (v < 8.388608E+6F) {
    if (v >= 0.5F) {
      u = floorf(u + 0.5F);
    } else {
      u = 0.0F;
    }
  }

  /* Update for UnitDelay: '<S119>/Unit Delay4' incorporates:
   *  DataTypeConversion: '<S126>/DataTypeConversion'
   *  RelationalOperator: '<S126>/Relational Operator1'
   *  Saturate: '<S126>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay4_DSTATE = (rtb_Switch_lt > (sint32)u);

  /* Update for UnitDelay: '<S125>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_DSTATE_cr = rtb_TmpSignalConversionAticbm_l;

  /* Update for Delay: '<S122>/Delay' */
  Chrg_ARID_DEF.icLoad = false;
  Chrg_ARID_DEF.Delay_DSTATE = rtb_Add6;

  /* Update for UnitDelay: '<S126>/Unit Delay' incorporates:
   *  Saturate: '<S126>/Saturation2'
   */
  Chrg_ARID_DEF.UnitDelay_DSTATE_f = rtb_Switch_lt;

  /* Update for UnitDelay: '<S120>/Unit Delay' */
  Chrg_ARID_DEF.UnitDelay_DSTATE = rtb_TmpSignalConversionAticb_cr;

  /* Update for Delay: '<S127>/Delay' */
  Chrg_ARID_DEF.icLoad_e = false;
  Chrg_ARID_DEF.Delay_DSTATE_o = rtb_MinMax5;

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */
fc_Chrg_PFC_End;
}

/* Model initialize function */
void Chrg_Init(void)
{
  /* SystemInitialize for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' incorporates:
   *  SubSystem: '<Root>/Chrg'
   */
  /* InitializeConditions for UnitDelay: '<S54>/UnitDelay' */
  Chrg_ARID_DEF.UnitDelay_DSTATE_il = true;

  /* InitializeConditions for Delay: '<S122>/Delay' */
  Chrg_ARID_DEF.icLoad = true;

  /* InitializeConditions for Delay: '<S127>/Delay' */
  Chrg_ARID_DEF.icLoad_e = true;

  /* SystemInitialize for Outport: '<Root>/Chrg_bBMSChrgErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion23'
   */
  (void)Rte_Write_Chrg_bBMSChrgErr_Value(Chrg_bBMSChrgErr);

  /* End of SystemInitialize for RootInportFunctionCallGenerator generated from: '<Root>/fc_Chrg' */
}

/*
 * File trailer for generated code.
 *
 * [EOF]
 */

