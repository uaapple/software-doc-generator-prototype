/*
 * File: PwrLimBatt.c
 *
 * Code generated for Simulink model 'PwrLimBatt'.
 *
 * Model version                  : 4.117
 * Simulink Coder version         : 9.8 (R2022b) 13-May-2022
 * C/C++ source code generated on : Tue Mar 10 14:40:57 2026
 *
 * Target selection: autosar.tlc
 * Embedded hardware selection: Infineon->TriCore
 * Code generation objectives: Unspecified
 * Validation result: Not run
 */

#include "PwrLimBatt.h"
#include <math.h>
#include "rtwtypes.h"
#include "PwrLimBatt_calibration.h"
#include "VehCfg_calibration.h"

/* Invariant block signals (default storage) */
const ConstB_PwrLimBatt_T PwrLimBatt_ConstB = {
  0.01F,                               /* '<S15>/Max' */
  0.01F,                               /* '<S16>/Max' */
  0.01F,                               /* '<S25>/Max' */
  0.01F,                               /* '<S26>/Max' */
  0.01F,                               /* '<S29>/Max' */
  0.01F,                               /* '<S38>/Max' */
  0.01F                                /* '<S39>/Max' */
};

/* Constant parameters (default storage) */
const ConstP_PwrLimBatt_T PwrLimBatt_ConstP = {
  /* Pooled Parameter (Expression: )
   * Referenced by:
   *   '<S9>/2-D Lookup Table1'
   *   '<S9>/2-D Lookup Table10'
   *   '<S9>/2-D Lookup Table2'
   *   '<S9>/2-D Lookup Table3'
   *   '<S9>/2-D Lookup Table4'
   *   '<S9>/2-D Lookup Table5'
   *   '<S9>/2-D Lookup Table6'
   *   '<S9>/2-D Lookup Table7'
   *   '<S9>/2-D Lookup Table8'
   *   '<S9>/2-D Lookup Table9'
   */
  { 7U, 4U },

  /* Pooled Parameter (Expression: )
   * Referenced by:
   *   '<S4>/2-D Lookup Table1'
   *   '<S4>/2-D Lookup Table2'
   */
  { 14U, 12U },

  /* Pooled Parameter (Expression: )
   * Referenced by:
   *   '<S4>/2-D Lookup Table3'
   *   '<S4>/2-D Lookup Table4'
   */
  { 13U, 11U }
};

/* PublicStructure Variables for Internal Data */
ARID_DEF_PwrLimBatt_T PwrLimBatt_ARID_DEF;/* '<S9>/Unit Delay' */
static float32 look1_iflf_binlca(float32 u0, const float32 bp0[], const float32
  table[], uint32 maxIndex);
static float32 look2_iflf_binlca(float32 u0, float32 u1, const float32 bp0[],
  const float32 bp1[], const float32 table[], const uint32 maxIndex[], uint32
  stride);
static uint32 plook_u32ff_binca(float32 u, const float32 bp[], uint32 maxIndex,
  float32 *fraction);
static float32 intrp2d_fu32fla(const uint32 bpIndex[], const float32 frac[],
  const float32 table[], const uint32 stride, const uint32 maxIndex[]);
static uint32 binsearch_u32f(float32 u, const float32 bp[], uint32 startIndex,
  uint32 maxIndex);
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

static float32 look2_iflf_binlca(float32 u0, float32 u1, const float32 bp0[],
  const float32 bp1[], const float32 table[], const uint32 maxIndex[], uint32
  stride)
{
  float32 fractions[2];
  float32 frac;
  float32 y;
  float32 yL_0d0;
  uint32 bpIndices[2];
  uint32 bpIdx;
  uint32 iLeft;
  uint32 iRght;

  /* Column-major Lookup 2-D
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
  } else if (u0 < bp0[maxIndex[0U]]) {
    /* Binary Search */
    bpIdx = maxIndex[0U] >> 1U;
    iLeft = 0U;
    iRght = maxIndex[0U];
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
    iLeft = maxIndex[0U];
    frac = 0.0F;
  }

  fractions[0U] = frac;
  bpIndices[0U] = iLeft;

  /* Prelookup - Index and Fraction
     Index Search method: 'binary'
     Extrapolation method: 'Clip'
     Use previous index: 'off'
     Use last breakpoint for index at or above upper limit: 'on'
     Remove protection against out-of-range input in generated code: 'off'
   */
  if (u1 <= bp1[0U]) {
    iLeft = 0U;
    frac = 0.0F;
  } else if (u1 < bp1[maxIndex[1U]]) {
    /* Binary Search */
    bpIdx = maxIndex[1U] >> 1U;
    iLeft = 0U;
    iRght = maxIndex[1U];
    while (iRght - iLeft > 1U) {
      if (u1 < bp1[bpIdx]) {
        iRght = bpIdx;
      } else {
        iLeft = bpIdx;
      }

      bpIdx = (iRght + iLeft) >> 1U;
    }

    frac = (u1 - bp1[iLeft]) / (bp1[iLeft + 1U] - bp1[iLeft]);
  } else {
    iLeft = maxIndex[1U];
    frac = 0.0F;
  }

  /* Column-major Interpolation 2-D
     Interpolation method: 'Linear point-slope'
     Use last breakpoint for index at or above upper limit: 'on'
     Overflow mode: 'wrapping'
   */
  bpIdx = iLeft * stride + bpIndices[0U];
  if (bpIndices[0U] == maxIndex[0U]) {
    y = table[bpIdx];
  } else {
    yL_0d0 = table[bpIdx];
    y = (table[bpIdx + 1U] - yL_0d0) * fractions[0U] + yL_0d0;
  }

  if (iLeft == maxIndex[1U]) {
  } else {
    bpIdx += stride;
    if (bpIndices[0U] == maxIndex[0U]) {
      yL_0d0 = table[bpIdx];
    } else {
      yL_0d0 = table[bpIdx];
      yL_0d0 += (table[bpIdx + 1U] - yL_0d0) * fractions[0U];
    }

    y += (yL_0d0 - y) * frac;
  }

  return y;
}

static uint32 plook_u32ff_binca(float32 u, const float32 bp[], uint32 maxIndex,
  float32 *fraction)
{
  uint32 bpIndex;

  /* Prelookup - Index and Fraction
     Index Search method: 'binary'
     Extrapolation method: 'Clip'
     Use previous index: 'off'
     Use last breakpoint for index at or above upper limit: 'on'
     Remove protection against out-of-range input in generated code: 'off'
   */
  if (u <= bp[0U]) {
    bpIndex = 0U;
    *fraction = 0.0F;
  } else if (u < bp[maxIndex]) {
    bpIndex = binsearch_u32f(u, bp, maxIndex >> 1U, maxIndex);
    *fraction = (u - bp[bpIndex]) / (bp[bpIndex + 1U] - bp[bpIndex]);
  } else {
    bpIndex = maxIndex;
    *fraction = 0.0F;
  }

  return bpIndex;
}

static float32 intrp2d_fu32fla(const uint32 bpIndex[], const float32 frac[],
  const float32 table[], const uint32 stride, const uint32 maxIndex[])
{
  float32 y;
  float32 yL_0d0;
  uint32 offset_1d;

  /* Column-major Interpolation 2-D
     Interpolation method: 'Linear point-slope'
     Use last breakpoint for index at or above upper limit: 'on'
     Overflow mode: 'wrapping'
   */
  offset_1d = bpIndex[1U] * stride + bpIndex[0U];
  if (bpIndex[0U] == maxIndex[0U]) {
    y = table[offset_1d];
  } else {
    yL_0d0 = table[offset_1d];
    y = (table[offset_1d + 1U] - yL_0d0) * frac[0U] + yL_0d0;
  }

  if (bpIndex[1U] == maxIndex[1U]) {
  } else {
    offset_1d += stride;
    if (bpIndex[0U] == maxIndex[0U]) {
      yL_0d0 = table[offset_1d];
    } else {
      yL_0d0 = table[offset_1d];
      yL_0d0 += (table[offset_1d + 1U] - yL_0d0) * frac[0U];
    }

    y += (yL_0d0 - y) * frac[1U];
  }

  return y;
}

static uint32 binsearch_u32f(float32 u, const float32 bp[], uint32 startIndex,
  uint32 maxIndex)
{
  uint32 bpIdx;
  uint32 bpIndex;
  uint32 iRght;

  /* Binary Search */
  bpIdx = startIndex;
  bpIndex = 0U;
  iRght = maxIndex;
  while (iRght - bpIndex > 1U) {
    if (u < bp[bpIdx]) {
      iRght = bpIdx;
    } else {
      bpIndex = bpIdx;
    }

    bpIdx = (iRght + bpIndex) >> 1U;
  }

  return bpIndex;
}

/* Model step function for TID1 */
void fc_PwrLimBatt(void)               /* Explicit Task: fc_PwrLimBatt */
{
  sint32 rtb_DataTypeConversion_g;
  sint32 rtb_Switch_g;
  float32 fractions[2];
  float32 fractions_0[2];
  float32 fractions_1[2];
  float32 fractions_2[2];
  float32 rtb_Max3;
  float32 rtb_Sum1;
  float32 rtb_Switch3;
  float32 rtb_Switch3_h_idx_1;
  float32 rtb_TmpSignalConversionAtVehCfg;
  float32 rtb_TmpSignalConversionAticb_av;
  float32 rtb_TmpSignalConversionAticb_c0;
  float32 rtb_TmpSignalConversionAticb_h2;
  float32 rtb_TmpSignalConversionAticb_h3;
  float32 rtb_TmpSignalConversionAticb_o0;
  float32 rtb_TmpSignalConversionAticbcm_;
  float32 rtb_TmpSignalConversionAticbm_c;
  float32 rtb_TmpSignalConversionAticbm_d;
  float32 rtb_TmpSignalConversionAticbm_f;
  float32 rtb_TmpSignalConversionAticbm_o;
  float32 rtb_TmpSignalConversionAticbm_p;
  float32 rtb_TmpSignalConversionAticbms_;
  float32 rtb_uDLookupTable1_m_idx_0;
  float32 rtb_uDLookupTable2_g_idx_0;
  float32 rtb_uDLookupTable2_l_idx_0;
  float32 rtb_uDLookupTable4_k_idx_0;
  float32 rtb_uDLookupTable4_k_idx_1;
  uint32 bpIndices[2];
  uint32 bpIndices_0[2];
  uint32 bpIndices_1[2];
  uint32 bpIndices_2[2];
  uint8 rtb_TmpSignalConversionAtHvCoor;
  uint8 rtb_TmpSignalConversionAtHybCoo;
  uint8 rtb_TmpSignalConversionAtVehC_m;
  uint8 rtb_TmpSignalConversionAticbm_i;
  uint8 tmp_0;
  boolean rtb_AND1;
  boolean rtb_AND1_e;
  boolean rtb_AND2;
  boolean rtb_LogicalOperator9;
  boolean rtb_Logical_Operator4;
  boolean rtb_Logical_Operator4_a;
  boolean rtb_Logical_Operator4_c;
  boolean rtb_Logical_Operator4_ch;
  boolean rtb_Logical_Operator4_d;
  boolean rtb_Logical_Operator4_f;
  boolean rtb_Logical_Operator4_h;
  boolean rtb_Logical_Operator4_nb;
  boolean rtb_Logical_Operator4_p;
  boolean rtb_Logical_Operator4_pc;
  boolean rtb_RelationalOperator;
  boolean rtb_TmpSignalConversionAtved_bB;
  boolean tmpRead;
  boolean tmpRead_0;
  boolean tmpRead_1;
  boolean tmpRead_2;

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' incorporates:
   *  SubSystem: '<Root>/PwrLimBatt'
   */
  /* SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp' incorporates:
   *  Inport: '<Root>/icbms_pctHVBatSOCDisp'
   */
  (void)Rte_Read_icbms_pctHVBatSOCDisp_Value(&rtb_TmpSignalConversionAticbms_);

  /* SignalConversion generated from: '<S2>/icbms_tBatMin' incorporates:
   *  Inport: '<Root>/icbms_tMinBat'
   */
  (void)Rte_Read_icbms_tMinBat_Value(&rtb_TmpSignalConversionAticb_h3);

  /* SignalConversion generated from: '<S2>/icbms_tBatMax' incorporates:
   *  Inport: '<Root>/icbms_tMaxBat'
   */
  (void)Rte_Read_icbms_tMaxBat_Value(&rtb_TmpSignalConversionAticbm_c);

  /* Lookup_n-D: '<S4>/2-D Lookup Table4' incorporates:
   *  Constant: '<S4>/Constant7'
   *  Constant: '<S4>/Constant8'
   *  SignalConversion generated from: '<S4>/2-D Lookup Table1'
   *  Sum: '<S4>/Add'
   *  Sum: '<S4>/Subtract'
   *
   * Block description for '<S4>/Constant7':
   *  [3]
   *
   * Block description for '<S4>/Constant8':
   *  [2]
   */
  rtb_uDLookupTable4_k_idx_0 = rtb_TmpSignalConversionAticb_h3 -
    PwrLimBatt_tBatMinOfstCalcPwr_C;
  rtb_uDLookupTable4_k_idx_1 = rtb_TmpSignalConversionAticbm_c +
    PwrLimBatt_tBatMaxOfstCalcPwr_C;

  /* Lookup_n-D: '<S4>/2-D Lookup Table1' incorporates:
   *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
   */
  bpIndices[0U] = plook_u32ff_binca(rtb_TmpSignalConversionAticbms_, (const
    float32 *)&PwrLimBatt_pwrHvesDChrgPeak_AX[0], 14U, &rtb_Sum1);
  fractions[0U] = rtb_Sum1;
  bpIndices[1U] = plook_u32ff_binca(rtb_uDLookupTable4_k_idx_0, (const float32 *)
    &PwrLimBatt_pwrHvesDChrgPeak_AY[0], 12U, &rtb_Sum1);
  fractions[1U] = rtb_Sum1;
  rtb_uDLookupTable1_m_idx_0 = intrp2d_fu32fla(bpIndices, fractions, (const
    float32 *)&PwrLimBatt_pwrHvesDChrgPeak_M[0], 15U, PwrLimBatt_ConstP.pooled15);
  bpIndices[1U] = plook_u32ff_binca(rtb_uDLookupTable4_k_idx_1, (const float32 *)
    &PwrLimBatt_pwrHvesDChrgPeak_AY[0], 12U, &rtb_Sum1);
  fractions[1U] = rtb_Sum1;

  /* Lookup_n-D: '<S4>/2-D Lookup Table2' incorporates:
   *  Lookup_n-D: '<S5>/1-D Lookup Table2'
   *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
   */
  bpIndices_0[0U] = plook_u32ff_binca(rtb_TmpSignalConversionAticbms_, (const
    float32 *)&PwrLimBatt_pwrHvesDChrgContns_AX[0], 14U, &rtb_Sum1);
  fractions_0[0U] = rtb_Sum1;
  bpIndices_0[1U] = plook_u32ff_binca(rtb_uDLookupTable4_k_idx_0, (const float32
    *)&PwrLimBatt_pwrHvesDChrgContns_AY[0], 12U, &rtb_Sum1);
  fractions_0[1U] = rtb_Sum1;
  rtb_uDLookupTable2_g_idx_0 = intrp2d_fu32fla(bpIndices_0, fractions_0, (const
    float32 *)&PwrLimBatt_pwrHvesDChrgContns_M[0], 15U,
    PwrLimBatt_ConstP.pooled15);
  bpIndices_0[1U] = plook_u32ff_binca(rtb_uDLookupTable4_k_idx_1, (const float32
    *)&PwrLimBatt_pwrHvesDChrgContns_AY[0], 12U, &rtb_Sum1);
  fractions_0[1U] = rtb_Sum1;

  /* Lookup_n-D: '<S4>/2-D Lookup Table3' incorporates:
   *  Lookup_n-D: '<S7>/1-D Lookup Table2'
   *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
   */
  bpIndices_1[0U] = plook_u32ff_binca(rtb_TmpSignalConversionAticbms_, (const
    float32 *)&PwrLimBatt_pwrHvesChrgPeak_AX[0], 13U, &rtb_Sum1);
  fractions_1[0U] = rtb_Sum1;
  bpIndices_1[1U] = plook_u32ff_binca(rtb_uDLookupTable4_k_idx_0, (const float32
    *)&PwrLimBatt_pwrHvesChrgPeak_AY[0], 11U, &rtb_Sum1);
  fractions_1[1U] = rtb_Sum1;
  rtb_uDLookupTable2_l_idx_0 = intrp2d_fu32fla(bpIndices_1, fractions_1, (const
    float32 *)&PwrLimBatt_pwrHvesChrgPeak_M[0], 14U, PwrLimBatt_ConstP.pooled16);
  bpIndices_1[1U] = plook_u32ff_binca(rtb_uDLookupTable4_k_idx_1, (const float32
    *)&PwrLimBatt_pwrHvesChrgPeak_AY[0], 11U, &rtb_Sum1);
  fractions_1[1U] = rtb_Sum1;

  /* Lookup_n-D: '<S4>/2-D Lookup Table4' incorporates:
   *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
   */
  bpIndices_2[0U] = plook_u32ff_binca(rtb_TmpSignalConversionAticbms_, (const
    float32 *)&PwrLimBatt_pwrHvesChrgContns_AX[0], 13U, &rtb_Sum1);
  fractions_2[0U] = rtb_Sum1;
  bpIndices_2[1U] = plook_u32ff_binca(rtb_uDLookupTable4_k_idx_0, (const float32
    *)&PwrLimBatt_pwrHvesChrgContns_AY[0], 11U, &rtb_Sum1);
  fractions_2[1U] = rtb_Sum1;

  /* Lookup_n-D: '<S4>/2-D Lookup Table4' */
  rtb_uDLookupTable4_k_idx_0 = intrp2d_fu32fla(bpIndices_2, fractions_2, (const
    float32 *)&PwrLimBatt_pwrHvesChrgContns_M[0], 14U,
    PwrLimBatt_ConstP.pooled16);

  /* Lookup_n-D: '<S4>/2-D Lookup Table4' */
  bpIndices_2[1U] = plook_u32ff_binca(rtb_uDLookupTable4_k_idx_1, (const float32
    *)&PwrLimBatt_pwrHvesChrgContns_AY[0], 11U, &rtb_Sum1);
  fractions_2[1U] = rtb_Sum1;

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' */

  /* Inport: '<Root>/icbms_pwrChrgPeak' */
  (void)Rte_Read_icbms_pwrChrgPeak_Value(&rtb_Max3);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' incorporates:
   *  SubSystem: '<Root>/PwrLimBatt'
   */
  /* SignalConversion generated from: '<S2>/icbms_uBat' incorporates:
   *  Inport: '<Root>/icbms_uHVBat'
   */
  (void)Rte_Read_icbms_uHVBat_Value(&rtb_TmpSignalConversionAticb_av);

  /* SignalConversion generated from: '<S2>/icbms_pwrDChrgMax' incorporates:
   *  Inport: '<Root>/icbms_pwrDChrgMax'
   */
  (void)Rte_Read_icbms_pwrDChrgMax_Value(&rtb_TmpSignalConversionAticbm_d);

  /* SignalConversion generated from: '<S2>/icbms_pwrDChrgPeak' incorporates:
   *  Inport: '<Root>/icbms_pwrDChrgPeak'
   */
  (void)Rte_Read_icbms_pwrDChrgPeak_Value(&rtb_TmpSignalConversionAticb_o0);

  /* Switch: '<S4>/Switch8' incorporates:
   *  Constant: '<S4>/Constant4'
   *
   * Block description for '<S4>/Constant4':
   *  [1]
   */
  if (PwrLimBatt_bSel10sBatPwr_C) {
    /* Sum: '<S41>/Sum1' */
    rtb_Sum1 = rtb_TmpSignalConversionAticbm_d;
  } else {
    /* Sum: '<S41>/Sum1' */
    rtb_Sum1 = rtb_TmpSignalConversionAticb_o0;
  }

  /* End of Switch: '<S4>/Switch8' */

  /* Switch: '<S4>/Switch' incorporates:
   *  Constant: '<S2>/single'
   *  Constant: '<S4>/Constant'
   *
   * Block description for '<S4>/Constant':
   *  [1]
   */
  if (PwrLimBatt_bVoltModeChoose_C) {
    rtb_uDLookupTable4_k_idx_1 = 500.0F;
  } else {
    rtb_uDLookupTable4_k_idx_1 = rtb_TmpSignalConversionAticb_av;
  }

  /* Switch: '<S44>/Switch2' incorporates:
   *  Constant: '<S2>/single2'
   *  Lookup_n-D: '<S4>/2-D Lookup Table1'
   *  MinMax: '<S4>/Min'
   *  MinMax: '<S4>/Min1'
   *  Product: '<S4>/Product'
   *  Switch: '<S4>/Switch'
   */
  rtb_uDLookupTable1_m_idx_0 = fminf(fminf(rtb_Sum1, fminf
    (rtb_uDLookupTable1_m_idx_0, intrp2d_fu32fla(bpIndices, fractions, (const
    float32 *)&PwrLimBatt_pwrHvesDChrgPeak_M[0], 15U, PwrLimBatt_ConstP.pooled15))),
    rtb_uDLookupTable4_k_idx_1 * 100.0F);

  /* MinMax: '<S4>/Max' incorporates:
   *  Constant: '<S4>/single'
   */
  PwrLimBatt_pwrHvesDChrgPeakRaw = fmaxf(rtb_uDLookupTable1_m_idx_0, 0.0F);

  /* SignalConversion generated from: '<S2>/icbms_pwrDChrgContns' incorporates:
   *  Inport: '<Root>/icbms_pwrDChrgContns'
   */
  (void)Rte_Read_icbms_pwrDChrgContns_Value(&rtb_TmpSignalConversionAticb_c0);

  /* Switch: '<S4>/Switch1' incorporates:
   *  Constant: '<S2>/single1'
   *  Constant: '<S4>/Constant'
   *
   * Block description for '<S4>/Constant':
   *  [1]
   */
  if (PwrLimBatt_bVoltModeChoose_C) {
    rtb_uDLookupTable4_k_idx_1 = 500.0F;
  } else {
    rtb_uDLookupTable4_k_idx_1 = rtb_TmpSignalConversionAticb_av;
  }

  /* MinMax: '<S4>/Max1' incorporates:
   *  Constant: '<S2>/single3'
   *  Constant: '<S4>/single1'
   *  Lookup_n-D: '<S4>/2-D Lookup Table2'
   *  MinMax: '<S4>/Min2'
   *  MinMax: '<S4>/Min3'
   *  MinMax: '<S4>/Min4'
   *  Product: '<S4>/Product1'
   *  Switch: '<S4>/Switch1'
   */
  PwrLimBatt_pwrHvesDChrgContnsRaw = fmaxf(fminf(fminf
    (rtb_TmpSignalConversionAticb_c0, rtb_uDLookupTable1_m_idx_0), fminf(fminf
    (rtb_uDLookupTable2_g_idx_0, intrp2d_fu32fla(bpIndices_0, fractions_0, (
    const float32 *)&PwrLimBatt_pwrHvesDChrgContns_M[0], 15U,
    PwrLimBatt_ConstP.pooled15)), rtb_uDLookupTable4_k_idx_1 * 100.0F)), 0.0F);

  /* SignalConversion generated from: '<S2>/icbms_pwrChrgMax' incorporates:
   *  Inport: '<Root>/icbms_pwrChrgMax'
   */
  (void)Rte_Read_icbms_pwrChrgMax_Value(&rtb_TmpSignalConversionAticbm_o);

  /* Switch: '<S4>/Switch9' incorporates:
   *  Constant: '<S4>/Constant6'
   *
   * Block description for '<S4>/Constant6':
   *  [1]
   */
  if (PwrLimBatt_bSel10sBatPwr_C) {
    /* Switch: '<S9>/Switch7' */
    rtb_uDLookupTable2_g_idx_0 = rtb_TmpSignalConversionAticbm_o;
  } else {
    /* Switch: '<S9>/Switch7' */
    rtb_uDLookupTable2_g_idx_0 = rtb_Max3;
  }

  /* End of Switch: '<S4>/Switch9' */

  /* Switch: '<S4>/Switch2' incorporates:
   *  Constant: '<S2>/single4'
   *  Constant: '<S4>/Constant'
   *
   * Block description for '<S4>/Constant':
   *  [1]
   */
  if (PwrLimBatt_bVoltModeChoose_C) {
    rtb_uDLookupTable4_k_idx_1 = 500.0F;
  } else {
    rtb_uDLookupTable4_k_idx_1 = rtb_TmpSignalConversionAticb_av;
  }

  /* MinMax: '<S4>/Max3' incorporates:
   *  Abs: '<S4>/Abs2'
   *  Constant: '<S11>/single'
   *  Constant: '<S2>/single5'
   *  Lookup_n-D: '<S4>/2-D Lookup Table3'
   *  MinMax: '<S4>/Max2'
   *  Product: '<S11>/Product2'
   *  Product: '<S4>/Product2'
   *  Switch: '<S4>/Switch2'
   */
  rtb_Max3 = fmaxf(fmaxf(rtb_uDLookupTable2_g_idx_0, fabsf
    (rtb_uDLookupTable4_k_idx_1 * (-100.0F)) * (-1.0F)), fmaxf
                   (rtb_uDLookupTable2_l_idx_0, intrp2d_fu32fla(bpIndices_1,
    fractions_1, (const float32 *)&PwrLimBatt_pwrHvesChrgPeak_M[0], 14U,
    PwrLimBatt_ConstP.pooled16)));

  /* SignalConversion generated from: '<S2>/icbms_pwrChrgContns' incorporates:
   *  Inport: '<Root>/icbms_pwrChrgContns'
   */
  (void)Rte_Read_icbms_pwrChrgContns_Value(&rtb_TmpSignalConversionAticbm_f);

  /* MinMax: '<S4>/Min5' incorporates:
   *  Constant: '<S4>/single2'
   */
  PwrLimBatt_pwrHvesChrgPeakRaw = fminf(rtb_Max3, 0.0F);

  /* Switch: '<S4>/Switch3' incorporates:
   *  Constant: '<S2>/single6'
   *  Constant: '<S4>/Constant'
   *
   * Block description for '<S4>/Constant':
   *  [1]
   */
  if (PwrLimBatt_bVoltModeChoose_C) {
    rtb_TmpSignalConversionAticb_av = 500.0F;
  }

  /* MinMax: '<S4>/Min6' incorporates:
   *  Abs: '<S4>/Abs1'
   *  Constant: '<S12>/single'
   *  Constant: '<S2>/single7'
   *  Constant: '<S4>/single3'
   *  Lookup_n-D: '<S4>/2-D Lookup Table4'
   *  MinMax: '<S4>/Max4'
   *  MinMax: '<S4>/Max5'
   *  MinMax: '<S4>/Max6'
   *  Product: '<S12>/Product2'
   *  Product: '<S4>/Product3'
   *  Switch: '<S4>/Switch3'
   */
  PwrLimBatt_pwrHvesChrgContnsRaw = fminf(fmaxf(fmaxf
    (rtb_TmpSignalConversionAticbm_f, rtb_Max3), fmaxf(fabsf
    (rtb_TmpSignalConversionAticb_av * (-100.0F)) * (-1.0F), fmaxf
    (rtb_uDLookupTable4_k_idx_0, intrp2d_fu32fla(bpIndices_2, fractions_2, (
    const float32 *)&PwrLimBatt_pwrHvesChrgContns_M[0], 14U,
    PwrLimBatt_ConstP.pooled16)))), 0.0F);

  /* Switch: '<S4>/Switch4' incorporates:
   *  Constant: '<S4>/Constant5'
   *  Switch: '<S4>/Switch5'
   *  Switch: '<S4>/Switch6'
   *  Switch: '<S4>/Switch7'
   *
   * Block description for '<S4>/Constant5':
   *  [0]
   */
  if (PwrLimBatt_bUseBMSMaxPwr_C) {
    /* Switch: '<S4>/Switch4' */
    PwrLimBatt_pwrHvesDChrgPeak = rtb_Sum1;

    /* Switch: '<S4>/Switch5' */
    PwrLimBatt_pwrHvesDChrgContns = rtb_TmpSignalConversionAticb_c0;

    /* Switch: '<S4>/Switch6' */
    PwrLimBatt_pwrHvesChrgPeak = rtb_uDLookupTable2_g_idx_0;

    /* Switch: '<S4>/Switch7' */
    PwrLimBatt_pwrHvesChrgContns = rtb_TmpSignalConversionAticbm_f;
  } else {
    /* Switch: '<S4>/Switch4' */
    PwrLimBatt_pwrHvesDChrgPeak = PwrLimBatt_pwrHvesDChrgPeakRaw;

    /* Switch: '<S4>/Switch5' */
    PwrLimBatt_pwrHvesDChrgContns = PwrLimBatt_pwrHvesDChrgContnsRaw;

    /* Switch: '<S4>/Switch6' */
    PwrLimBatt_pwrHvesChrgPeak = PwrLimBatt_pwrHvesChrgPeakRaw;

    /* Switch: '<S4>/Switch7' */
    PwrLimBatt_pwrHvesChrgContns = PwrLimBatt_pwrHvesChrgContnsRaw;
  }

  /* End of Switch: '<S4>/Switch4' */

  /* SignalConversion generated from: '<S2>/VehCfg_pwrBatAct' incorporates:
   *  Inport: '<Root>/VehCfg_pwrBatAct'
   */
  (void)Rte_Read_VehCfg_pwrBatAct_Value(&rtb_TmpSignalConversionAtVehCfg);

  /* Lookup_n-D: '<S9>/1-D Lookup Table14' incorporates:
   *  Constant: '<S5>/single'
   *  MinMax: '<S5>/Max'
   *  Sum: '<S5>/Subtract'
   */
  rtb_uDLookupTable2_l_idx_0 = fmaxf(rtb_TmpSignalConversionAtVehCfg, 0.0F) -
    PwrLimBatt_pwrHvesDChrgContns;

  /* Lookup_n-D: '<S7>/1-D Lookup Table2' incorporates:
   *  SignalConversion generated from: '<S5>/1-D Lookup Table2'
   */
  rtb_uDLookupTable4_k_idx_0 = rtb_TmpSignalConversionAticbm_c;

  /* SignalConversion generated from: '<S2>/HvCoorn_stHVP' incorporates:
   *  Inport: '<Root>/HvCoorn_stHVP'
   */
  (void)Rte_Read_HvCoorn_stHVP_Value(&rtb_TmpSignalConversionAtHvCoor);

  /* Logic: '<S9>/Logical Operator9' incorporates:
   *  Constant: '<S5>/uint1'
   *  Constant: '<S5>/uint8'
   *  Logic: '<S5>/AND'
   *  RelationalOperator: '<S5>/UnEqual'
   *  RelationalOperator: '<S5>/UnEqual1'
   *
   * Block description for '<S5>/uint1':
   *  SystemReady
   *
   * Block description for '<S5>/uint8':
   *  SystemReadyWait
   */
  rtb_LogicalOperator9 = ((rtb_TmpSignalConversionAtHvCoor != ((uint8)89U)) &&
    (rtb_TmpSignalConversionAtHvCoor != ((uint8)90U)));

  /* Switch: '<S9>/Switch7' incorporates:
   *  Lookup_n-D: '<S5>/1-D Lookup Table2'
   *  MinMax: '<S5>/Min1'
   *  SignalConversion generated from: '<S5>/1-D Lookup Table2'
   */
  rtb_uDLookupTable2_g_idx_0 = fminf(look1_iflf_binlca
    (rtb_TmpSignalConversionAticb_h3, (const float32 *)
     &PwrLimBatt_tiBatPeakDChrgPwrMax_AX[0], (const float32 *)
     &PwrLimBatt_tiBatPeakDChrgPwrMax_T[0], 5U), look1_iflf_binlca
    (rtb_TmpSignalConversionAticbm_c, (const float32 *)
     &PwrLimBatt_tiBatPeakDChrgPwrMax_AX[0], (const float32 *)
     &PwrLimBatt_tiBatPeakDChrgPwrMax_T[0], 5U));

  /* Switch: '<S5>/Switch2' incorporates:
   *  Constant: '<S5>/single2'
   *  Constant: '<S5>/single3'
   *  Constant: '<S5>/single4'
   *  RelationalOperator: '<S5>/Greater'
   */
  if (rtb_uDLookupTable2_l_idx_0 > 0.0F) {
    rtb_uDLookupTable4_k_idx_1 = 0.01F;
  } else {
    rtb_uDLookupTable4_k_idx_1 = (-0.01F);
  }

  /* MinMax: '<S5>/Min' incorporates:
   *  Abs: '<S5>/Abs'
   *  Abs: '<S5>/Abs1'
   *  Constant: '<S5>/single1'
   *  Constant: '<S5>/single5'
   *  Constant: '<S5>/single6'
   *  Lookup_n-D: '<S5>/1-D Lookup Table1'
   *  MinMax: '<S5>/Max1'
   *  MinMax: '<S5>/Max3'
   *  Product: '<S5>/Divide'
   *  Product: '<S5>/Product'
   *  Sum: '<S5>/Subtract1'
   *  Sum: '<S5>/Subtract2'
   *  Sum: '<S5>/Subtract3'
   *  Switch: '<S5>/Switch2'
   *  UnitDelay: '<S5>/Unit Delay'
   */
  rtb_TmpSignalConversionAticbm_c = fminf(fmaxf(look1_iflf_binlca(fabsf
    (rtb_uDLookupTable2_l_idx_0) / fmaxf(fabsf(PwrLimBatt_pwrHvesDChrgPeak -
    PwrLimBatt_pwrHvesDChrgContns), 0.01F), (const float32 *)
    &PwrLimBatt_facPeakDChrgPwr_AX[0], (const float32 *)
    &PwrLimBatt_facPeakDChrgPwr_T[0], 5U) * rtb_uDLookupTable4_k_idx_1 +
    PwrLimBatt_ARID_DEF.UnitDelay_DSTATE, 0.0F), rtb_uDLookupTable2_g_idx_0 +
    0.1F);

  /* Switch: '<S15>/Switch' incorporates:
   *  Constant: '<S5>/single7'
   *  RelationalOperator: '<S5>/LowerOrEqual'
   */
  if (rtb_TmpSignalConversionAticbm_c <= 0.1F) {
    /* Sum: '<S15>/Subtract1' incorporates:
     *  Constant: '<S15>/single1'
     *  UnitDelay: '<S15>/Unit Delay'
     */
    if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o < 0) && (1 < MIN_int32_T
         - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o)) {
      /* Switch: '<S39>/Switch' */
      rtb_Switch_g = MIN_int32_T;
    } else if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o > 0) && (1 > MAX_int32_T
                - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o)) {
      /* Switch: '<S39>/Switch' */
      rtb_Switch_g = MAX_int32_T;
    } else {
      /* Switch: '<S39>/Switch' */
      rtb_Switch_g = PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o + 1;
    }

    /* End of Sum: '<S15>/Subtract1' */
  } else {
    /* Switch: '<S39>/Switch' incorporates:
     *  Constant: '<S15>/single2'
     */
    rtb_Switch_g = 0;
  }

  /* End of Switch: '<S15>/Switch' */

  /* Update for UnitDelay: '<S15>/Unit Delay' incorporates:
   *  Saturate: '<S15>/Saturation2'
   */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o = rtb_Switch_g;

  /* Product: '<S15>/Divide' incorporates:
   *  Constant: '<S5>/Constant1'
   *
   * Block description for '<S5>/Constant1':
   *  [0.5]
   */
  rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_tiBatDChrgPwrLimOff_C /
    PwrLimBatt_ConstB.Max;

  /* DataTypeConversion: '<S15>/DataTypeConversion' */
  rtb_uDLookupTable2_l_idx_0 = fabsf(rtb_uDLookupTable4_k_idx_1);
  if (rtb_uDLookupTable2_l_idx_0 < 8.388608E+6F) {
    if (rtb_uDLookupTable2_l_idx_0 >= 0.5F) {
      rtb_uDLookupTable4_k_idx_1 = floorf(rtb_uDLookupTable4_k_idx_1 + 0.5F);
    } else {
      rtb_uDLookupTable4_k_idx_1 = 0.0F;
    }
  }

  /* Logic: '<S14>/Logical_Operator4' incorporates:
   *  DataTypeConversion: '<S15>/DataTypeConversion'
   *  Logic: '<S14>/Logical Operator1'
   *  Logic: '<S14>/Logical_Operator5'
   *  RelationalOperator: '<S15>/Relational Operator1'
   *  RelationalOperator: '<S5>/GreaterOrEqual'
   *  Saturate: '<S15>/Saturation2'
   *  UnitDelay: '<S14>/Unit Delay'
   */
  rtb_Logical_Operator4 = ((rtb_Switch_g <= (sint32)rtb_uDLookupTable4_k_idx_1) &&
    ((rtb_TmpSignalConversionAticbm_c >= rtb_uDLookupTable2_g_idx_0) ||
     PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_n));

  /* Switch: '<S5>/Switch1' */
  if (rtb_Logical_Operator4) {
    /* Switch: '<S5>/Switch1' */
    rtb_TmpSignalConversionAticbm_f = PwrLimBatt_pwrHvesDChrgContns;
  } else {
    /* Switch: '<S5>/Switch1' */
    rtb_TmpSignalConversionAticbm_f = PwrLimBatt_pwrHvesDChrgPeak;
  }

  /* End of Switch: '<S5>/Switch1' */

  /* Delay: '<S13>/Delay' */
  if (PwrLimBatt_ARID_DEF.icLoad) {
    PwrLimBatt_ARID_DEF.Delay_DSTATE = rtb_TmpSignalConversionAticbm_f;
  }

  /* RelationalOperator: '<S16>/Relational Operator' incorporates:
   *  Constant: '<S16>/single4'
   *  UnitDelay: '<S16>/Unit Delay'
   */
  rtb_RelationalOperator = (PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_j > 0);

  /* Logic: '<S10>/AND1' incorporates:
   *  Logic: '<S16>/Logical Operator2'
   */
  rtb_AND1_e = (rtb_RelationalOperator || rtb_LogicalOperator9);

  /* Switch: '<S13>/Switch1' incorporates:
   *  Constant: '<S5>/TRUE'
   *  Switch: '<S13>/Switch3'
   *
   * Block description for '<S5>/TRUE':
   *  TRUE
   */
  if (rtb_AND1_e) {
    /* Switch: '<S13>/Switch1' */
    rtb_TmpSignalConversionAticb_av = rtb_TmpSignalConversionAticbm_f;
  } else {
    if (true) {
      /* Switch: '<S13>/Switch3' incorporates:
       *  Delay: '<S13>/Delay'
       */
      rtb_TmpSignalConversionAticb_av = PwrLimBatt_ARID_DEF.Delay_DSTATE;
    } else {
      /* Switch: '<S13>/Switch3' */
      rtb_TmpSignalConversionAticb_av = rtb_TmpSignalConversionAticbm_f;
    }

    /* Switch: '<S13>/Switch1' incorporates:
     *  Constant: '<S13>/Number1'
     *  Constant: '<S13>/Number2'
     *  Constant: '<S5>/Constant3'
     *  Constant: '<S5>/Constant4'
     *  Constant: '<S5>/TaskTime_s1'
     *  MinMax: '<S13>/MinMax1'
     *  MinMax: '<S13>/MinMax2'
     *  MinMax: '<S13>/MinMax3'
     *  MinMax: '<S13>/MinMax4'
     *  Product: '<S13>/Product'
     *  Product: '<S13>/Product1'
     *  Sum: '<S13>/Sum'
     *  Sum: '<S13>/Sum1'
     *
     * Block description for '<S5>/Constant3':
     *  [5000]
     *
     * Block description for '<S5>/Constant4':
     *  [-5000]
     */
    rtb_TmpSignalConversionAticb_av += fminf(fmaxf
      (PwrLimBatt_pwrGrdtBatDChrgInc_C * 0.01F, 0.0F), fmaxf(fminf
      (PwrLimBatt_pwrGrdtBatDChrgDec_C * 0.01F, 0.0F),
      rtb_TmpSignalConversionAticbm_f - rtb_TmpSignalConversionAticb_av));
  }

  /* End of Switch: '<S13>/Switch1' */

  /* Saturate: '<S5>/Saturation2' incorporates:
   *  Constant: '<S5>/Constant'
   *
   * Block description for '<S5>/Constant':
   *  [2]
   */
  if (VehCfg_stBatMaxPwrSel_C <= ((uint8)3U)) {
    tmp_0 = VehCfg_stBatMaxPwrSel_C;
  } else {
    tmp_0 = ((uint8)3U);
  }

  /* MultiPortSwitch: '<S5>/Multiport Switch' incorporates:
   *  Saturate: '<S5>/Saturation2'
   */
  switch (tmp_0) {
   case 0:
    /* MultiPortSwitch: '<S5>/Multiport Switch' incorporates:
     *  Constant: '<S5>/single8'
     */
    PwrLimBatt_pwrBatDChrgMax = 0.0F;
    break;

   case 1:
    /* MultiPortSwitch: '<S5>/Multiport Switch' */
    PwrLimBatt_pwrBatDChrgMax = PwrLimBatt_pwrHvesDChrgContns;
    break;

   case 2:
    /* MultiPortSwitch: '<S5>/Multiport Switch' */
    PwrLimBatt_pwrBatDChrgMax = PwrLimBatt_pwrHvesDChrgPeak;
    break;

   default:
    /* Switch: '<S13>/Switch2' incorporates:
     *  Constant: '<S5>/TRUE'
     *
     * Block description for '<S5>/TRUE':
     *  TRUE
     */
    if (true) {
      /* MultiPortSwitch: '<S5>/Multiport Switch' */
      PwrLimBatt_pwrBatDChrgMax = rtb_TmpSignalConversionAticb_av;
    } else {
      /* MultiPortSwitch: '<S5>/Multiport Switch' */
      PwrLimBatt_pwrBatDChrgMax = rtb_TmpSignalConversionAticbm_f;
    }

    /* End of Switch: '<S13>/Switch2' */
    break;
  }

  /* End of MultiPortSwitch: '<S5>/Multiport Switch' */

  /* Switch: '<S16>/Switch' incorporates:
   *  Switch: '<S16>/Switch1'
   */
  if (rtb_LogicalOperator9) {
    /* Product: '<S16>/Divide' incorporates:
     *  Constant: '<S5>/Constant2'
     *
     * Block description for '<S5>/Constant2':
     *  [1]
     */
    rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_tiBatPwrFiltRstDly_C /
      PwrLimBatt_ConstB.Max_p;

    /* DataTypeConversion: '<S16>/DataTypeConversion' */
    rtb_uDLookupTable2_l_idx_0 = fabsf(rtb_uDLookupTable4_k_idx_1);
    if (rtb_uDLookupTable2_l_idx_0 < 8.388608E+6F) {
      if (rtb_uDLookupTable2_l_idx_0 >= 0.5F) {
        /* Update for UnitDelay: '<S16>/Unit Delay' incorporates:
         *  Saturate: '<S16>/Saturation2'
         *  Switch: '<S39>/Switch'
         */
        PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_j = (sint32)floorf
          (rtb_uDLookupTable4_k_idx_1 + 0.5F);
      } else {
        /* Update for UnitDelay: '<S16>/Unit Delay' incorporates:
         *  Saturate: '<S16>/Saturation2'
         *  Switch: '<S39>/Switch'
         */
        PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_j = 0;
      }
    } else {
      /* Update for UnitDelay: '<S16>/Unit Delay' incorporates:
       *  Saturate: '<S16>/Saturation2'
       *  Switch: '<S39>/Switch'
       */
      PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_j = (sint32)
        rtb_uDLookupTable4_k_idx_1;
    }

    /* End of DataTypeConversion: '<S16>/DataTypeConversion' */
  } else if (rtb_RelationalOperator) {
    /* Update for UnitDelay: '<S16>/Unit Delay' incorporates:
     *  Constant: '<S16>/single5'
     *  Saturate: '<S16>/Saturation2'
     *  Sum: '<S16>/Subtract'
     *  Switch: '<S16>/Switch1'
     */
    PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_j -= 1;
  }

  /* End of Switch: '<S16>/Switch' */

  /* Logic: '<S9>/Logical Operator9' incorporates:
   *  Constant: '<S6>/uint1'
   *  Constant: '<S6>/uint8'
   *  Logic: '<S6>/OR'
   *  RelationalOperator: '<S6>/Equal1'
   *  RelationalOperator: '<S6>/Equal2'
   *
   * Block description for '<S6>/uint1':
   *  SystemReady
   *
   * Block description for '<S6>/uint8':
   *  SystemReadyWait
   */
  rtb_LogicalOperator9 = ((rtb_TmpSignalConversionAtHvCoor == ((uint8)89U)) ||
    (rtb_TmpSignalConversionAtHvCoor == ((uint8)90U)));

  /* Logic: '<S6>/AND1' incorporates:
   *  RelationalOperator: '<S6>/Greater2'
   */
  rtb_AND1 = (rtb_LogicalOperator9 && (rtb_TmpSignalConversionAtVehCfg >
    PwrLimBatt_pwrBatDChrgMax));

  /* Switch: '<S25>/Switch' incorporates:
   *  Lookup_n-D: '<S6>/1-D Lookup Table3'
   *  MultiPortSwitch: '<S5>/Multiport Switch'
   *  RelationalOperator: '<S6>/Greater1'
   *  Sum: '<S6>/Subtract4'
   */
  if (PwrLimBatt_pwrBatDChrgMax - rtb_TmpSignalConversionAtVehCfg >
      look1_iflf_binlca(PwrLimBatt_pwrBatDChrgMax, (const float32 *)
                        &PwrLimBatt_pwrOvDChrgRecv_AX[0], (const float32 *)
                        &PwrLimBatt_pwrOvDChrgRecv_T[0], 5U)) {
    /* Sum: '<S25>/Subtract1' incorporates:
     *  Constant: '<S25>/single1'
     *  UnitDelay: '<S25>/Unit Delay'
     */
    if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_d < 0) && (1 < MIN_int32_T
         - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_d)) {
      /* Switch: '<S39>/Switch' */
      rtb_Switch_g = MIN_int32_T;
    } else if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_d > 0) && (1 > MAX_int32_T
                - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_d)) {
      /* Switch: '<S39>/Switch' */
      rtb_Switch_g = MAX_int32_T;
    } else {
      /* Switch: '<S39>/Switch' */
      rtb_Switch_g = PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_d + 1;
    }

    /* End of Sum: '<S25>/Subtract1' */
  } else {
    /* Switch: '<S39>/Switch' incorporates:
     *  Constant: '<S25>/single2'
     */
    rtb_Switch_g = 0;
  }

  /* End of Switch: '<S25>/Switch' */

  /* Update for UnitDelay: '<S25>/Unit Delay' incorporates:
   *  Saturate: '<S25>/Saturation2'
   */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_d = rtb_Switch_g;

  /* Product: '<S25>/Divide' incorporates:
   *  Constant: '<S6>/Constant10'
   *
   * Block description for '<S6>/Constant10':
   *  [0.5]
   */
  rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_tiOvDChrgRecvTime_C /
    PwrLimBatt_ConstB.Max_g;

  /* DataTypeConversion: '<S25>/DataTypeConversion' */
  rtb_uDLookupTable2_l_idx_0 = fabsf(rtb_uDLookupTable4_k_idx_1);
  if (rtb_uDLookupTable2_l_idx_0 < 8.388608E+6F) {
    if (rtb_uDLookupTable2_l_idx_0 >= 0.5F) {
      rtb_uDLookupTable4_k_idx_1 = floorf(rtb_uDLookupTable4_k_idx_1 + 0.5F);
    } else {
      rtb_uDLookupTable4_k_idx_1 = 0.0F;
    }
  }

  /* Logic: '<S23>/Logical_Operator4' incorporates:
   *  DataTypeConversion: '<S25>/DataTypeConversion'
   *  Logic: '<S23>/Logical Operator1'
   *  Logic: '<S23>/Logical_Operator5'
   *  RelationalOperator: '<S25>/Relational Operator1'
   *  Saturate: '<S25>/Saturation2'
   *  UnitDelay: '<S23>/Unit Delay'
   */
  rtb_RelationalOperator = ((rtb_Switch_g <= (sint32)rtb_uDLookupTable4_k_idx_1)
    && (rtb_AND1 || PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_c));

  /* Logic: '<S22>/Logical Operator1' incorporates:
   *  Logic: '<S20>/Logical Operator1'
   *  Logic: '<S21>/Logical Operator1'
   *  UnitDelay: '<S6>/Unit Delay5'
   */
  rtb_Logical_Operator4_a = !PwrLimBatt_ARID_DEF.UnitDelay5_DSTATE_e;

  /* Logic: '<S22>/Logical_Operator4' incorporates:
   *  Logic: '<S22>/Logical Operator1'
   *  Logic: '<S22>/Logical_Operator5'
   *  UnitDelay: '<S22>/Unit Delay'
   */
  rtb_Logical_Operator4_c = (rtb_Logical_Operator4_a && (rtb_AND1 ||
    PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_e));

  /* MinMax: '<S6>/Max2' incorporates:
   *  Constant: '<S6>/single9'
   *  Sum: '<S6>/Subtract5'
   */
  rtb_uDLookupTable1_m_idx_0 = fmaxf(rtb_TmpSignalConversionAtVehCfg -
    PwrLimBatt_pwrBatDChrgMax, 0.0F);

  /* UnitDelay: '<S6>/Unit Delay6' */
  rtb_TmpSignalConversionAticbm_f = PwrLimBatt_pwrBatDChrgMaxOvDChrg;

  /* Sum: '<S6>/Subtract8' incorporates:
   *  Constant: '<S6>/Constant12'
   *  UnitDelay: '<S6>/Unit Delay6'
   *
   * Block description for '<S6>/Constant12':
   *  [100]
   */
  rtb_Max3 = PwrLimBatt_pwrBatDChrgMaxOvDChrg + PwrLimBatt_pwrOvDChrgIncRate_C;

  /* Logic: '<S18>/Logical Operator' incorporates:
   *  Logic: '<S6>/OR1'
   */
  rtb_Logical_Operator4_h = !rtb_RelationalOperator;

  /* Switch: '<S6>/Switch2' incorporates:
   *  Logic: '<S18>/Logical Operator'
   *  UnitDelay: '<S18>/Unit Delay2'
   */
  if (rtb_Logical_Operator4_h || PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_o) {
    /* Switch: '<S6>/Switch2' incorporates:
     *  UnitDelay: '<S6>/Unit Delay1'
     */
    rtb_TmpSignalConversionAticbm_f = PwrLimBatt_ARID_DEF.UnitDelay1_DSTATE;
  }

  /* End of Switch: '<S6>/Switch2' */

  /* Logic: '<S20>/Logical_Operator4' incorporates:
   *  Constant: '<S6>/Constant5'
   *  Logic: '<S20>/Logical_Operator5'
   *  RelationalOperator: '<S6>/Greater3'
   *  UnitDelay: '<S20>/Unit Delay'
   *
   * Block description for '<S6>/Constant5':
   *  [5000]
   */
  rtb_Logical_Operator4_p = (rtb_Logical_Operator4_a &&
    ((rtb_uDLookupTable1_m_idx_0 > PwrLimBatt_pwrOvDChrgHiThrd_C) ||
     PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_bp));

  /* Logic: '<S21>/Logical_Operator4' incorporates:
   *  Constant: '<S6>/Constant6'
   *  Logic: '<S21>/Logical_Operator5'
   *  RelationalOperator: '<S6>/Greater4'
   *  UnitDelay: '<S21>/Unit Delay'
   *
   * Block description for '<S6>/Constant6':
   *  [3000]
   */
  rtb_Logical_Operator4_a = (rtb_Logical_Operator4_a &&
    ((rtb_uDLookupTable1_m_idx_0 > PwrLimBatt_pwrOvDChrgMidThrd_C) ||
     PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_di));

  /* Switch: '<S6>/Switch7' */
  if (rtb_RelationalOperator) {
    /* Switch: '<S6>/Switch7' incorporates:
     *  UnitDelay: '<S6>/Unit Delay2'
     */
    rtb_Sum1 = PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE;
  } else {
    /* Switch: '<S6>/Switch7' incorporates:
     *  Constant: '<S6>/single11'
     */
    rtb_Sum1 = 0.0F;
  }

  /* End of Switch: '<S6>/Switch7' */

  /* Switch: '<S6>/Switch8' incorporates:
   *  Logic: '<S19>/Logical Operator'
   *  Logic: '<S19>/Logical Operator1'
   *  UnitDelay: '<S19>/Unit Delay2'
   */
  if (rtb_Logical_Operator4_c && (!PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_k)) {
    /* Switch: '<S6>/Switch9' incorporates:
     *  Constant: '<S6>/Constant7'
     *  Constant: '<S6>/single10'
     *  MinMax: '<S6>/Max4'
     *  Switch: '<S6>/Switch4'
     *  Switch: '<S6>/Switch5'
     *
     * Block description for '<S6>/Constant7':
     *  [8000]
     */
    if (rtb_Logical_Operator4_p) {
      rtb_uDLookupTable4_k_idx_1 = fmaxf(rtb_uDLookupTable1_m_idx_0,
        PwrLimBatt_pwrOvDChrgRedHi_C);
    } else if (rtb_Logical_Operator4_a) {
      /* Switch: '<S6>/Switch4' incorporates:
       *  Constant: '<S6>/Constant8'
       *
       * Block description for '<S6>/Constant8':
       *  [5000]
       */
      rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_pwrOvDChrgRedMid_C;
    } else if (rtb_AND1) {
      /* Switch: '<S6>/Switch5' incorporates:
       *  Constant: '<S6>/Constant9'
       *  Switch: '<S6>/Switch4'
       *
       * Block description for '<S6>/Constant9':
       *  [3000]
       */
      rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_pwrOvDChrgRedLo_C;
    } else {
      rtb_uDLookupTable4_k_idx_1 = 0.0F;
    }

    /* Switch: '<S6>/Switch8' incorporates:
     *  Sum: '<S6>/Subtract6'
     *  Switch: '<S6>/Switch9'
     */
    rtb_Sum1 += rtb_uDLookupTable4_k_idx_1;
  }

  /* End of Switch: '<S6>/Switch8' */

  /* Switch: '<S6>/Switch10' */
  if (rtb_RelationalOperator) {
    /* Switch: '<S6>/Switch10' incorporates:
     *  Constant: '<S6>/single12'
     *  MinMax: '<S6>/Max5'
     *  MinMax: '<S6>/Min2'
     *  Sum: '<S6>/Subtract7'
     */
    rtb_uDLookupTable1_m_idx_0 = fminf(fmaxf(rtb_TmpSignalConversionAticbm_f -
      rtb_Sum1, 0.0F), PwrLimBatt_pwrBatDChrgMax);
  } else {
    /* Switch: '<S6>/Switch10' */
    rtb_uDLookupTable1_m_idx_0 = PwrLimBatt_pwrBatDChrgMax;
  }

  /* End of Switch: '<S6>/Switch10' */

  /* Logic: '<S24>/Logical_Operator4' incorporates:
   *  Logic: '<S17>/Logical Operator'
   *  Logic: '<S24>/Logical Operator1'
   *  Logic: '<S24>/Logical_Operator5'
   *  Logic: '<S6>/OR1'
   *  RelationalOperator: '<S6>/GreaterOrEqual1'
   *  UnitDelay: '<S17>/Unit Delay2'
   *  UnitDelay: '<S24>/Unit Delay'
   */
  rtb_AND1 = (rtb_Logical_Operator4_h && (rtb_Max3 < rtb_uDLookupTable1_m_idx_0)
              && ((rtb_Logical_Operator4_h &&
                   PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_e) ||
                  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_e2));

  /* Switch: '<S6>/Switch1' */
  if (rtb_AND1) {
    /* Switch: '<S6>/Switch1' incorporates:
     *  MinMax: '<S6>/Min3'
     */
    PwrLimBatt_pwrBatDChrgMaxOvDChrg = fminf(rtb_Max3,
      rtb_uDLookupTable1_m_idx_0);
  } else {
    /* Switch: '<S6>/Switch1' */
    PwrLimBatt_pwrBatDChrgMaxOvDChrg = rtb_uDLookupTable1_m_idx_0;
  }

  /* End of Switch: '<S6>/Switch1' */

  /* Switch: '<S26>/Switch' */
  if (rtb_Logical_Operator4_c) {
    /* Sum: '<S26>/Subtract1' incorporates:
     *  Constant: '<S26>/single1'
     *  UnitDelay: '<S26>/Unit Delay'
     */
    if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_l < 0) && (1 < MIN_int32_T
         - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_l)) {
      /* DataTypeConversion: '<S39>/DataTypeConversion' */
      rtb_DataTypeConversion_g = MIN_int32_T;
    } else if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_l > 0) && (1 > MAX_int32_T
                - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_l)) {
      /* DataTypeConversion: '<S39>/DataTypeConversion' */
      rtb_DataTypeConversion_g = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S39>/DataTypeConversion' */
      rtb_DataTypeConversion_g = PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_l + 1;
    }

    /* End of Sum: '<S26>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S39>/DataTypeConversion' incorporates:
     *  Constant: '<S26>/single2'
     */
    rtb_DataTypeConversion_g = 0;
  }

  /* End of Switch: '<S26>/Switch' */

  /* Update for UnitDelay: '<S26>/Unit Delay' incorporates:
   *  Saturate: '<S26>/Saturation2'
   */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_l = rtb_DataTypeConversion_g;

  /* Product: '<S26>/Divide' incorporates:
   *  Constant: '<S6>/Constant11'
   *
   * Block description for '<S6>/Constant11':
   *  [0.1]
   */
  rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_tiOvDChrgDecInt_C /
    PwrLimBatt_ConstB.Max_b;

  /* DataTypeConversion: '<S26>/DataTypeConversion' */
  rtb_uDLookupTable2_l_idx_0 = fabsf(rtb_uDLookupTable4_k_idx_1);
  if (rtb_uDLookupTable2_l_idx_0 < 8.388608E+6F) {
    if (rtb_uDLookupTable2_l_idx_0 >= 0.5F) {
      rtb_uDLookupTable4_k_idx_1 = floorf(rtb_uDLookupTable4_k_idx_1 + 0.5F);
    } else {
      rtb_uDLookupTable4_k_idx_1 = 0.0F;
    }
  }

  /* Update for UnitDelay: '<S6>/Unit Delay5' incorporates:
   *  DataTypeConversion: '<S26>/DataTypeConversion'
   *  RelationalOperator: '<S26>/Relational Operator1'
   *  Saturate: '<S26>/Saturation2'
   */
  PwrLimBatt_ARID_DEF.UnitDelay5_DSTATE_e = (rtb_DataTypeConversion_g > (sint32)
    rtb_uDLookupTable4_k_idx_1);

  /* Lookup_n-D: '<S9>/1-D Lookup Table14' incorporates:
   *  Constant: '<S7>/single'
   *  MinMax: '<S7>/Min2'
   *  Sum: '<S7>/Subtract4'
   */
  rtb_uDLookupTable2_l_idx_0 = PwrLimBatt_pwrHvesChrgContns - fminf
    (rtb_TmpSignalConversionAtVehCfg, 0.0F);

  /* Switch: '<S9>/Switch7' incorporates:
   *  Lookup_n-D: '<S7>/1-D Lookup Table2'
   *  MinMax: '<S7>/Min1'
   *  SignalConversion generated from: '<S5>/1-D Lookup Table2'
   */
  rtb_uDLookupTable2_g_idx_0 = fminf(look1_iflf_binlca
    (rtb_TmpSignalConversionAticb_h3, (const float32 *)
     &PwrLimBatt_tiBatPeakChrgPwrMax_AX[0], (const float32 *)
     &PwrLimBatt_tiBatPeakChrgPwrMax_T[0], 5U), look1_iflf_binlca
    (rtb_uDLookupTable4_k_idx_0, (const float32 *)
     &PwrLimBatt_tiBatPeakChrgPwrMax_AX[0], (const float32 *)
     &PwrLimBatt_tiBatPeakChrgPwrMax_T[0], 5U));

  /* Switch: '<S7>/Switch4' incorporates:
   *  Constant: '<S7>/single2'
   *  Constant: '<S7>/single3'
   *  Constant: '<S7>/single4'
   *  RelationalOperator: '<S7>/Greater'
   */
  if (rtb_uDLookupTable2_l_idx_0 > 0.0F) {
    rtb_uDLookupTable4_k_idx_1 = 0.01F;
  } else {
    rtb_uDLookupTable4_k_idx_1 = (-0.01F);
  }

  /* MinMax: '<S7>/Min' incorporates:
   *  Abs: '<S7>/Abs'
   *  Abs: '<S7>/Abs1'
   *  Constant: '<S7>/single1'
   *  Constant: '<S7>/single5'
   *  Constant: '<S7>/single6'
   *  Lookup_n-D: '<S7>/1-D Lookup Table1'
   *  MinMax: '<S7>/Max1'
   *  MinMax: '<S7>/Max3'
   *  Product: '<S7>/Divide'
   *  Product: '<S7>/Product'
   *  Sum: '<S7>/Subtract2'
   *  Sum: '<S7>/Subtract3'
   *  Sum: '<S7>/Subtract5'
   *  Switch: '<S7>/Switch4'
   *  UnitDelay: '<S7>/Unit Delay'
   */
  rtb_Max3 = fminf(fmaxf(look1_iflf_binlca(fabsf(rtb_uDLookupTable2_l_idx_0) /
    fmaxf(fabsf(PwrLimBatt_pwrHvesChrgContns - PwrLimBatt_pwrHvesChrgPeak),
          0.01F), (const float32 *)&PwrLimBatt_facPeakChrgPwr_AX[0], (const
    float32 *)&PwrLimBatt_facPeakChrgPwr_T[0], 5U) * rtb_uDLookupTable4_k_idx_1
    + PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_a, 0.0F), rtb_uDLookupTable2_g_idx_0
                   + 0.1F);

  /* Switch: '<S29>/Switch' incorporates:
   *  Constant: '<S7>/single7'
   *  RelationalOperator: '<S7>/LowerOrEqual'
   */
  if (rtb_Max3 <= 0.1F) {
    /* Sum: '<S29>/Subtract1' incorporates:
     *  Constant: '<S29>/single1'
     *  UnitDelay: '<S29>/Unit Delay'
     */
    if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o0 < 0) && (1 < MIN_int32_T
         - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o0)) {
      /* DataTypeConversion: '<S39>/DataTypeConversion' */
      rtb_DataTypeConversion_g = MIN_int32_T;
    } else if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o0 > 0) && (1 > MAX_int32_T
                - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o0)) {
      /* DataTypeConversion: '<S39>/DataTypeConversion' */
      rtb_DataTypeConversion_g = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S39>/DataTypeConversion' */
      rtb_DataTypeConversion_g = PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o0 + 1;
    }

    /* End of Sum: '<S29>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S39>/DataTypeConversion' incorporates:
     *  Constant: '<S29>/single2'
     */
    rtb_DataTypeConversion_g = 0;
  }

  /* End of Switch: '<S29>/Switch' */

  /* Update for UnitDelay: '<S29>/Unit Delay' incorporates:
   *  Saturate: '<S29>/Saturation2'
   */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_o0 = rtb_DataTypeConversion_g;

  /* Product: '<S29>/Divide' incorporates:
   *  Constant: '<S7>/Constant1'
   *
   * Block description for '<S7>/Constant1':
   *  [0.5]
   */
  rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_tiBatChrgPwrLimOff_C /
    PwrLimBatt_ConstB.Max_k;

  /* DataTypeConversion: '<S29>/DataTypeConversion' */
  rtb_uDLookupTable2_l_idx_0 = fabsf(rtb_uDLookupTable4_k_idx_1);
  if (rtb_uDLookupTable2_l_idx_0 < 8.388608E+6F) {
    if (rtb_uDLookupTable2_l_idx_0 >= 0.5F) {
      rtb_uDLookupTable4_k_idx_1 = floorf(rtb_uDLookupTable4_k_idx_1 + 0.5F);
    } else {
      rtb_uDLookupTable4_k_idx_1 = 0.0F;
    }
  }

  /* Logic: '<S28>/Logical_Operator4' incorporates:
   *  DataTypeConversion: '<S29>/DataTypeConversion'
   *  Logic: '<S28>/Logical Operator1'
   *  Logic: '<S28>/Logical_Operator5'
   *  RelationalOperator: '<S29>/Relational Operator1'
   *  RelationalOperator: '<S7>/GreaterOrEqual'
   *  Saturate: '<S29>/Saturation2'
   *  UnitDelay: '<S28>/Unit Delay'
   */
  rtb_Logical_Operator4_h = ((rtb_DataTypeConversion_g <= (sint32)
    rtb_uDLookupTable4_k_idx_1) && ((rtb_Max3 >= rtb_uDLookupTable2_g_idx_0) ||
    PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_k));

  /* Switch: '<S7>/Switch2' */
  if (rtb_Logical_Operator4_h) {
    /* Switch: '<S7>/Switch2' */
    rtb_uDLookupTable4_k_idx_0 = PwrLimBatt_pwrHvesChrgContns;
  } else {
    /* Switch: '<S7>/Switch2' */
    rtb_uDLookupTable4_k_idx_0 = PwrLimBatt_pwrHvesChrgPeak;
  }

  /* End of Switch: '<S7>/Switch2' */

  /* Delay: '<S27>/Delay' */
  if (PwrLimBatt_ARID_DEF.icLoad_n) {
    PwrLimBatt_ARID_DEF.Delay_DSTATE_c = rtb_uDLookupTable4_k_idx_0;
  }

  /* Switch: '<S27>/Switch1' incorporates:
   *  Constant: '<S7>/TRUE'
   *  Switch: '<S27>/Switch3'
   *
   * Block description for '<S7>/TRUE':
   *  TRUE
   */
  if (rtb_AND1_e) {
    /* Switch: '<S27>/Switch1' */
    rtb_uDLookupTable1_m_idx_0 = rtb_uDLookupTable4_k_idx_0;
  } else {
    if (true) {
      /* Switch: '<S27>/Switch3' incorporates:
       *  Delay: '<S27>/Delay'
       */
      rtb_uDLookupTable1_m_idx_0 = PwrLimBatt_ARID_DEF.Delay_DSTATE_c;
    } else {
      /* Switch: '<S27>/Switch3' */
      rtb_uDLookupTable1_m_idx_0 = rtb_uDLookupTable4_k_idx_0;
    }

    /* Switch: '<S27>/Switch1' incorporates:
     *  Constant: '<S27>/Number1'
     *  Constant: '<S27>/Number2'
     *  Constant: '<S7>/Constant3'
     *  Constant: '<S7>/Constant4'
     *  Constant: '<S7>/TaskTime_s1'
     *  MinMax: '<S27>/MinMax1'
     *  MinMax: '<S27>/MinMax2'
     *  MinMax: '<S27>/MinMax3'
     *  MinMax: '<S27>/MinMax4'
     *  Product: '<S27>/Product'
     *  Product: '<S27>/Product1'
     *  Sum: '<S27>/Sum'
     *  Sum: '<S27>/Sum1'
     *
     * Block description for '<S7>/Constant3':
     *  [5000]
     *
     * Block description for '<S7>/Constant4':
     *  [-5000]
     */
    rtb_uDLookupTable1_m_idx_0 += fminf(fmaxf(PwrLimBatt_pwrGrdtBatChrgInc_C *
      0.01F, 0.0F), fmaxf(fminf(PwrLimBatt_pwrGrdtBatChrgDec_C * 0.01F, 0.0F),
                          rtb_uDLookupTable4_k_idx_0 -
                          rtb_uDLookupTable1_m_idx_0));
  }

  /* End of Switch: '<S27>/Switch1' */

  /* Saturate: '<S7>/Saturation2' incorporates:
   *  Constant: '<S7>/Constant'
   *
   * Block description for '<S7>/Constant':
   *  [2]
   */
  if (VehCfg_stBatMaxPwrSel_C <= ((uint8)3U)) {
    tmp_0 = VehCfg_stBatMaxPwrSel_C;
  } else {
    tmp_0 = ((uint8)3U);
  }

  /* MultiPortSwitch: '<S7>/Multiport Switch' incorporates:
   *  Saturate: '<S7>/Saturation2'
   */
  switch (tmp_0) {
   case 0:
    /* MultiPortSwitch: '<S7>/Multiport Switch' incorporates:
     *  Constant: '<S7>/single8'
     */
    PwrLimBatt_pwrBatChrgMax = 0.0F;
    break;

   case 1:
    /* MultiPortSwitch: '<S7>/Multiport Switch' */
    PwrLimBatt_pwrBatChrgMax = PwrLimBatt_pwrHvesChrgContns;
    break;

   case 2:
    /* MultiPortSwitch: '<S7>/Multiport Switch' */
    PwrLimBatt_pwrBatChrgMax = PwrLimBatt_pwrHvesChrgPeak;
    break;

   default:
    /* Switch: '<S27>/Switch2' incorporates:
     *  Constant: '<S7>/TRUE'
     *
     * Block description for '<S7>/TRUE':
     *  TRUE
     */
    if (true) {
      /* MultiPortSwitch: '<S7>/Multiport Switch' */
      PwrLimBatt_pwrBatChrgMax = rtb_uDLookupTable1_m_idx_0;
    } else {
      /* MultiPortSwitch: '<S7>/Multiport Switch' */
      PwrLimBatt_pwrBatChrgMax = rtb_uDLookupTable4_k_idx_0;
    }

    /* End of Switch: '<S27>/Switch2' */
    break;
  }

  /* End of MultiPortSwitch: '<S7>/Multiport Switch' */

  /* Logic: '<S8>/AND1' incorporates:
   *  RelationalOperator: '<S8>/Lower1'
   */
  rtb_AND1_e = (rtb_LogicalOperator9 && (rtb_TmpSignalConversionAtVehCfg <
    PwrLimBatt_pwrBatChrgMax));

  /* Switch: '<S38>/Switch' incorporates:
   *  Lookup_n-D: '<S8>/1-D Lookup Table3'
   *  MultiPortSwitch: '<S7>/Multiport Switch'
   *  RelationalOperator: '<S8>/Lower'
   *  Sum: '<S8>/Subtract4'
   */
  if (PwrLimBatt_pwrBatChrgMax - rtb_TmpSignalConversionAtVehCfg <
      look1_iflf_binlca(PwrLimBatt_pwrBatChrgMax, (const float32 *)
                        &PwrLimBatt_pwrOvChrgRecv_AX[0], (const float32 *)
                        &PwrLimBatt_pwrOvChrgRecv_T[0], 5U)) {
    /* Sum: '<S38>/Subtract1' incorporates:
     *  Constant: '<S38>/single1'
     *  UnitDelay: '<S38>/Unit Delay'
     */
    if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_b < 0) && (1 < MIN_int32_T
         - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_b)) {
      /* DataTypeConversion: '<S39>/DataTypeConversion' */
      rtb_DataTypeConversion_g = MIN_int32_T;
    } else if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_b > 0) && (1 > MAX_int32_T
                - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_b)) {
      /* DataTypeConversion: '<S39>/DataTypeConversion' */
      rtb_DataTypeConversion_g = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S39>/DataTypeConversion' */
      rtb_DataTypeConversion_g = PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_b + 1;
    }

    /* End of Sum: '<S38>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S39>/DataTypeConversion' incorporates:
     *  Constant: '<S38>/single2'
     */
    rtb_DataTypeConversion_g = 0;
  }

  /* End of Switch: '<S38>/Switch' */

  /* Product: '<S38>/Divide' incorporates:
   *  Constant: '<S8>/Constant10'
   *
   * Block description for '<S8>/Constant10':
   *  [0.5]
   */
  rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_tiOvChrgRecvTime_C /
    PwrLimBatt_ConstB.Max_pr;

  /* DataTypeConversion: '<S38>/DataTypeConversion' */
  rtb_uDLookupTable2_l_idx_0 = fabsf(rtb_uDLookupTable4_k_idx_1);
  if (rtb_uDLookupTable2_l_idx_0 < 8.388608E+6F) {
    if (rtb_uDLookupTable2_l_idx_0 >= 0.5F) {
      rtb_uDLookupTable4_k_idx_1 = floorf(rtb_uDLookupTable4_k_idx_1 + 0.5F);
    } else {
      rtb_uDLookupTable4_k_idx_1 = 0.0F;
    }
  }

  /* Logic: '<S36>/Logical_Operator4' incorporates:
   *  DataTypeConversion: '<S38>/DataTypeConversion'
   *  Logic: '<S36>/Logical Operator1'
   *  Logic: '<S36>/Logical_Operator5'
   *  RelationalOperator: '<S38>/Relational Operator1'
   *  Saturate: '<S38>/Saturation2'
   *  UnitDelay: '<S36>/Unit Delay'
   */
  rtb_Logical_Operator4_ch = ((rtb_DataTypeConversion_g <= (sint32)
    rtb_uDLookupTable4_k_idx_1) && (rtb_AND1_e ||
    PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_ah));

  /* Logic: '<S35>/Logical Operator1' incorporates:
   *  Logic: '<S33>/Logical Operator1'
   *  Logic: '<S34>/Logical Operator1'
   *  UnitDelay: '<S8>/Unit Delay6'
   */
  rtb_Logical_Operator4_d = !PwrLimBatt_ARID_DEF.UnitDelay6_DSTATE_m;

  /* Logic: '<S35>/Logical_Operator4' incorporates:
   *  Logic: '<S35>/Logical Operator1'
   *  Logic: '<S35>/Logical_Operator5'
   *  UnitDelay: '<S35>/Unit Delay'
   */
  rtb_Logical_Operator4_f = (rtb_Logical_Operator4_d && (rtb_AND1_e ||
    PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_ae));

  /* UnitDelay: '<S8>/Unit Delay7' */
  rtb_uDLookupTable4_k_idx_0 = PwrLimBatt_pwrBatChrgMaxOvChrg;

  /* Sum: '<S8>/Subtract8' incorporates:
   *  Constant: '<S8>/Constant12'
   *  UnitDelay: '<S8>/Unit Delay7'
   *
   * Block description for '<S8>/Constant12':
   *  [-100]
   */
  rtb_uDLookupTable2_l_idx_0 = PwrLimBatt_pwrBatChrgMaxOvChrg +
    PwrLimBatt_pwrOvChrgIncRate_C;

  /* Logic: '<S31>/Logical Operator' incorporates:
   *  Logic: '<S8>/OR1'
   */
  rtb_Logical_Operator4_nb = !rtb_Logical_Operator4_ch;

  /* Switch: '<S8>/Switch6' incorporates:
   *  Logic: '<S31>/Logical Operator'
   *  UnitDelay: '<S31>/Unit Delay2'
   */
  if (rtb_Logical_Operator4_nb || PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_n) {
    /* Switch: '<S8>/Switch6' incorporates:
     *  UnitDelay: '<S8>/Unit Delay4'
     */
    rtb_uDLookupTable4_k_idx_0 = PwrLimBatt_ARID_DEF.UnitDelay4_DSTATE;
  }

  /* End of Switch: '<S8>/Switch6' */

  /* MinMax: '<S8>/Min1' incorporates:
   *  Constant: '<S8>/single9'
   *  Sum: '<S8>/Subtract5'
   */
  rtb_uDLookupTable2_g_idx_0 = fminf(rtb_TmpSignalConversionAtVehCfg -
    PwrLimBatt_pwrBatChrgMax, 0.0F);

  /* Logic: '<S33>/Logical_Operator4' incorporates:
   *  Constant: '<S8>/Constant5'
   *  Logic: '<S33>/Logical_Operator5'
   *  RelationalOperator: '<S8>/Lower2'
   *  UnitDelay: '<S33>/Unit Delay'
   *
   * Block description for '<S8>/Constant5':
   *  [-5000]
   */
  rtb_Logical_Operator4_pc = (rtb_Logical_Operator4_d &&
    ((rtb_uDLookupTable2_g_idx_0 < PwrLimBatt_pwrOvChrgHiThrd_C) ||
     PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_hj));

  /* Logic: '<S34>/Logical_Operator4' incorporates:
   *  Constant: '<S8>/Constant6'
   *  Logic: '<S34>/Logical_Operator5'
   *  RelationalOperator: '<S8>/Lower3'
   *  UnitDelay: '<S34>/Unit Delay'
   *
   * Block description for '<S8>/Constant6':
   *  [-3000]
   */
  rtb_Logical_Operator4_d = (rtb_Logical_Operator4_d &&
    ((rtb_uDLookupTable2_g_idx_0 < PwrLimBatt_pwrOvChrgMidThrd_C) ||
     PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_do));

  /* Switch: '<S8>/Switch12' */
  if (rtb_Logical_Operator4_ch) {
    /* Switch: '<S8>/Switch12' incorporates:
     *  UnitDelay: '<S8>/Unit Delay5'
     */
    rtb_TmpSignalConversionAtVehCfg = PwrLimBatt_ARID_DEF.UnitDelay5_DSTATE;
  } else {
    /* Switch: '<S8>/Switch12' incorporates:
     *  Constant: '<S8>/single11'
     */
    rtb_TmpSignalConversionAtVehCfg = 0.0F;
  }

  /* End of Switch: '<S8>/Switch12' */

  /* Switch: '<S8>/Switch13' incorporates:
   *  Logic: '<S32>/Logical Operator'
   *  Logic: '<S32>/Logical Operator1'
   *  UnitDelay: '<S32>/Unit Delay2'
   */
  if (rtb_Logical_Operator4_f && (!PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_h)) {
    /* Switch: '<S8>/Switch14' incorporates:
     *  Constant: '<S8>/Constant7'
     *  Constant: '<S8>/single10'
     *  MinMax: '<S8>/Min4'
     *  Switch: '<S8>/Switch11'
     *  Switch: '<S8>/Switch9'
     *
     * Block description for '<S8>/Constant7':
     *  [-8000]
     */
    if (rtb_Logical_Operator4_pc) {
      rtb_uDLookupTable4_k_idx_1 = fminf(rtb_uDLookupTable2_g_idx_0,
        PwrLimBatt_pwrOvChrgRedHi_C);
    } else if (rtb_Logical_Operator4_d) {
      /* Switch: '<S8>/Switch9' incorporates:
       *  Constant: '<S8>/Constant8'
       *
       * Block description for '<S8>/Constant8':
       *  [-5000]
       */
      rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_pwrOvChrgRedMid_C;
    } else if (rtb_AND1_e) {
      /* Switch: '<S8>/Switch11' incorporates:
       *  Constant: '<S8>/Constant9'
       *  Switch: '<S8>/Switch9'
       *
       * Block description for '<S8>/Constant9':
       *  [-3000]
       */
      rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_pwrOvChrgRedLo_C;
    } else {
      rtb_uDLookupTable4_k_idx_1 = 0.0F;
    }

    /* Switch: '<S8>/Switch13' incorporates:
     *  Sum: '<S8>/Subtract6'
     *  Switch: '<S8>/Switch14'
     */
    rtb_TmpSignalConversionAtVehCfg += rtb_uDLookupTable4_k_idx_1;
  }

  /* End of Switch: '<S8>/Switch13' */

  /* Switch: '<S8>/Switch10' */
  if (rtb_Logical_Operator4_ch) {
    /* Switch: '<S8>/Switch10' incorporates:
     *  Constant: '<S8>/single12'
     *  MinMax: '<S8>/Max1'
     *  MinMax: '<S8>/Min5'
     *  Sum: '<S8>/Subtract7'
     */
    rtb_uDLookupTable2_g_idx_0 = fmaxf(fminf(rtb_uDLookupTable4_k_idx_0 -
      rtb_TmpSignalConversionAtVehCfg, 0.0F), PwrLimBatt_pwrBatChrgMax);
  } else {
    /* Switch: '<S8>/Switch10' */
    rtb_uDLookupTable2_g_idx_0 = PwrLimBatt_pwrBatChrgMax;
  }

  /* End of Switch: '<S8>/Switch10' */

  /* Logic: '<S37>/Logical_Operator4' incorporates:
   *  Logic: '<S30>/Logical Operator'
   *  Logic: '<S37>/Logical Operator1'
   *  Logic: '<S37>/Logical_Operator5'
   *  Logic: '<S8>/OR1'
   *  RelationalOperator: '<S8>/GreaterOrEqual1'
   *  UnitDelay: '<S30>/Unit Delay2'
   *  UnitDelay: '<S37>/Unit Delay'
   */
  rtb_Logical_Operator4_nb = (rtb_Logical_Operator4_nb &&
    (rtb_uDLookupTable2_l_idx_0 > rtb_uDLookupTable2_g_idx_0) &&
    ((rtb_Logical_Operator4_nb && PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_p) ||
     PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_ay));

  /* Switch: '<S8>/Switch3' */
  if (rtb_Logical_Operator4_nb) {
    /* Switch: '<S8>/Switch3' incorporates:
     *  MinMax: '<S8>/Max2'
     */
    PwrLimBatt_pwrBatChrgMaxOvChrg = fmaxf(rtb_uDLookupTable2_l_idx_0,
      rtb_uDLookupTable2_g_idx_0);
  } else {
    /* Switch: '<S8>/Switch3' */
    PwrLimBatt_pwrBatChrgMaxOvChrg = rtb_uDLookupTable2_g_idx_0;
  }

  /* End of Switch: '<S8>/Switch3' */

  /* Switch: '<S39>/Switch' */
  if (rtb_Logical_Operator4_f) {
    /* Sum: '<S39>/Subtract1' incorporates:
     *  Constant: '<S39>/single1'
     *  UnitDelay: '<S39>/Unit Delay'
     */
    if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_jr < 0) && (1 < MIN_int32_T
         - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_jr)) {
      /* Switch: '<S39>/Switch' */
      rtb_Switch_g = MIN_int32_T;
    } else if ((PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_jr > 0) && (1 > MAX_int32_T
                - PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_jr)) {
      /* Switch: '<S39>/Switch' */
      rtb_Switch_g = MAX_int32_T;
    } else {
      /* Switch: '<S39>/Switch' */
      rtb_Switch_g = PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_jr + 1;
    }

    /* End of Sum: '<S39>/Subtract1' */
  } else {
    /* Switch: '<S39>/Switch' incorporates:
     *  Constant: '<S39>/single2'
     */
    rtb_Switch_g = 0;
  }

  /* End of Switch: '<S39>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' */

  /* Inport: '<Root>/VehSpd_vVeh' */
  (void)Rte_Read_VehSpd_vVeh_Value(&rtb_Switch3);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' incorporates:
   *  SubSystem: '<Root>/PwrLimBatt'
   */
  /* SignalConversion generated from: '<S2>/icbms_uCellMin' incorporates:
   *  Inport: '<Root>/icbms_uMinCell'
   */
  (void)Rte_Read_icbms_uMinCell_Value(&rtb_TmpSignalConversionAticbm_p);

  /* Lookup_n-D: '<S9>/1-D Lookup Table14' incorporates:
   *  SignalConversion generated from: '<S2>/icbms_tBatMin'
   */
  rtb_uDLookupTable2_l_idx_0 = look1_iflf_binlca(rtb_TmpSignalConversionAticb_h3,
    (const float32 *)&PwrLimBatt_tBatMinBatOfstPwr_AX[0], (const float32 *)
    &PwrLimBatt_pwrBatOfstDChrg_T[0], 4U);

  /* SignalConversion generated from: '<S2>/icbms_uCellMax' incorporates:
   *  Inport: '<Root>/icbms_uMaxCell'
   */
  (void)Rte_Read_icbms_uMaxCell_Value(&rtb_TmpSignalConversionAticb_h2);

  /* SignalConversion generated from: '<S2>/icbcm_tAmbTemp' incorporates:
   *  Inport: '<Root>/icbcm_tAmbTemp'
   */
  (void)Rte_Read_icbcm_tAmbTemp_Value(&rtb_TmpSignalConversionAticbcm_);

  /* SignalConversion generated from: '<S2>/VehCfg_stBatPwrCfg' incorporates:
   *  Inport: '<Root>/VehCfg_stBatPwrCfg'
   */
  (void)Rte_Read_VehCfg_stBatPwrCfg_Value(&rtb_TmpSignalConversionAtVehC_m);

  /* SignalConversion generated from: '<S2>/HybCoorn_stMod' incorporates:
   *  Inport: '<Root>/HybCoorn_stMod'
   */
  (void)Rte_Read_HybCoorn_stMod_Value(&rtb_TmpSignalConversionAtHybCoo);

  /* Switch: '<S9>/Switch3' incorporates:
   *  Constant: '<S9>/Constant15'
   *  Constant: '<S9>/Constant9'
   *  Logic: '<S9>/OR1'
   *  RelationalOperator: '<S9>/Relational Operator1'
   *  RelationalOperator: '<S9>/Relational Operator11'
   *
   * Block description for '<S9>/Constant15':
   *  [3]
   *
   * Block description for '<S9>/Constant9':
   *  [2]
   */
  if ((rtb_TmpSignalConversionAtHybCoo == ((uint8)2U)) ||
      (rtb_TmpSignalConversionAtHybCoo == ((uint8)3U))) {
    /* MultiPortSwitch: '<S9>/Multiport Switch2' */
    switch (rtb_TmpSignalConversionAtVehC_m) {
     case 3:
      /* Switch: '<S9>/Switch3' incorporates:
       *  Lookup_n-D: '<S9>/2-D Lookup Table1'
       *  MultiPortSwitch: '<S9>/Multiport Switch2'
       *  SignalConversion generated from: '<S2>/icbcm_tAmbTemp'
       *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
       */
      PwrLimBatt_pwrBattDChrgLimBySoc = look2_iflf_binlca
        (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbcm_, (
          const float32 *)&PwrLimBatt_pctSOCBattPwrLimHvBat3_AX[0], (const
          float32 *)&PwrLimBatt_tBattMinPwrLimHvBat3_AY[0], (const float32 *)
         &PwrLimBatt_pwrSOCBattPwrLimHvBat3_M[0], PwrLimBatt_ConstP.pooled14, 8U);
      break;

     case 4:
      /* Switch: '<S9>/Switch3' incorporates:
       *  Lookup_n-D: '<S9>/2-D Lookup Table2'
       *  MultiPortSwitch: '<S9>/Multiport Switch2'
       *  SignalConversion generated from: '<S2>/icbcm_tAmbTemp'
       *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
       */
      PwrLimBatt_pwrBattDChrgLimBySoc = look2_iflf_binlca
        (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbcm_, (
          const float32 *)&PwrLimBatt_pctSOCBattPwrLimHvBat4_AX[0], (const
          float32 *)&PwrLimBatt_tBattMinPwrLimHvBat4_AY[0], (const float32 *)
         &PwrLimBatt_pwrSOCBattPwrLimHvBat4_M[0], PwrLimBatt_ConstP.pooled14, 8U);
      break;

     case 5:
      /* Switch: '<S9>/Switch3' incorporates:
       *  Lookup_n-D: '<S9>/2-D Lookup Table3'
       *  MultiPortSwitch: '<S9>/Multiport Switch2'
       *  SignalConversion generated from: '<S2>/icbcm_tAmbTemp'
       *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
       */
      PwrLimBatt_pwrBattDChrgLimBySoc = look2_iflf_binlca
        (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbcm_, (
          const float32 *)&PwrLimBatt_pctSOCBattPwrLimHvBat5_AX[0], (const
          float32 *)&PwrLimBatt_tBattMinPwrLimHvBat5_AY[0], (const float32 *)
         &PwrLimBatt_pwrSOCBattPwrLimHvBat5_M[0], PwrLimBatt_ConstP.pooled14, 8U);
      break;

     case 6:
      /* Switch: '<S9>/Switch3' incorporates:
       *  Lookup_n-D: '<S9>/2-D Lookup Table4'
       *  MultiPortSwitch: '<S9>/Multiport Switch2'
       *  SignalConversion generated from: '<S2>/icbcm_tAmbTemp'
       *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
       */
      PwrLimBatt_pwrBattDChrgLimBySoc = look2_iflf_binlca
        (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbcm_, (
          const float32 *)&PwrLimBatt_pctSOCBattPwrLimHvBat6_AX[0], (const
          float32 *)&PwrLimBatt_tBattMinPwrLimHvBat6_AY[0], (const float32 *)
         &PwrLimBatt_pwrSOCBattPwrLimHvBat6_M[0], PwrLimBatt_ConstP.pooled14, 8U);
      break;

     default:
      /* Switch: '<S9>/Switch3' incorporates:
       *  Lookup_n-D: '<S9>/2-D Lookup Table5'
       *  MultiPortSwitch: '<S9>/Multiport Switch2'
       *  SignalConversion generated from: '<S2>/icbcm_tAmbTemp'
       *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
       */
      PwrLimBatt_pwrBattDChrgLimBySoc = look2_iflf_binlca
        (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbcm_, (
          const float32 *)&PwrLimBatt_pctSOCBattPwrLimHvBat7_AX[0], (const
          float32 *)&PwrLimBatt_tBattMinPwrLimHvBat7_AY[0], (const float32 *)
         &PwrLimBatt_pwrSOCBattPwrLimHvBat7_M[0], PwrLimBatt_ConstP.pooled14, 8U);
      break;
    }

    /* End of MultiPortSwitch: '<S9>/Multiport Switch2' */
  } else {
    /* MultiPortSwitch: '<S9>/Multiport Switch1' */
    switch (rtb_TmpSignalConversionAtVehC_m) {
     case 3:
      /* Switch: '<S9>/Switch3' incorporates:
       *  Lookup_n-D: '<S9>/2-D Lookup Table6'
       *  MultiPortSwitch: '<S9>/Multiport Switch1'
       *  SignalConversion generated from: '<S2>/icbcm_tAmbTemp'
       *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
       */
      PwrLimBatt_pwrBattDChrgLimBySoc = look2_iflf_binlca
        (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbcm_, (
          const float32 *)&PwrLimBatt_pctSOCBattPwrLimEvBat3_AX[0], (const
          float32 *)&PwrLimBatt_tBattMinPwrLimEvBat3_AY[0], (const float32 *)
         &PwrLimBatt_pwrSOCBattPwrLimEvBat3_M[0], PwrLimBatt_ConstP.pooled14, 8U);
      break;

     case 4:
      /* Switch: '<S9>/Switch3' incorporates:
       *  Lookup_n-D: '<S9>/2-D Lookup Table8'
       *  MultiPortSwitch: '<S9>/Multiport Switch1'
       *  SignalConversion generated from: '<S2>/icbcm_tAmbTemp'
       *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
       */
      PwrLimBatt_pwrBattDChrgLimBySoc = look2_iflf_binlca
        (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbcm_, (
          const float32 *)&PwrLimBatt_pctSOCBattPwrLimEvBat4_AX[0], (const
          float32 *)&PwrLimBatt_tBattMinPwrLimEvBat4_AY[0], (const float32 *)
         &PwrLimBatt_pwrSOCBattPwrLimEvBat4_M[0], PwrLimBatt_ConstP.pooled14, 8U);
      break;

     case 5:
      /* Switch: '<S9>/Switch3' incorporates:
       *  Lookup_n-D: '<S9>/2-D Lookup Table9'
       *  MultiPortSwitch: '<S9>/Multiport Switch1'
       *  SignalConversion generated from: '<S2>/icbcm_tAmbTemp'
       *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
       */
      PwrLimBatt_pwrBattDChrgLimBySoc = look2_iflf_binlca
        (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbcm_, (
          const float32 *)&PwrLimBatt_pctSOCBattPwrLimEvBat5_AX[0], (const
          float32 *)&PwrLimBatt_tBattMinPwrLimEvBat5_AY[0], (const float32 *)
         &PwrLimBatt_pwrSOCBattPwrLimEvBat5_M[0], PwrLimBatt_ConstP.pooled14, 8U);
      break;

     case 6:
      /* Switch: '<S9>/Switch3' incorporates:
       *  Lookup_n-D: '<S9>/2-D Lookup Table10'
       *  MultiPortSwitch: '<S9>/Multiport Switch1'
       *  SignalConversion generated from: '<S2>/icbcm_tAmbTemp'
       *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
       */
      PwrLimBatt_pwrBattDChrgLimBySoc = look2_iflf_binlca
        (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbcm_, (
          const float32 *)&PwrLimBatt_pctSOCBattPwrLimEvBat6_AX[0], (const
          float32 *)&PwrLimBatt_tBattMinPwrLimEvBat6_AY[0], (const float32 *)
         &PwrLimBatt_pwrSOCBattPwrLimEvBat6_M[0], PwrLimBatt_ConstP.pooled14, 8U);
      break;

     default:
      /* Switch: '<S9>/Switch3' incorporates:
       *  Lookup_n-D: '<S9>/2-D Lookup Table7'
       *  MultiPortSwitch: '<S9>/Multiport Switch1'
       *  SignalConversion generated from: '<S2>/icbcm_tAmbTemp'
       *  SignalConversion generated from: '<S2>/icbms_pctHVBatSOCDisp'
       */
      PwrLimBatt_pwrBattDChrgLimBySoc = look2_iflf_binlca
        (rtb_TmpSignalConversionAticbms_, rtb_TmpSignalConversionAticbcm_, (
          const float32 *)&PwrLimBatt_pctSOCBattPwrLimEvBat7_AX[0], (const
          float32 *)&PwrLimBatt_tBattMinPwrLimEvBat7_AY[0], (const float32 *)
         &PwrLimBatt_pwrSOCBattPwrLimEvBat7_M[0], PwrLimBatt_ConstP.pooled14, 8U);
      break;
    }

    /* End of MultiPortSwitch: '<S9>/Multiport Switch1' */
  }

  /* End of Switch: '<S9>/Switch3' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' */

  /* Inport: '<Root>/ved_bBatPwrLim50Pct' */
  (void)Rte_Read_ved_bBatPwrLim50Pct_Value(&tmpRead_2);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' incorporates:
   *  SubSystem: '<Root>/PwrLimBatt'
   */
  /* Switch: '<S9>/Switch5' incorporates:
   *  Constant: '<S9>/Constant11'
   *
   * Block description for '<S9>/Constant11':
   *  [1]
   */
  if (PwrLimBatt_bBattMaxPwrSel_C) {
    /* Switch: '<S9>/Switch5' */
    rtb_TmpSignalConversionAticbcm_ = rtb_TmpSignalConversionAticbm_d;
  } else {
    /* Switch: '<S9>/Switch5' */
    rtb_TmpSignalConversionAticbcm_ = PwrLimBatt_pwrBatDChrgMaxOvDChrg;
  }

  /* End of Switch: '<S9>/Switch5' */

  /* RelationalOperator: '<S9>/Equal1' */
  PwrLimBatt_bDChrgMaxPwrRamp = (PwrLimBatt_pwrBattDChrgLimBySoc <
    rtb_TmpSignalConversionAticbcm_);

  /* RelationalOperator: '<S9>/Equal2' incorporates:
   *  Constant: '<S9>/uint8'
   */
  rtb_AND1_e = (rtb_TmpSignalConversionAtVehC_m == ((uint8)6U));

  /* Switch: '<S9>/Switch' */
  if (tmpRead_2) {
    /* Switch: '<S9>/Switch' incorporates:
     *  Constant: '<S9>/single3'
     */
    rtb_uDLookupTable2_g_idx_0 = 0.5F;
  } else {
    /* Switch: '<S9>/Switch' incorporates:
     *  Constant: '<S9>/single4'
     */
    rtb_uDLookupTable2_g_idx_0 = 1.0F;
  }

  /* End of Switch: '<S9>/Switch' */

  /* Delay: '<S41>/Delay' */
  if (PwrLimBatt_ARID_DEF.icLoad_k) {
    PwrLimBatt_ARID_DEF.Delay_DSTATE_f = rtb_uDLookupTable2_g_idx_0;
  }

  /* Sum: '<S41>/Sum' incorporates:
   *  Constant: '<S41>/Number1'
   *  Constant: '<S41>/Number2'
   *  Constant: '<S9>/Constant14'
   *  Constant: '<S9>/Constant19'
   *  Constant: '<S9>/TaskTime_s5'
   *  Delay: '<S41>/Delay'
   *  MinMax: '<S41>/MinMax1'
   *  MinMax: '<S41>/MinMax2'
   *  MinMax: '<S41>/MinMax3'
   *  MinMax: '<S41>/MinMax4'
   *  Product: '<S41>/Product'
   *  Product: '<S41>/Product1'
   *  Sum: '<S41>/Sum1'
   *
   * Block description for '<S9>/Constant14':
   *  [-0.1]
   *
   * Block description for '<S9>/Constant19':
   *  [0.1]
   */
  PwrLimBatt_facBattLimPwr = fminf(fmaxf(PwrLimBatt_dfacBattLimPwrPos_C * 0.01F,
    0.0F), fmaxf(fminf(PwrLimBatt_dfacBattLimPwrNeg_C * 0.01F, 0.0F),
                 rtb_uDLookupTable2_g_idx_0 - PwrLimBatt_ARID_DEF.Delay_DSTATE_f))
    + PwrLimBatt_ARID_DEF.Delay_DSTATE_f;

  /* SignalConversion generated from: '<S2>/ved_bBatPwrLim3Kw' incorporates:
   *  Inport: '<Root>/ved_bBatPwrLim3Kw'
   */
  (void)Rte_Read_ved_bBatPwrLim3Kw_Value(&rtb_TmpSignalConversionAtved_bB);

  /* Switch: '<S9>/Switch4' incorporates:
   *  Constant: '<S9>/Constant12'
   *  Switch: '<S9>/Switch6'
   *
   * Block description for '<S9>/Constant12':
   *  [1]
   */
  if (rtb_TmpSignalConversionAtved_bB) {
    /* Switch: '<S9>/Switch4' incorporates:
     *  Constant: '<S9>/Constant10'
     *  Constant: '<S9>/Constant7'
     *  Constant: '<S9>/TaskTime_s3'
     *  MinMax: '<S9>/Min2'
     *  Product: '<S9>/Product3'
     *  Sum: '<S9>/Add2'
     *  UnitDelay: '<S9>/Unit Delay1'
     *
     * Block description for '<S9>/Constant10':
     *  [5000]
     *
     * Block description for '<S9>/Constant7':
     *  [0]
     */
    rtb_TmpSignalConversionAticb_h3 = fminf(PwrLimBatt_dpwrChrg4LimpRdc_C *
      0.01F + PwrLimBatt_ARID_DEF.UnitDelay1_DSTATE_h, PwrLimBatt_pwrChrg4Limp_C);
  } else {
    if (!PwrLimBatt_bBattMaxPwrSel_C) {
      /* Switch: '<S9>/Switch6' */
      rtb_TmpSignalConversionAticbm_o = PwrLimBatt_pwrBatChrgMaxOvChrg;
    }

    /* Switch: '<S9>/Switch8' */
    if (rtb_AND1_e) {
      /* Switch: '<S9>/Switch8' incorporates:
       *  Lookup_n-D: '<S9>/1-D Lookup Table4'
       *  SignalConversion generated from: '<S2>/icbms_uCellMax'
       */
      rtb_TmpSignalConversionAticb_h2 = look1_iflf_binlca
        (rtb_TmpSignalConversionAticb_h2, (const float32 *)
         &PwrLimBatt_rHvesChrgPwrByCellMax6_AX[0], (const float32 *)
         &PwrLimBatt_rHvesChrgPwrByCellMax6_T[0], 5U);
    } else {
      /* Switch: '<S9>/Switch8' incorporates:
       *  Lookup_n-D: '<S9>/1-D Lookup Table2'
       *  SignalConversion generated from: '<S2>/icbms_uCellMax'
       */
      rtb_TmpSignalConversionAticb_h2 = look1_iflf_binlca
        (rtb_TmpSignalConversionAticb_h2, (const float32 *)
         &PwrLimBatt_rHvesChrgPwrByCellMax_AX[0], (const float32 *)
         &PwrLimBatt_rHvesChrgPwrByCellMax_T[0], 5U);
    }

    /* End of Switch: '<S9>/Switch8' */

    /* Switch: '<S9>/Switch1' incorporates:
     *  Constant: '<S9>/Constant5'
     *  RelationalOperator: '<S9>/Greater'
     *
     * Block description for '<S9>/Constant5':
     *  [-1500]
     */
    if (rtb_TmpSignalConversionAticbm_o > PwrLimBatt_pwrHvesChrgLim_C) {
      /* Switch: '<S9>/Switch1' incorporates:
       *  Constant: '<S9>/single1'
       */
      rtb_TmpSignalConversionAticb_h3 = 0.0F;
    } else {
      /* Switch: '<S9>/Switch1' incorporates:
       *  Constant: '<S9>/single2'
       *  Lookup_n-D: '<S9>/1-D Lookup Table13'
       *  MinMax: '<S9>/Min'
       *  SignalConversion generated from: '<S2>/icbms_tBatMin'
       *  Sum: '<S9>/Add'
       */
      rtb_TmpSignalConversionAticb_h3 = fminf(rtb_TmpSignalConversionAticbm_o +
        look1_iflf_binlca(rtb_TmpSignalConversionAticb_h3, (const float32 *)
                          &PwrLimBatt_tBatMinBatOfstPwr_AX[0], (const float32 *)
                          &PwrLimBatt_pwrBatOfstChrg_T[0], 4U), 0.0F);
    }

    /* End of Switch: '<S9>/Switch1' */

    /* Switch: '<S9>/Switch4' incorporates:
     *  Product: '<S9>/Product1'
     *  Product: '<S9>/Product5'
     */
    rtb_TmpSignalConversionAticb_h3 = rtb_TmpSignalConversionAticb_h3 *
      rtb_TmpSignalConversionAticb_h2 * PwrLimBatt_facBattLimPwr;
  }

  /* End of Switch: '<S9>/Switch4' */

  /* Delay: '<S42>/Delay' */
  if (PwrLimBatt_ARID_DEF.icLoad_nt) {
    PwrLimBatt_ARID_DEF.Delay_DSTATE_k = rtb_TmpSignalConversionAticb_h3;
  }

  /* Logic: '<S9>/Logical Operator9' */
  rtb_LogicalOperator9 = !rtb_LogicalOperator9;

  /* Switch: '<S42>/Switch1' incorporates:
   *  Constant: '<S9>/TRUE'
   *  Switch: '<S42>/Switch3'
   *
   * Block description for '<S9>/TRUE':
   *  TRUE
   */
  if (rtb_LogicalOperator9) {
    /* Switch: '<S42>/Switch1' */
    rtb_TmpSignalConversionAticb_h2 = rtb_TmpSignalConversionAticb_h3;
  } else {
    if (true) {
      /* Switch: '<S42>/Switch3' incorporates:
       *  Delay: '<S42>/Delay'
       */
      rtb_TmpSignalConversionAticb_h2 = PwrLimBatt_ARID_DEF.Delay_DSTATE_k;
    } else {
      /* Switch: '<S42>/Switch3' */
      rtb_TmpSignalConversionAticb_h2 = rtb_TmpSignalConversionAticb_h3;
    }

    /* Switch: '<S42>/Switch1' incorporates:
     *  Constant: '<S42>/Number1'
     *  Constant: '<S42>/Number2'
     *  Constant: '<S9>/Constant1'
     *  Constant: '<S9>/Constant2'
     *  Constant: '<S9>/TaskTime_s2'
     *  MinMax: '<S42>/MinMax1'
     *  MinMax: '<S42>/MinMax2'
     *  MinMax: '<S42>/MinMax3'
     *  MinMax: '<S42>/MinMax4'
     *  Product: '<S42>/Product'
     *  Product: '<S42>/Product1'
     *  Sum: '<S42>/Sum'
     *  Sum: '<S42>/Sum1'
     *
     * Block description for '<S9>/Constant1':
     *  [999999]
     *
     * Block description for '<S9>/Constant2':
     *  [-5000]
     */
    rtb_TmpSignalConversionAticb_h2 += fminf(fmaxf
      (PwrLimBatt_pwrGrdtHvesChrgInc_C * 0.01F, 0.0F), fmaxf(fminf
      (PwrLimBatt_pwrGrdtHvesChrgDec_C * 0.01F, 0.0F),
      rtb_TmpSignalConversionAticb_h3 - rtb_TmpSignalConversionAticb_h2));
  }

  /* End of Switch: '<S42>/Switch1' */

  /* Switch: '<S42>/Switch2' incorporates:
   *  Constant: '<S9>/TRUE'
   *
   * Block description for '<S9>/TRUE':
   *  TRUE
   */
  if (true) {
    /* Switch: '<S42>/Switch2' */
    PwrLimBatt_pwrMaxHvesChrg = rtb_TmpSignalConversionAticb_h2;
  } else {
    /* Switch: '<S42>/Switch2' */
    PwrLimBatt_pwrMaxHvesChrg = rtb_TmpSignalConversionAticb_h3;
  }

  /* End of Switch: '<S42>/Switch2' */

  /* Switch: '<S9>/Switch7' */
  if (rtb_AND1_e) {
    /* Switch: '<S9>/Switch7' incorporates:
     *  Lookup_n-D: '<S9>/1-D Lookup Table3'
     *  SignalConversion generated from: '<S2>/icbms_uCellMin'
     */
    rtb_uDLookupTable2_g_idx_0 = look1_iflf_binlca
      (rtb_TmpSignalConversionAticbm_p, (const float32 *)
       &PwrLimBatt_rHvesDChrgPwrByCellMin6_AX[0], (const float32 *)
       &PwrLimBatt_rHvesDChrgPwrByCellMin6_T[0], 5U);
  } else {
    /* Switch: '<S9>/Switch7' incorporates:
     *  Lookup_n-D: '<S9>/1-D Lookup Table1'
     *  SignalConversion generated from: '<S2>/icbms_uCellMin'
     */
    rtb_uDLookupTable2_g_idx_0 = look1_iflf_binlca
      (rtb_TmpSignalConversionAticbm_p, (const float32 *)
       &PwrLimBatt_rHvesDChrgPwrByCellMin_AX[0], (const float32 *)
       &PwrLimBatt_rHvesDChrgPwrByCellMin_T[0], 5U);
  }

  /* End of Switch: '<S9>/Switch7' */

  /* Switch: '<S9>/Switch9' incorporates:
   *  Abs: '<S9>/Abs'
   *  Constant: '<S9>/Constant13'
   *  RelationalOperator: '<S9>/Equal3'
   *
   * Block description for '<S9>/Constant13':
   *  [5]
   */
  if (fabsf(rtb_Switch3) >= PwrLimBatt_vVehBattPwrLimSwtThd_C) {
    /* Switch: '<S9>/Switch9' incorporates:
     *  MinMax: '<S9>/Min3'
     */
    rtb_TmpSignalConversionAticbcm_ = fminf(rtb_TmpSignalConversionAticbcm_,
      PwrLimBatt_pwrBattDChrgLimBySoc);
  }

  /* End of Switch: '<S9>/Switch9' */

  /* Delay: '<S44>/Delay' */
  if (PwrLimBatt_ARID_DEF.icLoad_l) {
    PwrLimBatt_ARID_DEF.Delay_DSTATE_n = rtb_TmpSignalConversionAticbcm_;
  }

  /* Switch: '<S44>/Switch1' incorporates:
   *  Constant: '<S9>/FALSE'
   *  Switch: '<S44>/Switch3'
   *
   * Block description for '<S9>/FALSE':
   *  FALSE
   */
  if (false) {
    /* Switch: '<S44>/Switch1' incorporates:
     *  Constant: '<S9>/single5'
     */
    rtb_Switch3 = 0.0F;
  } else {
    if (PwrLimBatt_bDChrgMaxPwrRamp) {
      /* Switch: '<S44>/Switch3' incorporates:
       *  Delay: '<S44>/Delay'
       */
      rtb_Switch3 = PwrLimBatt_ARID_DEF.Delay_DSTATE_n;
    } else {
      /* Switch: '<S44>/Switch3' */
      rtb_Switch3 = rtb_TmpSignalConversionAticbcm_;
    }

    /* Switch: '<S44>/Switch1' incorporates:
     *  Constant: '<S44>/Number1'
     *  Constant: '<S44>/Number2'
     *  Constant: '<S9>/Constant16'
     *  Constant: '<S9>/Constant17'
     *  Constant: '<S9>/TaskTime_s6'
     *  MinMax: '<S44>/MinMax1'
     *  MinMax: '<S44>/MinMax2'
     *  MinMax: '<S44>/MinMax3'
     *  MinMax: '<S44>/MinMax4'
     *  Product: '<S44>/Product'
     *  Product: '<S44>/Product1'
     *  Sum: '<S44>/Sum'
     *  Sum: '<S44>/Sum1'
     *
     * Block description for '<S9>/Constant16':
     *  [8000]
     *
     * Block description for '<S9>/Constant17':
     *  [-8000]
     */
    rtb_Switch3 += fminf(fmaxf(PwrLimBatt_pwrGrdtDChrgMaxInc_C * 0.01F, 0.0F),
                         fmaxf(fminf(PwrLimBatt_pwrGrdtDChrgMaxDec_C * 0.01F,
      0.0F), rtb_TmpSignalConversionAticbcm_ - rtb_Switch3));
  }

  /* End of Switch: '<S44>/Switch1' */

  /* Product: '<S9>/Product' incorporates:
   *  Constant: '<S9>/single'
   *  MinMax: '<S9>/Max'
   *  Sum: '<S9>/Subtract'
   */
  rtb_TmpSignalConversionAticbm_o = fmaxf(rtb_TmpSignalConversionAticb_o0 -
    rtb_uDLookupTable2_l_idx_0, 0.0F) * rtb_uDLookupTable2_g_idx_0;

  /* Switch: '<S9>/Switch2' incorporates:
   *  Constant: '<S9>/Constant6'
   *  Constant: '<S9>/single'
   *  MinMax: '<S9>/Max'
   *  MinMax: '<S9>/Min1'
   *  MinMax: '<S9>/Min4'
   *  Product: '<S9>/Product'
   *  Product: '<S9>/Product4'
   *  Sum: '<S9>/Add1'
   *  Sum: '<S9>/Subtract'
   *  Switch: '<S44>/Switch2'
   *  UnitDelay: '<S9>/Unit Delay'
   *
   * Block description for '<S9>/Constant6':
   *  [3000]
   */
  if (rtb_TmpSignalConversionAtved_bB) {
    /* Product: '<S9>/Product2' incorporates:
     *  Constant: '<S9>/Constant8'
     *  Constant: '<S9>/TaskTime_s1'
     *
     * Block description for '<S9>/Constant8':
     *  [5000]
     */
    rtb_TmpSignalConversionAticb_o0 = PwrLimBatt_dpwrDChrg4LimpRdc_C * 0.01F;
    rtb_TmpSignalConversionAticbm_o = fmaxf
      (PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_i[0] -
       rtb_TmpSignalConversionAticb_o0, fminf(rtb_TmpSignalConversionAticbm_o *
        PwrLimBatt_facBattLimPwr, PwrLimBatt_pwrDChrg4Limp_C));

    /* Switch: '<S44>/Switch2' incorporates:
     *  Constant: '<S9>/Constant6'
     *  MinMax: '<S9>/Min1'
     *  MinMax: '<S9>/Min4'
     *  Product: '<S9>/Product'
     *  Product: '<S9>/Product4'
     *  Sum: '<S9>/Add1'
     *  Switch: '<S9>/Switch2'
     *  UnitDelay: '<S9>/Unit Delay'
     *
     * Block description for '<S9>/Constant6':
     *  [3000]
     */
    if (PwrLimBatt_bDChrgMaxPwrRamp) {
      rtb_TmpSignalConversionAticbcm_ = rtb_Switch3;
    }

    rtb_TmpSignalConversionAticbcm_ = fmaxf
      (PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_i[1] -
       rtb_TmpSignalConversionAticb_o0, fminf(fmaxf
        (rtb_TmpSignalConversionAticbcm_ - rtb_uDLookupTable2_l_idx_0, 0.0F) *
        rtb_uDLookupTable2_g_idx_0 * PwrLimBatt_facBattLimPwr,
        PwrLimBatt_pwrDChrg4Limp_C));
    rtb_uDLookupTable2_g_idx_0 = fmaxf(PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_i[2]
      - rtb_TmpSignalConversionAticb_o0, fminf(fmaxf
      (rtb_TmpSignalConversionAticb_c0 - rtb_uDLookupTable2_l_idx_0, 0.0F) *
      rtb_uDLookupTable2_g_idx_0 * PwrLimBatt_facBattLimPwr,
      PwrLimBatt_pwrDChrg4Limp_C));
  } else {
    rtb_TmpSignalConversionAticbm_o *= PwrLimBatt_facBattLimPwr;

    /* Switch: '<S44>/Switch2' incorporates:
     *  Product: '<S9>/Product4'
     *  Switch: '<S9>/Switch2'
     */
    if (PwrLimBatt_bDChrgMaxPwrRamp) {
      rtb_TmpSignalConversionAticbcm_ = rtb_Switch3;
    }

    rtb_TmpSignalConversionAticbcm_ = fmaxf(rtb_TmpSignalConversionAticbcm_ -
      rtb_uDLookupTable2_l_idx_0, 0.0F) * rtb_uDLookupTable2_g_idx_0 *
      PwrLimBatt_facBattLimPwr;
    rtb_uDLookupTable2_g_idx_0 = fmaxf(rtb_TmpSignalConversionAticb_c0 -
      rtb_uDLookupTable2_l_idx_0, 0.0F) * rtb_uDLookupTable2_g_idx_0 *
      PwrLimBatt_facBattLimPwr;
  }

  /* End of Switch: '<S9>/Switch2' */

  /* Delay: '<S43>/Delay' */
  if (PwrLimBatt_ARID_DEF.icLoad_h) {
    PwrLimBatt_ARID_DEF.Delay_DSTATE_g[0] = rtb_TmpSignalConversionAticbm_o;
    PwrLimBatt_ARID_DEF.Delay_DSTATE_g[1] = rtb_TmpSignalConversionAticbcm_;
    PwrLimBatt_ARID_DEF.Delay_DSTATE_g[2] = rtb_uDLookupTable2_g_idx_0;
  }

  /* Switch: '<S43>/Switch1' incorporates:
   *  MinMax: '<S43>/MinMax2'
   *  MinMax: '<S43>/MinMax3'
   *  Sum: '<S43>/Sum'
   *  Sum: '<S43>/Sum1'
   *  Switch: '<S43>/Switch3'
   */
  if (rtb_LogicalOperator9) {
    /* Switch: '<S43>/Switch1' */
    rtb_TmpSignalConversionAticbm_p = rtb_TmpSignalConversionAticbm_o;
    rtb_Switch3_h_idx_1 = rtb_TmpSignalConversionAticbcm_;
    rtb_TmpSignalConversionAticb_o0 = rtb_uDLookupTable2_g_idx_0;
  } else {
    /* MinMax: '<S43>/MinMax4' incorporates:
     *  Constant: '<S43>/Number1'
     *  Constant: '<S43>/Number2'
     *  Constant: '<S9>/Constant3'
     *  Constant: '<S9>/Constant4'
     *  Constant: '<S9>/TaskTime_s4'
     *  MinMax: '<S43>/MinMax1'
     *  Product: '<S43>/Product'
     *  Product: '<S43>/Product1'
     *
     * Block description for '<S9>/Constant3':
     *  [5000]
     *
     * Block description for '<S9>/Constant4':
     *  [-999999]
     */
    rtb_TmpSignalConversionAticb_o0 = fminf(PwrLimBatt_pwrGrdtHvesDChrgDec_C *
      0.01F, 0.0F);
    rtb_TmpSignalConversionAticb_c0 = fmaxf(PwrLimBatt_pwrGrdtHvesDChrgInc_C *
      0.01F, 0.0F);

    /* Switch: '<S43>/Switch3' incorporates:
     *  Constant: '<S9>/TRUE1'
     *
     * Block description for '<S9>/TRUE1':
     *  TRUE
     */
    if (true) {
      /* Switch: '<S43>/Switch3' incorporates:
       *  Delay: '<S43>/Delay'
       */
      rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_ARID_DEF.Delay_DSTATE_g[0];
    } else {
      /* Switch: '<S43>/Switch3' */
      rtb_uDLookupTable4_k_idx_1 = rtb_TmpSignalConversionAticbm_o;
    }

    rtb_TmpSignalConversionAticbm_p = fminf(rtb_TmpSignalConversionAticb_c0,
      fmaxf(rtb_TmpSignalConversionAticb_o0, rtb_TmpSignalConversionAticbm_o -
            rtb_uDLookupTable4_k_idx_1)) + rtb_uDLookupTable4_k_idx_1;

    /* Switch: '<S43>/Switch3' incorporates:
     *  Constant: '<S9>/TRUE1'
     *  Delay: '<S43>/Delay'
     *  MinMax: '<S43>/MinMax2'
     *  MinMax: '<S43>/MinMax3'
     *  Sum: '<S43>/Sum'
     *  Sum: '<S43>/Sum1'
     *
     * Block description for '<S9>/TRUE1':
     *  TRUE
     */
    if (true) {
      rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_ARID_DEF.Delay_DSTATE_g[1];
    } else {
      rtb_uDLookupTable4_k_idx_1 = rtb_TmpSignalConversionAticbcm_;
    }

    rtb_Switch3_h_idx_1 = fminf(rtb_TmpSignalConversionAticb_c0, fmaxf
      (rtb_TmpSignalConversionAticb_o0, rtb_TmpSignalConversionAticbcm_ -
       rtb_uDLookupTable4_k_idx_1)) + rtb_uDLookupTable4_k_idx_1;

    /* Switch: '<S43>/Switch3' incorporates:
     *  Constant: '<S9>/TRUE1'
     *  Delay: '<S43>/Delay'
     *  MinMax: '<S43>/MinMax2'
     *  MinMax: '<S43>/MinMax3'
     *  Sum: '<S43>/Sum'
     *  Sum: '<S43>/Sum1'
     *
     * Block description for '<S9>/TRUE1':
     *  TRUE
     */
    if (true) {
      rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_ARID_DEF.Delay_DSTATE_g[2];
    } else {
      rtb_uDLookupTable4_k_idx_1 = rtb_uDLookupTable2_g_idx_0;
    }

    rtb_TmpSignalConversionAticb_o0 = fminf(rtb_TmpSignalConversionAticb_c0,
      fmaxf(rtb_TmpSignalConversionAticb_o0, rtb_uDLookupTable2_g_idx_0 -
            rtb_uDLookupTable4_k_idx_1)) + rtb_uDLookupTable4_k_idx_1;
  }

  /* End of Switch: '<S43>/Switch1' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' */

  /* Inport: '<Root>/DTC_bDiagRst' */
  (void)Rte_Read_DTC_bDiagRst_Value(&rtb_AND2);

  /* Inport: '<Root>/ipf_bPCAN0x343S2Vld' */
  (void)Rte_Read_ipf_bPCAN0x343S2Vld_Value(&tmpRead_1);

  /* Inport: '<Root>/ipf_bPCAN0x350S1Vld' */
  (void)Rte_Read_ipf_bPCAN0x350S1Vld_Value(&tmpRead_0);

  /* Inport: '<Root>/DTC_bDiagEnaCdnLong' */
  (void)Rte_Read_DTC_bDiagEnaCdnLong_Value(&tmpRead);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' incorporates:
   *  SubSystem: '<Root>/PwrLimBatt'
   */
  /* Switch: '<S43>/Switch2' incorporates:
   *  Constant: '<S9>/TRUE1'
   *
   * Block description for '<S9>/TRUE1':
   *  TRUE
   */
  if (true) {
    /* SignalConversion: '<S9>/Signal Copy' incorporates:
     *  Switch: '<S43>/Switch2'
     */
    PwrLimBatt_pwrPeakHvesDChrg = rtb_TmpSignalConversionAticbm_p;

    /* SignalConversion: '<S9>/Signal Copy1' incorporates:
     *  Switch: '<S43>/Switch2'
     */
    PwrLimBatt_pwrMaxHvesDChrg = rtb_Switch3_h_idx_1;

    /* SignalConversion: '<S9>/Signal Copy2' incorporates:
     *  Switch: '<S43>/Switch2'
     */
    PwrLimBatt_pwrContnsDChrg = rtb_TmpSignalConversionAticb_o0;
  } else {
    /* SignalConversion: '<S9>/Signal Copy' incorporates:
     *  Switch: '<S43>/Switch2'
     */
    PwrLimBatt_pwrPeakHvesDChrg = rtb_TmpSignalConversionAticbm_o;

    /* SignalConversion: '<S9>/Signal Copy1' incorporates:
     *  Switch: '<S43>/Switch2'
     */
    PwrLimBatt_pwrMaxHvesDChrg = rtb_TmpSignalConversionAticbcm_;

    /* SignalConversion: '<S9>/Signal Copy2' incorporates:
     *  Switch: '<S43>/Switch2'
     */
    PwrLimBatt_pwrContnsDChrg = rtb_uDLookupTable2_g_idx_0;
  }

  /* End of Switch: '<S43>/Switch2' */

  /* SignalConversion generated from: '<S2>/icbms_stFltLvl' incorporates:
   *  Inport: '<Root>/icbms_stFltLvl'
   */
  (void)Rte_Read_icbms_stFltLvl_Value(&rtb_TmpSignalConversionAticbm_i);

  /* Logic: '<S10>/AND' incorporates:
   *  Constant: '<S10>/Calibration1'
   *  Constant: '<S10>/Calibration2'
   *  Constant: '<S10>/uint1'
   *  Constant: '<S10>/uint8'
   *  Logic: '<S10>/AND3'
   *  RelationalOperator: '<S10>/Lower'
   *  RelationalOperator: '<S10>/Lower1'
   *  RelationalOperator: '<S10>/Lower2'
   *  RelationalOperator: '<S10>/Lower3'
   *
   * Block description for '<S10>/Calibration1':
   *  [5]
   *
   * Block description for '<S10>/Calibration2':
   *  [5000]
   */
  rtb_LogicalOperator9 = (((rtb_TmpSignalConversionAticbm_i == ((uint8)0U)) ||
    (rtb_TmpSignalConversionAticbm_i == ((uint8)7U))) &&
    (rtb_TmpSignalConversionAticbms_ >= PwrLimBatt_pctSOCThd4LimChk_C) &&
    (rtb_TmpSignalConversionAticbm_d < PwrLimBatt_pwrThd4LimChk_C));

  /* Logic: '<S10>/AND1' */
  rtb_AND1_e = (tmpRead && tmpRead_0 && tmpRead_1);

  /* Logic: '<S10>/AND2' incorporates:
   *  Logic: '<S10>/AND4'
   */
  rtb_AND2 = (rtb_AND2 || (!rtb_AND1_e));

  /* Outputs for Enabled SubSystem: '<S46>/Debounce_OBD' incorporates:
   *  EnablePort: '<S48>/Enable'
   */
  /* Logic: '<S47>/Logical Operator' incorporates:
   *  Logic: '<S47>/Logical Operator1'
   *  Logic: '<S47>/Logical Operator2'
   *  Logic: '<S47>/Logical Operator3'
   *  RelationalOperator: '<S47>/Relational Operator'
   *  UnitDelay: '<S46>/Unit Delay1'
   *  UnitDelay: '<S46>/Unit Delay2'
   */
  if ((((!PwrLimBatt_ARID_DEF.outRanged) ||
        (PwrLimBatt_ARID_DEF.UnitDelay1_DSTATE_e != rtb_LogicalOperator9)) &&
       rtb_AND1_e) || rtb_AND2) {
    sint16 rtb_Saturation2_jd;
    sint16 rtb_Switch2_f;

    /* Switch: '<S48>/Switch2' incorporates:
     *  Constant: '<S48>/int1'
     *  Logic: '<S48>/Logical Operator'
     *  Logic: '<S49>/Logical Operator'
     *  Logic: '<S49>/Logical Operator1'
     *  RelationalOperator: '<S48>/Relational Operator'
     *  Switch: '<S48>/Switch'
     *  UnitDelay: '<S48>/Unit Delay'
     *  UnitDelay: '<S49>/Unit Delay2'
     */
    if (rtb_AND2) {
      /* Switch: '<S48>/Switch2' incorporates:
       *  Constant: '<S48>/int16'
       */
      rtb_Switch2_f = 0;
    } else if (rtb_LogicalOperator9 &&
               (!PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_eb) &&
               (PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_h < 0)) {
      /* Switch: '<S48>/Switch' incorporates:
       *  Constant: '<S48>/int16'
       *  Switch: '<S48>/Switch2'
       */
      rtb_Switch2_f = 0;
    } else {
      /* Switch: '<S48>/Switch2' incorporates:
       *  UnitDelay: '<S48>/Unit Delay'
       */
      rtb_Switch2_f = PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_h;
    }

    /* End of Switch: '<S48>/Switch2' */

    /* Switch: '<S48>/Switch4' */
    if (rtb_LogicalOperator9) {
      sint32 tmp;

      /* Sum: '<S48>/Sum1' incorporates:
       *  Constant: '<S10>/int16'
       */
      tmp = 1 + rtb_Switch2_f;
      if (tmp > 32767) {
        tmp = 32767;
      } else if (tmp < -32768) {
        tmp = -32768;
      }

      /* Saturate: '<S48>/Saturation2' incorporates:
       *  Sum: '<S48>/Sum1'
       */
      rtb_Saturation2_jd = (sint16)tmp;
    } else {
      sint32 tmp;

      /* Sum: '<S48>/Sum2' incorporates:
       *  Constant: '<S10>/int1'
       */
      tmp = (-1) + rtb_Switch2_f;
      if (tmp > 32767) {
        tmp = 32767;
      } else if (tmp < -32768) {
        tmp = -32768;
      }

      /* Saturate: '<S48>/Saturation2' incorporates:
       *  Sum: '<S48>/Sum2'
       */
      rtb_Saturation2_jd = (sint16)tmp;
    }

    /* End of Switch: '<S48>/Switch4' */

    /* Saturate: '<S48>/Saturation2' */
    if (rtb_Saturation2_jd > 32766) {
      /* Saturate: '<S48>/Saturation2' */
      rtb_Saturation2_jd = 32766;
    } else if (rtb_Saturation2_jd < (-32767)) {
      /* Saturate: '<S48>/Saturation2' */
      rtb_Saturation2_jd = (-32767);
    }

    /* End of Saturate: '<S48>/Saturation2' */

    /* RelationalOperator: '<S48>/ROUpLim' incorporates:
     *  Constant: '<S10>/Calibration6'
     *
     * Block description for '<S10>/Calibration6':
     *  [500]
     */
    PwrLimBatt_ARID_DEF.outRanged = (PwrLimBatt_nrUnexpdPwrLimFaiThd_C <
      rtb_Saturation2_jd);

    /* Logic: '<S50>/Logical_Operator4' incorporates:
     *  Constant: '<S10>/Calibration7'
     *  Logic: '<S48>/LORelay1'
     *  Logic: '<S50>/Logical Operator1'
     *  Logic: '<S50>/Logical_Operator5'
     *  RelationalOperator: '<S48>/ROLoLim'
     *  UnitDelay: '<S50>/Unit Delay'
     *
     * Block description for '<S10>/Calibration7':
     *  [20]
     */
    PwrLimBatt_bUnexpdPwrLimErr = ((rtb_Saturation2_jd >=
      PwrLimBatt_nrUnexpdPwrLimRcvThd_C) && (!rtb_AND2) &&
      (PwrLimBatt_ARID_DEF.outRanged || PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_m));

    /* Update for UnitDelay: '<S49>/Unit Delay2' */
    PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_eb = rtb_LogicalOperator9;

    /* Switch: '<S48>/Switch3' */
    if (PwrLimBatt_ARID_DEF.outRanged) {
      /* Update for UnitDelay: '<S48>/Unit Delay' */
      PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_h = rtb_Switch2_f;
    } else {
      /* Update for UnitDelay: '<S48>/Unit Delay' */
      PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_h = rtb_Saturation2_jd;
    }

    /* End of Switch: '<S48>/Switch3' */

    /* Update for UnitDelay: '<S50>/Unit Delay' */
    PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_m = PwrLimBatt_bUnexpdPwrLimErr;
  }

  /* End of Logic: '<S47>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S46>/Debounce_OBD' */

  /* Outport: '<Root>/PwrLimBatt_pwrMaxHvesDChrg' incorporates:
   *  SignalConversion: '<S2>/Signal Conversion'
   */
  (void)Rte_Write_PwrLimBatt_pwrMaxHvesDChrg_Value(PwrLimBatt_pwrMaxHvesDChrg);

  /* Outport: '<Root>/PwrLimBatt_pwrMaxHvesChrg' incorporates:
   *  SignalConversion: '<S2>/Signal Conversion1'
   */
  (void)Rte_Write_PwrLimBatt_pwrMaxHvesChrg_Value(PwrLimBatt_pwrMaxHvesChrg);

  /* Outport: '<Root>/PwrLimBatt_pwrPeakHvesDChrg' incorporates:
   *  SignalConversion: '<S2>/Signal Conversion2'
   */
  (void)Rte_Write_PwrLimBatt_pwrPeakHvesDChrg_Value(PwrLimBatt_pwrPeakHvesDChrg);

  /* Outport: '<Root>/PwrLimBatt_pwrContnsDChrg' incorporates:
   *  SignalConversion: '<S2>/Signal Conversion3'
   */
  (void)Rte_Write_PwrLimBatt_pwrContnsDChrg_Value(PwrLimBatt_pwrContnsDChrg);

  /* Outport: '<Root>/PwrLimBatt_bUnexpdPwrLimErr' incorporates:
   *  SignalConversion: '<S2>/Signal Conversion8'
   */
  (void)Rte_Write_PwrLimBatt_bUnexpdPwrLimErr_Value(PwrLimBatt_bUnexpdPwrLimErr);

  /* Constant: '<S2>/uint32' */
  PwrLimBatt_Version = 10010109U;

  /* Update for UnitDelay: '<S5>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE = rtb_TmpSignalConversionAticbm_c;

  /* Update for UnitDelay: '<S14>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_n = rtb_Logical_Operator4;

  /* Update for Delay: '<S13>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad = false;
  PwrLimBatt_ARID_DEF.Delay_DSTATE = rtb_TmpSignalConversionAticb_av;

  /* Update for UnitDelay: '<S23>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_c = rtb_RelationalOperator;

  /* Update for UnitDelay: '<S17>/Unit Delay2' */
  PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_e = rtb_RelationalOperator;

  /* Update for UnitDelay: '<S18>/Unit Delay2' */
  PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_o = rtb_RelationalOperator;

  /* Update for UnitDelay: '<S22>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_e = rtb_Logical_Operator4_c;

  /* Update for UnitDelay: '<S19>/Unit Delay2' */
  PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_k = rtb_Logical_Operator4_c;

  /* Update for UnitDelay: '<S6>/Unit Delay1' */
  PwrLimBatt_ARID_DEF.UnitDelay1_DSTATE = rtb_TmpSignalConversionAticbm_f;

  /* Update for UnitDelay: '<S20>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_bp = rtb_Logical_Operator4_p;

  /* Update for UnitDelay: '<S21>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_di = rtb_Logical_Operator4_a;

  /* Update for UnitDelay: '<S6>/Unit Delay2' */
  PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE = rtb_Sum1;

  /* Update for UnitDelay: '<S24>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_e2 = rtb_AND1;

  /* Update for UnitDelay: '<S7>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_a = rtb_Max3;

  /* Update for UnitDelay: '<S28>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_k = rtb_Logical_Operator4_h;

  /* Update for Delay: '<S27>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad_n = false;
  PwrLimBatt_ARID_DEF.Delay_DSTATE_c = rtb_uDLookupTable1_m_idx_0;

  /* Update for UnitDelay: '<S38>/Unit Delay' incorporates:
   *  Saturate: '<S38>/Saturation2'
   */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_b = rtb_DataTypeConversion_g;

  /* Update for UnitDelay: '<S36>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_ah = rtb_Logical_Operator4_ch;

  /* Update for UnitDelay: '<S30>/Unit Delay2' */
  PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_p = rtb_Logical_Operator4_ch;

  /* Update for UnitDelay: '<S31>/Unit Delay2' */
  PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_n = rtb_Logical_Operator4_ch;

  /* Product: '<S39>/Divide' incorporates:
   *  Constant: '<S8>/Constant11'
   *
   * Block description for '<S8>/Constant11':
   *  [0.1]
   */
  rtb_uDLookupTable4_k_idx_1 = PwrLimBatt_tiOvChrgDecInt_C /
    PwrLimBatt_ConstB.Max_f;

  /* DataTypeConversion: '<S39>/DataTypeConversion' */
  rtb_uDLookupTable2_l_idx_0 = fabsf(rtb_uDLookupTable4_k_idx_1);
  if (rtb_uDLookupTable2_l_idx_0 < 8.388608E+6F) {
    if (rtb_uDLookupTable2_l_idx_0 >= 0.5F) {
      rtb_uDLookupTable4_k_idx_1 = floorf(rtb_uDLookupTable4_k_idx_1 + 0.5F);
    } else {
      rtb_uDLookupTable4_k_idx_1 = 0.0F;
    }
  }

  /* Update for UnitDelay: '<S8>/Unit Delay6' incorporates:
   *  DataTypeConversion: '<S39>/DataTypeConversion'
   *  RelationalOperator: '<S39>/Relational Operator1'
   *  Saturate: '<S39>/Saturation2'
   */
  PwrLimBatt_ARID_DEF.UnitDelay6_DSTATE_m = (rtb_Switch_g > (sint32)
    rtb_uDLookupTable4_k_idx_1);

  /* Update for UnitDelay: '<S35>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_ae = rtb_Logical_Operator4_f;

  /* Update for UnitDelay: '<S32>/Unit Delay2' */
  PwrLimBatt_ARID_DEF.UnitDelay2_DSTATE_h = rtb_Logical_Operator4_f;

  /* Update for UnitDelay: '<S8>/Unit Delay4' */
  PwrLimBatt_ARID_DEF.UnitDelay4_DSTATE = rtb_uDLookupTable4_k_idx_0;

  /* Update for UnitDelay: '<S33>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_hj = rtb_Logical_Operator4_pc;

  /* Update for UnitDelay: '<S34>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_do = rtb_Logical_Operator4_d;

  /* Update for UnitDelay: '<S8>/Unit Delay5' */
  PwrLimBatt_ARID_DEF.UnitDelay5_DSTATE = rtb_TmpSignalConversionAtVehCfg;

  /* Update for UnitDelay: '<S37>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_ay = rtb_Logical_Operator4_nb;

  /* Update for UnitDelay: '<S39>/Unit Delay' incorporates:
   *  Saturate: '<S39>/Saturation2'
   */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_jr = rtb_Switch_g;

  /* Update for UnitDelay: '<S9>/Unit Delay1' */
  PwrLimBatt_ARID_DEF.UnitDelay1_DSTATE_h = rtb_TmpSignalConversionAticb_h3;

  /* Update for Delay: '<S41>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad_k = false;
  PwrLimBatt_ARID_DEF.Delay_DSTATE_f = PwrLimBatt_facBattLimPwr;

  /* Update for Delay: '<S42>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad_nt = false;
  PwrLimBatt_ARID_DEF.Delay_DSTATE_k = rtb_TmpSignalConversionAticb_h2;

  /* Update for Delay: '<S44>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad_l = false;
  PwrLimBatt_ARID_DEF.Delay_DSTATE_n = rtb_Switch3;

  /* Update for Delay: '<S43>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad_h = false;

  /* Update for UnitDelay: '<S9>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_i[0] = rtb_TmpSignalConversionAticbm_o;

  /* Update for Delay: '<S43>/Delay' */
  PwrLimBatt_ARID_DEF.Delay_DSTATE_g[0] = rtb_TmpSignalConversionAticbm_p;

  /* Update for UnitDelay: '<S9>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_i[1] = rtb_TmpSignalConversionAticbcm_;

  /* Update for Delay: '<S43>/Delay' */
  PwrLimBatt_ARID_DEF.Delay_DSTATE_g[1] = rtb_Switch3_h_idx_1;

  /* Update for UnitDelay: '<S9>/Unit Delay' */
  PwrLimBatt_ARID_DEF.UnitDelay_DSTATE_i[2] = rtb_uDLookupTable2_g_idx_0;

  /* Update for Delay: '<S43>/Delay' */
  PwrLimBatt_ARID_DEF.Delay_DSTATE_g[2] = rtb_TmpSignalConversionAticb_o0;

  /* Update for UnitDelay: '<S46>/Unit Delay1' */
  PwrLimBatt_ARID_DEF.UnitDelay1_DSTATE_e = PwrLimBatt_bUnexpdPwrLimErr;

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' */
}

/* Model initialize function */
void PwrLimBatt_Init(void)
{
  /* SystemInitialize for RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' incorporates:
   *  SubSystem: '<Root>/PwrLimBatt'
   */
  /* InitializeConditions for Delay: '<S13>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad = true;

  /* InitializeConditions for Delay: '<S27>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad_n = true;

  /* InitializeConditions for Delay: '<S41>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad_k = true;

  /* InitializeConditions for Delay: '<S42>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad_nt = true;

  /* InitializeConditions for Delay: '<S44>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad_l = true;

  /* InitializeConditions for Delay: '<S43>/Delay' */
  PwrLimBatt_ARID_DEF.icLoad_h = true;

  /* SystemInitialize for Outport: '<Root>/PwrLimBatt_bUnexpdPwrLimErr' incorporates:
   *  SignalConversion: '<S2>/Signal Conversion8'
   */
  (void)Rte_Write_PwrLimBatt_bUnexpdPwrLimErr_Value(PwrLimBatt_bUnexpdPwrLimErr);

  /* End of SystemInitialize for RootInportFunctionCallGenerator generated from: '<Root>/fc_PwrLimBatt' */
}

/*
 * File trailer for generated code.
 *
 * [EOF]
 */
