/*
 * File: ESCWhlTq.c
 *
 * Code generated for Simulink model 'ESCWhlTq'.
 *
 * Model version                  : 4.93
 * Simulink Coder version         : 9.8 (R2022b) 13-May-2022
 * C/C++ source code generated on : Mon Jan  5 14:34:50 2026
 *
 * Target selection: autosar.tlc
 * Embedded hardware selection: Infineon->TriCore
 * Code generation objectives: Unspecified
 * Validation result: Not run
 */

#include "ESCWhlTq.h"
#include <math.h>
#include "rtwtypes.h"
#include "ESCWhlTq_calibration.h"

/* PublicStructure Variables for Internal Data */
ARID_DEF_ESCWhlTq_T ESCWhlTq_ARID_DEF; /* '<S18>/Delay' */
static float32 look1_iflf_binlca(float32 u0, const float32 bp0[], const float32
  table[], uint32 maxIndex);
static float32 look1_iflf_binlca(float32 u0, const float32 bp0[], const float32
  table[], uint32 maxIndex)
{
  float32 frac;
  float32 y;
  uint32 iLeft;

  /* Column-major Lookup 1-D
     Search method: 'binary'
     Use previous index: 'off'
     Interpolation method: 'Linear point-slope'
     Extrapolation method: 'Clip'
     Use last breakpoint for index at or above upper limit: 'on'
     Remove protection against out-of-range input in generated code: 'off'
   */
  /* Prelookup - Index and Fraction
     Index Search method: 'binary'
     Extrapolation method: 'Clip'
     Use previous index: 'off'
     Use last breakpoint for index at or above upper limit: 'on'
     Remove protection against out-of-range input in generated code: 'off'
   */
  if (u0 <= bp0[0U]) {
    iLeft = 0U;
    frac = 0.0F;
  } else if (u0 < bp0[maxIndex]) {
    uint32 bpIdx;
    uint32 iRght;

    /* Binary Search */
    bpIdx = maxIndex >> 1U;
    iLeft = 0U;
    iRght = maxIndex;
    while (iRght - iLeft > 1U) {
      if (u0 < bp0[bpIdx]) {
        iRght = bpIdx;
      } else {
        iLeft = bpIdx;
      }

      bpIdx = (iRght + iLeft) >> 1U;
    }

    frac = (u0 - bp0[iLeft]) / (bp0[iLeft + 1U] - bp0[iLeft]);
  } else {
    iLeft = maxIndex;
    frac = 0.0F;
  }

  /* Column-major Interpolation 1-D
     Interpolation method: 'Linear point-slope'
     Use last breakpoint for index at or above upper limit: 'on'
     Overflow mode: 'wrapping'
   */
  if (iLeft == maxIndex) {
    y = table[iLeft];
  } else {
    float32 yL_0d0;
    yL_0d0 = table[iLeft];
    y = (table[iLeft + 1U] - yL_0d0) * frac + yL_0d0;
  }

  return y;
}

/* Model step function for TID1 */
void fc_ESCWhlTq(void)                 /* Explicit Task: fc_ESCWhlTq */
{
  float32 rtb_Product1;
  float32 rtb_Switch2;
  float32 rtb_Switch2_n;
  float32 rtb_Switch5;
  float32 rtb_TmpSignalConversionAtPwrL_a;
  float32 rtb_TmpSignalConversionAtPwrL_d;
  float32 rtb_TmpSignalConversionAtPwrL_i;
  float32 rtb_TmpSignalConversionAtPwrL_n;
  float32 rtb_TmpSignalConversionAtPwrL_p;
  float32 rtb_TmpSignalConversionAtPwrLim;
  float32 rtb_TmpSignalConversionAtTqSp_h;
  float32 rtb_TmpSignalConversionAtTqSplt;
  float32 rtb_TmpSignalConversionAtices_e;
  float32 rtb_TmpSignalConversionAtices_f;
  float32 rtb_TmpSignalConversionAtices_j;
  float32 rtb_TmpSignalConversionAtices_k;
  float32 rtb_TmpSignalConversionAtices_m;
  float32 rtb_TmpSignalConversionAticesc_;
  float32 tmpRead_3;
  uint8 rtb_TmpSignalConversionAtCrCtl_;
  uint8 rtb_TmpSignalConversionAtDrvMod;
  uint8 rtb_TmpSignalConversionAtGearLv;
  uint8 rtb_TmpSignalConversionAtHvCoor;
  uint8 rtb_TmpSignalConversionAtVehCfg;
  uint8 rtb_TmpSignalConversionAtice_px;
  uint8 tmpRead;
  uint8 tmpRead_0;
  uint8 tmpRead_5;
  boolean rtb_AND;
  boolean rtb_AND11;
  boolean rtb_AND2;
  boolean rtb_AND2_m;
  boolean rtb_AND9;
  boolean rtb_AND9_j;
  boolean rtb_AND_b;
  boolean rtb_OR3_g;
  boolean rtb_OR6;
  boolean rtb_TmpSignalConversionAtACCtl_;
  boolean rtb_TmpSignalConversionAtBrkPed;
  boolean rtb_TmpSignalConversionAtParkCt;
  boolean rtb_TmpSignalConversionAticad_h;
  boolean rtb_TmpSignalConversionAticadas;
  boolean rtb_TmpSignalConversionAtice_by;
  boolean rtb_TmpSignalConversionAtice_cn;
  boolean rtb_TmpSignalConversionAtice_h2;
  boolean rtb_TmpSignalConversionAtices_a;
  boolean rtb_TmpSignalConversionAtices_i;
  boolean tmpRead_1;
  boolean tmpRead_2;
  boolean tmpRead_4;

  /* Inport: '<Root>/icesc_bISAFrntTqReqVld' */
  (void)Rte_Read_icesc_bISAFrntTqReqVld_Value(&rtb_AND11);

  /* Inport: '<Root>/icesc_bCCOFrntTqReqVld' */
  (void)Rte_Read_icesc_bCCOFrntTqReqVld_Value(&rtb_AND9);

  /* Inport: '<Root>/icesc_stTABActv' */
  (void)Rte_Read_icesc_stTABActv_Value(&tmpRead_0);

  /* Inport: '<Root>/icesc_stCCOActv' */
  (void)Rte_Read_icesc_stCCOActv_Value(&tmpRead);

  /* Inport: '<Root>/icesc_bFrntAxleRBSTqActv' */
  (void)Rte_Read_icesc_bFrntAxleRBSTqActv_Value(&rtb_AND);

  /* Inport: '<Root>/icesc_bReAxleTqIncActv' */
  (void)Rte_Read_icesc_bReAxleTqIncActv_Value(&rtb_AND2_m);

  /* Inport: '<Root>/icesc_bReAxleTqDecActv' */
  (void)Rte_Read_icesc_bReAxleTqDecActv_Value(&rtb_OR3_g);

  /* Inport: '<Root>/icesc_bFrntAxleTqIncActv' */
  (void)Rte_Read_icesc_bFrntAxleTqIncActv_Value(&rtb_AND2);

  /* Inport: '<Root>/icesc_bFrntAxleTqDecActv' */
  (void)Rte_Read_icesc_bFrntAxleTqDecActv_Value(&rtb_OR6);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' incorporates:
   *  SubSystem: '<Root>/ESCWhlTq'
   */
  /* SignalConversion generated from: '<S1>/icesc_tqReqFrntAxleDec' incorporates:
   *  Inport: '<Root>/icesc_tqReqFrntAxleDec'
   */
  (void)Rte_Read_icesc_tqReqFrntAxleDec_Value(&rtb_TmpSignalConversionAticesc_);

  /* SignalConversion generated from: '<S1>/icesc_tqReqFrntAxleInc' incorporates:
   *  Inport: '<Root>/icesc_tqReqFrntAxleInc'
   */
  (void)Rte_Read_icesc_tqReqFrntAxleInc_Value(&rtb_TmpSignalConversionAtices_e);

  /* SignalConversion generated from: '<S1>/icesc_tqRBSReqFrntAxle' incorporates:
   *  Inport: '<Root>/icesc_tqRBSReqFrntAxle'
   */
  (void)Rte_Read_icesc_tqRBSReqFrntAxle_Value(&rtb_TmpSignalConversionAtices_m);

  /* Logic: '<S5>/AND' incorporates:
   *  Constant: '<S5>/Constant'
   *  Constant: '<S5>/Constant7'
   *  Constant: '<S5>/Constant8'
   *  Logic: '<S5>/AND6'
   *  RelationalOperator: '<S5>/Equal6'
   *  RelationalOperator: '<S5>/Equal7'
   *
   * Block description for '<S5>/Constant':
   *  [1]
   *
   * Block description for '<S5>/Constant7':
   *  [-3900]
   *
   * Block description for '<S5>/Constant8':
   *  [3900]
   */
  rtb_AND = (rtb_AND && ESCWhlTq_bRBSIntvEna_C &&
             ((rtb_TmpSignalConversionAtices_m >= ESCWhlTq_tqESCIntvMin_C) &&
              (rtb_TmpSignalConversionAtices_m <= ESCWhlTq_tqESCIntvMax_C)));

  /* Logic: '<S5>/AND1' incorporates:
   *  Constant: '<S5>/Constant1'
   *  Constant: '<S5>/Constant7'
   *  Constant: '<S5>/Constant8'
   *  Logic: '<S5>/AND6'
   *  RelationalOperator: '<S5>/Equal6'
   *  RelationalOperator: '<S5>/Equal7'
   *
   * Block description for '<S5>/Constant1':
   *  [1]
   *
   * Block description for '<S5>/Constant7':
   *  [-3900]
   *
   * Block description for '<S5>/Constant8':
   *  [3900]
   */
  ESCWhlTq_bFrntAxleTqDecActv = (rtb_OR6 && ESCWhlTq_bTqDecIntvEna_C &&
    ((rtb_TmpSignalConversionAticesc_ >= ESCWhlTq_tqESCIntvMin_C) &&
     (rtb_TmpSignalConversionAticesc_ <= ESCWhlTq_tqESCIntvMax_C)));

  /* SignalConversion generated from: '<S1>/icesc_bISAActv' incorporates:
   *  Inport: '<Root>/icesc_bISAActv'
   */
  (void)Rte_Read_icesc_bISAActv_Value(&rtb_TmpSignalConversionAtice_cn);

  /* SignalConversion generated from: '<S1>/icesc_stISAAvl' incorporates:
   *  Inport: '<Root>/icesc_stISAAvl'
   */
  (void)Rte_Read_icesc_stISAAvl_Value(&rtb_TmpSignalConversionAtice_px);

  /* Logic: '<S7>/OR6' incorporates:
   *  Constant: '<S5>/uint4'
   *  Logic: '<S5>/AND10'
   *  RelationalOperator: '<S5>/Equal11'
   */
  rtb_OR6 = (rtb_TmpSignalConversionAtice_cn && (rtb_TmpSignalConversionAtice_px
              == ((uint8)2U)));

  /* Logic: '<S5>/AND11' incorporates:
   *  Constant: '<S5>/Constant17'
   *
   * Block description for '<S5>/Constant17':
   *  [1]
   */
  rtb_AND11 = (rtb_OR6 && ESCWhlTq_bISATqIntvEna_C && rtb_AND11);

  /* Logic: '<S5>/AND2' incorporates:
   *  Constant: '<S5>/Constant2'
   *  Constant: '<S5>/Constant7'
   *  Constant: '<S5>/Constant8'
   *  Logic: '<S5>/AND6'
   *  RelationalOperator: '<S5>/Equal6'
   *  RelationalOperator: '<S5>/Equal7'
   *
   * Block description for '<S5>/Constant2':
   *  [1]
   *
   * Block description for '<S5>/Constant7':
   *  [-3900]
   *
   * Block description for '<S5>/Constant8':
   *  [3900]
   */
  rtb_AND2 = (rtb_AND2 && ESCWhlTq_bTqIncIntvEna_C &&
              ((rtb_TmpSignalConversionAtices_e >= ESCWhlTq_tqESCIntvMin_C) &&
               (rtb_TmpSignalConversionAtices_e <= ESCWhlTq_tqESCIntvMax_C)));

  /* SignalConversion generated from: '<S1>/icesc_bABSActv' incorporates:
   *  Inport: '<Root>/icesc_bABSActv'
   */
  (void)Rte_Read_icesc_bABSActv_Value(&rtb_TmpSignalConversionAtice_h2);

  /* SignalConversion generated from: '<S1>/icesc_bEBDActv' incorporates:
   *  Inport: '<Root>/icesc_bEBDActv'
   */
  (void)Rte_Read_icesc_bEBDActv_Value(&rtb_TmpSignalConversionAtices_a);

  /* SignalConversion generated from: '<S1>/icadas_bAEBActv' incorporates:
   *  Inport: '<Root>/icadas_bAEBActv'
   */
  (void)Rte_Read_icadas_bAEBActv_Value(&rtb_TmpSignalConversionAticadas);

  /* SignalConversion generated from: '<S1>/icesc_bCDPActv' incorporates:
   *  Inport: '<Root>/icesc_bCDPActv'
   */
  (void)Rte_Read_icesc_bCDPActv_Value(&rtb_TmpSignalConversionAtices_i);

  /* Logic: '<S5>/OR1' incorporates:
   *  Constant: '<S5>/Constant4'
   *  Constant: '<S5>/Constant5'
   *  Logic: '<S5>/AND4'
   *  Logic: '<S5>/AND5'
   *  Logic: '<S6>/OR1'
   *
   * Block description for '<S5>/Constant4':
   *  [0]
   *
   * Block description for '<S5>/Constant5':
   *  [0]
   */
  rtb_TmpSignalConversionAtice_h2 = ((rtb_TmpSignalConversionAtice_h2 &&
    ESCWhlTq_bABS0TqEna_C) || (rtb_TmpSignalConversionAtices_a &&
    ESCWhlTq_bEBD0TqEna_C) || rtb_TmpSignalConversionAticadas ||
    rtb_TmpSignalConversionAtices_i);

  /* SignalConversion generated from: '<S1>/ParkCtrl_bAPAActv' incorporates:
   *  Inport: '<Root>/ParkCtrl_bAPAActv'
   */
  (void)Rte_Read_ParkCtrl_bAPAActv_Value(&rtb_TmpSignalConversionAtParkCt);

  /* SignalConversion generated from: '<S1>/ACCtl_bAccActv' incorporates:
   *  Inport: '<Root>/ACCtl_bAccActv'
   */
  (void)Rte_Read_ACCtl_bAccActv_Value(&rtb_TmpSignalConversionAtACCtl_);

  /* SignalConversion generated from: '<S1>/icadas_bTqVLCTrgtReqVld' incorporates:
   *  Inport: '<Root>/icadas_bTqVLCTrgtReqVld'
   */
  (void)Rte_Read_icadas_bTqVLCTrgtReqVld_Value(&rtb_TmpSignalConversionAticad_h);

  /* Logic: '<S5>/OR3' incorporates:
   *  Logic: '<S5>/OR2'
   *  Logic: '<S6>/OR3'
   */
  rtb_TmpSignalConversionAtParkCt = ((rtb_TmpSignalConversionAtParkCt ||
    rtb_TmpSignalConversionAtACCtl_) && rtb_TmpSignalConversionAticad_h);

  /* Logic: '<S5>/Not' incorporates:
   *  Logic: '<S6>/Not4'
   *  Switch: '<S6>/Switch'
   *  Switch: '<S6>/Switch1'
   *  Switch: '<S6>/Switch10'
   *  Switch: '<S6>/Switch2'
   *  Switch: '<S6>/Switch3'
   *  Switch: '<S6>/Switch7'
   */
  rtb_TmpSignalConversionAtACCtl_ = !rtb_AND2;

  /* Logic: '<S5>/Not2' incorporates:
   *  Logic: '<S5>/OR1'
   *  Logic: '<S6>/Not1'
   */
  rtb_TmpSignalConversionAtices_a = !rtb_TmpSignalConversionAtice_h2;

  /* Logic: '<S5>/Not3' incorporates:
   *  Logic: '<S5>/OR3'
   *  Logic: '<S6>/Not3'
   */
  rtb_TmpSignalConversionAticadas = !rtb_TmpSignalConversionAtParkCt;

  /* Logic: '<S5>/AND7' incorporates:
   *  Logic: '<S5>/Not'
   *  Logic: '<S5>/Not1'
   *  Logic: '<S5>/Not2'
   *  Logic: '<S5>/Not3'
   *  Logic: '<S5>/Not5'
   */
  ESCWhlTq_bFrntAxleOnlyRBSActv = (rtb_TmpSignalConversionAtACCtl_ &&
    (!ESCWhlTq_bFrntAxleTqDecActv) && rtb_TmpSignalConversionAtices_a && rtb_AND
    && rtb_TmpSignalConversionAticadas && (!rtb_AND11));

  /* SignalConversion generated from: '<S1>/icesc_tqReqReAxleDec' incorporates:
   *  Inport: '<Root>/icesc_tqReqReAxleDec'
   */
  (void)Rte_Read_icesc_tqReqReAxleDec_Value(&rtb_TmpSignalConversionAtices_f);

  /* SignalConversion generated from: '<S1>/icesc_tqReqReAxleInc' incorporates:
   *  Inport: '<Root>/icesc_tqReqReAxleInc'
   */
  (void)Rte_Read_icesc_tqReqReAxleInc_Value(&rtb_TmpSignalConversionAtices_k);

  /* SignalConversion generated from: '<S1>/icesc_tqRBSReqReAxle' incorporates:
   *  Inport: '<Root>/icesc_tqRBSReqReAxle'
   */
  (void)Rte_Read_icesc_tqRBSReqReAxle_Value(&rtb_TmpSignalConversionAtices_j);

  /* Logic: '<S6>/AND2' incorporates:
   *  Constant: '<S6>/Constant2'
   *  Constant: '<S6>/Constant7'
   *  Constant: '<S6>/Constant8'
   *  Logic: '<S6>/AND3'
   *  RelationalOperator: '<S6>/Equal6'
   *  RelationalOperator: '<S6>/Equal7'
   *
   * Block description for '<S6>/Constant2':
   *  [1]
   *
   * Block description for '<S6>/Constant7':
   *  [-3900]
   *
   * Block description for '<S6>/Constant8':
   *  [3900]
   */
  rtb_AND2_m = (rtb_AND2_m && ESCWhlTq_bTqIncIntvEna_C &&
                ((rtb_TmpSignalConversionAtices_k >= ESCWhlTq_tqESCIntvMin_C) &&
                 (rtb_TmpSignalConversionAtices_k <= ESCWhlTq_tqESCIntvMax_C)));

  /* Logic: '<S6>/AND1' incorporates:
   *  Constant: '<S6>/Constant1'
   *  Constant: '<S6>/Constant7'
   *  Constant: '<S6>/Constant8'
   *  Logic: '<S6>/AND3'
   *  RelationalOperator: '<S6>/Equal6'
   *  RelationalOperator: '<S6>/Equal7'
   *
   * Block description for '<S6>/Constant1':
   *  [1]
   *
   * Block description for '<S6>/Constant7':
   *  [-3900]
   *
   * Block description for '<S6>/Constant8':
   *  [3900]
   */
  ESCWhlTq_bReAxleTqDecActv = (rtb_OR3_g && ESCWhlTq_bTqDecIntvEna_C &&
    ((rtb_TmpSignalConversionAtices_f >= ESCWhlTq_tqESCIntvMin_C) &&
     (rtb_TmpSignalConversionAtices_f <= ESCWhlTq_tqESCIntvMax_C)));

  /* SignalConversion generated from: '<S1>/icesc_bTCSActv' incorporates:
   *  Inport: '<Root>/icesc_bTCSActv'
   */
  (void)Rte_Read_icesc_bTCSActv_Value(&rtb_TmpSignalConversionAtice_by);

  /* SignalConversion generated from: '<S1>/DrvMod_stDrvMod' incorporates:
   *  Inport: '<Root>/DrvMod_stDrvMod'
   */
  (void)Rte_Read_DrvMod_stDrvMod_Value(&rtb_TmpSignalConversionAtDrvMod);

  /* RelationalOperator: '<S10>/Greater' incorporates:
   *  ArithShift: '<S11>/Shift Arithmetic1'
   *  ArithShift: '<S11>/Shift Arithmetic2'
   *  ArithShift: '<S11>/Shift Arithmetic3'
   *  ArithShift: '<S11>/Shift Arithmetic4'
   *  Constant: '<S10>/uint32'
   *  Constant: '<S5>/Constant11'
   *  Constant: '<S5>/Constant12'
   *  Constant: '<S5>/Constant13'
   *  Constant: '<S5>/Constant14'
   *  Constant: '<S5>/Constant15'
   *  Constant: '<S5>/Constant16'
   *  DataTypeConversion: '<S10>/DataTypeConversion'
   *  RelationalOperator: '<S5>/Equal10'
   *  RelationalOperator: '<S5>/Equal3'
   *  RelationalOperator: '<S5>/Equal4'
   *  RelationalOperator: '<S5>/Equal8'
   *  RelationalOperator: '<S5>/Equal9'
   *  S-Function (sfix_bitop): '<S10>/Bitwise Operator'
   *  Sum: '<S11>/Add'
   *
   * Block description for '<S5>/Constant11':
   *  [9]
   *
   * Block description for '<S5>/Constant12':
   *  [5]
   *
   * Block description for '<S5>/Constant13':
   *  [7]
   *
   * Block description for '<S5>/Constant14':
   *  [8]
   *
   * Block description for '<S5>/Constant15':
   *  [4]
   *
   * Block description for '<S5>/Constant16':
   *  [30]
   */
  ESCWhlTq_bOffRoadTCSActv = (((((((uint32)((rtb_TmpSignalConversionAtDrvMod ==
    ((uint8)5U)) << 1) + (uint32)(rtb_TmpSignalConversionAtDrvMod == ((uint8)4U)))
    + (uint32)((rtb_TmpSignalConversionAtDrvMod == ((uint8)7U)) << 2)) + (uint32)
    ((rtb_TmpSignalConversionAtDrvMod == ((uint8)8U)) << 3)) + (uint32)
    ((rtb_TmpSignalConversionAtDrvMod == ((uint8)9U)) << 4)) &
    ESCWhlTq_noOffRoadTCSActv_C) >= 1U);

  /* Logic: '<S5>/AND9' incorporates:
   *  Constant: '<S5>/Constant10'
   *  Constant: '<S5>/uint1'
   *  Constant: '<S5>/uint2'
   *  Logic: '<S5>/OR5'
   *  Logic: '<S6>/AND9'
   *  RelationalOperator: '<S5>/Equal1'
   *  RelationalOperator: '<S5>/Equal2'
   *
   * Block description for '<S5>/Constant10':
   *  [1]
   */
  rtb_OR3_g = (((tmpRead == ((uint8)2U)) || (tmpRead_0 == ((uint8)2U))) &&
               ESCWhlTq_bCCOTqIntvEna_C);

  /* Logic: '<S5>/AND9' */
  rtb_AND9 = (rtb_OR3_g && rtb_AND9);

  /* SignalConversion generated from: '<S1>/PwrLimEM_tqMaxFrntAxle' incorporates:
   *  Inport: '<Root>/PwrLimEM_tqMaxFrntAxle'
   */
  (void)Rte_Read_PwrLimEM_tqMaxFrntAxle_Value(&rtb_TmpSignalConversionAtPwrLim);

  /* SignalConversion generated from: '<S1>/TqSpltArbt_tqTarFrntAxle' incorporates:
   *  Inport: '<Root>/TqSpltArbt_tqTarFrntAxle'
   */
  (void)Rte_Read_TqSpltArbt_tqTarFrntAxle_Value(&rtb_TmpSignalConversionAtTqSplt);

  /* Switch: '<S5>/Switch5' incorporates:
   *  Constant: '<S5>/Constant3'
   *  Logic: '<S5>/AND3'
   *
   * Block description for '<S5>/Constant3':
   *  [0]
   */
  if (rtb_AND && ESCWhlTq_bRBSRgnTrqLock_C) {
    /* Switch: '<S5>/Switch5' incorporates:
     *  UnitDelay: '<S5>/Unit Delay'
     */
    rtb_Switch5 = ESCWhlTq_ARID_DEF.UnitDelay_DSTATE;
  } else {
    /* Switch: '<S5>/Switch5' */
    rtb_Switch5 = rtb_TmpSignalConversionAtTqSplt;
  }

  /* End of Switch: '<S5>/Switch5' */

  /* MinMax: '<S5>/Min1' incorporates:
   *  Constant: '<S5>/single2'
   */
  ESCWhlTq_tqTarCstRgnFrntAxle = fminf(rtb_Switch5, 0.0F);

  /* SignalConversion generated from: '<S1>/VehCfg_stRBCCtrlModeSel' incorporates:
   *  Inport: '<Root>/VehCfg_stRBCCtrlModeSel'
   */
  (void)Rte_Read_VehCfg_stRBCCtrlModeSel_Value(&rtb_TmpSignalConversionAtVehCfg);

  /* Switch: '<S5>/Switch2' incorporates:
   *  Constant: '<S5>/Constant6'
   *  Constant: '<S5>/Constant9'
   *  Inport: '<Root>/icesc_tqCCOFrntTqReq'
   *  Logic: '<S5>/AND8'
   *  Logic: '<S5>/Not4'
   *  Logic: '<S5>/OR1'
   *  Logic: '<S5>/OR3'
   *  Logic: '<S5>/OR4'
   *  Switch: '<S5>/Switch'
   *  Switch: '<S5>/Switch1'
   *  Switch: '<S5>/Switch10'
   *  Switch: '<S5>/Switch3'
   *  Switch: '<S5>/Switch4'
   *  Switch: '<S5>/Switch7'
   *
   * Block description for '<S5>/Constant6':
   *  [0]
   *
   * Block description for '<S5>/Constant9':
   *  [1]
   */
  if (rtb_AND2) {
    /* Switch: '<S5>/Switch2' */
    rtb_Switch2 = rtb_TmpSignalConversionAtices_e;
  } else if (ESCWhlTq_bFrntAxleTqDecActv) {
    /* Switch: '<S5>/Switch2' incorporates:
     *  Switch: '<S5>/Switch1'
     */
    rtb_Switch2 = rtb_TmpSignalConversionAticesc_;
  } else if (rtb_TmpSignalConversionAtice_h2) {
    /* Switch: '<S5>/Switch2' incorporates:
     *  Constant: '<S5>/single1'
     *  Switch: '<S5>/Switch1'
     *  Switch: '<S5>/Switch3'
     */
    rtb_Switch2 = 0.0F;
  } else if (rtb_AND11) {
    /* Switch: '<S5>/Switch2' incorporates:
     *  Inport: '<Root>/icesc_tqISAFrntReq'
     *  Switch: '<S5>/Switch10'
     */
    (void)Rte_Read_icesc_tqISAFrntReq_Value(&rtb_Switch2);
  } else if (rtb_TmpSignalConversionAtParkCt) {
    /* Switch: '<S5>/Switch2' incorporates:
     *  Switch: '<S5>/Switch1'
     *  Switch: '<S5>/Switch10'
     *  Switch: '<S5>/Switch3'
     *  Switch: '<S5>/Switch7'
     */
    rtb_Switch2 = rtb_TmpSignalConversionAtTqSplt;
  } else if (rtb_AND) {
    /* Switch: '<S5>/Switch6' incorporates:
     *  Constant: '<S5>/uint3'
     *  RelationalOperator: '<S5>/Equal5'
     *  Sum: '<S5>/Add'
     *  Switch: '<S5>/Switch'
     *  Switch: '<S5>/Switch1'
     *  Switch: '<S5>/Switch10'
     *  Switch: '<S5>/Switch3'
     *  Switch: '<S5>/Switch7'
     *
     * Block description for '<S5>/uint3':
     *  [3]
     */
    if (rtb_TmpSignalConversionAtVehCfg == ((uint8)3U)) {
      rtb_TmpSignalConversionAticesc_ = ESCWhlTq_tqTarCstRgnFrntAxle +
        rtb_TmpSignalConversionAtices_m;
    } else {
      rtb_TmpSignalConversionAticesc_ = rtb_TmpSignalConversionAtTqSplt;
    }

    /* Switch: '<S5>/Switch2' incorporates:
     *  Constant: '<S5>/single6'
     *  MinMax: '<S5>/Max4'
     *  Switch: '<S5>/Switch'
     *  Switch: '<S5>/Switch1'
     *  Switch: '<S5>/Switch10'
     *  Switch: '<S5>/Switch3'
     *  Switch: '<S5>/Switch6'
     *  Switch: '<S5>/Switch7'
     */
    rtb_Switch2 = fminf(rtb_TmpSignalConversionAticesc_, 0.0F);
  } else if ((!rtb_AND2_m) && ESCWhlTq_bReAxleTqDecActv &&
             (rtb_TmpSignalConversionAtice_by || ESCWhlTq_bTCS4DecTqTrfByp_C) &&
             ESCWhlTq_bESCDecTqTrf_C && ESCWhlTq_bOffRoadTCSActv) {
    /* Switch: '<S5>/Switch2' incorporates:
     *  Constant: '<S5>/single'
     *  MinMax: '<S5>/Max'
     *  Sum: '<S5>/Add2'
     *  Switch: '<S5>/Switch'
     *  Switch: '<S5>/Switch1'
     *  Switch: '<S5>/Switch10'
     *  Switch: '<S5>/Switch3'
     *  Switch: '<S5>/Switch4'
     *  Switch: '<S5>/Switch7'
     *  UnitDelay: '<S5>/Unit Delay1'
     */
    rtb_Switch2 = fmaxf(ESCWhlTq_ARID_DEF.UnitDelay1_DSTATE, 0.0F) +
      rtb_TmpSignalConversionAtTqSplt;
  } else {
    (void)Rte_Read_icesc_tqCCOFrntTqReq_Value(&rtb_Switch2);

    /* Switch: '<S5>/Switch8' incorporates:
     *  Inport: '<Root>/icesc_tqCCOFrntTqReq'
     *  Switch: '<S5>/Switch'
     *  Switch: '<S5>/Switch1'
     *  Switch: '<S5>/Switch10'
     *  Switch: '<S5>/Switch3'
     *  Switch: '<S5>/Switch4'
     *  Switch: '<S5>/Switch7'
     */
    if (!rtb_AND9) {
      /* Switch: '<S5>/Switch2' incorporates:
       *  Switch: '<S5>/Switch'
       *  Switch: '<S5>/Switch10'
       *  Switch: '<S5>/Switch4'
       */
      rtb_Switch2 = rtb_TmpSignalConversionAtTqSplt;
    }

    /* End of Switch: '<S5>/Switch8' */
  }

  /* End of Switch: '<S5>/Switch2' */

  /* SignalConversion generated from: '<S1>/PwrLimEM_tqMinFrntAxle' incorporates:
   *  Inport: '<Root>/PwrLimEM_tqMinFrntAxle'
   */
  (void)Rte_Read_PwrLimEM_tqMinFrntAxle_Value(&rtb_TmpSignalConversionAtPwrL_a);

  /* Switch: '<S9>/Switch' incorporates:
   *  RelationalOperator: '<S9>/GreaterOrEqual'
   */
  if (rtb_TmpSignalConversionAtPwrLim >= rtb_TmpSignalConversionAtPwrL_a) {
    /* Switch: '<S9>/Switch' incorporates:
     *  MinMax: '<S9>/MinMax'
     *  MinMax: '<S9>/MinMax1'
     */
    rtb_TmpSignalConversionAtPwrL_a = fminf(rtb_TmpSignalConversionAtPwrLim,
      fmaxf(rtb_Switch2, rtb_TmpSignalConversionAtPwrL_a));
  } else {
    /* Switch: '<S9>/Switch' incorporates:
     *  MinMax: '<S9>/MinMax2'
     *  MinMax: '<S9>/MinMax3'
     */
    rtb_TmpSignalConversionAtPwrL_a = fminf(fmaxf(rtb_Switch2,
      rtb_TmpSignalConversionAtPwrLim), rtb_TmpSignalConversionAtPwrL_a);
  }

  /* End of Switch: '<S9>/Switch' */

  /* Logic: '<S5>/OR' */
  ESCWhlTq_bFrntAxleTqIntvActv = (rtb_AND || ESCWhlTq_bFrntAxleTqDecActv ||
    rtb_AND2 || rtb_AND9 || rtb_AND11);

  /* Switch: '<S5>/Switch9' */
  if (rtb_OR6) {
    /* Switch: '<S5>/Switch9' incorporates:
     *  Abs: '<S5>/Abs'
     */
    ESCWhlTq_tqTarFrntAxle = fabsf(rtb_TmpSignalConversionAtPwrL_a);
  } else {
    /* Switch: '<S5>/Switch9' */
    ESCWhlTq_tqTarFrntAxle = rtb_TmpSignalConversionAtPwrL_a;
  }

  /* End of Switch: '<S5>/Switch9' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' */

  /* Inport: '<Root>/icesc_bISAReTqReqVld' */
  (void)Rte_Read_icesc_bISAReTqReqVld_Value(&tmpRead_4);

  /* Inport: '<Root>/icesc_bCCOReTqReqVld' */
  (void)Rte_Read_icesc_bCCOReTqReqVld_Value(&rtb_AND9_j);

  /* Inport: '<Root>/icesc_bReAxleRBSTqActv' */
  (void)Rte_Read_icesc_bReAxleRBSTqActv_Value(&rtb_AND_b);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' incorporates:
   *  SubSystem: '<Root>/ESCWhlTq'
   */
  /* Logic: '<S6>/AND' incorporates:
   *  Constant: '<S6>/Constant'
   *  Constant: '<S6>/Constant7'
   *  Constant: '<S6>/Constant8'
   *  Logic: '<S6>/AND3'
   *  RelationalOperator: '<S6>/Equal6'
   *  RelationalOperator: '<S6>/Equal7'
   *
   * Block description for '<S6>/Constant':
   *  [1]
   *
   * Block description for '<S6>/Constant7':
   *  [-3900]
   *
   * Block description for '<S6>/Constant8':
   *  [3900]
   */
  rtb_AND_b = (rtb_AND_b && ESCWhlTq_bRBSIntvEna_C &&
               ((rtb_TmpSignalConversionAtices_j >= ESCWhlTq_tqESCIntvMin_C) &&
                (rtb_TmpSignalConversionAtices_j <= ESCWhlTq_tqESCIntvMax_C)));

  /* Logic: '<S7>/OR6' incorporates:
   *  Constant: '<S6>/uint4'
   *  Logic: '<S6>/AND10'
   *  RelationalOperator: '<S6>/Equal11'
   */
  rtb_OR6 = (rtb_TmpSignalConversionAtice_cn && (rtb_TmpSignalConversionAtice_px
              == ((uint8)2U)));

  /* Logic: '<S6>/AND11' incorporates:
   *  Constant: '<S6>/Constant11'
   *
   * Block description for '<S6>/Constant11':
   *  [1]
   */
  rtb_TmpSignalConversionAtice_cn = (rtb_OR6 && ESCWhlTq_bISATqIntvEna_C &&
    tmpRead_4);

  /* Logic: '<S6>/AND7' incorporates:
   *  Logic: '<S6>/Not'
   *  Logic: '<S6>/Not2'
   *  Logic: '<S6>/Not5'
   */
  ESCWhlTq_bReAxleOnlyRBSActv = ((!ESCWhlTq_bReAxleTqDecActv) && (!rtb_AND2_m) &&
    rtb_TmpSignalConversionAtices_a && rtb_AND_b &&
    rtb_TmpSignalConversionAticadas && (!rtb_TmpSignalConversionAtice_cn));

  /* Logic: '<S6>/AND9' */
  rtb_AND9_j = (rtb_OR3_g && rtb_AND9_j);

  /* SignalConversion generated from: '<S1>/PwrLimEM_tqMaxReAxle' incorporates:
   *  Inport: '<Root>/PwrLimEM_tqMaxReAxle'
   */
  (void)Rte_Read_PwrLimEM_tqMaxReAxle_Value(&rtb_TmpSignalConversionAtPwrL_d);

  /* SignalConversion generated from: '<S1>/TqSpltArbt_tqTarReAxle' incorporates:
   *  Inport: '<Root>/TqSpltArbt_tqTarReAxle'
   */
  (void)Rte_Read_TqSpltArbt_tqTarReAxle_Value(&rtb_TmpSignalConversionAtTqSp_h);

  /* Switch: '<S6>/Switch5' incorporates:
   *  Constant: '<S6>/Constant6'
   *  Logic: '<S6>/AND6'
   *
   * Block description for '<S6>/Constant6':
   *  [0]
   */
  if (rtb_AND_b && ESCWhlTq_bRBSRgnTrqLock_C) {
    /* Switch: '<S6>/Switch5' incorporates:
     *  UnitDelay: '<S6>/Unit Delay'
     */
    rtb_TmpSignalConversionAtPwrLim = ESCWhlTq_ARID_DEF.UnitDelay_DSTATE_d;
  } else {
    /* Switch: '<S6>/Switch5' */
    rtb_TmpSignalConversionAtPwrLim = rtb_TmpSignalConversionAtTqSp_h;
  }

  /* End of Switch: '<S6>/Switch5' */

  /* MinMax: '<S6>/Min1' incorporates:
   *  Constant: '<S6>/single2'
   */
  ESCWhlTq_tqTarCstRgnReAxle = fminf(rtb_TmpSignalConversionAtPwrLim, 0.0F);

  /* Switch: '<S6>/Switch2' incorporates:
   *  Constant: '<S6>/Constant5'
   *  Constant: '<S6>/Constant9'
   *  Inport: '<Root>/icesc_tqCCOReTqReq'
   *  Logic: '<S6>/AND8'
   *  Logic: '<S6>/OR4'
   *  Switch: '<S6>/Switch'
   *  Switch: '<S6>/Switch1'
   *  Switch: '<S6>/Switch10'
   *  Switch: '<S6>/Switch3'
   *  Switch: '<S6>/Switch4'
   *  Switch: '<S6>/Switch7'
   *
   * Block description for '<S6>/Constant5':
   *  [0]
   *
   * Block description for '<S6>/Constant9':
   *  [1]
   */
  if (rtb_AND2_m) {
    /* Switch: '<S6>/Switch2' */
    rtb_Switch2_n = rtb_TmpSignalConversionAtices_k;
  } else if (ESCWhlTq_bReAxleTqDecActv) {
    /* Switch: '<S6>/Switch2' incorporates:
     *  Switch: '<S6>/Switch1'
     */
    rtb_Switch2_n = rtb_TmpSignalConversionAtices_f;
  } else if (rtb_TmpSignalConversionAtice_h2) {
    /* Switch: '<S6>/Switch2' incorporates:
     *  Constant: '<S6>/single1'
     *  Switch: '<S6>/Switch1'
     *  Switch: '<S6>/Switch3'
     */
    rtb_Switch2_n = 0.0F;
  } else if (rtb_TmpSignalConversionAtice_cn) {
    /* Switch: '<S6>/Switch2' incorporates:
     *  Inport: '<Root>/icesc_tqISAReReq'
     *  Switch: '<S6>/Switch10'
     */
    (void)Rte_Read_icesc_tqISAReReq_Value(&rtb_Switch2_n);
  } else if (rtb_TmpSignalConversionAtParkCt) {
    /* Switch: '<S6>/Switch2' incorporates:
     *  Switch: '<S6>/Switch1'
     *  Switch: '<S6>/Switch10'
     *  Switch: '<S6>/Switch3'
     *  Switch: '<S6>/Switch7'
     */
    rtb_Switch2_n = rtb_TmpSignalConversionAtTqSp_h;
  } else if (rtb_AND_b) {
    /* Switch: '<S6>/Switch6' incorporates:
     *  Constant: '<S6>/uint3'
     *  RelationalOperator: '<S6>/Equal5'
     *  Sum: '<S6>/Add'
     *  Switch: '<S6>/Switch'
     *  Switch: '<S6>/Switch1'
     *  Switch: '<S6>/Switch10'
     *  Switch: '<S6>/Switch3'
     *  Switch: '<S6>/Switch7'
     *
     * Block description for '<S6>/uint3':
     *  [3]
     */
    if (rtb_TmpSignalConversionAtVehCfg == ((uint8)3U)) {
      rtb_TmpSignalConversionAticesc_ = ESCWhlTq_tqTarCstRgnReAxle +
        rtb_TmpSignalConversionAtices_j;
    } else {
      rtb_TmpSignalConversionAticesc_ = rtb_TmpSignalConversionAtTqSp_h;
    }

    /* Switch: '<S6>/Switch2' incorporates:
     *  Constant: '<S6>/single6'
     *  MinMax: '<S6>/Max4'
     *  Switch: '<S6>/Switch'
     *  Switch: '<S6>/Switch1'
     *  Switch: '<S6>/Switch10'
     *  Switch: '<S6>/Switch3'
     *  Switch: '<S6>/Switch6'
     *  Switch: '<S6>/Switch7'
     */
    rtb_Switch2_n = fminf(rtb_TmpSignalConversionAticesc_, 0.0F);
  } else if (rtb_TmpSignalConversionAtACCtl_ && ESCWhlTq_bFrntAxleTqDecActv &&
             (rtb_TmpSignalConversionAtice_by || ESCWhlTq_bTCS4DecTqTrfByp_C) &&
             ESCWhlTq_bESCDecTqTrf_C && ESCWhlTq_bOffRoadTCSActv) {
    /* Switch: '<S6>/Switch2' incorporates:
     *  Constant: '<S6>/single'
     *  MinMax: '<S6>/Max'
     *  Sum: '<S5>/Add1'
     *  Sum: '<S6>/Add1'
     *  Switch: '<S6>/Switch'
     *  Switch: '<S6>/Switch1'
     *  Switch: '<S6>/Switch10'
     *  Switch: '<S6>/Switch3'
     *  Switch: '<S6>/Switch4'
     *  Switch: '<S6>/Switch7'
     */
    rtb_Switch2_n = fmaxf(rtb_TmpSignalConversionAtTqSplt -
                          rtb_TmpSignalConversionAtPwrL_a, 0.0F) +
      rtb_TmpSignalConversionAtTqSp_h;
  } else {
    (void)Rte_Read_icesc_tqCCOReTqReq_Value(&rtb_Switch2_n);

    /* Switch: '<S6>/Switch8' incorporates:
     *  Inport: '<Root>/icesc_tqCCOReTqReq'
     *  Switch: '<S6>/Switch'
     *  Switch: '<S6>/Switch1'
     *  Switch: '<S6>/Switch10'
     *  Switch: '<S6>/Switch3'
     *  Switch: '<S6>/Switch4'
     *  Switch: '<S6>/Switch7'
     */
    if (!rtb_AND9_j) {
      /* Switch: '<S6>/Switch2' incorporates:
       *  Switch: '<S6>/Switch'
       *  Switch: '<S6>/Switch10'
       *  Switch: '<S6>/Switch4'
       */
      rtb_Switch2_n = rtb_TmpSignalConversionAtTqSp_h;
    }

    /* End of Switch: '<S6>/Switch8' */
  }

  /* SignalConversion generated from: '<S1>/PwrLimEM_tqMinReAxle' incorporates:
   *  Inport: '<Root>/PwrLimEM_tqMinReAxle'
   */
  (void)Rte_Read_PwrLimEM_tqMinReAxle_Value(&rtb_TmpSignalConversionAtPwrL_n);

  /* Switch: '<S14>/Switch' incorporates:
   *  RelationalOperator: '<S14>/GreaterOrEqual'
   */
  if (rtb_TmpSignalConversionAtPwrL_d >= rtb_TmpSignalConversionAtPwrL_n) {
    /* Switch: '<S14>/Switch' incorporates:
     *  MinMax: '<S14>/MinMax'
     *  MinMax: '<S14>/MinMax1'
     */
    rtb_TmpSignalConversionAtPwrL_d = fminf(rtb_TmpSignalConversionAtPwrL_d,
      fmaxf(rtb_Switch2_n, rtb_TmpSignalConversionAtPwrL_n));
  } else {
    /* Switch: '<S14>/Switch' incorporates:
     *  MinMax: '<S14>/MinMax2'
     *  MinMax: '<S14>/MinMax3'
     */
    rtb_TmpSignalConversionAtPwrL_d = fminf(fmaxf(rtb_Switch2_n,
      rtb_TmpSignalConversionAtPwrL_d), rtb_TmpSignalConversionAtPwrL_n);
  }

  /* End of Switch: '<S14>/Switch' */

  /* Logic: '<S6>/OR' */
  ESCWhlTq_bReAxleTqIntvActv = (rtb_AND_b || ESCWhlTq_bReAxleTqDecActv ||
    rtb_AND2_m || rtb_AND9_j || rtb_TmpSignalConversionAtice_cn);

  /* Switch: '<S6>/Switch9' */
  if (rtb_OR6) {
    /* Switch: '<S6>/Switch9' incorporates:
     *  Abs: '<S6>/Abs'
     *  Constant: '<S15>/single'
     *  Product: '<S15>/Product2'
     */
    ESCWhlTq_tqTarReAxle = fabsf(rtb_TmpSignalConversionAtPwrL_d) * (-1.0F);
  } else {
    /* Switch: '<S6>/Switch9' */
    ESCWhlTq_tqTarReAxle = rtb_TmpSignalConversionAtPwrL_d;
  }

  /* End of Switch: '<S6>/Switch9' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' */

  /* Inport: '<Root>/VehSpd_vVeh' */
  (void)Rte_Read_VehSpd_vVeh_Value(&tmpRead_3);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' incorporates:
   *  SubSystem: '<Root>/ESCWhlTq'
   */
  /* SignalConversion generated from: '<S1>/GearLvr_stDrvGear' incorporates:
   *  Inport: '<Root>/GearLvr_stDrvGear'
   */
  (void)Rte_Read_GearLvr_stDrvGear_Value(&rtb_TmpSignalConversionAtGearLv);

  /* SignalConversion generated from: '<S1>/BrkPedDev_bBrk' incorporates:
   *  Inport: '<Root>/BrkPedDev_bBrk'
   */
  (void)Rte_Read_BrkPedDev_bBrk_Value(&rtb_TmpSignalConversionAtBrkPed);

  /* SignalConversion generated from: '<S1>/HvCoorn_stVoltMod' incorporates:
   *  Inport: '<Root>/HvCoorn_stVoltMod'
   */
  (void)Rte_Read_HvCoorn_stVoltMod_Value(&rtb_TmpSignalConversionAtHvCoor);

  /* SignalConversion generated from: '<S1>/PwrLimEM_tqMinFrntAxle4ESC' incorporates:
   *  Inport: '<Root>/PwrLimEM_tqMinFrntAxle4ESC'
   */
  (void)Rte_Read_PwrLimEM_tqMinFrntAxle4ESC_Value
    (&rtb_TmpSignalConversionAtPwrL_i);

  /* SignalConversion generated from: '<S1>/PwrLimEM_tqMinReAxle4ESC' incorporates:
   *  Inport: '<Root>/PwrLimEM_tqMinReAxle4ESC'
   */
  (void)Rte_Read_PwrLimEM_tqMinReAxle4ESC_Value(&rtb_TmpSignalConversionAtPwrL_p);

  /* Switch: '<S7>/Switch' incorporates:
   *  Constant: '<S7>/Constant'
   *  RelationalOperator: '<S7>/Equal1'
   *
   * Block description for '<S7>/Constant':
   *  [1]
   */
  if (rtb_TmpSignalConversionAtGearLv == ((uint8)1U)) {
    /* Switch: '<S7>/Switch6' incorporates:
     *  Constant: '<S7>/Constant1'
     *  Inport: '<Root>/icems_stEng'
     *
     * Block description for '<S7>/Constant1':
     *  [1]
     */
    if (ESCWhlTq_bSelBrkMaxRgnTqCalc_C) {
      (void)Rte_Read_icems_stEng_Value(&tmpRead_5);

      /* Switch: '<S7>/Switch3' incorporates:
       *  Constant: '<S7>/icemsSt_Run_SC2'
       *  Inport: '<Root>/icbms_tMinBat'
       *  Inport: '<Root>/icems_stEng'
       *  RelationalOperator: '<S7>/Relational Operator6'
       *
       * Block description for '<S7>/icemsSt_Run_SC2':
       *  [3]
       */
      if (tmpRead_5 == ((uint8)3U)) {
        (void)Rte_Read_icbms_tMinBat_Value(&rtb_Product1);

        /* Product: '<S7>/Product1' incorporates:
         *  Inport: '<Root>/icbms_tMinBat'
         *  Lookup_n-D: '<S7>/1-D Lookup Table4'
         */
        rtb_Product1 = look1_iflf_binlca(rtb_Product1, (const float32 *)
          &ESCWhlTq_tBatMinBrkMaxRgnTq_AX[0], (const float32 *)
          &ESCWhlTq_facBrkMaxRgnTqBatMin_T[0], 4U);
      } else {
        /* Product: '<S7>/Product1' incorporates:
         *  Constant: '<S7>/single'
         */
        rtb_Product1 = 1.0F;
      }

      /* End of Switch: '<S7>/Switch3' */

      /* Switch: '<S7>/Switch' incorporates:
       *  Constant: '<S7>/single1'
       *  Constant: '<S7>/single10'
       *  Constant: '<S7>/single12'
       *  Constant: '<S7>/single2'
       *  MinMax: '<S7>/Min1'
       *  MinMax: '<S7>/Min2'
       *  MinMax: '<S7>/Min3'
       *  MinMax: '<S7>/Min4'
       *  Product: '<S7>/Product'
       *  Product: '<S7>/Product1'
       *  Sum: '<S7>/Subtract1'
       *  Sum: '<S7>/Subtract2'
       *  Switch: '<S7>/Switch6'
       */
      rtb_TmpSignalConversionAtices_f = fminf((fminf
        (rtb_TmpSignalConversionAtPwrL_i, 0.0F) - ESCWhlTq_tqTarCstRgnFrntAxle) *
        rtb_Product1, 0.0F);
      rtb_TmpSignalConversionAtPwrL_p = fminf((fminf
        (rtb_TmpSignalConversionAtPwrL_p, 0.0F) - ESCWhlTq_tqTarCstRgnReAxle) *
        rtb_Product1, 0.0F);
    } else {
      /* Switch: '<S7>/Switch' incorporates:
       *  Switch: '<S7>/Switch6'
       */
      rtb_TmpSignalConversionAtices_f = rtb_TmpSignalConversionAtPwrL_i;
    }

    /* End of Switch: '<S7>/Switch6' */
  } else {
    /* Switch: '<S7>/Switch' incorporates:
     *  Constant: '<S7>/single5'
     */
    rtb_TmpSignalConversionAtices_f = 0.0F;
    rtb_TmpSignalConversionAtPwrL_p = 0.0F;
  }

  /* End of Switch: '<S7>/Switch' */

  /* Delay: '<S18>/Delay' */
  if (ESCWhlTq_ARID_DEF.icLoad) {
    ESCWhlTq_ARID_DEF.Delay_DSTATE[0] = rtb_TmpSignalConversionAtices_f;
    ESCWhlTq_ARID_DEF.Delay_DSTATE[1] = rtb_TmpSignalConversionAtPwrL_p;
  }

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' */

  /* Inport: '<Root>/ipf_bCCAN0x10FSG4Vld' */
  (void)Rte_Read_ipf_bCCAN0x10FSG4Vld_Value(&tmpRead_2);

  /* Inport: '<Root>/ipf_bCCAN0x10BSG6Vld' */
  (void)Rte_Read_ipf_bCCAN0x10BSG6Vld_Value(&tmpRead_1);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' incorporates:
   *  SubSystem: '<Root>/ESCWhlTq'
   */
  /* Product: '<S18>/K' incorporates:
   *  Constant: '<S18>/single'
   *  Constant: '<S7>/Constant2'
   *  Constant: '<S7>/TaskTime_s2'
   *  MinMax: '<S18>/MinMax'
   *
   * Block description for '<S7>/Constant2':
   *  [0.01]
   */
  rtb_TmpSignalConversionAtPwrL_i = 0.01F / fmaxf(fmaxf(0.01F,
    ESCWhlTq_tiBrkMaxRgnTqFilt_C), 1.0E-5F);

  /* Sum: '<S18>/Subtract' incorporates:
   *  Delay: '<S18>/Delay'
   *  Product: '<S18>/Product'
   *  Sum: '<S18>/dif'
   */
  rtb_Product1 = (rtb_TmpSignalConversionAtices_f -
                  ESCWhlTq_ARID_DEF.Delay_DSTATE[0]) *
    rtb_TmpSignalConversionAtPwrL_i + ESCWhlTq_ARID_DEF.Delay_DSTATE[0];

  /* MinMax: '<S7>/Min' incorporates:
   *  Constant: '<S7>/single6'
   */
  rtb_TmpSignalConversionAtices_k = fminf(rtb_Product1, 0.0F);

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' */

  /* Sum: '<S18>/Subtract' incorporates:
   *  Delay: '<S18>/Delay'
   *  Product: '<S18>/Product'
   *  Sum: '<S18>/dif'
   */
  rtb_TmpSignalConversionAtices_f = rtb_Product1;

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' incorporates:
   *  SubSystem: '<Root>/ESCWhlTq'
   */
  rtb_Product1 = (rtb_TmpSignalConversionAtPwrL_p -
                  ESCWhlTq_ARID_DEF.Delay_DSTATE[1]) *
    rtb_TmpSignalConversionAtPwrL_i + ESCWhlTq_ARID_DEF.Delay_DSTATE[1];

  /* SignalConversion generated from: '<S1>/CrCtl_stCrCtl' incorporates:
   *  Inport: '<Root>/CrCtl_stCrCtl'
   */
  (void)Rte_Read_CrCtl_stCrCtl_Value(&rtb_TmpSignalConversionAtCrCtl_);

  /* Logic: '<S7>/OR' incorporates:
   *  Constant: '<S7>/Constant14'
   *  Constant: '<S7>/Constant3'
   *  RelationalOperator: '<S7>/Relational Operator1'
   *  RelationalOperator: '<S7>/Relational Operator9'
   *
   * Block description for '<S7>/Constant14':
   *  [2]
   *
   * Block description for '<S7>/Constant3':
   *  [3]
   */
  rtb_TmpSignalConversionAtice_by = ((rtb_TmpSignalConversionAtCrCtl_ == ((uint8)
    2U)) || (rtb_TmpSignalConversionAtCrCtl_ == ((uint8)3U)));

  /* Logic: '<S19>/Logical_Operator4' incorporates:
   *  Logic: '<S17>/Logical Operator'
   *  Logic: '<S17>/Logical Operator1'
   *  Logic: '<S19>/Logical Operator1'
   *  Logic: '<S19>/Logical_Operator5'
   *  Logic: '<S7>/AND2'
   *  UnitDelay: '<S17>/Unit Delay2'
   *  UnitDelay: '<S19>/Unit Delay'
   *  UnitDelay: '<S7>/Unit Delay'
   */
  rtb_AND9_j = ((rtb_TmpSignalConversionAtBrkPed ||
                 (!ESCWhlTq_ARID_DEF.UnitDelay2_DSTATE)) &&
                ((ESCWhlTq_ARID_DEF.UnitDelay_DSTATE_a &&
                  rtb_TmpSignalConversionAtBrkPed) ||
                 ESCWhlTq_ARID_DEF.UnitDelay_DSTATE_f));

  /* Logic: '<S7>/OR3' incorporates:
   *  Constant: '<S7>/icbms_undefined1'
   *  Constant: '<S7>/icbms_undefined2'
   *  Constant: '<S7>/icbms_undefined3'
   *  Logic: '<S7>/OR7'
   *  RelationalOperator: '<S7>/Equal4'
   *  RelationalOperator: '<S7>/Equal5'
   *  RelationalOperator: '<S7>/Equal6'
   *
   * Block description for '<S7>/icbms_undefined1':
   *  [3]
   *
   * Block description for '<S7>/icbms_undefined2':
   *  [5]
   *
   * Block description for '<S7>/icbms_undefined3':
   *  [4]
   */
  rtb_OR3_g = ((rtb_TmpSignalConversionAtHvCoor == ((uint8)3U)) ||
               (rtb_TmpSignalConversionAtHvCoor == ((uint8)4U)) ||
               (rtb_TmpSignalConversionAtHvCoor == ((uint8)5U)));

  /* Logic: '<S20>/Logical_Operator4' incorporates:
   *  Constant: '<S7>/Calibration3'
   *  Constant: '<S7>/Constant5'
   *  Constant: '<S7>/uint1'
   *  Constant: '<S7>/uint2'
   *  Constant: '<S7>/uint3'
   *  Logic: '<S20>/Logical_Operator5'
   *  Logic: '<S7>/AND1'
   *  Logic: '<S7>/Not3'
   *  Logic: '<S7>/OR5'
   *  RelationalOperator: '<S7>/Equal10'
   *  RelationalOperator: '<S7>/Equal2'
   *  RelationalOperator: '<S7>/Equal3'
   *  RelationalOperator: '<S7>/Relational Operator2'
   *  UnitDelay: '<S20>/Unit Delay'
   *  UnitDelay: '<S7>/Unit Delay1'
   *
   * Block description for '<S7>/Calibration3':
   *  [7]
   *
   * Block description for '<S7>/Constant5':
   *  [1]
   *
   * Block description for '<S7>/uint1':
   *  [5]
   *
   * Block description for '<S7>/uint2':
   *  [1]
   *
   * Block description for '<S7>/uint3':
   *  [4]
   */
  rtb_TmpSignalConversionAtParkCt = (rtb_TmpSignalConversionAtBrkPed &&
    ((ESCWhlTq_bBrkN2DInhbRBSEna_C && (ESCWhlTq_ARID_DEF.UnitDelay1_DSTATE_h ==
    ((uint8)4U)) && ((rtb_TmpSignalConversionAtGearLv == ((uint8)1U)) ||
                     (rtb_TmpSignalConversionAtGearLv == ((uint8)5U))) &&
      (tmpRead_3 >= ESCWhlTq_vVehSpdThd4N2DRBSDisb_C) &&
      rtb_TmpSignalConversionAtBrkPed) || ESCWhlTq_ARID_DEF.UnitDelay_DSTATE_c));

  /* Logic: '<S7>/OR6' incorporates:
   *  Constant: '<S7>/Constant4'
   *  Logic: '<S7>/OR1'
   *  Logic: '<S7>/OR4'
   *
   * Block description for '<S7>/Constant4':
   *  [1]
   */
  rtb_OR6 = (((rtb_TmpSignalConversionAtice_by || rtb_AND9_j) &&
              ESCWhlTq_bCCInhbRBSEna_C) || rtb_TmpSignalConversionAtParkCt);

  /* Switch: '<S7>/Switch1' incorporates:
   *  Logic: '<S7>/Not1'
   *  Logic: '<S7>/OR2'
   */
  if (rtb_OR3_g || (!tmpRead_1) || rtb_OR6) {
    /* Switch: '<S7>/Switch1' incorporates:
     *  Constant: '<S7>/single3'
     */
    ESCWhlTq_tqFrntBrkRegenMax = 0.0F;
  } else {
    /* Switch: '<S7>/Switch1' */
    ESCWhlTq_tqFrntBrkRegenMax = rtb_TmpSignalConversionAtices_k;
  }

  /* End of Switch: '<S7>/Switch1' */

  /* Switch: '<S7>/Switch2' incorporates:
   *  Logic: '<S7>/Not2'
   *  Logic: '<S7>/OR3'
   */
  if (rtb_OR3_g || (!tmpRead_2) || rtb_OR6) {
    /* Switch: '<S7>/Switch2' incorporates:
     *  Constant: '<S7>/single4'
     */
    ESCWhlTq_tqReBrkRegenMax = 0.0F;
  } else {
    /* Switch: '<S7>/Switch2' incorporates:
     *  Constant: '<S7>/single6'
     *  MinMax: '<S7>/Min'
     */
    ESCWhlTq_tqReBrkRegenMax = fminf(rtb_Product1, 0.0F);
  }

  /* End of Switch: '<S7>/Switch2' */

  /* Outport: '<Root>/ESCWhlTq_tqTarFrntAxle' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion'
   */
  (void)Rte_Write_ESCWhlTq_tqTarFrntAxle_Value(ESCWhlTq_tqTarFrntAxle);

  /* Outport: '<Root>/ESCWhlTq_bFrntAxleTqIntvActv' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion1'
   */
  (void)Rte_Write_ESCWhlTq_bFrntAxleTqIntvActv_Value
    (ESCWhlTq_bFrntAxleTqIntvActv);

  /* Outport: '<Root>/ESCWhlTq_tqFrntBrkRegenMax' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion10'
   */
  (void)Rte_Write_ESCWhlTq_tqFrntBrkRegenMax_Value(ESCWhlTq_tqFrntBrkRegenMax);

  /* Outport: '<Root>/ESCWhlTq_tqReBrkRegenMax' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion11'
   */
  (void)Rte_Write_ESCWhlTq_tqReBrkRegenMax_Value(ESCWhlTq_tqReBrkRegenMax);

  /* Outport: '<Root>/ESCWhlTq_tqTarReAxle' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion2'
   */
  (void)Rte_Write_ESCWhlTq_tqTarReAxle_Value(ESCWhlTq_tqTarReAxle);

  /* Outport: '<Root>/ESCWhlTq_bReAxleTqIntvActv' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion3'
   */
  (void)Rte_Write_ESCWhlTq_bReAxleTqIntvActv_Value(ESCWhlTq_bReAxleTqIntvActv);

  /* Outport: '<Root>/ESCWhlTq_bFrntAxleOnlyRBSActv' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion4'
   */
  (void)Rte_Write_ESCWhlTq_bFrntAxleOnlyRBSActv_Value
    (ESCWhlTq_bFrntAxleOnlyRBSActv);

  /* Outport: '<Root>/ESCWhlTq_bReAxleOnlyRBSActv' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion5'
   */
  (void)Rte_Write_ESCWhlTq_bReAxleOnlyRBSActv_Value(ESCWhlTq_bReAxleOnlyRBSActv);

  /* Outport: '<Root>/ESCWhlTq_tqTarCstRgnFrntAxle' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion6'
   */
  (void)Rte_Write_ESCWhlTq_tqTarCstRgnFrntAxle_Value
    (ESCWhlTq_tqTarCstRgnFrntAxle);

  /* Outport: '<Root>/ESCWhlTq_tqTarCstRgnReAxle' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion7'
   */
  (void)Rte_Write_ESCWhlTq_tqTarCstRgnReAxle_Value(ESCWhlTq_tqTarCstRgnReAxle);

  /* Outport: '<Root>/ESCWhlTq_bFrntAxleTqDecActv' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion8'
   */
  (void)Rte_Write_ESCWhlTq_bFrntAxleTqDecActv_Value(ESCWhlTq_bFrntAxleTqDecActv);

  /* Outport: '<Root>/ESCWhlTq_bReAxleTqDecActv' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion9'
   */
  (void)Rte_Write_ESCWhlTq_bReAxleTqDecActv_Value(ESCWhlTq_bReAxleTqDecActv);

  /* Constant: '<S1>/uint32' */
  ESCWhlTq_Version = 10010306U;

  /* Update for UnitDelay: '<S5>/Unit Delay' */
  ESCWhlTq_ARID_DEF.UnitDelay_DSTATE = rtb_Switch5;

  /* Update for UnitDelay: '<S5>/Unit Delay1' incorporates:
   *  Sum: '<S6>/Add2'
   */
  ESCWhlTq_ARID_DEF.UnitDelay1_DSTATE = rtb_TmpSignalConversionAtTqSp_h -
    rtb_TmpSignalConversionAtPwrL_d;

  /* Update for UnitDelay: '<S6>/Unit Delay' */
  ESCWhlTq_ARID_DEF.UnitDelay_DSTATE_d = rtb_TmpSignalConversionAtPwrLim;

  /* Update for UnitDelay: '<S7>/Unit Delay1' */
  ESCWhlTq_ARID_DEF.UnitDelay1_DSTATE_h = rtb_TmpSignalConversionAtGearLv;

  /* Update for UnitDelay: '<S7>/Unit Delay' */
  ESCWhlTq_ARID_DEF.UnitDelay_DSTATE_a = rtb_TmpSignalConversionAtice_by;

  /* Update for UnitDelay: '<S17>/Unit Delay2' */
  ESCWhlTq_ARID_DEF.UnitDelay2_DSTATE = rtb_TmpSignalConversionAtBrkPed;

  /* Update for Delay: '<S18>/Delay' */
  ESCWhlTq_ARID_DEF.icLoad = false;
  ESCWhlTq_ARID_DEF.Delay_DSTATE[0] = rtb_TmpSignalConversionAtices_f;
  ESCWhlTq_ARID_DEF.Delay_DSTATE[1] = rtb_Product1;

  /* Update for UnitDelay: '<S19>/Unit Delay' */
  ESCWhlTq_ARID_DEF.UnitDelay_DSTATE_f = rtb_AND9_j;

  /* Update for UnitDelay: '<S20>/Unit Delay' */
  ESCWhlTq_ARID_DEF.UnitDelay_DSTATE_c = rtb_TmpSignalConversionAtParkCt;

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' */
}

/* Model initialize function */
void ESCWhlTq_Init(void)
{
  /* SystemInitialize for RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' incorporates:
   *  SubSystem: '<Root>/ESCWhlTq'
   */
  /* InitializeConditions for Delay: '<S18>/Delay' */
  ESCWhlTq_ARID_DEF.icLoad = true;

  /* End of SystemInitialize for RootInportFunctionCallGenerator generated from: '<Root>/fc_ESCWhlTq' */
}

/*
 * File trailer for generated code.
 *
 * [EOF]
 */
