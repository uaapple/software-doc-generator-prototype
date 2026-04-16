/*
 * File: HvCoorn.c
 *
 * Code generated for Simulink model 'HvCoorn'.
 *
 * Model version                  : 4.809
 * Simulink Coder version         : 9.8 (R2022b) 13-May-2022
 * C/C++ source code generated on : Tue Apr  7 14:22:57 2026
 *
 * Target selection: autosar.tlc
 * Embedded hardware selection: Infineon->TriCore
 * Code generation objectives: Unspecified
 * Validation result: Not run
 */
#include "HvCoorn.h"
#include "rtwtypes.h"
#include <math.h>
#include "HvCoorn_calibration.h"
#include "Wdgm_PFC_Swadp.h"

/* Named constants for Chart: '<S3>/A19_MainProcedure' */
#define H_IN_Emergency_VcuPowerShutDown ((uint8)6U)
#define HvCoo_IN_Emergency_MotDischarge ((uint8)2U)
#define HvCoor_IN_Emergency_NmHoldState ((uint8)3U)
#define HvCoor_IN_Emergency_ShutDownIni ((uint8)4U)
#define HvCoor_IN_Emergency_Wait4KeyOff ((uint8)7U)
#define HvCoor_IN_Shutdown_MotDischarge ((uint8)3U)
#define HvCoorn_IN_DCDCBuckReq         ((uint8)1U)
#define HvCoorn_IN_Emergency_DisChErr  ((uint8)1U)
#define HvCoorn_IN_Emergency_HV        ((uint8)1U)
#define HvCoorn_IN_Emergency_ShutdownHV ((uint8)5U)
#define HvCoorn_IN_HVReady             ((uint8)1U)
#define HvCoorn_IN_HvContactorRequest  ((uint8)2U)
#define HvCoorn_IN_Initial_Settings    ((uint8)2U)
#define HvCoorn_IN_NO_ACTIVE_CHILD     ((uint8)0U)
#define HvCoorn_IN_NmHoldState         ((uint8)3U)
#define HvCoorn_IN_Normal              ((uint8)4U)
#define HvCoorn_IN_Shutdown            ((uint8)2U)
#define HvCoorn_IN_Shutdown_DisChErr   ((uint8)1U)
#define HvCoorn_IN_Shutdown_HV         ((uint8)2U)
#define HvCoorn_IN_Shutdown_OthersECU  ((uint8)4U)
#define HvCoorn_IN_Startup             ((uint8)3U)
#define HvCoorn_IN_SystemReady         ((uint8)1U)
#define HvCoorn_IN_SystemReadyWait     ((uint8)2U)
#define HvCoorn_IN_VcuAfterRun         ((uint8)5U)
#define HvCoorn_IN_VcuPowerShutDown    ((uint8)6U)
#define HvCoorn_IN_Wait4ComMindChange  ((uint8)2U)
#define HvCoorn_IN_Wait4Communication  ((uint8)3U)
#define HvCoorn_IN_Wait4MindChange     ((uint8)3U)
#define HvCoorn_IN_WakeUp              ((uint8)7U)

/* Named constants for Chart: '<S33>/Auth_status' */
#define HvCoorn_IN_Equal               ((uint8)1U)
#define HvCoorn_IN_ISO                 ((uint8)2U)
#define HvCoorn_IN_Reset               ((uint8)3U)
#define HvCoorn_IN_Wait                ((uint8)4U)
#define HvCoorn_IN_init                ((uint8)5U)

/* Named constants for Chart: '<S3>/A32_VoltModSts' */
#define HvCoorn_IN_DCDCBuck            ((uint8)1U)
#define HvCoorn_IN_Default             ((uint8)2U)
#define HvCoorn_IN_EngStrt             ((uint8)3U)
#define HvCoorn_IN_HvCnt               ((uint8)4U)
#define HvCoorn_IN_HvDcnct             ((uint8)1U)
#define HvCoorn_IN_HvDisb              ((uint8)5U)
#define HvCoorn_IN_HvInitial           ((uint8)6U)
#define HvCoorn_IN_HvReq               ((uint8)2U)
#define HvCoorn_IN_VoltMod             ((uint8)7U)
#define HvCoorn_IN_VoltModRdy          ((uint8)3U)
#define HvCoorn_VoltMod_stDCBuck_SC    ((uint8)8U)
#define HvCoorn_VoltMod_stDft_SC       ((uint8)0U)
#define HvCoorn_VoltMod_stEngStrt_SC   ((uint8)1U)
#define HvCoorn_VoltMod_stHvCnt_SC     ((uint8)7U)
#define HvCoorn_VoltMod_stHvDcnct_SC   ((uint8)3U)
#define HvCoorn_VoltMod_stHvDisb_SC    ((uint8)2U)
#define HvCoorn_VoltMod_stHvInitial_SC ((uint8)6U)
#define HvCoorn_VoltMod_stHvReq_SC     ((uint8)4U)
#define HvCoorn_VoltMod_stVoltModRdy_SC ((uint8)5U)
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
const ConstB_HvCoorn_T HvCoorn_ConstB = {
  0.01F,                               /* '<S58>/Max' */
  0.01F,                               /* '<S59>/Max' */
  0.01F,                               /* '<S60>/Max' */
  0.01F,                               /* '<S65>/Max' */
  0.01F,                               /* '<S66>/Max' */
  0.01F,                               /* '<S67>/Max' */
  0.01F,                               /* '<S68>/Max' */
  0.01F,                               /* '<S76>/Max' */
  0.01F,                               /* '<S78>/Max' */
  0.01F,                               /* '<S79>/Max' */
  100000.0F,                           /* '<S46>/Product' */
  0.01F,                               /* '<S98>/Max' */
  0.01F,                               /* '<S99>/Max' */
  0.01F,                               /* '<S100>/Max' */
  0.01F,                               /* '<S105>/Max' */
  0.01F,                               /* '<S106>/Max' */
  0.01F,                               /* '<S110>/Max' */
  0.01F,                               /* '<S114>/Max' */
  0.01F,                               /* '<S141>/Max' */
  0.01F,                               /* '<S142>/Max' */
  0.01F,                               /* '<S143>/Max' */
  0.01F,                               /* '<S144>/Max' */
  0.01F,                               /* '<S145>/Max' */
  0.01F,                               /* '<S146>/Max' */
  0.01F,                               /* '<S147>/Max' */
  0.01F,                               /* '<S148>/Max' */
  0.01F,                               /* '<S149>/Max' */
  0.01F,                               /* '<S150>/Max' */
  0.01F,                               /* '<S151>/Max' */
  0.01F,                               /* '<S152>/Max' */
  0.01F,                               /* '<S158>/Max' */
  0.01F,                               /* '<S159>/Max' */
  0.01F,                               /* '<S160>/Max' */
  0.01F,                               /* '<S167>/Max' */
  0.01F,                               /* '<S175>/Max' */
  0.01F,                               /* '<S183>/Max' */
  0.01F,                               /* '<S184>/Max' */
  0.01F,                               /* '<S185>/Max' */
  0.01F,                               /* '<S186>/Max' */
  0.01F,                               /* '<S194>/Max' */
  0.01F,                               /* '<S195>/Max' */
  0.01F,                               /* '<S196>/Max' */
  0.01F,                               /* '<S207>/Max' */
  0.01F,                               /* '<S219>/Max' */
  0.01F,                               /* '<S228>/Max' */
  0.01F,                               /* '<S243>/Max' */
  0.01F,                               /* '<S244>/Max' */
  0.01F,                               /* '<S245>/Max' */
  0.01F,                               /* '<S281>/Max' */
  0.01F,                               /* '<S287>/Max' */
  0.01F,                               /* '<S320>/Max' */
  0.01F,                               /* '<S321>/Max' */
  0.01F,                               /* '<S331>/Max' */
  0.01F,                               /* '<S332>/Max' */
  0.01F,                               /* '<S333>/Max' */
  0.01F,                               /* '<S334>/Max' */
  0.01F,                               /* '<S335>/Max' */
  0.01F,                               /* '<S336>/Max' */
  0.01F,                               /* '<S337>/Max' */
  0.01F,                               /* '<S338>/Max' */
  0.01F,                               /* '<S340>/Max' */
  0.01F,                               /* '<S341>/Max' */
  0.01F,                               /* '<S339>/Max' */
  0.01F,                               /* '<S302>/Max' */
  0.01F,                               /* '<S319>/Max' */
  1U,                                  /* '<S40>/Switch6' */
  true,                                /* '<S43>/Logical Operator3' */
  true,                                /* '<S74>/Logical Operator1' */
  false,                               /* '<S43>/Relational Operator2' */
  false,                               /* '<S45>/Logical Operator17' */
  false,                               /* '<S45>/Logical Operator31' */
  false,                               /* '<S48>/Logical Operator34' */
  true,                                /* '<S102>/Logical Operator1' */
  true,                                /* '<S48>/Relational Operator17' */
  true,                                /* '<S9>/Relational Operator1' */
  true,                                /* '<S13>/Logical Operator9' */
  true                                 /* '<S20>/Logical Operator13' */
};

/* PublicStructure Variables for Internal Data */
ARID_DEF_HvCoorn_T HvCoorn_ARID_DEF;   /* '<S33>/Auth_status' */
static float32 look1_is8lftf_binlca(sint8 u0, const sint8 bp0[], const float32
  table[], uint32 maxIndex);

/* Forward declaration for local functions */
static void HvCoorn_Normal(const boolean *LogicalOperator6, uint8
  *HvCoorn_stHVP_f);
static float32 look1_is8lftf_binlca(sint8 u0, const sint8 bp0[], const float32
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

    sint8 bpLeftVar;
    bpLeftVar = bp0[iLeft];
    frac = (float32)(uint8)(u0 - bpLeftVar) / (float32)(uint8)(bp0[iLeft + 1U] -
      bpLeftVar);
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

/* Function for Chart: '<S3>/A19_MainProcedure' */
static void HvCoorn_Normal(const boolean *LogicalOperator6, uint8
  *HvCoorn_stHVP_f)
{
  /* During 'Normal': '<S22>:233' */
  if (HvCoorn_bEmgcyShutDownReq) {
    /* Transition: '<S22>:222' */
    /* Exit Internal 'Normal': '<S22>:233' */
    /* Exit Internal 'HVReady': '<S22>:204' */
    /* Exit Internal 'SystemReady': '<S22>:199' */
    HvCoorn_ARID_DEF.is_SystemReady = HvCoorn_IN_NO_ACTIVE_CHILD;
    HvCoorn_ARID_DEF.is_HVReady = HvCoorn_IN_NO_ACTIVE_CHILD;

    /* Exit Internal 'Shutdown': '<S22>:226' */
    HvCoorn_ARID_DEF.is_Shutdown = HvCoorn_IN_NO_ACTIVE_CHILD;

    /* Exit Internal 'Startup': '<S22>:234' */
    HvCoorn_ARID_DEF.is_Startup = HvCoorn_IN_NO_ACTIVE_CHILD;
    HvCoorn_ARID_DEF.is_Normal = HvCoorn_IN_NO_ACTIVE_CHILD;
    HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_Emergency_HV;

    /* Entry Internal 'Emergency_HV': '<S22>:223' */
    /* Transition: '<S22>:208' */
    HvCoorn_ARID_DEF.is_Emergency_HV = HvCoor_IN_Emergency_ShutDownIni;

    /* Entry 'Emergency_ShutDownIni': '<S22>:209' */
    *HvCoorn_stHVP_f = 151U;
  } else {
    switch (HvCoorn_ARID_DEF.is_Normal) {
     case HvCoorn_IN_HVReady:
      /* During 'HVReady': '<S22>:204' */
      switch (HvCoorn_ARID_DEF.is_HVReady) {
       case HvCoorn_IN_SystemReady:
        /* During 'SystemReady': '<S22>:199' */
        if ((!HvCoorn_bStartUpReq) && (*LogicalOperator6) && HvCoorn_bAPUNotRdy)
        {
          /* Transition: '<S22>:206' */
          /* Exit Internal 'SystemReady': '<S22>:199' */
          HvCoorn_ARID_DEF.is_SystemReady = HvCoorn_IN_NO_ACTIVE_CHILD;
          HvCoorn_ARID_DEF.is_HVReady = HvCoorn_IN_Wait4MindChange;

          /* Entry 'Wait4MindChange': '<S22>:205' */
          *HvCoorn_stHVP_f = 95U;
        } else if (HvCoorn_ARID_DEF.is_SystemReady == HvCoorn_IN_SystemReady) {
          *HvCoorn_stHVP_f = 90U;

          /* During 'SystemReady': '<S22>:200' */
          if (HvCoorn_bRdy2RdyWait) {
            /* Transition: '<S22>:258' */
            HvCoorn_ARID_DEF.is_SystemReady = HvCoorn_IN_SystemReadyWait;

            /* Entry 'SystemReadyWait': '<S22>:201' */
            *HvCoorn_stHVP_f = 89U;
          }
        } else {
          *HvCoorn_stHVP_f = 89U;

          /* During 'SystemReadyWait': '<S22>:201' */
          if (HvCoorn_bRdyWait2Rdy) {
            /* Transition: '<S22>:225' */
            HvCoorn_ARID_DEF.is_SystemReady = HvCoorn_IN_SystemReady;

            /* Entry 'SystemReady': '<S22>:200' */
            *HvCoorn_stHVP_f = 90U;
          }
        }
        break;

       case HvCoorn_IN_Wait4ComMindChange:
        *HvCoorn_stHVP_f = 91U;

        /* During 'Wait4ComMindChange': '<S22>:237' */
        if (!HvCoorn_bStartUpReq) {
          /* Transition: '<S22>:243' */
          HvCoorn_ARID_DEF.is_HVReady = HvCoorn_IN_Wait4MindChange;

          /* Entry 'Wait4MindChange': '<S22>:205' */
          *HvCoorn_stHVP_f = 95U;
        } else if (HvCoorn_bMindChag2Rdy) {
          /* Transition: '<S22>:244' */
          HvCoorn_ARID_DEF.is_HVReady = HvCoorn_IN_SystemReady;

          /* Entry Internal 'SystemReady': '<S22>:199' */
          /* Transition: '<S22>:257' */
          HvCoorn_ARID_DEF.is_SystemReady = HvCoorn_IN_SystemReadyWait;

          /* Entry 'SystemReadyWait': '<S22>:201' */
          *HvCoorn_stHVP_f = 89U;
        }
        break;

       default:
        *HvCoorn_stHVP_f = 95U;

        /* During 'Wait4MindChange': '<S22>:205' */
        if (HvCoorn_bMindChag2ShutHV) {
          /* Transition: '<S22>:247' */
          HvCoorn_ARID_DEF.is_HVReady = HvCoorn_IN_NO_ACTIVE_CHILD;
          HvCoorn_ARID_DEF.is_Normal = HvCoorn_IN_Shutdown;
          HvCoorn_ARID_DEF.is_Shutdown = HvCoorn_IN_Shutdown_HV;

          /* Entry 'Shutdown_HV': '<S22>:256' */
          *HvCoorn_stHVP_f = 101U;
        } else if (HvCoorn_bStartUpReq) {
          /* Transition: '<S22>:242' */
          HvCoorn_ARID_DEF.is_HVReady = HvCoorn_IN_Wait4ComMindChange;

          /* Entry 'Wait4ComMindChange': '<S22>:237' */
          *HvCoorn_stHVP_f = 91U;
        }
        break;
      }
      break;

     case HvCoorn_IN_Shutdown:
      /* During 'Shutdown': '<S22>:226' */
      switch (HvCoorn_ARID_DEF.is_Shutdown) {
       case HvCoorn_IN_Shutdown_DisChErr:
        *HvCoorn_stHVP_f = 110U;

        /* During 'Shutdown_DisChErr': '<S22>:235' */
        if (HvCoorn_ARID_DEF.temporalCounter_i1 >= 1) {
          /* Transition: '<S22>:203' */
          HvCoorn_ARID_DEF.is_Shutdown = HvCoorn_IN_Shutdown_OthersECU;

          /* Entry 'Shutdown_OthersECU': '<S22>:255' */
          *HvCoorn_stHVP_f = 115U;
        }
        break;

       case HvCoorn_IN_Shutdown_HV:
        *HvCoorn_stHVP_f = 101U;

        /* During 'Shutdown_HV': '<S22>:256' */
        if (HvCoorn_bShutHV2ShutDisCh) {
          /* Transition: '<S22>:202' */
          HvCoorn_ARID_DEF.is_Shutdown = HvCoor_IN_Shutdown_MotDischarge;

          /* Entry 'Shutdown_MotDischarge': '<S22>:228' */
          *HvCoorn_stHVP_f = 105U;
        }
        break;

       case HvCoor_IN_Shutdown_MotDischarge:
        *HvCoorn_stHVP_f = 105U;

        /* During 'Shutdown_MotDischarge': '<S22>:228' */
        if (HvCoorn_bShutDisCh2ShutECU) {
          /* Transition: '<S22>:240' */
          HvCoorn_ARID_DEF.is_Shutdown = HvCoorn_IN_Shutdown_OthersECU;

          /* Entry 'Shutdown_OthersECU': '<S22>:255' */
          *HvCoorn_stHVP_f = 115U;
        } else if (HvCoorn_bShutDisCh2ShutErr) {
          /* Transition: '<S22>:241' */
          HvCoorn_ARID_DEF.is_Shutdown = HvCoorn_IN_Shutdown_DisChErr;
          HvCoorn_ARID_DEF.temporalCounter_i1 = 0U;

          /* Entry 'Shutdown_DisChErr': '<S22>:235' */
          *HvCoorn_stHVP_f = 110U;
        }
        break;

       default:
        *HvCoorn_stHVP_f = 115U;

        /* During 'Shutdown_OthersECU': '<S22>:255' */
        if (HvCoorn_bShutECU2AftRun) {
          /* Transition: '<S22>:267' */
          HvCoorn_ARID_DEF.is_Shutdown = HvCoorn_IN_NO_ACTIVE_CHILD;
          HvCoorn_ARID_DEF.is_Normal = HvCoorn_IN_NO_ACTIVE_CHILD;
          HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_VcuAfterRun;

          /* Entry 'VcuAfterRun': '<S22>:261' */
          *HvCoorn_stHVP_f = 121U;
        } else if (HvCoorn_bShutECU2Comm) {
          /* Transition: '<S22>:245' */
          HvCoorn_ARID_DEF.is_Shutdown = HvCoorn_IN_NO_ACTIVE_CHILD;
          HvCoorn_ARID_DEF.is_Normal = HvCoorn_IN_Startup;

          /* Entry Internal 'Startup': '<S22>:234' */
          /* Transition: '<S22>:229' */
          HvCoorn_ARID_DEF.is_Startup = HvCoorn_IN_Wait4Communication;

          /* Entry 'Wait4Communication': '<S22>:236' */
          *HvCoorn_stHVP_f = 11U;
        }
        break;
      }
      break;

     default:
      /* During 'Startup': '<S22>:234' */
      switch (HvCoorn_ARID_DEF.is_Startup) {
       case HvCoorn_IN_DCDCBuckReq:
        *HvCoorn_stHVP_f = 17U;

        /* During 'DCDCBuckReq': '<S22>:254' */
        if (HvCoorn_bDCBuck2Rdy) {
          /* Transition: '<S22>:249' */
          HvCoorn_ARID_DEF.is_Startup = HvCoorn_IN_NO_ACTIVE_CHILD;
          HvCoorn_ARID_DEF.is_Normal = HvCoorn_IN_HVReady;
          HvCoorn_ARID_DEF.is_HVReady = HvCoorn_IN_SystemReady;

          /* Entry Internal 'SystemReady': '<S22>:199' */
          /* Transition: '<S22>:257' */
          HvCoorn_ARID_DEF.is_SystemReady = HvCoorn_IN_SystemReadyWait;

          /* Entry 'SystemReadyWait': '<S22>:201' */
          *HvCoorn_stHVP_f = 89U;
        } else if (HvCoorn_bDCBuck2Shtdwn) {
          /* Transition: '<S22>:248' */
          HvCoorn_ARID_DEF.is_Startup = HvCoorn_IN_NO_ACTIVE_CHILD;
          HvCoorn_ARID_DEF.is_Normal = HvCoorn_IN_Shutdown;

          /* Entry Internal 'Shutdown': '<S22>:226' */
          /* Transition: '<S22>:227' */
          HvCoorn_ARID_DEF.is_Shutdown = HvCoorn_IN_Shutdown_HV;

          /* Entry 'Shutdown_HV': '<S22>:256' */
          *HvCoorn_stHVP_f = 101U;
        }
        break;

       case HvCoorn_IN_HvContactorRequest:
        *HvCoorn_stHVP_f = 12U;

        /* During 'HvContactorRequest': '<S22>:253' */
        if (HvCoorn_bHVReq2DCBuck) {
          /* Transition: '<S22>:238' */
          HvCoorn_ARID_DEF.is_Startup = HvCoorn_IN_DCDCBuckReq;

          /* Entry 'DCDCBuckReq': '<S22>:254' */
          *HvCoorn_stHVP_f = 17U;
        } else if (HvCoorn_bHVReq2ShutDown) {
          /* Transition: '<S22>:246' */
          HvCoorn_ARID_DEF.is_Startup = HvCoorn_IN_NO_ACTIVE_CHILD;
          HvCoorn_ARID_DEF.is_Normal = HvCoorn_IN_Shutdown;

          /* Entry Internal 'Shutdown': '<S22>:226' */
          /* Transition: '<S22>:227' */
          HvCoorn_ARID_DEF.is_Shutdown = HvCoorn_IN_Shutdown_HV;

          /* Entry 'Shutdown_HV': '<S22>:256' */
          *HvCoorn_stHVP_f = 101U;
        }
        break;

       default:
        *HvCoorn_stHVP_f = 11U;

        /* During 'Wait4Communication': '<S22>:236' */
        if (HvCoorn_bComm2HVReq) {
          /* Transition: '<S22>:239' */
          HvCoorn_ARID_DEF.is_Startup = HvCoorn_IN_HvContactorRequest;

          /* Entry 'HvContactorRequest': '<S22>:253' */
          *HvCoorn_stHVP_f = 12U;
        } else if (HvCoorn_bComm2ShutECU) {
          /* Transition: '<S22>:252' */
          HvCoorn_ARID_DEF.is_Startup = HvCoorn_IN_NO_ACTIVE_CHILD;
          HvCoorn_ARID_DEF.is_Normal = HvCoorn_IN_Shutdown;
          HvCoorn_ARID_DEF.is_Shutdown = HvCoorn_IN_Shutdown_OthersECU;

          /* Entry 'Shutdown_OthersECU': '<S22>:255' */
          *HvCoorn_stHVP_f = 115U;
        }
        break;
      }
      break;
    }
  }
}

/* Model step function for TID1 */
void fc_HvCoorn(void)                  /* Explicit Task: fc_HvCoorn */
{
fc_HvCoorn_PFC_Start;
  /* local block i/o variables */
  boolean rtb_Logical_Operator4_cz;
  sint32 HvCoorn_stTboxByte7Req_tmp;
  sint32 i;
  sint32 rtb_DataTypeConversion_jq;
  sint32 rtb_Saturation2_ic;
  sint32 rtb_Saturation2_ke;
  sint32 rtb_Switch_e5;
  sint32 rtb_Switch_k_idx_0;
  sint32 rtb_Switch_k_idx_1;
  float32 rtb_Sum3_idx_0;
  float32 rtb_Sum3_idx_1;
  float32 rtb_Switch2_as;
  float32 rtb_Switch3_e3j;
  float32 rtb_TmpSignalConversionAtPwrL_i;
  float32 rtb_TmpSignalConversionAtPwrLim;
  float32 rtb_TmpSignalConversionAtVehSpd;
  float32 rtb_TmpSignalConversionAtian__o;
  float32 rtb_TmpSignalConversionAtian_tD;
  float32 rtb_TmpSignalConversionAticb_ke;
  float32 rtb_TmpSignalConversionAticbms_;
  float32 rtb_TmpSignalConversionAticdc_u;
  float32 rtb_TmpSignalConversionAticeb_g;
  float32 rtb_TmpSignalConversionAticebs_;
  float32 rtb_TmpSignalConversionAticems_;
  float32 rtb_TmpSignalConversionAticfm_n;
  float32 rtb_TmpSignalConversionAticfm_u;
  float32 rtb_TmpSignalConversionAticicm_;
  float32 rtb_TmpSignalConversionAticisg_;
  float32 rtb_TmpSignalConversionAticobc_;
  float32 rtb_TmpSignalConversionAticrm_n;
  float32 rtb_TmpSignalConversionAticrm_u;
  float32 rtb_tLoadInitAcTemp_idx_0;
  float32 rtb_tLoadInitAcTemp_idx_1;
  float32 tmpRead_2;
  float32 tmpRead_4;
  float32 tmpRead_a;
  float32 tmpRead_e;
  float32 tmpRead_f;
  float32 tmpRead_h;
  float32 tmpRead_i;
  float32 tmpRead_tmp;
  uint32 rtb_DataTypeConversion;
  uint32 tmp;
  sint16 rtb_Saturation2_gh[9];
  sint16 rtb_Switch2_ld[9];
  sint16 rtb_Saturation2_jr;
  sint16 rtb_Switch2_p5;
  uint16 rtb_Switch5;
  sint8 rtb_Switch_ld;
  uint8 rtb_TmpSignalConversionAtictc_h[8];
  uint8 rtb_TmpSignalConversionAtictc_j[8];
  uint8 HvCoorn_stHVP_f;
  uint8 rtb_Gain12;
  uint8 rtb_HvCoorn_stHVPOld;
  uint8 rtb_Selector14;
  uint8 rtb_Selector16;
  uint8 rtb_ShiftArithmetic2;
  uint8 rtb_ShiftArithmetic3;
  uint8 rtb_ShiftArithmetic4;
  uint8 rtb_ShiftArithmetic5;
  uint8 rtb_ShiftArithmetic6;
  uint8 rtb_ShiftArithmetic7;
  uint8 rtb_Switch7;
  uint8 rtb_TmpSignalConversionAtGearLv;
  uint8 rtb_TmpSignalConversionAtHvCoor;
  uint8 rtb_TmpSignalConversionAtVehCfg;
  uint8 rtb_TmpSignalConversionAticb_dk;
  uint8 rtb_TmpSignalConversionAticbm_b;
  uint8 rtb_TmpSignalConversionAticbm_d;
  uint8 rtb_TmpSignalConversionAticbm_j;
  uint8 rtb_TmpSignalConversionAticbm_l;
  uint8 rtb_TmpSignalConversionAticbm_p;
  uint8 rtb_TmpSignalConversionAticdc_s;
  uint8 rtb_TmpSignalConversionAticeb_a;
  uint8 rtb_TmpSignalConversionAticem_j;
  uint8 rtb_TmpSignalConversionAticfm_d;
  uint8 rtb_TmpSignalConversionAticfm_s;
  uint8 rtb_TmpSignalConversionAtici_ec;
  uint8 rtb_TmpSignalConversionAticic_h;
  uint8 rtb_TmpSignalConversionAticic_k;
  uint8 rtb_TmpSignalConversionAticic_m;
  uint8 rtb_TmpSignalConversionAticlbms;
  uint8 rtb_TmpSignalConversionAtico_em;
  uint8 rtb_TmpSignalConversionAtico_my;
  uint8 rtb_TmpSignalConversionAticob_c;
  uint8 rtb_TmpSignalConversionAticr_lo;
  uint8 rtb_TmpSignalConversionAticrm_i;
  uint8 rtb_TmpSignalConversionAticrm_p;
  uint8 rtb_TmpSignalConversionAticrm_s;
  uint8 rtb_TmpSignalConversionAtictcp_;
  uint8 rtb_TmpSignalConversionAticzcu_;
  uint8 rtb_switch1;
  uint8 tmpRead_0;
  uint8 tmpRead_3;
  uint8 tmpRead_6;
  uint8 tmpRead_8;
  uint8 tmpRead_9;
  uint8 tmpRead_c;
  uint8 tmpRead_d;
  uint8 tmpRead_g;
  boolean rtb_LogicalOperator1_b2[9];
  boolean tmpForInput[9];
  boolean HvCoorn_bRemLvBatMntnEx_tmp;
  boolean HvCoorn_bRemLvBatMntnEx_tmp_0;
  boolean HvCoorn_bStartUpReq_tmp;
  boolean HvCoorn_bStartUpReq_tmp_0;
  boolean rtb_AND12_o;
  boolean rtb_AND13;
  boolean rtb_AND14_l;
  boolean rtb_AND15_f;
  boolean rtb_AND1_al;
  boolean rtb_AND20;
  boolean rtb_AND20_i;
  boolean rtb_AND21;
  boolean rtb_AND23;
  boolean rtb_AND26_o;
  boolean rtb_AND2_e;
  boolean rtb_AND3;
  boolean rtb_AND32_f;
  boolean rtb_AND4;
  boolean rtb_AND5_g;
  boolean rtb_AND7_g;
  boolean rtb_AND7_j;
  boolean rtb_AND8_k;
  boolean rtb_AND8_p;
  boolean rtb_AND9_c;
  boolean rtb_AND9_p_tmp;
  boolean rtb_Equal12_a;
  boolean rtb_Equal2;
  boolean rtb_Equal3_a;
  boolean rtb_Equal3_lx;
  boolean rtb_Greater26;
  boolean rtb_LogicalOperator2;
  boolean rtb_LogicalOperator20_a;
  boolean rtb_LogicalOperator2_bz_idx_0;
  boolean rtb_LogicalOperator2_bz_idx_1;
  boolean rtb_LogicalOperator2_go;
  boolean rtb_LogicalOperator2_kb;
  boolean rtb_LogicalOperator2_m5;
  boolean rtb_LogicalOperator6_hy;
  boolean rtb_LogicalOperator_mf;
  boolean rtb_Logical_Operator4;
  boolean rtb_Logical_Operator4_b;
  boolean rtb_Logical_Operator4_e;
  boolean rtb_Logical_Operator4_ee;
  boolean rtb_Logical_Operator4_en;
  boolean rtb_Logical_Operator4_hp;
  boolean rtb_Logical_Operator4_i5;
  boolean rtb_Logical_Operator4_ix;
  boolean rtb_Logical_Operator4_mf_idx_0;
  boolean rtb_Logical_Operator4_mf_idx_1;
  boolean rtb_Logical_Operator4_n_tmp;
  boolean rtb_Logical_Operator5_io_idx_0;
  boolean rtb_Logical_Operator5_io_idx_1;
  boolean rtb_LowerOrEqual2;
  boolean rtb_Not1_eo;
  boolean rtb_OR;
  boolean rtb_OR2;
  boolean rtb_OR_jg;
  boolean rtb_OR_lx;
  boolean rtb_RelationalOperator;
  boolean rtb_RelationalOperator27;
  boolean rtb_RelationalOperator28;
  boolean rtb_RelationalOperator29;
  boolean rtb_RelationalOperator30;
  boolean rtb_RelationalOperator_ce_idx_0;
  boolean rtb_RelationalOperator_ce_idx_1;
  boolean rtb_RelationalOperator_e2;
  boolean rtb_RelationalOperator_f;
  boolean rtb_RelationalOperator_f_tmp;
  boolean rtb_RelationalOperator_gi;
  boolean rtb_RelationalOperator_gn;
  boolean rtb_RelationalOperator_iq;
  boolean rtb_RelationalOperator_no;
  boolean rtb_RelationalOperator_ox;
  boolean rtb_RelationalOperator_p0;
  boolean rtb_Switch1_bl_idx_0;
  boolean rtb_TmpSignalConversionAtBrkPed;
  boolean rtb_TmpSignalConversionAtChr_ge;
  boolean rtb_TmpSignalConversionAtChr_kb;
  boolean rtb_TmpSignalConversionAtChrg_a;
  boolean rtb_TmpSignalConversionAtChrg_b;
  boolean rtb_TmpSignalConversionAtDTC__c;
  boolean rtb_TmpSignalConversionAtDTC__j;
  boolean rtb_TmpSignalConversionAtDTC_bD;
  boolean rtb_TmpSignalConversionAtDrvMod;
  boolean rtb_TmpSignalConversionAtEngS_k;
  boolean rtb_TmpSignalConversionAtEngS_n;
  boolean rtb_TmpSignalConversionAtEngStr;
  boolean rtb_TmpSignalConversionAtGear_e;
  boolean rtb_TmpSignalConversionAtGear_m;
  boolean rtb_TmpSignalConversionAtGear_n;
  boolean rtb_TmpSignalConversionAtHybCoo;
  boolean rtb_TmpSignalConversionAtVehC_i;
  boolean rtb_TmpSignalConversionAtibsw_b;
  boolean rtb_TmpSignalConversionAticbm_a;
  boolean rtb_TmpSignalConversionAticbm_o;
  boolean rtb_TmpSignalConversionAticem_e;
  boolean rtb_TmpSignalConversionAticic_a;
  boolean rtb_TmpSignalConversionAticis_b;
  boolean rtb_TmpSignalConversionAticob_m;
  boolean rtb_TmpSignalConversionAticob_p;
  boolean rtb_TmpSignalConversionAtidi__j;
  boolean rtb_TmpSignalConversionAtidi_bK;
  boolean rtb_TmpSignalConversionAtipf__i;
  boolean rtb_TmpSignalConversionAtipf_bP;
  boolean rtb_TmpSignalConversionAtiud_bE;
  boolean rtb_TmpSignalConversionAtved__l;
  boolean rtb_TmpSignalConversionAtved__p;
  boolean rtb_TmpSignalConversionAtved_bH;
  boolean rtb_TmpSignalConversionAtved_bI;
  boolean rtb_UnitDelay_jn;
  boolean rtb_UnitDelay_njy;
  boolean rtb_bGearOk;
  boolean tmpRead;
  boolean tmpRead_1;
  boolean tmpRead_5;
  boolean tmpRead_7;
  boolean tmpRead_b;
  boolean tmp_0;
  boolean tmp_1;
  boolean tmp_2;

  /* Inport: '<Root>/icbms_stPrecRly' */
  (void)Rte_Read_icbms_stPrecRly_Value(&rtb_HvCoorn_stHVPOld);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* SignalConversion generated from: '<S1>/icbms_stHvBat' incorporates:
   *  Inport: '<Root>/icbms_stHvBat'
   */
  (void)Rte_Read_icbms_stHvBat_Value(&rtb_TmpSignalConversionAticbm_d);

  /* SignalConversion generated from: '<S1>/icbms_stMainPosRly' incorporates:
   *  Inport: '<Root>/icbms_stMainPosRly'
   */
  (void)Rte_Read_icbms_stMainPosRly_Value(&rtb_TmpSignalConversionAticbm_b);

  /* SignalConversion generated from: '<S1>/icbms_stMainNegRly' incorporates:
   *  Inport: '<Root>/icbms_stMainNegRly'
   */
  (void)Rte_Read_icbms_stMainNegRly_Value(&rtb_TmpSignalConversionAticb_dk);

  /* Logic: '<S39>/Logical Operator2' incorporates:
   *  Constant: '<S39>/icbms_offline'
   *  Constant: '<S39>/icbms_undefined'
   *  Constant: '<S39>/icbms_undefined7'
   *  Constant: '<S39>/icbms_undefined8'
   *  Logic: '<S39>/Logical Operator7'
   *  RelationalOperator: '<S39>/Relational Operator1'
   *  RelationalOperator: '<S39>/Relational Operator12'
   *  RelationalOperator: '<S39>/Relational Operator13'
   *  RelationalOperator: '<S39>/Relational Operator5'
   *
   * Block description for '<S39>/icbms_offline':
   *  [1]
   *
   * Block description for '<S39>/icbms_undefined':
   *  [0]
   *
   * Block description for '<S39>/icbms_undefined7':
   *  [1]
   *
   * Block description for '<S39>/icbms_undefined8':
   *  [1]
   */
  HvCoorn_bHvRlyOpenAct = ((rtb_TmpSignalConversionAticbm_b == ((uint8)1U)) ||
    (rtb_TmpSignalConversionAticb_dk == ((uint8)1U)) ||
    (rtb_TmpSignalConversionAticbm_d == ((uint8)1U)) ||
    (rtb_TmpSignalConversionAticbm_d == ((uint8)0U)));

  /* Logic: '<S39>/Logical Operator4' incorporates:
   *  Constant: '<S39>/icbms_undefined1'
   *  Constant: '<S39>/icbms_undefined2'
   *  Constant: '<S39>/icbms_undefined3'
   *  Constant: '<S39>/icbms_undefined4'
   *  Logic: '<S39>/Logical Operator3'
   *  Logic: '<S39>/Logical Operator5'
   *  RelationalOperator: '<S39>/Relational Operator10'
   *  RelationalOperator: '<S39>/Relational Operator6'
   *  RelationalOperator: '<S39>/Relational Operator8'
   *  RelationalOperator: '<S39>/Relational Operator9'
   *
   * Block description for '<S39>/icbms_undefined1':
   *  [4]
   *
   * Block description for '<S39>/icbms_undefined2':
   *  [4]
   *
   * Block description for '<S39>/icbms_undefined3':
   *  [3]
   *
   * Block description for '<S39>/icbms_undefined4':
   *  [3]
   */
  HvCoorn_bHvRlyStuck = (((rtb_TmpSignalConversionAticbm_b == ((uint8)4U)) ||
    (rtb_HvCoorn_stHVPOld == ((uint8)3U))) && ((rtb_TmpSignalConversionAticb_dk ==
    ((uint8)4U)) || (rtb_TmpSignalConversionAticb_dk == ((uint8)3U))));

  /* Switch: '<S39>/Switch' incorporates:
   *  Constant: '<S39>/hpp_tiHvilOkDelay_C'
   *
   * Block description for '<S39>/hpp_tiHvilOkDelay_C':
   *  [0]
   */
  if (HvCoorn_bHvRlyClsJudgByMod_C) {
    /* Switch: '<S39>/Switch' incorporates:
     *  Constant: '<S39>/icbms_acCharge'
     *  Constant: '<S39>/icbms_dcCharge'
     *  Constant: '<S39>/icbms_online'
     *  Logic: '<S39>/Logical Operator1'
     *  RelationalOperator: '<S39>/Relational Operator2'
     *  RelationalOperator: '<S39>/Relational Operator3'
     *  RelationalOperator: '<S39>/Relational Operator4'
     *
     * Block description for '<S39>/icbms_acCharge':
     *  [9]
     *
     * Block description for '<S39>/icbms_dcCharge':
     *  [8]
     *
     * Block description for '<S39>/icbms_online':
     *  [4]
     */
    HvCoorn_bHvRlyClsAct = ((rtb_TmpSignalConversionAticbm_d == ((uint8)4U)) ||
      (rtb_TmpSignalConversionAticbm_d == ((uint8)9U)) ||
      (rtb_TmpSignalConversionAticbm_d == ((uint8)8U)));
  } else {
    /* Switch: '<S39>/Switch' incorporates:
     *  Constant: '<S39>/icbms_undefined5'
     *  Constant: '<S39>/icbms_undefined6'
     *  Logic: '<S39>/Logical Operator6'
     *  RelationalOperator: '<S39>/Relational Operator11'
     *  RelationalOperator: '<S39>/Relational Operator7'
     *
     * Block description for '<S39>/icbms_undefined5':
     *  [2]
     *
     * Block description for '<S39>/icbms_undefined6':
     *  [2]
     */
    HvCoorn_bHvRlyClsAct = ((rtb_TmpSignalConversionAticbm_b == ((uint8)2U)) &&
      (rtb_TmpSignalConversionAticb_dk == ((uint8)2U)));
  }

  /* End of Switch: '<S39>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/icecc_uEASAct' */
  (void)Rte_Read_icecc_uEASAct_Value(&tmpRead_i);

  /* Inport: '<Root>/icecc_uPTCAct' */
  (void)Rte_Read_icecc_uPTCAct_Value(&tmpRead_h);

  /* Inport: '<Root>/icecc_bEASHvilFlt' */
  (void)Rte_Read_icecc_bEASHvilFlt_Value(&rtb_AND4);

  /* Inport: '<Root>/icecc_bWPTCHvilFlt' */
  (void)Rte_Read_icecc_bWPTCHvilFlt_Value(&rtb_AND3);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* UnitDelay: '<S3>/Unit Delay2' */
  rtb_HvCoorn_stHVPOld = HvCoorn_stHVP;

  /* Logic: '<S40>/OR' incorporates:
   *  Constant: '<S40>/uint15'
   *  Constant: '<S40>/uint28'
   *  RelationalOperator: '<S40>/Equal'
   *  RelationalOperator: '<S40>/Equal1'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  rtb_OR = ((HvCoorn_stHVP >= ((uint8)89U)) && (HvCoorn_stHVP <= ((uint8)95U)));

  /* SignalConversion generated from: '<S1>/icisg_uAct' incorporates:
   *  Inport: '<Root>/icisg_uAct'
   */
  (void)Rte_Read_icisg_uAct_Value(&rtb_TmpSignalConversionAticisg_);

  /* SignalConversion generated from: '<S1>/icrm_uAct' incorporates:
   *  Inport: '<Root>/icrm_uAct'
   */
  (void)Rte_Read_icrm_uAct_Value(&rtb_TmpSignalConversionAticrm_u);

  /* RelationalOperator: '<S40>/Equal2' incorporates:
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C10'
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C10':
   *  [200]
   */
  rtb_Equal2 = (rtb_TmpSignalConversionAticrm_u < HvCoorn_uHvilChkgRMcuMaxThd_C);

  /* Logic: '<S40>/AND3' incorporates:
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C11'
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C15'
   *  Logic: '<S40>/AND5'
   *  Logic: '<S40>/OR5'
   *  RelationalOperator: '<S40>/Equal4'
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C11':
   *  [200]
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C15':
   *  [1]
   */
  rtb_AND3 = (rtb_AND3 && ((rtb_OR && (tmpRead_h < HvCoorn_uHvilChkgPTCMaxThd_C))
    || HvCoorn_bHvilChkgVoltSwtShd_C));

  /* Logic: '<S40>/AND4' incorporates:
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C12'
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C16'
   *  Logic: '<S40>/AND6'
   *  Logic: '<S40>/OR6'
   *  RelationalOperator: '<S40>/Equal5'
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C12':
   *  [200]
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C16':
   *  [1]
   */
  rtb_AND4 = (rtb_AND4 && ((rtb_OR && (tmpRead_i < HvCoorn_uHvilChkgEASMaxThd_C))
    || HvCoorn_bHvilChkgVoltSwtShd_C));

  /* SignalConversion generated from: '<S1>/icisg_bHvilFlt' incorporates:
   *  Inport: '<Root>/icisg_bHvilFlt'
   */
  (void)Rte_Read_icisg_bHvilFlt_Value(&rtb_TmpSignalConversionAticis_b);

  /* Switch: '<S40>/Switch3' incorporates:
   *  Constant: '<S1>/FALSE5'
   *  Constant: '<S40>/hpp_tiHvilOkDelay_C1'
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C3'
   *  Inport: '<Root>/icbms_stHvil'
   *  Logic: '<S40>/Logical Operator4'
   *  Logic: '<S40>/Logical Operator9'
   *  RelationalOperator: '<S40>/Relational Operator10'
   *
   * Block description for '<S1>/FALSE5':
   *  FALSE
   *
   * Block description for '<S40>/hpp_tiHvilOkDelay_C1':
   *  [0]
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C3':
   *  [0]
   */
  if (HvCoorn_bHvilChkgEna_C && ((rtb_TmpSignalConversionAticbm_d == ((uint8)0U))
       || false)) {
    /* ArithShift: '<S113>/Shift Arithmetic7' incorporates:
     *  Constant: '<S40>/uint1'
     *
     * Block description for '<S40>/uint1':
     *  Checking
     */
    rtb_ShiftArithmetic7 = ((uint8)2U);
  } else {
    (void)Rte_Read_icbms_stHvil_Value(&rtb_ShiftArithmetic7);

    /* Switch: '<S40>/Switch1' incorporates:
     *  Constant: '<S40>/hpp_tiWait4HvilHw_C13'
     *  Constant: '<S40>/hpp_tiWait4HvilHw_C9'
     *  Constant: '<S40>/uint12'
     *  Inport: '<Root>/icbms_stHvil'
     *  Logic: '<S40>/AND'
     *  Logic: '<S40>/OR1'
     *  Logic: '<S40>/OR2'
     *  Logic: '<S40>/OR3'
     *  RelationalOperator: '<S40>/Equal3'
     *  RelationalOperator: '<S40>/Relational Operator3'
     *
     * Block description for '<S40>/hpp_tiWait4HvilHw_C13':
     *  [1]
     *
     * Block description for '<S40>/hpp_tiWait4HvilHw_C9':
     *  [200]
     *
     * Block description for '<S40>/uint12':
     *  BMSClosed
     */
    if ((rtb_ShiftArithmetic7 != ((uint8)1U)) && ((rtb_OR &&
          ((rtb_TmpSignalConversionAticisg_ < HvCoorn_uHvilChkgISGMaxThd_C) ||
           rtb_Equal2)) || HvCoorn_bHvilChkgVoltSwtShd_C)) {
      /* ArithShift: '<S113>/Shift Arithmetic7' incorporates:
       *  Constant: '<S40>/uint14'
       *
       * Block description for '<S40>/uint14':
       *  NotOk
       */
      rtb_ShiftArithmetic7 = ((uint8)0U);
    } else {
      /* ArithShift: '<S113>/Shift Arithmetic7' incorporates:
       *  Constant: '<S40>/uint6'
       *
       * Block description for '<S40>/uint6':
       *  Ok
       */
      rtb_ShiftArithmetic7 = ((uint8)1U);
    }

    /* End of Switch: '<S40>/Switch1' */
  }

  /* End of Switch: '<S40>/Switch3' */

  /* SignalConversion generated from: '<S1>/VehCfg_bFrntMotByp' incorporates:
   *  Inport: '<Root>/VehCfg_bFrntMotByp'
   */
  (void)Rte_Read_VehCfg_bFrntMotByp_Value(&rtb_TmpSignalConversionAtVehC_i);

  /* SignalConversion generated from: '<S1>/icfm_stMode' incorporates:
   *  Inport: '<Root>/icfm_stMode'
   */
  (void)Rte_Read_icfm_stMode_Value(&rtb_TmpSignalConversionAticfm_s);

  /* Switch: '<S40>/Switch16' incorporates:
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C4'
   *  Constant: '<S40>/uint13'
   *  Inport: '<Root>/icfm_bHvilFlt'
   *  Logic: '<S40>/Logical Operator11'
   *  RelationalOperator: '<S40>/Relational Operator2'
   *  Switch: '<S40>/Switch5'
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C4':
   *  [0]
   *
   * Block description for '<S40>/uint13':
   *  MCUInitial
   */
  if (rtb_TmpSignalConversionAtVehC_i) {
    /* ArithShift: '<S181>/Shift Arithmetic6' incorporates:
     *  Constant: '<S40>/uint46'
     *
     * Block description for '<S40>/uint46':
     *  Ok
     */
    rtb_ShiftArithmetic6 = ((uint8)1U);
  } else if (HvCoorn_bHvilChkgEna_C && (rtb_TmpSignalConversionAticfm_s <=
              ((uint8)1U))) {
    /* ArithShift: '<S181>/Shift Arithmetic6' incorporates:
     *  Constant: '<S40>/uint2'
     *  Switch: '<S40>/Switch5'
     *
     * Block description for '<S40>/uint2':
     *  Checking
     */
    rtb_ShiftArithmetic6 = ((uint8)2U);
  } else {
    (void)Rte_Read_icfm_bHvilFlt_Value(&rtb_RelationalOperator);

    /* Switch: '<S40>/Switch2' incorporates:
     *  Inport: '<Root>/icfm_bHvilFlt'
     *  Switch: '<S40>/Switch5'
     */
    if (rtb_RelationalOperator) {
      /* ArithShift: '<S181>/Shift Arithmetic6' incorporates:
       *  Constant: '<S40>/uint16'
       *  Switch: '<S40>/Switch5'
       *
       * Block description for '<S40>/uint16':
       *  NotOk
       */
      rtb_ShiftArithmetic6 = ((uint8)0U);
    } else {
      /* ArithShift: '<S181>/Shift Arithmetic6' incorporates:
       *  Constant: '<S40>/uint7'
       *  Switch: '<S40>/Switch5'
       *
       * Block description for '<S40>/uint7':
       *  Ok
       */
      rtb_ShiftArithmetic6 = ((uint8)1U);
    }

    /* End of Switch: '<S40>/Switch2' */
  }

  /* End of Switch: '<S40>/Switch16' */

  /* SignalConversion generated from: '<S1>/icdc_stMode' incorporates:
   *  Inport: '<Root>/icdc_stMode'
   */
  (void)Rte_Read_icdc_stMode_Value(&rtb_TmpSignalConversionAticdc_s);

  /* Switch: '<S40>/Switch7' incorporates:
   *  Constant: '<S1>/FALSE10'
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C5'
   *  Constant: '<S40>/uint24'
   *  Logic: '<S40>/Logical Operator12'
   *  Logic: '<S40>/Logical Operator7'
   *  RelationalOperator: '<S40>/Relational Operator4'
   *
   * Block description for '<S1>/FALSE10':
   *  FALSE
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C5':
   *  [0]
   *
   * Block description for '<S40>/uint24':
   *  DCDCInitial
   */
  if (HvCoorn_bHvilChkgEna_C && ((rtb_TmpSignalConversionAticdc_s == ((uint8)0U))
       || false)) {
    /* ArithShift: '<S181>/Shift Arithmetic5' incorporates:
     *  Constant: '<S40>/uint3'
     *
     * Block description for '<S40>/uint3':
     *  Checking
     */
    rtb_ShiftArithmetic5 = ((uint8)2U);
  } else {
    /* ArithShift: '<S181>/Shift Arithmetic5' */
    rtb_ShiftArithmetic5 = HvCoorn_ConstB.Switch6;
  }

  /* End of Switch: '<S40>/Switch7' */

  /* SignalConversion generated from: '<S1>/icobc_stOBCMode' incorporates:
   *  Inport: '<Root>/icobc_stOBCMode'
   */
  (void)Rte_Read_icobc_stOBCMode_Value(&rtb_TmpSignalConversionAticob_c);

  /* Switch: '<S40>/Switch9' incorporates:
   *  Constant: '<S1>/FALSE16'
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C6'
   *  Constant: '<S40>/uint34'
   *  Inport: '<Root>/icobc_stHvil'
   *  Logic: '<S40>/Logical Operator15'
   *  Logic: '<S40>/Logical Operator8'
   *  RelationalOperator: '<S40>/Relational Operator5'
   *
   * Block description for '<S1>/FALSE16':
   *  FALSE
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C6':
   *  [0]
   *
   * Block description for '<S40>/uint34':
   *  OBCInitial
   */
  if (HvCoorn_bHvilChkgEna_C && ((rtb_TmpSignalConversionAticob_c == ((uint8)0U))
       || false)) {
    /* ArithShift: '<S181>/Shift Arithmetic4' incorporates:
     *  Constant: '<S40>/uint4'
     *
     * Block description for '<S40>/uint4':
     *  Checking
     */
    rtb_ShiftArithmetic4 = ((uint8)2U);
  } else {
    (void)Rte_Read_icobc_stHvil_Value(&rtb_ShiftArithmetic2);

    /* Switch: '<S40>/Switch8' incorporates:
     *  Constant: '<S40>/hpp_tiWait4HvilHw_C8'
     *  Constant: '<S40>/uint36'
     *  Inport: '<Root>/icobc_stHvil'
     *  Logic: '<S40>/Logical Operator5'
     *  RelationalOperator: '<S40>/Relational Operator8'
     *
     * Block description for '<S40>/hpp_tiWait4HvilHw_C8':
     *  [1]
     *
     * Block description for '<S40>/uint36':
     *  OBCClosed
     */
    if ((rtb_ShiftArithmetic2 == ((uint8)1U)) || HvCoorn_bOBCHvilChkgShd_C) {
      /* ArithShift: '<S181>/Shift Arithmetic4' incorporates:
       *  Constant: '<S40>/uint10'
       *
       * Block description for '<S40>/uint10':
       *  Ok
       */
      rtb_ShiftArithmetic4 = ((uint8)1U);
    } else {
      /* ArithShift: '<S181>/Shift Arithmetic4' incorporates:
       *  Constant: '<S40>/uint27'
       *
       * Block description for '<S40>/uint27':
       *  NotOk
       */
      rtb_ShiftArithmetic4 = ((uint8)0U);
    }

    /* End of Switch: '<S40>/Switch8' */
  }

  /* End of Switch: '<S40>/Switch9' */

  /* RelationalOperator: '<S59>/Relational Operator' incorporates:
   *  Constant: '<S59>/single4'
   *  UnitDelay: '<S59>/Unit Delay'
   */
  rtb_RelationalOperator = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_p > 0);

  /* Logic: '<S40>/Logical Operator2' incorporates:
   *  UnitDelay: '<S3>/Unit Delay3'
   */
  rtb_LogicalOperator2 = !HvCoorn_bHvilClsReq;

  /* RelationalOperator: '<S60>/Relational Operator' incorporates:
   *  Constant: '<S60>/single4'
   *  UnitDelay: '<S60>/Unit Delay'
   */
  rtb_RelationalOperator_ox = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_a > 0);

  /* Switch: '<S40>/Switch4' incorporates:
   *  Constant: '<S1>/FALSE4'
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C1'
   *  Logic: '<S59>/Logical Operator2'
   *  Logic: '<S60>/Logical Operator2'
   *  Switch: '<S40>/Switch10'
   *  Switch: '<S40>/Switch11'
   *
   * Block description for '<S1>/FALSE4':
   *  FALSE
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C1':
   *  [1]
   */
  if (HvCoorn_bHvilHwStOvrd_C) {
    /* ArithShift: '<S181>/Shift Arithmetic3' incorporates:
     *  Constant: '<S40>/hpp_tiWait4HvilHw_C2'
     *
     * Block description for '<S40>/hpp_tiWait4HvilHw_C2':
     *  [1]
     */
    rtb_ShiftArithmetic3 = HvCoorn_stHvilHwStOvrdVal_C;
  } else if (rtb_RelationalOperator || rtb_LogicalOperator2) {
    /* Switch: '<S40>/Switch11' incorporates:
     *  ArithShift: '<S181>/Shift Arithmetic3'
     *  Constant: '<S40>/uint5'
     *
     * Block description for '<S40>/uint5':
     *  Checking
     */
    rtb_ShiftArithmetic3 = ((uint8)2U);
  } else if (rtb_RelationalOperator_ox || false) {
    /* Switch: '<S40>/Switch10' incorporates:
     *  ArithShift: '<S181>/Shift Arithmetic3'
     *  Constant: '<S40>/uint11'
     *  Switch: '<S40>/Switch11'
     *
     * Block description for '<S40>/uint11':
     *  Ok
     */
    rtb_ShiftArithmetic3 = ((uint8)1U);
  } else {
    /* ArithShift: '<S181>/Shift Arithmetic3' incorporates:
     *  Constant: '<S40>/uint32'
     *  Switch: '<S40>/Switch10'
     *  Switch: '<S40>/Switch11'
     *
     * Block description for '<S40>/uint32':
     *  NotOk
     */
    rtb_ShiftArithmetic3 = ((uint8)0U);
  }

  /* End of Switch: '<S40>/Switch4' */

  /* SignalConversion generated from: '<S1>/icrm_stMode' incorporates:
   *  Inport: '<Root>/icrm_stMode'
   */
  (void)Rte_Read_icrm_stMode_Value(&rtb_TmpSignalConversionAticrm_s);

  /* Switch: '<S40>/Switch15' incorporates:
   *  Constant: '<S40>/hpp_tiWait4HvilHw_C7'
   *  Constant: '<S40>/uint39'
   *  Inport: '<Root>/icrm_bHvilFlt'
   *  Logic: '<S40>/Logical Operator16'
   *  RelationalOperator: '<S40>/Relational Operator13'
   *
   * Block description for '<S40>/hpp_tiWait4HvilHw_C7':
   *  [0]
   *
   * Block description for '<S40>/uint39':
   *  MCUInitial
   */
  if (HvCoorn_bHvilChkgEna_C && (rtb_TmpSignalConversionAticrm_s <= ((uint8)1U)))
  {
    /* ArithShift: '<S181>/Shift Arithmetic2' incorporates:
     *  Constant: '<S40>/uint43'
     *
     * Block description for '<S40>/uint43':
     *  Checking
     */
    rtb_ShiftArithmetic2 = ((uint8)2U);
  } else {
    (void)Rte_Read_icrm_bHvilFlt_Value(&rtb_RelationalOperator27);

    /* Switch: '<S40>/Switch14' incorporates:
     *  Constant: '<S40>/hpp_tiWait4HvilHw_C14'
     *  Inport: '<Root>/icrm_bHvilFlt'
     *  Logic: '<S40>/AND1'
     *  Logic: '<S40>/AND2'
     *  Logic: '<S40>/OR4'
     *
     * Block description for '<S40>/hpp_tiWait4HvilHw_C14':
     *  [1]
     */
    if (rtb_RelationalOperator27 && ((rtb_OR && rtb_Equal2) ||
         HvCoorn_bHvilChkgVoltSwtShd_C)) {
      /* ArithShift: '<S181>/Shift Arithmetic2' incorporates:
       *  Constant: '<S40>/uint42'
       *
       * Block description for '<S40>/uint42':
       *  NotOk
       */
      rtb_ShiftArithmetic2 = ((uint8)0U);
    } else {
      /* ArithShift: '<S181>/Shift Arithmetic2' incorporates:
       *  Constant: '<S40>/uint44'
       *
       * Block description for '<S40>/uint44':
       *  Ok
       */
      rtb_ShiftArithmetic2 = ((uint8)1U);
    }

    /* End of Switch: '<S40>/Switch14' */
  }

  /* End of Switch: '<S40>/Switch15' */

  /* RelationalOperator: '<S40>/Relational Operator23' incorporates:
   *  Constant: '<S40>/uint35'
   *
   * Block description for '<S40>/uint35':
   *  NotOk
   */
  rtb_OR = (rtb_ShiftArithmetic7 == ((uint8)0U));

  /* RelationalOperator: '<S40>/Relational Operator26' incorporates:
   *  Constant: '<S40>/uint47'
   *
   * Block description for '<S40>/uint47':
   *  NotOk
   */
  rtb_Equal2 = (rtb_ShiftArithmetic6 == ((uint8)0U));

  /* RelationalOperator: '<S40>/Relational Operator27' incorporates:
   *  Constant: '<S40>/uint48'
   *
   * Block description for '<S40>/uint48':
   *  NotOk
   */
  rtb_RelationalOperator27 = (rtb_ShiftArithmetic2 == ((uint8)0U));

  /* RelationalOperator: '<S40>/Relational Operator28' incorporates:
   *  Constant: '<S40>/uint49'
   *
   * Block description for '<S40>/uint49':
   *  NotOk
   */
  rtb_RelationalOperator28 = (rtb_ShiftArithmetic4 == ((uint8)0U));

  /* RelationalOperator: '<S40>/Relational Operator29' incorporates:
   *  Constant: '<S40>/uint50'
   *
   * Block description for '<S40>/uint50':
   *  NotOk
   */
  rtb_RelationalOperator29 = (rtb_ShiftArithmetic5 == ((uint8)0U));

  /* RelationalOperator: '<S40>/Relational Operator30' incorporates:
   *  Constant: '<S40>/uint51'
   *
   * Block description for '<S40>/uint51':
   *  NotOk
   */
  rtb_RelationalOperator30 = (rtb_ShiftArithmetic3 == ((uint8)0U));

  /* RelationalOperator: '<S40>/Relational Operator21' incorporates:
   *  Constant: '<S40>/uint37'
   *
   * Block description for '<S40>/uint37':
   *  Ok
   */
  HvCoorn_bHvilHwErr = (rtb_ShiftArithmetic3 == ((uint8)1U));

  /* Switch: '<S40>/Switch13' incorporates:
   *  Constant: '<S40>/uint17'
   *  Constant: '<S40>/uint18'
   *  Constant: '<S40>/uint19'
   *  Constant: '<S40>/uint20'
   *  Constant: '<S40>/uint21'
   *  Constant: '<S40>/uint40'
   *  Logic: '<S40>/Logical Operator1'
   *  Logic: '<S40>/Logical Operator10'
   *  Logic: '<S40>/Logical Operator17'
   *  Logic: '<S40>/Logical Operator18'
   *  RelationalOperator: '<S40>/Relational Operator11'
   *  RelationalOperator: '<S40>/Relational Operator12'
   *  RelationalOperator: '<S40>/Relational Operator14'
   *  RelationalOperator: '<S40>/Relational Operator15'
   *  RelationalOperator: '<S40>/Relational Operator16'
   *  RelationalOperator: '<S40>/Relational Operator24'
   *
   * Block description for '<S40>/uint17':
   *  Ok
   *
   * Block description for '<S40>/uint18':
   *  Ok
   *
   * Block description for '<S40>/uint19':
   *  Ok
   *
   * Block description for '<S40>/uint20':
   *  Ok
   *
   * Block description for '<S40>/uint21':
   *  Ok
   *
   * Block description for '<S40>/uint40':
   *  Ok
   */
  if ((rtb_ShiftArithmetic7 == ((uint8)1U)) && (rtb_ShiftArithmetic6 == ((uint8)
        1U)) && (rtb_ShiftArithmetic5 == ((uint8)1U)) && (rtb_ShiftArithmetic4 ==
       ((uint8)1U)) && (rtb_ShiftArithmetic3 == ((uint8)1U)) &&
      (rtb_ShiftArithmetic2 == ((uint8)1U)) && (!rtb_AND3) && (!rtb_AND4) &&
      (!rtb_TmpSignalConversionAticis_b)) {
    /* Switch: '<S40>/Switch13' incorporates:
     *  Constant: '<S40>/uint22'
     *
     * Block description for '<S40>/uint22':
     *  Ok
     */
    HvCoorn_stHvil = ((uint8)1U);
  } else {
    /* Logic: '<S40>/Logical Operator3' */
    tmpForInput[0] = rtb_OR;
    tmpForInput[1] = rtb_Equal2;
    tmpForInput[2] = rtb_RelationalOperator27;
    tmpForInput[3] = rtb_RelationalOperator28;
    tmpForInput[4] = rtb_RelationalOperator29;
    tmpForInput[5] = rtb_RelationalOperator30;
    tmpForInput[6] = rtb_AND3;
    tmpForInput[7] = rtb_AND4;
    tmpForInput[8] = rtb_TmpSignalConversionAticis_b;
    rtb_Equal12_a = rtb_OR;
    for (rtb_DataTypeConversion_jq = 0; rtb_DataTypeConversion_jq < 8;
         rtb_DataTypeConversion_jq++) {
      rtb_Equal12_a = (rtb_Equal12_a || tmpForInput[rtb_DataTypeConversion_jq +
                       1]);
    }

    /* Switch: '<S40>/Switch12' incorporates:
     *  Logic: '<S40>/Logical Operator3'
     */
    if (rtb_Equal12_a) {
      /* Switch: '<S40>/Switch13' incorporates:
       *  Constant: '<S40>/uint23'
       *
       * Block description for '<S40>/uint23':
       *  NotOk
       */
      HvCoorn_stHvil = ((uint8)0U);
    } else {
      /* Switch: '<S40>/Switch13' incorporates:
       *  Constant: '<S40>/uint8'
       *
       * Block description for '<S40>/uint8':
       *  Checking
       */
      HvCoorn_stHvil = ((uint8)2U);
    }

    /* End of Switch: '<S40>/Switch12' */
  }

  /* End of Switch: '<S40>/Switch13' */

  /* Switch: '<S58>/Switch' incorporates:
   *  Constant: '<S40>/uint33'
   *  RelationalOperator: '<S40>/Relational Operator9'
   *
   * Block description for '<S40>/uint33':
   *  Ok
   */
  if (HvCoorn_stHvil == ((uint8)1U)) {
    /* Sum: '<S58>/Subtract1' incorporates:
     *  Constant: '<S58>/single1'
     *  UnitDelay: '<S58>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_i < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_i)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_i > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_i)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_i + 1;
    }

    /* End of Sum: '<S58>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S58>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S58>/Switch' */

  /* Update for UnitDelay: '<S58>/Unit Delay' incorporates:
   *  Saturate: '<S58>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_i = rtb_DataTypeConversion_jq;

  /* Switch: '<S59>/Switch' incorporates:
   *  Switch: '<S59>/Switch1'
   */
  if (rtb_LogicalOperator2) {
    /* Product: '<S59>/Divide' incorporates:
     *  Constant: '<S40>/hpp_tiWait4HvilHw_C'
     *
     * Block description for '<S40>/hpp_tiWait4HvilHw_C':
     *  [0.08]
     */
    tmpRead_i = HvCoorn_tiWait4HvilHw_C / HvCoorn_ConstB.Max_n;

    /* DataTypeConversion: '<S59>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S59>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S59>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_p = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S59>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S59>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_p = 0;
      }
    } else {
      /* Update for UnitDelay: '<S59>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       *  Saturate: '<S59>/Saturation2'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_p = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S59>/DataTypeConversion' */
  } else if (rtb_RelationalOperator) {
    /* Update for UnitDelay: '<S59>/Unit Delay' incorporates:
     *  Constant: '<S59>/single5'
     *  Saturate: '<S59>/Saturation2'
     *  Sum: '<S59>/Subtract'
     *  Switch: '<S59>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_p -= 1;
  }

  /* End of Switch: '<S59>/Switch' */

  /* Switch: '<S60>/Switch' incorporates:
   *  Constant: '<S1>/FALSE4'
   *  Switch: '<S60>/Switch1'
   *
   * Block description for '<S1>/FALSE4':
   *  FALSE
   */
  if (false) {
    /* Product: '<S60>/Divide' incorporates:
     *  Constant: '<S40>/hpp_tiDelay4HvilHw_C'
     *
     * Block description for '<S40>/hpp_tiDelay4HvilHw_C':
     *  [0.1]
     */
    tmpRead_i = HvCoorn_tiDly4HvilHw_C / HvCoorn_ConstB.Max_c;

    /* DataTypeConversion: '<S60>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S60>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S60>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_a = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S60>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S60>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_a = 0;
      }
    } else {
      /* Update for UnitDelay: '<S60>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       *  Saturate: '<S60>/Saturation2'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_a = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S60>/DataTypeConversion' */
  } else if (rtb_RelationalOperator_ox) {
    /* Update for UnitDelay: '<S60>/Unit Delay' incorporates:
     *  Constant: '<S60>/single5'
     *  Saturate: '<S60>/Saturation2'
     *  Sum: '<S60>/Subtract'
     *  Switch: '<S60>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_a -= 1;
  }

  /* End of Switch: '<S60>/Switch' */

  /* Product: '<S58>/Divide' incorporates:
   *  Constant: '<S40>/hpp_tiHvilOkDelay_C'
   *
   * Block description for '<S40>/hpp_tiHvilOkDelay_C':
   *  [0.03]
   */
  tmpRead_i = HvCoorn_tiHvilOkDly_C / HvCoorn_ConstB.Max;

  /* DataTypeConversion: '<S58>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S40>/logic4' incorporates:
   *  Constant: '<S40>/hpp_bManuHvilOk_C'
   *  DataTypeConversion: '<S58>/DataTypeConversion'
   *  RelationalOperator: '<S58>/Relational Operator1'
   *  Saturate: '<S58>/Saturation2'
   *
   * Block description for '<S40>/hpp_bManuHvilOk_C':
   *  [0]
   */
  HvCoorn_bHvilStOk = ((rtb_DataTypeConversion_jq > (sint32)tmpRead_i) ||
                       HvCoorn_bManHvilOk_C);

  /* Logic: '<S136>/Logical_Operator5' incorporates:
   *  Constant: '<S1>/single2'
   *  Constant: '<S1>/single3'
   *  Constant: '<S41>/hpp_tAcLinkTempErrHi_C'
   *  RelationalOperator: '<S63>/Relational Operator1'
   *
   * Block description for '<S41>/hpp_tAcLinkTempErrHi_C':
   *  [5000]
   */
  rtb_Logical_Operator5_io_idx_0 = (HvCoorn_tAcLinkTempErrHi_C <= 25.0F);
  rtb_Logical_Operator5_io_idx_1 = (HvCoorn_tAcLinkTempErrHi_C <= 25.0F);

  /* Switch: '<S63>/Switch1' incorporates:
   *  Constant: '<S1>/single2'
   *  Constant: '<S1>/single3'
   *  Constant: '<S41>/hpp_tAcLinkTempErrLo_C'
   *  Logic: '<S63>/Logical Operator1'
   *  RelationalOperator: '<S63>/Relational Operator'
   *
   * Block description for '<S41>/hpp_tAcLinkTempErrLo_C':
   *  [4950]
   */
  if (rtb_Logical_Operator5_io_idx_0 || (25.0F <= HvCoorn_tAcLinkTempErrLo_C)) {
    /* Switch: '<S63>/Switch1' */
    rtb_Switch1_bl_idx_0 = rtb_Logical_Operator5_io_idx_0;
  } else {
    /* Switch: '<S63>/Switch1' incorporates:
     *  UnitDelay: '<S63>/Unit Delay1'
     */
    rtb_Switch1_bl_idx_0 = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_b[0];
  }

  if ((!rtb_Logical_Operator5_io_idx_1) && (25.0F > HvCoorn_tAcLinkTempErrLo_C))
  {
    /* Switch: '<S63>/Switch1' incorporates:
     *  UnitDelay: '<S63>/Unit Delay1'
     */
    rtb_Logical_Operator5_io_idx_1 = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_b[1];
  }

  /* End of Switch: '<S63>/Switch1' */

  /* SignalConversion generated from: '<S1>/VehSpd_vVeh' incorporates:
   *  Inport: '<Root>/VehSpd_vVeh'
   */
  (void)Rte_Read_VehSpd_vVeh_Value(&rtb_TmpSignalConversionAtVehSpd);

  /* Abs: '<S44>/Abs1' incorporates:
   *  Abs: '<S27>/Abs'
   */
  tmpRead_tmp = fabsf(rtb_TmpSignalConversionAtVehSpd);

  /* Switch: '<S78>/Switch' incorporates:
   *  Abs: '<S44>/Abs1'
   *  Constant: '<S44>/hpp_vVldChgLinkThr_C'
   *  RelationalOperator: '<S44>/Relational Operator1'
   *
   * Block description for '<S44>/hpp_vVldChgLinkThr_C':
   *  [3]
   */
  if (tmpRead_tmp <= HvCoorn_vVldChrgLinkThd_C) {
    /* Sum: '<S78>/Subtract1' incorporates:
     *  Constant: '<S78>/single1'
     *  UnitDelay: '<S78>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_o < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_o)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_o > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_o)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_o + 1;
    }

    /* End of Sum: '<S78>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S78>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S78>/Switch' */

  /* Update for UnitDelay: '<S78>/Unit Delay' incorporates:
   *  Saturate: '<S78>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_o = rtb_DataTypeConversion_jq;

  /* Product: '<S78>/Divide' incorporates:
   *  Constant: '<S44>/hpp_tiSpdVld4ChgLinkChk_C'
   *
   * Block description for '<S44>/hpp_tiSpdVld4ChgLinkChk_C':
   *  [0.1]
   */
  tmpRead_i = HvCoorn_tiSpdVld4ChrgLinkChk_C / HvCoorn_ConstB.Max_c4;

  /* DataTypeConversion: '<S78>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S54>/Equal3' incorporates:
   *  DataTypeConversion: '<S78>/DataTypeConversion'
   *  RelationalOperator: '<S78>/Relational Operator1'
   *  Saturate: '<S78>/Saturation2'
   */
  rtb_Equal3_a = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Switch: '<S79>/Switch' incorporates:
   *  Constant: '<S1>/single8'
   *  Constant: '<S44>/hpp_uCpConnectCheck_C'
   *  RelationalOperator: '<S44>/Relational Operator6'
   *
   * Block description for '<S44>/hpp_uCpConnectCheck_C':
   *  [1000]
   */
  if (0.0F >= HvCoorn_uCpConnectChk_C) {
    /* Sum: '<S79>/Subtract1' incorporates:
     *  Constant: '<S79>/single1'
     *  UnitDelay: '<S79>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_f < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_f)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_f > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_f)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_f + 1;
    }

    /* End of Sum: '<S79>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S79>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S79>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/icobc_bVehCnct' */
  (void)Rte_Read_icobc_bVehCnct_Value(&rtb_Logical_Operator4);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S79>/Unit Delay' incorporates:
   *  Saturate: '<S79>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_f = rtb_DataTypeConversion_jq;

  /* SignalConversion generated from: '<S1>/icobc_bChrgrCtrlSigCnct' incorporates:
   *  Inport: '<Root>/icobc_bChrgrCtrlSigCnct'
   */
  (void)Rte_Read_icobc_bChrgrCtrlSigCnct_Value(&rtb_TmpSignalConversionAticob_p);

  /* SignalConversion generated from: '<S1>/icobc_stChrgrCnct' incorporates:
   *  Inport: '<Root>/icobc_stChrgrCnct'
   */
  (void)Rte_Read_icobc_stChrgrCnct_Value(&rtb_TmpSignalConversionAtico_my);

  /* RelationalOperator: '<S52>/Equal3' incorporates:
   *  Constant: '<S7>/Constant1'
   *  Constant: '<S7>/Constant10'
   *  Logic: '<S7>/OR1'
   *  RelationalOperator: '<S7>/Relational Operator15'
   *  RelationalOperator: '<S7>/Relational Operator9'
   *
   * Block description for '<S7>/Constant1':
   *  [2]
   *
   * Block description for '<S7>/Constant10':
   *  [1]
   */
  rtb_Equal3_lx = ((rtb_TmpSignalConversionAtico_my == ((uint8)1U)) ||
                   (rtb_TmpSignalConversionAtico_my == ((uint8)2U)));

  /* Logic: '<S6>/Logical Operator6' incorporates:
   *  Logic: '<S44>/OR'
   */
  rtb_LogicalOperator6_hy = (rtb_Equal3_lx || rtb_Logical_Operator4);

  /* SignalConversion generated from: '<S1>/icbms_stDcChrgrCnct' incorporates:
   *  Inport: '<Root>/icbms_stDcChrgrCnct'
   */
  (void)Rte_Read_icbms_stDcChrgrCnct_Value(&rtb_TmpSignalConversionAticbm_l);

  /* Logic: '<S30>/AND26' incorporates:
   *  Constant: '<S44>/uint6'
   *  RelationalOperator: '<S44>/Relational Operator5'
   *
   * Block description for '<S44>/uint6':
   *  DCPlug_WakeupActive
   */
  rtb_AND26_o = (rtb_TmpSignalConversionAticbm_l == ((uint8)2U));

  /* Product: '<S79>/Divide' incorporates:
   *  Constant: '<S44>/hpp_tiCpConnectCheck_C'
   *
   * Block description for '<S44>/hpp_tiCpConnectCheck_C':
   *  [0.1]
   */
  tmpRead_i = HvCoorn_tiCpConnectChk_C / HvCoorn_ConstB.Max_fe;

  /* DataTypeConversion: '<S79>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S44>/Logical Operator3' incorporates:
   *  Constant: '<S44>/hpp_tiSpdVld4ChgLinkChk_C3'
   *  DataTypeConversion: '<S79>/DataTypeConversion'
   *  Logic: '<S44>/Logical Operator1'
   *  Logic: '<S44>/Not'
   *  Logic: '<S44>/OR1'
   *  RelationalOperator: '<S79>/Relational Operator1'
   *  Saturate: '<S79>/Saturation2'
   *
   * Block description for '<S44>/hpp_tiSpdVld4ChgLinkChk_C3':
   *  [0]
   */
  HvCoorn_bACChrgLink = (rtb_Equal3_a && ((rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i) || rtb_TmpSignalConversionAticob_p || rtb_LogicalOperator6_hy) &&
    ((!rtb_AND26_o) || HvCoorn_bDCDcnct4ACEna_C));

  /* Switch: '<S65>/Switch' */
  if (HvCoorn_bACChrgLink) {
    /* Sum: '<S65>/Subtract1' incorporates:
     *  Constant: '<S65>/single1'
     *  UnitDelay: '<S65>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_d < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_d)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_d > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_d)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_d + 1;
    }

    /* End of Sum: '<S65>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S65>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S65>/Switch' */

  /* Update for UnitDelay: '<S65>/Unit Delay' incorporates:
   *  Saturate: '<S65>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_d = rtb_DataTypeConversion_jq;

  /* Product: '<S65>/Divide' incorporates:
   *  Constant: '<S41>/hpp_tiLoadAcLinkTemp_C'
   *
   * Block description for '<S41>/hpp_tiLoadAcLinkTemp_C':
   *  [0.1]
   */
  tmpRead_i = HvCoorn_tiLoadAcLinkTemp_C / HvCoorn_ConstB.Max_a;

  /* DataTypeConversion: '<S65>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Switch: '<S41>/Switch2' incorporates:
   *  DataTypeConversion: '<S65>/DataTypeConversion'
   *  Logic: '<S41>/Logical Operator1'
   *  RelationalOperator: '<S65>/Relational Operator1'
   *  Saturate: '<S65>/Saturation2'
   */
  if (rtb_DataTypeConversion_jq <= (sint32)tmpRead_i) {
    /* Switch: '<S41>/Switch2' incorporates:
     *  Constant: '<S1>/single2'
     *  Constant: '<S1>/single3'
     */
    rtb_tLoadInitAcTemp_idx_0 = 25.0F;
    rtb_tLoadInitAcTemp_idx_1 = 25.0F;
  } else {
    /* Switch: '<S41>/Switch2' incorporates:
     *  UnitDelay: '<S41>/Unit Delay3'
     */
    rtb_tLoadInitAcTemp_idx_0 = HvCoorn_ARID_DEF.UnitDelay3_DSTATE[0];
    rtb_tLoadInitAcTemp_idx_1 = HvCoorn_ARID_DEF.UnitDelay3_DSTATE[1];
  }

  /* End of Switch: '<S41>/Switch2' */

  /* Sum: '<S41>/Sum3' incorporates:
   *  Constant: '<S1>/single2'
   *  Constant: '<S1>/single3'
   *  Sum: '<S41>/Sum1'
   */
  rtb_Sum3_idx_0 = 25.0F - rtb_tLoadInitAcTemp_idx_0;
  rtb_Sum3_idx_1 = 25.0F - rtb_tLoadInitAcTemp_idx_1;

  /* RelationalOperator: '<S150>/Relational Operator' incorporates:
   *  Constant: '<S41>/hpp_tAcLinkTepmIncErrHi_C'
   *  RelationalOperator: '<S64>/Relational Operator1'
   *
   * Block description for '<S41>/hpp_tAcLinkTepmIncErrHi_C':
   *  [5000]
   */
  rtb_RelationalOperator_p0 = (HvCoorn_tAcLinkTepmIncErrHi_C <= rtb_Sum3_idx_0);

  /* Switch: '<S64>/Switch1' incorporates:
   *  Constant: '<S41>/hpp_tAcLinkTepmIncErrLo_C'
   *  Logic: '<S64>/Logical Operator1'
   *  RelationalOperator: '<S64>/Relational Operator'
   *  RelationalOperator: '<S64>/Relational Operator1'
   *
   * Block description for '<S41>/hpp_tAcLinkTepmIncErrLo_C':
   *  [4950]
   */
  if ((!rtb_RelationalOperator_p0) && (rtb_Sum3_idx_0 >
       HvCoorn_tAcLinkTepmIncErrLo_C)) {
    /* Switch: '<S64>/Switch1' incorporates:
     *  UnitDelay: '<S64>/Unit Delay1'
     */
    rtb_RelationalOperator_p0 = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_f[0];
  }

  /* RelationalOperator: '<S150>/Relational Operator' incorporates:
   *  Logic: '<S41>/Logical Operator59'
   */
  rtb_RelationalOperator_ce_idx_0 = (rtb_Switch1_bl_idx_0 ||
    rtb_RelationalOperator_p0);

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Switch: '<S64>/Switch1' */
  rtb_Logical_Operator5_io_idx_0 = rtb_RelationalOperator_p0;

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* RelationalOperator: '<S150>/Relational Operator' incorporates:
   *  Constant: '<S41>/hpp_tAcLinkTepmIncErrHi_C'
   *  RelationalOperator: '<S64>/Relational Operator1'
   *
   * Block description for '<S41>/hpp_tAcLinkTepmIncErrHi_C':
   *  [5000]
   */
  rtb_RelationalOperator_p0 = (HvCoorn_tAcLinkTepmIncErrHi_C <= rtb_Sum3_idx_1);

  /* Switch: '<S64>/Switch1' incorporates:
   *  Constant: '<S41>/hpp_tAcLinkTepmIncErrLo_C'
   *  Logic: '<S64>/Logical Operator1'
   *  RelationalOperator: '<S64>/Relational Operator'
   *  RelationalOperator: '<S64>/Relational Operator1'
   *
   * Block description for '<S41>/hpp_tAcLinkTepmIncErrLo_C':
   *  [4950]
   */
  if ((!rtb_RelationalOperator_p0) && (rtb_Sum3_idx_1 >
       HvCoorn_tAcLinkTepmIncErrLo_C)) {
    /* Switch: '<S64>/Switch1' incorporates:
     *  UnitDelay: '<S64>/Unit Delay1'
     */
    rtb_RelationalOperator_p0 = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_f[1];
  }

  /* Switch: '<S66>/Switch' incorporates:
   *  Logic: '<S41>/Logical Operator59'
   *  Logic: '<S41>/Logical Operator60'
   */
  if (rtb_RelationalOperator_ce_idx_0 || (rtb_Logical_Operator5_io_idx_1 ||
       rtb_RelationalOperator_p0)) {
    /* Sum: '<S66>/Subtract1' incorporates:
     *  Constant: '<S66>/single1'
     *  UnitDelay: '<S66>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_h < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_h)) {
      /* Switch: '<S67>/Switch' */
      rtb_Switch_e5 = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_h > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_h)) {
      /* Switch: '<S67>/Switch' */
      rtb_Switch_e5 = MAX_int32_T;
    } else {
      /* Switch: '<S67>/Switch' */
      rtb_Switch_e5 = HvCoorn_ARID_DEF.UnitDelay_DSTATE_h + 1;
    }

    /* End of Sum: '<S66>/Subtract1' */
  } else {
    /* Switch: '<S67>/Switch' incorporates:
     *  Constant: '<S66>/single2'
     */
    rtb_Switch_e5 = 0;
  }

  /* End of Switch: '<S66>/Switch' */

  /* Update for UnitDelay: '<S66>/Unit Delay' incorporates:
   *  Saturate: '<S66>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_h = rtb_Switch_e5;

  /* Product: '<S66>/Divide' incorporates:
   *  Constant: '<S41>/hpp_tiChgLinkOverTempDeb_C'
   *
   * Block description for '<S41>/hpp_tiChgLinkOverTempDeb_C':
   *  [10000]
   */
  tmpRead_i = HvCoorn_tiChgLinkOverTempDeb_C / HvCoorn_ConstB.Max_p;

  /* DataTypeConversion: '<S66>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S66>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S66>/DataTypeConversion'
   *  Saturate: '<S66>/Saturation2'
   */
  HvCoorn_bACLinkTempErr = (rtb_Switch_e5 > (sint32)tmpRead_i);

  /* SignalConversion generated from: '<S1>/ian_tDcChrgrTemp1' incorporates:
   *  Inport: '<Root>/ian_tDcChrgrTemp1'
   */
  (void)Rte_Read_ian_tDcChrgrTemp1_Value(&rtb_TmpSignalConversionAtian_tD);

  /* SignalConversion generated from: '<S1>/ian_tDcChrgrTemp2' incorporates:
   *  Inport: '<Root>/ian_tDcChrgrTemp2'
   */
  (void)Rte_Read_ian_tDcChrgrTemp2_Value(&rtb_TmpSignalConversionAtian__o);

  /* Logic: '<S44>/Logical Operator7' incorporates:
   *  Constant: '<S44>/hpp_tiSpdVld4ChgLinkChk_C1'
   *  Constant: '<S44>/hpp_tiSpdVld4ChgLinkChk_C2'
   *  Constant: '<S44>/uint5'
   *  Logic: '<S44>/AND'
   *  Logic: '<S44>/Logical Operator9'
   *  RelationalOperator: '<S44>/Relational Operator9'
   *
   * Block description for '<S44>/hpp_tiSpdVld4ChgLinkChk_C1':
   *  [1]
   *
   * Block description for '<S44>/hpp_tiSpdVld4ChgLinkChk_C2':
   *  [1]
   *
   * Block description for '<S44>/uint5':
   *  DCPlug_WakeupInactive
   */
  HvCoorn_bDCChrgLink = ((((rtb_TmpSignalConversionAticbm_l == ((uint8)1U)) &&
    HvCoorn_bDcChrgWkupEnaChrgLink_C) || rtb_AND26_o) && rtb_Equal3_a &&
    HvCoorn_bDCChrgFctCfg_C);

  /* Switch: '<S68>/Switch' */
  if (HvCoorn_bDCChrgLink) {
    /* Sum: '<S68>/Subtract1' incorporates:
     *  Constant: '<S68>/single1'
     *  UnitDelay: '<S68>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_fw < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_fw)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_fw > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_fw)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_fw + 1;
    }

    /* End of Sum: '<S68>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S68>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S68>/Switch' */

  /* Update for UnitDelay: '<S68>/Unit Delay' incorporates:
   *  Saturate: '<S68>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_fw = rtb_DataTypeConversion_jq;

  /* Product: '<S68>/Divide' incorporates:
   *  Constant: '<S41>/hpp_tiLoadAcLinkTemp_C1'
   *
   * Block description for '<S41>/hpp_tiLoadAcLinkTemp_C1':
   *  [0.1]
   */
  tmpRead_i = HvCoorn_tiLoadDcLinkTemp_C / HvCoorn_ConstB.Max_i;

  /* DataTypeConversion: '<S68>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Switch: '<S41>/Switch1' incorporates:
   *  DataTypeConversion: '<S68>/DataTypeConversion'
   *  Logic: '<S41>/Logical Operator3'
   *  RelationalOperator: '<S68>/Relational Operator1'
   *  Saturate: '<S68>/Saturation2'
   */
  if (rtb_DataTypeConversion_jq <= (sint32)tmpRead_i) {
    /* Switch: '<S41>/Switch1' */
    rtb_Sum3_idx_0 = rtb_TmpSignalConversionAtian_tD;
    rtb_Sum3_idx_1 = rtb_TmpSignalConversionAtian__o;
  } else {
    /* Switch: '<S41>/Switch1' incorporates:
     *  UnitDelay: '<S41>/Unit Delay1'
     */
    rtb_Sum3_idx_0 = HvCoorn_ARID_DEF.UnitDelay1_DSTATE[0];
    rtb_Sum3_idx_1 = HvCoorn_ARID_DEF.UnitDelay1_DSTATE[1];
  }

  /* End of Switch: '<S41>/Switch1' */

  /* Switch: '<S67>/Switch' incorporates:
   *  Constant: '<S41>/hpp_tAcLinkTepmIncErrLo_C1'
   *  Constant: '<S41>/hpp_tAcLinkTepmIncErrLo_C2'
   *  Logic: '<S41>/Logical Operator5'
   *  Logic: '<S41>/Logical Operator6'
   *  RelationalOperator: '<S41>/GreaterOrEqual'
   *  RelationalOperator: '<S41>/GreaterOrEqual1'
   *  Sum: '<S41>/Sum3'
   *
   * Block description for '<S41>/hpp_tAcLinkTepmIncErrLo_C1':
   *  [5000]
   *
   * Block description for '<S41>/hpp_tAcLinkTepmIncErrLo_C2':
   *  [5000]
   */
  if ((rtb_TmpSignalConversionAtian_tD >= HvCoorn_tDcLinkTempErr_C) ||
      (rtb_TmpSignalConversionAtian_tD - rtb_Sum3_idx_0 >=
       HvCoorn_tDcLinkTempIncErr_C) || ((rtb_TmpSignalConversionAtian__o >=
        HvCoorn_tDcLinkTempErr_C) || (rtb_TmpSignalConversionAtian__o -
        rtb_Sum3_idx_1 >= HvCoorn_tDcLinkTempIncErr_C))) {
    /* Sum: '<S67>/Subtract1' incorporates:
     *  Constant: '<S67>/single1'
     *  UnitDelay: '<S67>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_g < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_g)) {
      /* Switch: '<S67>/Switch' */
      rtb_Switch_e5 = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_g > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_g)) {
      /* Switch: '<S67>/Switch' */
      rtb_Switch_e5 = MAX_int32_T;
    } else {
      /* Switch: '<S67>/Switch' */
      rtb_Switch_e5 = HvCoorn_ARID_DEF.UnitDelay_DSTATE_g + 1;
    }

    /* End of Sum: '<S67>/Subtract1' */
  } else {
    /* Switch: '<S67>/Switch' incorporates:
     *  Constant: '<S67>/single2'
     */
    rtb_Switch_e5 = 0;
  }

  /* End of Switch: '<S67>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/icepb_stEpbSys' */
  (void)Rte_Read_icepb_stEpbSys_Value(&rtb_switch1);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Product: '<S67>/Divide' incorporates:
   *  Constant: '<S41>/hpp_tiChgLinkOverTempDeb_C1'
   *
   * Block description for '<S41>/hpp_tiChgLinkOverTempDeb_C1':
   *  [10000]
   */
  tmpRead_i = HvCoorn_tiChgLinkOverTempDeb_C / HvCoorn_ConstB.Max_f;

  /* DataTypeConversion: '<S67>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S67>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S67>/DataTypeConversion'
   *  Saturate: '<S67>/Saturation2'
   */
  HvCoorn_bDCLinkTempErr = (rtb_Switch_e5 > (sint32)tmpRead_i);

  /* SignalConversion generated from: '<S1>/GearLvr_stDrvGear' incorporates:
   *  Inport: '<Root>/GearLvr_stDrvGear'
   */
  (void)Rte_Read_GearLvr_stDrvGear_Value(&rtb_TmpSignalConversionAtGearLv);

  /* Logic: '<S42>/Logical Operator4' incorporates:
   *  Constant: '<S42>/hpp_bEpbPark4ChDchgEna_C'
   *  Constant: '<S42>/hpp_bEpbPark4ChDchgEna_C1'
   *  Constant: '<S42>/hpp_bEpbPark4ChDchgEna_C2'
   *  Constant: '<S42>/hpp_bEpbPark4ChDchgEna_C4'
   *  Logic: '<S42>/Logical Operator2'
   *  RelationalOperator: '<S42>/Relational Operator1'
   *  RelationalOperator: '<S42>/Relational Operator3'
   *  RelationalOperator: '<S42>/Relational Operator7'
   *
   * Block description for '<S42>/hpp_bEpbPark4ChDchgEna_C':
   *  [1]
   *
   * Block description for '<S42>/hpp_bEpbPark4ChDchgEna_C1':
   *  [1]
   *
   * Block description for '<S42>/hpp_bEpbPark4ChDchgEna_C2':
   *  [6]
   *
   * Block description for '<S42>/hpp_bEpbPark4ChDchgEna_C4':
   *  [4]
   */
  HvCoorn_bParkedActv = (((rtb_switch1 == ((uint8)1U)) &&
    HvCoorn_bEpbPark4ChDchgEna_C) || (rtb_TmpSignalConversionAtGearLv == ((uint8)
    6U)) || (rtb_TmpSignalConversionAtGearLv == ((uint8)4U)));

  /* SignalConversion generated from: '<S1>/idi_bKeyOn' incorporates:
   *  Inport: '<Root>/idi_bKeyOn'
   */
  (void)Rte_Read_idi_bKeyOn_Value(&rtb_TmpSignalConversionAtidi_bK);

  /* SignalConversion generated from: '<S1>/icobc_bDchrgrCnct' incorporates:
   *  Inport: '<Root>/icobc_bDchrgrCnct'
   */
  (void)Rte_Read_icobc_bDchrgrCnct_Value(&rtb_TmpSignalConversionAticob_m);

  /* Logic: '<S71>/Logical_Operator4' incorporates:
   *  Logic: '<S42>/Logical Operator1'
   *  Logic: '<S42>/Logical Operator5'
   *  Logic: '<S71>/Logical Operator1'
   *  Logic: '<S71>/Logical_Operator5'
   *  UnitDelay: '<S71>/Unit Delay'
   */
  rtb_Logical_Operator4 = ((HvCoorn_bACChrgLink || HvCoorn_bDCChrgLink ||
    rtb_TmpSignalConversionAticob_m) && (HvCoorn_bParkedActv ||
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_bj));

  /* Switch: '<S42>/Switch1' incorporates:
   *  Constant: '<S42>/hpp_bKeyOffParkNoChk_C'
   *  Logic: '<S42>/Logical Operator3'
   *
   * Block description for '<S42>/hpp_bKeyOffParkNoChk_C':
   *  [0]
   */
  if (rtb_TmpSignalConversionAtidi_bK) {
    tmp_0 = HvCoorn_bParkedActv;
  } else {
    tmp_0 = (rtb_Logical_Operator4 || HvCoorn_bKeyOffParkNoChk_C);
  }

  /* Logic: '<S42>/AND' incorporates:
   *  Constant: '<S42>/hpp_bEpbPark4ChDchgEna_C3'
   *  RelationalOperator: '<S42>/Lower'
   *  Switch: '<S42>/Switch1'
   *
   * Block description for '<S42>/hpp_bEpbPark4ChDchgEna_C3':
   *  [3]
   */
  HvCoorn_bParked4ChDchgRaw = (tmp_0 && (rtb_TmpSignalConversionAtVehSpd <
    HvCoorn_vMax4ChDchgEna_C));

  /* Switch: '<S42>/Switch4' incorporates:
   *  Constant: '<S42>/dhc_bParkChk4ChDchgMan_C'
   *
   * Block description for '<S42>/dhc_bParkChk4ChDchgMan_C':
   *  [0]
   */
  if (HvCoorn_bParkChk4ChDchgOvrd_C) {
    /* Switch: '<S42>/Switch4' incorporates:
     *  Constant: '<S42>/dhc_bParkChk4ChDchgMan_C1'
     *
     * Block description for '<S42>/dhc_bParkChk4ChDchgMan_C1':
     *  [1]
     */
    HvCoorn_bParked4ChDchg = HvCoorn_bParkChk4ChDchgOvrdVal_C;
  } else {
    /* Switch: '<S42>/Switch4' */
    HvCoorn_bParked4ChDchg = HvCoorn_bParked4ChDchgRaw;
  }

  /* End of Switch: '<S42>/Switch4' */

  /* Switch: '<S76>/Switch' */
  if (HvCoorn_ConstB.RelationalOperator2) {
    /* Sum: '<S76>/Subtract1' incorporates:
     *  Constant: '<S76>/single1'
     *  UnitDelay: '<S76>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_o2 < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_o2)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_o2 > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_o2)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_o2 + 1;
    }

    /* End of Sum: '<S76>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S76>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S76>/Switch' */

  /* Update for UnitDelay: '<S76>/Unit Delay' incorporates:
   *  Saturate: '<S76>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_o2 = rtb_DataTypeConversion_jq;

  /* Product: '<S76>/Divide' incorporates:
   *  Constant: '<S43>/hpp_tiWarmChoseConfirm_C'
   *
   * Block description for '<S43>/hpp_tiWarmChoseConfirm_C':
   *  [0.05]
   */
  tmpRead_i = HvCoorn_tiWarmChoseCfm_C / HvCoorn_ConstB.Max_j;

  /* DataTypeConversion: '<S76>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S30>/AND9' incorporates:
   *  DataTypeConversion: '<S76>/DataTypeConversion'
   *  RelationalOperator: '<S76>/Relational Operator1'
   *  Saturate: '<S76>/Saturation2'
   */
  rtb_AND9_c = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Logic: '<S74>/Logical_Operator4' incorporates:
   *  Logic: '<S74>/Logical_Operator5'
   *  UnitDelay: '<S74>/Unit Delay'
   */
  rtb_RelationalOperator = (HvCoorn_ConstB.LogicalOperator1 && (rtb_AND9_c ||
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_l0));

  /* Switch: '<S43>/switch1' incorporates:
   *  Logic: '<S43>/Logical Operator5'
   *  Switch: '<S43>/switch2'
   */
  if (rtb_AND9_c) {
    /* Switch: '<S43>/switch1' incorporates:
     *  Constant: '<S1>/uint13'
     */
    rtb_switch1 = ((uint8)0U);
  } else if (!rtb_RelationalOperator) {
    /* Switch: '<S43>/switch2' incorporates:
     *  Constant: '<S1>/uint11'
     *  Switch: '<S43>/switch1'
     */
    rtb_switch1 = ((uint8)0U);
  } else {
    /* Switch: '<S43>/switch1' incorporates:
     *  UnitDelay: '<S43>/Unit Delay1'
     */
    rtb_switch1 = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_c;
  }

  /* End of Switch: '<S43>/switch1' */

  /* Saturate: '<S43>/Saturation2' */
  if (rtb_switch1 <= ((uint8)15U)) {
    /* Saturate: '<S43>/Saturation2' */
    HvCoorn_stWarmTimeCfgResp = rtb_switch1;
  } else {
    /* Saturate: '<S43>/Saturation2' */
    HvCoorn_stWarmTimeCfgResp = ((uint8)15U);
  }

  /* End of Saturate: '<S43>/Saturation2' */

  /* Switch: '<S43>/Switch' incorporates:
   *  Constant: '<S1>/FALSE1'
   *  Constant: '<S43>/hpp_bWarmTimeConfigEna_C'
   *  Switch: '<S43>/Switch2'
   *
   * Block description for '<S1>/FALSE1':
   *  FALSE
   *
   * Block description for '<S43>/hpp_bWarmTimeConfigEna_C':
   *  [0]
   */
  if (HvCoorn_bWarmTimeCfgEna_C) {
    /* ArithShift: '<S181>/Shift Arithmetic2' incorporates:
     *  Constant: '<S43>/hpp_stDefltWarmTime_C1'
     *
     * Block description for '<S43>/hpp_stDefltWarmTime_C1':
     *  [12]
     */
    rtb_ShiftArithmetic2 = HvCoorn_stDftWarmTime_C;
  } else {
    if (false) {
      /* Switch: '<S43>/Switch2' incorporates:
       *  Constant: '<S43>/hpp_stDefltWarmTime_C'
       *
       * Block description for '<S43>/hpp_stDefltWarmTime_C':
       *  [12]
       */
      rtb_ShiftArithmetic7 = HvCoorn_stDftWarmTime_C;
    } else {
      /* Switch: '<S43>/Switch2' */
      rtb_ShiftArithmetic7 = HvCoorn_stWarmTimeCfgResp;
    }

    /* Switch: '<S43>/Switch1' incorporates:
     *  Constant: '<S43>/uint2'
     *  RelationalOperator: '<S43>/Relational Operator4'
     *
     * Block description for '<S43>/uint2':
     *  WarmOff
     */
    if (rtb_ShiftArithmetic7 == ((uint8)15U)) {
      /* ArithShift: '<S181>/Shift Arithmetic2' incorporates:
       *  Constant: '<S43>/uint3'
       */
      rtb_ShiftArithmetic2 = ((uint8)0U);
    } else {
      /* ArithShift: '<S181>/Shift Arithmetic2' */
      rtb_ShiftArithmetic2 = rtb_ShiftArithmetic7;
    }

    /* End of Switch: '<S43>/Switch1' */
  }

  /* End of Switch: '<S43>/Switch' */

  /* SignalConversion generated from: '<S1>/icbms_pctHVBatSOCDisp' incorporates:
   *  Inport: '<Root>/icbms_pctHVBatSOCDisp'
   */
  (void)Rte_Read_icbms_pctHVBatSOCDisp_Value(&rtb_TmpSignalConversionAticbms_);

  /* SignalConversion generated from: '<S1>/icbms_bAcChrgFull' incorporates:
   *  Inport: '<Root>/icbms_bAcChrgFull'
   */
  (void)Rte_Read_icbms_bAcChrgFull_Value(&rtb_TmpSignalConversionAticbm_a);

  /* Logic: '<S73>/Logical_Operator4' incorporates:
   *  Constant: '<S1>/single'
   *  Constant: '<S43>/hpp_percBatWarmSocThr_C'
   *  Constant: '<S43>/hpp_tBatWarmExterTempThr_C'
   *  Logic: '<S43>/Logical Operator1'
   *  Logic: '<S43>/Logical Operator6'
   *  Logic: '<S73>/Logical_Operator5'
   *  RelationalOperator: '<S43>/Relational Operator1'
   *  RelationalOperator: '<S43>/Relational Operator3'
   *  UnitDelay: '<S73>/Unit Delay'
   *
   * Block description for '<S43>/hpp_percBatWarmSocThr_C':
   *  [80]
   *
   * Block description for '<S43>/hpp_tBatWarmExterTempThr_C':
   *  [10]
   */
  rtb_LogicalOperator2 = (HvCoorn_bACChrgLink &&
    (((rtb_TmpSignalConversionAticbms_ >= HvCoorn_pctBatWarmSocThd_C) &&
      rtb_TmpSignalConversionAticbm_a && (25.0F <=
    HvCoorn_tBatWarmExterTempThd_C)) || HvCoorn_ARID_DEF.UnitDelay_DSTATE_ps));

  /* Logic: '<S43>/Logical Operator18' */
  rtb_RelationalOperator_ox = (HvCoorn_ConstB.LogicalOperator3 &&
    rtb_LogicalOperator2 && HvCoorn_bACChrgLink);

  /* Switch: '<S75>/Switch2' incorporates:
   *  Logic: '<S43>/Logical Operator7'
   *  Switch: '<S75>/Switch1'
   */
  if (!HvCoorn_bACChrgLink) {
    /* Switch: '<S75>/Switch2' incorporates:
     *  Constant: '<S75>/Number1'
     */
    rtb_TmpSignalConversionAtian_tD = 0.0F;
  } else if (rtb_RelationalOperator_ox) {
    /* Switch: '<S75>/Switch1' incorporates:
     *  Constant: '<S43>/TaskTime_s2'
     *  Sum: '<S75>/Sum1'
     *  Switch: '<S75>/Switch2'
     *  UnitDelay: '<S75>/Unit Delay1'
     */
    rtb_TmpSignalConversionAtian_tD = 0.01F +
      HvCoorn_ARID_DEF.UnitDelay1_DSTATE_p;
  } else {
    /* Switch: '<S75>/Switch2' incorporates:
     *  Switch: '<S75>/Switch1'
     *  UnitDelay: '<S75>/Unit Delay1'
     */
    rtb_TmpSignalConversionAtian_tD = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_p;
  }

  /* End of Switch: '<S75>/Switch2' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/Chrg_bBookChrgCmpl' */
  (void)Rte_Read_Chrg_bBookChrgCmpl_Value(&rtb_Logical_Operator4_b);

  /* Inport: '<Root>/icobc_pwrChrgMax' */
  (void)Rte_Read_icobc_pwrChrgMax_Value(&rtb_Switch3_e3j);

  /* Inport: '<Root>/icbms_bDcChrgFull' */
  (void)Rte_Read_icbms_bDcChrgFull_Value(&rtb_Logical_Operator4_e);

  /* Inport: '<Root>/icbms_bDcChrgWkup' */
  (void)Rte_Read_icbms_bDcChrgWkup_Value(&rtb_RelationalOperator_gi);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Logic: '<S43>/Logical Operator2' incorporates:
   *  Constant: '<S43>/single'
   *  DataTypeConversion: '<S43>/DataTypeConversion'
   *  Logic: '<S43>/Logical Operator8'
   *  Product: '<S43>/Product10'
   *  RelationalOperator: '<S43>/Relational Operator6'
   */
  HvCoorn_bBattWarmReq = (rtb_RelationalOperator_ox &&
    (rtb_TmpSignalConversionAtian_tD < (float32)rtb_ShiftArithmetic2 * 3600.0F));

  /* Logic: '<S6>/Logical Operator6' incorporates:
   *  Logic: '<S44>/Logical Operator17'
   */
  rtb_LogicalOperator6_hy = (rtb_LogicalOperator6_hy &&
    rtb_TmpSignalConversionAticob_p);

  /* Logic: '<S44>/Logical Operator16' incorporates:
   *  Logic: '<S44>/Logical Operator14'
   */
  HvCoorn_bACChrgPause = (HvCoorn_bACChrgLink && (!rtb_LogicalOperator6_hy));

  /* Logic: '<S44>/Logical Operator5' */
  HvCoorn_bACChrgLinkOk = (HvCoorn_bACChrgLink && rtb_LogicalOperator6_hy);

  /* Logic: '<S44>/Logical Operator8' incorporates:
   *  Logic: '<S44>/Logical Operator2'
   */
  HvCoorn_bChrgLink = (HvCoorn_bDCChrgLink || (rtb_TmpSignalConversionAticob_m &&
    rtb_Equal3_a) || HvCoorn_bACChrgLink);

  /* Logic: '<S84>/Logical_Operator4' incorporates:
   *  Logic: '<S45>/Logical Operator2'
   *  Logic: '<S45>/Logical Operator20'
   *  Logic: '<S84>/Logical_Operator5'
   *  UnitDelay: '<S45>/Unit Delay3'
   *  UnitDelay: '<S84>/Unit Delay'
   */
  rtb_RelationalOperator_ox = (HvCoorn_bACChrgLink &&
    (HvCoorn_ConstB.WakeUpOrigin || HvCoorn_ARID_DEF.UnitDelay3_DSTATE_i ||
     HvCoorn_ConstB.BookChg || HvCoorn_ARID_DEF.UnitDelay_DSTATE_en));

  /* SignalConversion generated from: '<S1>/Chrg_bChrgErrForever' incorporates:
   *  Inport: '<Root>/Chrg_bChrgErrForever'
   */
  (void)Rte_Read_Chrg_bChrgErrForever_Value(&rtb_TmpSignalConversionAtChrg_b);

  /* Logic: '<S45>/Logical Operator4' incorporates:
   *  Logic: '<S46>/Logical Operator4'
   */
  rtb_TmpSignalConversionAtChrg_b = !rtb_TmpSignalConversionAtChrg_b;

  /* DataTypeConversion: '<S83>/Data Type Conversion1' incorporates:
   *  ArithShift: '<S83>/Shift Arithmetic1'
   *  ArithShift: '<S83>/Shift Arithmetic2'
   *  ArithShift: '<S83>/Shift Arithmetic3'
   *  ArithShift: '<S83>/Shift Arithmetic4'
   *  ArithShift: '<S83>/Shift Arithmetic5'
   *  ArithShift: '<S83>/Shift Arithmetic6'
   *  ArithShift: '<S83>/Shift Arithmetic7'
   *  Constant: '<S45>/hpp_pwrIpsSplyLim_C'
   *  DataTypeConversion: '<S83>/Data Type Conversion2'
   *  DataTypeConversion: '<S83>/Data Type Conversion3'
   *  DataTypeConversion: '<S83>/Data Type Conversion4'
   *  DataTypeConversion: '<S83>/Data Type Conversion6'
   *  DataTypeConversion: '<S83>/Data Type Conversion9'
   *  Logic: '<S45>/Logical Operator23'
   *  Logic: '<S45>/Logical Operator24'
   *  Logic: '<S45>/Logical Operator4'
   *  Logic: '<S45>/Logical Operator5'
   *  RelationalOperator: '<S45>/Relational Operator7'
   *  Sum: '<S83>/Add'
   *
   * Block description for '<S45>/hpp_pwrIpsSplyLim_C':
   *  [0]
   */
  HvCoorn_noACChrgEnaBitVal = (uint8)((((((((uint32)
    (rtb_TmpSignalConversionAticob_p << 1) + rtb_RelationalOperator_ox) +
    (uint32)(HvCoorn_bACChrgLinkOk << 2)) + (uint32)(!HvCoorn_bACLinkTempErr <<
    3)) + (uint32)(HvCoorn_bParked4ChDchg << 4)) + (uint32)((rtb_Switch3_e3j >=
    HvCoorn_pwrOBCSplyLim_C) << 5)) + (uint32)
    (((!rtb_TmpSignalConversionAticbm_a) || HvCoorn_bBattWarmReq) << 6)) +
    (uint32)(rtb_TmpSignalConversionAtChrg_b << 7));

  /* Logic: '<S82>/AND' incorporates:
   *  Constant: '<S45>/Constant10'
   *  Constant: '<S82>/uint32'
   *  DataTypeConversion: '<S82>/Data Type Conversion4'
   *  DataTypeConversion: '<S82>/Data Type Conversion7'
   *  RelationalOperator: '<S82>/Relational Operator'
   *  RelationalOperator: '<S82>/Relational Operator1'
   *  S-Function (sfix_bitop): '<S82>/Bitwise Operator'
   *
   * Block description for '<S45>/Constant10':
   *  [254]
   */
  HvCoorn_bACChrgEna = ((HvCoorn_noACChrgEna_C != 0U) && (((uint32)
    HvCoorn_noACChrgEna_C & HvCoorn_noACChrgEnaBitVal) == HvCoorn_noACChrgEna_C));

  /* SignalConversion generated from: '<S1>/Chrg_bACChrgCmpl' incorporates:
   *  Inport: '<Root>/Chrg_bACChrgCmpl'
   */
  (void)Rte_Read_Chrg_bACChrgCmpl_Value(&rtb_TmpSignalConversionAtChr_kb);

  /* SignalConversion generated from: '<S1>/Chrg_bChrgStopBySOCLim' incorporates:
   *  Inport: '<Root>/Chrg_bChrgStopBySOCLim'
   */
  (void)Rte_Read_Chrg_bChrgStopBySOCLim_Value(&rtb_TmpSignalConversionAtChr_ge);

  /* Update for UnitDelay: '<S45>/Unit Delay3' incorporates:
   *  Logic: '<S45>/Logical Operator18'
   */
  HvCoorn_ARID_DEF.UnitDelay3_DSTATE_i = (rtb_TmpSignalConversionAticob_p &&
    rtb_Equal3_lx);

  /* Logic: '<S45>/OR' incorporates:
   *  Logic: '<S25>/Logical Operator8'
   *  Logic: '<S46>/OR'
   *  Switch: '<S25>/Switch4'
   */
  rtb_Equal12_a = !rtb_TmpSignalConversionAtChr_ge;
  rtb_TmpSignalConversionAtChr_kb = !rtb_TmpSignalConversionAtChr_kb;

  /* Logic: '<S45>/Logical Operator10' incorporates:
   *  Logic: '<S45>/OR'
   *  Logic: '<S85>/Logical Operator1'
   */
  rtb_TmpSignalConversionAticob_p = (rtb_TmpSignalConversionAtChr_kb &&
    rtb_Equal12_a && (!rtb_Logical_Operator4_b));

  /* Logic: '<S85>/Logical_Operator4' incorporates:
   *  Logic: '<S45>/Logical Operator1'
   *  Logic: '<S45>/Logical Operator10'
   *  Logic: '<S85>/Logical_Operator5'
   *  UnitDelay: '<S85>/Unit Delay'
   */
  HvCoorn_bACChrgPwrUp = (rtb_TmpSignalConversionAticob_p &&
    ((HvCoorn_bACChrgEna && rtb_TmpSignalConversionAticob_p) ||
     HvCoorn_bACChrgPwrUp));

  /* Logic: '<S46>/AND' incorporates:
   *  Constant: '<S1>/TRUE'
   *  Constant: '<S46>/hpp_pwrIpsSplyLim_C1'
   *  Logic: '<S46>/Logical Operator1'
   *  Logic: '<S46>/Logical Operator9'
   *  RelationalOperator: '<S46>/GreaterOrEqual'
   *
   * Block description for '<S1>/TRUE':
   *  TRUE
   *
   * Block description for '<S46>/hpp_pwrIpsSplyLim_C1':
   *  [0]
   */
  HvCoorn_bDCChrgEna = (HvCoorn_bDCChrgLink && true && (!rtb_Logical_Operator4_e)
                        && (!HvCoorn_bDCLinkTempErr) && HvCoorn_bParked4ChDchg &&
                        (HvCoorn_ConstB.Product >= HvCoorn_pwrDCChrgrSplyLim_C) &&
                        rtb_RelationalOperator_gi &&
                        rtb_TmpSignalConversionAtChrg_b);

  /* SignalConversion generated from: '<S1>/Chrg_bDCChrgCmpl' incorporates:
   *  Inport: '<Root>/Chrg_bDCChrgCmpl'
   */
  (void)Rte_Read_Chrg_bDCChrgCmpl_Value(&rtb_TmpSignalConversionAtChrg_a);

  /* Logic: '<S46>/OR' incorporates:
   *  Logic: '<S25>/Logical Operator9'
   */
  rtb_TmpSignalConversionAtChrg_a = !rtb_TmpSignalConversionAtChrg_a;

  /* Logic: '<S46>/Logical Operator2' incorporates:
   *  Logic: '<S46>/OR'
   *  Logic: '<S88>/Logical Operator1'
   */
  rtb_Logical_Operator4_e = (rtb_TmpSignalConversionAtChrg_a && rtb_Equal12_a);

  /* Logic: '<S88>/Logical_Operator4' incorporates:
   *  Logic: '<S46>/AND1'
   *  Logic: '<S46>/Logical Operator2'
   *  Logic: '<S88>/Logical_Operator5'
   *  UnitDelay: '<S88>/Unit Delay'
   */
  HvCoorn_bDCChrgPwrUp = (rtb_Logical_Operator4_e && ((HvCoorn_bDCChrgEna &&
    rtb_Logical_Operator4_e) || HvCoorn_bDCChrgPwrUp));

  /* SignalConversion generated from: '<S1>/DrvMod_bVehShowMod' incorporates:
   *  Inport: '<Root>/DrvMod_bVehShowMod'
   */
  (void)Rte_Read_DrvMod_bVehShowMod_Value(&rtb_TmpSignalConversionAtDrvMod);

  /* Switch: '<S95>/Switch3' incorporates:
   *  Constant: '<S47>/hpp_pwrSocHiBatDchgThre_C2'
   *  Constant: '<S47>/hpp_pwrSocHiBatDchgThre_C3'
   *  RelationalOperator: '<S95>/Relational Operator'
   *  RelationalOperator: '<S95>/Relational Operator1'
   *  Switch: '<S95>/Switch2'
   *
   * Block description for '<S47>/hpp_pwrSocHiBatDchgThre_C2':
   *  [6]
   *
   * Block description for '<S47>/hpp_pwrSocHiBatDchgThre_C3':
   *  [4]
   */
  if (rtb_TmpSignalConversionAticbms_ >= HvCoorn_pctVehShowLoSocInhbOnUppr_C) {
    /* Switch: '<S95>/Switch3' incorporates:
     *  Constant: '<S95>/Number7'
     */
    rtb_TmpSignalConversionAticob_p = false;
  } else if (rtb_TmpSignalConversionAticbms_ <=
             HvCoorn_pctVehShowLoSocInhbOnLowr_C) {
    /* Switch: '<S95>/Switch2' incorporates:
     *  Constant: '<S95>/Number1'
     *  Switch: '<S95>/Switch3'
     */
    rtb_TmpSignalConversionAticob_p = true;
  } else {
    /* Switch: '<S95>/Switch3' incorporates:
     *  UnitDelay: '<S95>/Unit Delay1'
     */
    rtb_TmpSignalConversionAticob_p = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_ct;
  }

  /* End of Switch: '<S95>/Switch3' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/icicm_bPwrOffReq' */
  (void)Rte_Read_icicm_bPwrOffReq_Value(&rtb_OR2);

  /* Inport: '<Root>/iczcu_bHVPwrOffReq' */
  (void)Rte_Read_iczcu_bHVPwrOffReq_Value(&rtb_LowerOrEqual2);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* SignalConversion generated from: '<S1>/icicm_bOTAOn' incorporates:
   *  Inport: '<Root>/icicm_bOTAOn'
   */
  (void)Rte_Read_icicm_bOTAOn_Value(&rtb_TmpSignalConversionAticic_a);

  /* Logic: '<S47>/Logical Operator1' incorporates:
   *  Constant: '<S47>/hpp_percBatDchgSocThre_C1'
   *
   * Block description for '<S47>/hpp_percBatDchgSocThre_C1':
   *  [1]
   */
  rtb_TmpSignalConversionAticbm_a = (rtb_TmpSignalConversionAtidi_bK &&
    HvCoorn_bKeyOnStrtHvEna_C);

  /* Switch: '<S98>/Switch' incorporates:
   *  Constant: '<S47>/hpp_bEpbPark4ChDchgEna_C2'
   *  Constant: '<S47>/hpp_bEpbPark4ChDchgEna_C4'
   *  Constant: '<S47>/hpp_percBatDchgSocThre_C7'
   *  Logic: '<S47>/Not'
   *  Logic: '<S47>/OR4'
   *  Logic: '<S47>/OR5'
   *  Logic: '<S47>/OR6'
   *  RelationalOperator: '<S47>/Equal'
   *  RelationalOperator: '<S47>/Equal1'
   *
   * Block description for '<S47>/hpp_bEpbPark4ChDchgEna_C2':
   *  [6]
   *
   * Block description for '<S47>/hpp_bEpbPark4ChDchgEna_C4':
   *  [4]
   *
   * Block description for '<S47>/hpp_percBatDchgSocThre_C7':
   *  [0]
   */
  if ((rtb_LowerOrEqual2 || rtb_OR2) && HvCoorn_bZCUPwrOffEna_C &&
      (!HvCoorn_bChrgLink) && ((rtb_TmpSignalConversionAtGearLv == ((uint8)6U)) ||
       (rtb_TmpSignalConversionAtGearLv == ((uint8)4U)))) {
    /* Sum: '<S98>/Subtract1' incorporates:
     *  Constant: '<S98>/single1'
     *  UnitDelay: '<S98>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_l < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_l)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_l > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_l)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_l + 1;
    }

    /* End of Sum: '<S98>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S98>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S98>/Switch' */

  /* Update for UnitDelay: '<S98>/Unit Delay' incorporates:
   *  Saturate: '<S98>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_l = rtb_DataTypeConversion_jq;

  /* Product: '<S98>/Divide' incorporates:
   *  Constant: '<S47>/hpp_percBatDchgSocThre_C5'
   *
   * Block description for '<S47>/hpp_percBatDchgSocThre_C5':
   *  [0.2]
   */
  tmpRead_i = HvCoorn_tiPwrOffDly4RstKeyOn_C / HvCoorn_ConstB.Max_e;

  /* DataTypeConversion: '<S98>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S47>/OR2' incorporates:
   *  Constant: '<S47>/single'
   *  Constant: '<S47>/single1'
   *  DataTypeConversion: '<S98>/DataTypeConversion'
   *  Logic: '<S47>/OR3'
   *  RelationalOperator: '<S47>/LowerOrEqual'
   *  RelationalOperator: '<S47>/LowerOrEqual1'
   *  RelationalOperator: '<S98>/Relational Operator1'
   *  Saturate: '<S98>/Saturation2'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  rtb_OR2 = ((rtb_DataTypeConversion_jq > (sint32)tmpRead_i) || ((HvCoorn_stHVP <=
    ((uint8)130U)) && (HvCoorn_stHVP >= ((uint8)101U))));

  /* RelationalOperator: '<S47>/LowerOrEqual2' incorporates:
   *  Constant: '<S47>/single2'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  rtb_LowerOrEqual2 = (HvCoorn_stHVP == ((uint8)89U));

  /* SignalConversion generated from: '<S1>/PwrLimBatt_pwrMaxHvesDChrg' incorporates:
   *  Inport: '<Root>/PwrLimBatt_pwrMaxHvesDChrg'
   */
  (void)Rte_Read_PwrLimBatt_pwrMaxHvesDChrg_Value
    (&rtb_TmpSignalConversionAtPwrLim);

  /* RelationalOperator: '<S100>/Relational Operator' incorporates:
   *  Constant: '<S100>/single4'
   *  UnitDelay: '<S100>/Unit Delay'
   */
  rtb_RelationalOperator_gi = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_lk > 0);

  /* Logic: '<S91>/Logical Operator1' incorporates:
   *  Logic: '<S50>/AND1'
   *  Logic: '<S9>/Logical Operator8'
   */
  rtb_AND9_p_tmp = !rtb_TmpSignalConversionAticic_a;

  /* Logic: '<S30>/AND9' incorporates:
   *  Logic: '<S47>/Logical Operator4'
   *  Logic: '<S47>/Logical Operator5'
   *  Logic: '<S47>/OR8'
   *  Logic: '<S91>/Logical Operator'
   *  Logic: '<S91>/Logical Operator1'
   *  Logic: '<S92>/Logical Operator'
   *  Logic: '<S92>/Logical Operator1'
   *  Logic: '<S94>/Logical Operator'
   *  Logic: '<S94>/Logical Operator1'
   *  UnitDelay: '<S91>/Unit Delay2'
   *  UnitDelay: '<S92>/Unit Delay2'
   *  UnitDelay: '<S94>/Unit Delay2'
   */
  rtb_AND9_c = ((rtb_TmpSignalConversionAticbm_a && (rtb_LowerOrEqual2 &&
    (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_o))) ||
                (rtb_TmpSignalConversionAticbm_a && (rtb_AND9_p_tmp &&
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_n)) || (rtb_TmpSignalConversionAticbm_a &&
    (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_j)));

  /* Logic: '<S100>/Logical Operator2' */
  HvCoorn_bKeyOnRisSet = (rtb_RelationalOperator_gi || rtb_AND9_c);

  /* Logic: '<S97>/Logical_Operator4' incorporates:
   *  Logic: '<S47>/NOT1'
   *  Logic: '<S47>/OR7'
   *  Logic: '<S93>/Logical Operator'
   *  Logic: '<S97>/Logical Operator1'
   *  Logic: '<S97>/Logical_Operator5'
   *  UnitDelay: '<S93>/Unit Delay2'
   *  UnitDelay: '<S97>/Unit Delay'
   */
  rtb_Logical_Operator4_b = (((!rtb_OR2) || HvCoorn_ARID_DEF.UnitDelay2_DSTATE_m)
    && rtb_TmpSignalConversionAtidi_bK && (HvCoorn_bKeyOnRisSet ||
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_iq));

  /* SignalConversion generated from: '<S1>/idi_bKeyStrt' incorporates:
   *  Inport: '<Root>/idi_bKeyStrt'
   */
  (void)Rte_Read_idi_bKeyStrt_Value(&rtb_TmpSignalConversionAtidi__j);

  /* SignalConversion generated from: '<S1>/BrkPedDev_bBrk' incorporates:
   *  Inport: '<Root>/BrkPedDev_bBrk'
   */
  (void)Rte_Read_BrkPedDev_bBrk_Value(&rtb_TmpSignalConversionAtBrkPed);

  /* Logic: '<S47>/OR1' incorporates:
   *  Constant: '<S47>/sup_tiKeyStrt_C1'
   *  Logic: '<S9>/OR'
   *
   * Block description for '<S47>/sup_tiKeyStrt_C1':
   *  [0]
   */
  rtb_Logical_Operator4_n_tmp = (rtb_TmpSignalConversionAtBrkPed ||
    HvCoorn_bKeyStrtBypBrkSwt_C);

  /* Logic: '<S96>/Logical_Operator4' incorporates:
   *  Constant: '<S47>/hpp_percBatDchgSocThre_C2'
   *  Logic: '<S47>/Logical Operator2'
   *  Logic: '<S47>/NOT'
   *  Logic: '<S47>/OR1'
   *  Logic: '<S96>/Logical_Operator5'
   *  UnitDelay: '<S96>/Unit Delay'
   *
   * Block description for '<S47>/hpp_percBatDchgSocThre_C2':
   *  [1]
   */
  rtb_Logical_Operator4_e = (rtb_TmpSignalConversionAtidi_bK &&
    ((rtb_TmpSignalConversionAtidi__j && HvCoorn_bKeyStrtStrtHvEna_C &&
      rtb_Logical_Operator4_n_tmp) || HvCoorn_ARID_DEF.UnitDelay_DSTATE_jc));

  /* Switch: '<S99>/Switch' incorporates:
   *  Constant: '<S47>/icbms_acCharge'
   *  Constant: '<S47>/icbms_dcCharge'
   *  Logic: '<S47>/AND1'
   *  RelationalOperator: '<S47>/Relational Operator5'
   *  RelationalOperator: '<S47>/Relational Operator6'
   *
   * Block description for '<S47>/icbms_acCharge':
   *  [9]
   *
   * Block description for '<S47>/icbms_dcCharge':
   *  [8]
   */
  if ((rtb_TmpSignalConversionAticbm_d != ((uint8)9U)) &&
      (rtb_TmpSignalConversionAticbm_d != ((uint8)8U)) &&
      rtb_TmpSignalConversionAticob_p) {
    /* Sum: '<S99>/Subtract1' incorporates:
     *  Constant: '<S99>/single1'
     *  UnitDelay: '<S99>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_n < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_n)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_n > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_n)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_n + 1;
    }

    /* End of Sum: '<S99>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S99>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S99>/Switch' */

  /* Update for UnitDelay: '<S99>/Unit Delay' incorporates:
   *  Saturate: '<S99>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_n = rtb_DataTypeConversion_jq;

  /* Switch: '<S47>/Switch1' incorporates:
   *  Constant: '<S47>/hpp_pwrSocHiBatDchgThre_C1'
   *  Logic: '<S47>/AND'
   *
   * Block description for '<S47>/hpp_pwrSocHiBatDchgThre_C1':
   *  [1]
   */
  if (rtb_TmpSignalConversionAtDrvMod && HvCoorn_bVehShowLoSocInhbKeyOnEna_C) {
    /* Product: '<S99>/Divide' incorporates:
     *  Constant: '<S47>/hpp_percBatDchgSocThre_C4'
     *
     * Block description for '<S47>/hpp_percBatDchgSocThre_C4':
     *  [10]
     */
    tmpRead_i = HvCoorn_tiVehShowLoSocInhbOn_C / HvCoorn_ConstB.Max_g;

    /* DataTypeConversion: '<S99>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        tmpRead_i = floorf(tmpRead_i + 0.5F);
      } else {
        tmpRead_i = 0.0F;
      }
    }

    /* Logic: '<S30>/AND26' incorporates:
     *  DataTypeConversion: '<S99>/DataTypeConversion'
     *  Logic: '<S47>/Not1'
     *  RelationalOperator: '<S99>/Relational Operator1'
     *  Saturate: '<S99>/Saturation2'
     */
    rtb_AND26_o = (rtb_DataTypeConversion_jq <= (sint32)tmpRead_i);
  } else {
    /* Logic: '<S30>/AND26' incorporates:
     *  Constant: '<S47>/TRUE1'
     *
     * Block description for '<S47>/TRUE1':
     *  TRUE
     */
    rtb_AND26_o = true;
  }

  /* End of Switch: '<S47>/Switch1' */

  /* Switch: '<S47>/Switch' incorporates:
   *  Constant: '<S47>/TRUE'
   *  Constant: '<S47>/hpp_percBatDchgSocThre_C3'
   *  Logic: '<S47>/OR'
   *  UnitDelay: '<S47>/UnitDelay'
   *
   * Block description for '<S47>/TRUE':
   *  TRUE
   *
   * Block description for '<S47>/hpp_percBatDchgSocThre_C3':
   *  [1]
   */
  if (HvCoorn_bSOPVehKeyOnStrtHvEna_C || HvCoorn_bHvReady) {
    tmp_0 = true;
  } else {
    tmp_0 = rtb_Logical_Operator4_e;
  }

  /* Logic: '<S47>/Logical Operator15' incorporates:
   *  Constant: '<S47>/hpp_percBatDchgSocThre_C'
   *  Constant: '<S47>/hpp_pwrSocHiBatDchgThre_C'
   *  Logic: '<S47>/Logical Operator14'
   *  Logic: '<S47>/Logical Operator3'
   *  Logic: '<S47>/Logical Operator7'
   *  RelationalOperator: '<S47>/Relational Operator3'
   *  RelationalOperator: '<S47>/Relational Operator4'
   *  Switch: '<S47>/Switch'
   *
   * Block description for '<S47>/hpp_percBatDchgSocThre_C':
   *  [0]
   *
   * Block description for '<S47>/hpp_pwrSocHiBatDchgThre_C':
   *  [-5000]
   */
  HvCoorn_bKeyOnPwrUp = (rtb_Logical_Operator4_b && tmp_0 &&
    ((rtb_TmpSignalConversionAticbms_ >= HvCoorn_pctBatSOCLim4Shut_C) ||
     (rtb_TmpSignalConversionAtPwrLim >= HvCoorn_pwrBatDChrgLim4Shut_C)) &&
    rtb_AND26_o);

  /* Logic: '<S47>/Not2' */
  HvCoorn_bShowModSocLo = !rtb_AND26_o;

  /* Switch: '<S100>/Switch' incorporates:
   *  Switch: '<S100>/Switch1'
   */
  if (rtb_AND9_c) {
    /* Product: '<S100>/Divide' incorporates:
     *  Constant: '<S47>/hpp_percBatDchgSocThre_C6'
     *
     * Block description for '<S47>/hpp_percBatDchgSocThre_C6':
     *  [0.03]
     */
    tmpRead_i = HvCoorn_tiKeyOnRisKeep_C / HvCoorn_ConstB.Max_o;

    /* DataTypeConversion: '<S100>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S100>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S100>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_lk = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S100>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S100>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_lk = 0;
      }
    } else {
      /* Update for UnitDelay: '<S100>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       *  Saturate: '<S100>/Saturation2'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_lk = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S100>/DataTypeConversion' */
  } else if (rtb_RelationalOperator_gi) {
    /* Update for UnitDelay: '<S100>/Unit Delay' incorporates:
     *  Constant: '<S100>/single5'
     *  Saturate: '<S100>/Saturation2'
     *  Sum: '<S100>/Subtract'
     *  Switch: '<S100>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_lk -= 1;
  }

  /* End of Switch: '<S100>/Switch' */

  /* SignalConversion generated from: '<S1>/ictcp_stRmtHvReq' incorporates:
   *  Inport: '<Root>/ictcp_stRmtHvReq'
   */
  (void)Rte_Read_ictcp_stRmtHvReq_Value(&rtb_TmpSignalConversionAtictcp_);

  /* Logic: '<S48>/OR' incorporates:
   *  Logic: '<S148>/Logical Operator2'
   *  Logic: '<S282>/Logical Operator1'
   *  Logic: '<S52>/AND15'
   *  Logic: '<S53>/OR4'
   *  Logic: '<S7>/Logical Operator7'
   *  Logic: '<S9>/Logical Operator2'
   */
  rtb_RelationalOperator_f_tmp = !rtb_TmpSignalConversionAtidi_bK;

  /* Logic: '<S104>/Logical_Operator4' incorporates:
   *  Constant: '<S48>/sup_percSocAdj4HvOn_C'
   *  Constant: '<S48>/uint4'
   *  Constant: '<S48>/uint5'
   *  Logic: '<S104>/Logical Operator1'
   *  Logic: '<S104>/Logical_Operator5'
   *  Logic: '<S48>/OR'
   *  RelationalOperator: '<S48>/Equal'
   *  RelationalOperator: '<S48>/Equal1'
   *  RelationalOperator: '<S48>/Relational Operator10'
   *  UnitDelay: '<S104>/Unit Delay'
   *
   * Block description for '<S48>/sup_percSocAdj4HvOn_C':
   *  [15]
   *
   * Block description for '<S48>/uint4':
   *  HV active
   *
   * Block description for '<S48>/uint5':
   *  HV not active
   */
  rtb_RelationalOperator_gi = ((rtb_TmpSignalConversionAtictcp_ != ((uint8)2U)) &&
    rtb_RelationalOperator_f_tmp && (rtb_TmpSignalConversionAticbms_ >=
    HvCoorn_pctSocRmtHvRstThd_C) && ((rtb_TmpSignalConversionAtictcp_ == ((uint8)
    1U)) || HvCoorn_ARID_DEF.UnitDelay_DSTATE_fa));

  /* Switch: '<S105>/Switch' */
  if (HvCoorn_ConstB.bHvBatPrecdng) {
    /* Sum: '<S105>/Subtract1' incorporates:
     *  Constant: '<S105>/single1'
     *  UnitDelay: '<S105>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_oc < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_oc)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_oc > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_oc)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_oc + 1;
    }

    /* End of Sum: '<S105>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S105>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S105>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/ipf_bBD1CAN0x41CVld' */
  (void)Rte_Read_ipf_bBD1CAN0x41CVld_Value(&tmpRead_5);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S105>/Unit Delay' incorporates:
   *  Saturate: '<S105>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_oc = rtb_DataTypeConversion_jq;

  /* Product: '<S105>/Divide' incorporates:
   *  Constant: '<S48>/hpp_tiRemHvBatPrecdngSet_C'
   *
   * Block description for '<S48>/hpp_tiRemHvBatPrecdngSet_C':
   *  [0.01]
   */
  tmpRead_i = HvCoorn_tiRemHvBatPreCdngSet_C / HvCoorn_ConstB.Max_d;

  /* DataTypeConversion: '<S105>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S102>/Logical_Operator4' incorporates:
   *  DataTypeConversion: '<S105>/DataTypeConversion'
   *  Logic: '<S102>/Logical_Operator5'
   *  RelationalOperator: '<S105>/Relational Operator1'
   *  Saturate: '<S105>/Saturation2'
   *  UnitDelay: '<S102>/Unit Delay'
   */
  rtb_TmpSignalConversionAtChrg_b = (HvCoorn_ConstB.LogicalOperator1_b &&
    ((rtb_DataTypeConversion_jq > (sint32)tmpRead_i) ||
     HvCoorn_ARID_DEF.UnitDelay_DSTATE_i1w));

  /* Logic: '<S48>/Logical Operator1' */
  HvCoorn_bRemPwrUp = (rtb_RelationalOperator_gi ||
                       rtb_TmpSignalConversionAtChrg_b);

  /* SignalConversion generated from: '<S1>/iczcu_stRmtChrgReq' incorporates:
   *  Inport: '<Root>/iczcu_stRmtChrgReq'
   */
  (void)Rte_Read_iczcu_stRmtChrgReq_Value(&rtb_TmpSignalConversionAticzcu_);

  /* Switch: '<S106>/Switch' incorporates:
   *  Constant: '<S48>/hpp_bReMoteImmoEna_C'
   *  Constant: '<S48>/uint7'
   *  Logic: '<S48>/Logical Operator35'
   *  Logic: '<S48>/Logical Operator36'
   *  RelationalOperator: '<S48>/Relational Operator3'
   *
   * Block description for '<S48>/hpp_bReMoteImmoEna_C':
   *  [1]
   *
   * Block description for '<S48>/uint7':
   *  Charge Req
   */
  if ((rtb_TmpSignalConversionAticzcu_ == ((uint8)1U)) &&
      (HvCoorn_ConstB.RelationalOperator17 || HvCoorn_bRemImobEna_C)) {
    /* Sum: '<S106>/Subtract1' incorporates:
     *  Constant: '<S106>/single1'
     *  UnitDelay: '<S106>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_gc < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_gc)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_gc > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_gc)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_gc + 1;
    }

    /* End of Sum: '<S106>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S106>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S106>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/icecc_bHVReq' */
  (void)Rte_Read_icecc_bHVReq_Value(&rtb_UnitDelay_njy);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S106>/Unit Delay' incorporates:
   *  Saturate: '<S106>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_gc = rtb_DataTypeConversion_jq;

  /* Product: '<S106>/Divide' incorporates:
   *  Constant: '<S48>/hpp_tiRemLvBatMntnSet_C'
   *
   * Block description for '<S48>/hpp_tiRemLvBatMntnSet_C':
   *  [0.01]
   */
  tmpRead_i = HvCoorn_tiRemLvBatMntnSet_C / HvCoorn_ConstB.Max_fe4;

  /* DataTypeConversion: '<S106>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S103>/Logical_Operator5' incorporates:
   *  DataTypeConversion: '<S106>/DataTypeConversion'
   *  RelationalOperator: '<S106>/Relational Operator1'
   *  Saturate: '<S106>/Saturation2'
   *  UnitDelay: '<S103>/Unit Delay'
   */
  rtb_TmpSignalConversionAtChr_ge = ((rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i) || HvCoorn_ARID_DEF.UnitDelay_DSTATE_e4);

  /* SignalConversion generated from: '<S1>/icems_bFanAftRunActv' incorporates:
   *  Inport: '<Root>/icems_bFanAftRunActv'
   */
  (void)Rte_Read_icems_bFanAftRunActv_Value(&rtb_TmpSignalConversionAticem_e);

  /* Switch: '<S110>/Switch' incorporates:
   *  UnitDelay: '<S49>/Unit Delay'
   */
  if (HvCoorn_bFanAftRunPwrUp) {
    /* Sum: '<S110>/Subtract1' incorporates:
     *  Constant: '<S110>/single1'
     *  UnitDelay: '<S110>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_i3 < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_i3)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_i3 > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_i3)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_i3 + 1;
    }

    /* End of Sum: '<S110>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S110>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S110>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/RngPrdn_volFuRmnByInstModEEW' */
  (void)Rte_Read_RngPrdn_volFuRmnByInstModEEW_Value(&tmpRead_f);

  /* Inport: '<Root>/ipf_bLBMSCANVld' */
  (void)Rte_Read_ipf_bLBMSCANVld_Value(&rtb_Logical_Operator4_hp);

  /* Inport: '<Root>/iczcu_stCarMod' */
  (void)Rte_Read_iczcu_stCarMod_Value(&rtb_Switch7);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S110>/Unit Delay' incorporates:
   *  Saturate: '<S110>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_i3 = rtb_DataTypeConversion_jq;

  /* Product: '<S110>/Divide' incorporates:
   *  Constant: '<S49>/hpp_tiRemLvBatMntnSet_C'
   *
   * Block description for '<S49>/hpp_tiRemLvBatMntnSet_C':
   *  [600]
   */
  tmpRead_i = HvCoorn_tiFanAftRunMaxThd_C / HvCoorn_ConstB.Max_ew;

  /* DataTypeConversion: '<S110>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S109>/Logical_Operator4' incorporates:
   *  DataTypeConversion: '<S110>/DataTypeConversion'
   *  Logic: '<S108>/Logical Operator'
   *  Logic: '<S108>/Logical Operator1'
   *  Logic: '<S109>/Logical Operator1'
   *  Logic: '<S109>/Logical_Operator5'
   *  Logic: '<S49>/AND1'
   *  Logic: '<S49>/Not'
   *  Logic: '<S49>/OR1'
   *  RelationalOperator: '<S110>/Relational Operator1'
   *  Saturate: '<S110>/Saturation2'
   *  UnitDelay: '<S108>/Unit Delay2'
   *  UnitDelay: '<S109>/Unit Delay'
   */
  HvCoorn_bFanAftRunPwrUp = (rtb_TmpSignalConversionAticem_e &&
    (rtb_DataTypeConversion_jq <= (sint32)tmpRead_i) && (((!HvCoorn_bKeyOnPwrUp)
    && HvCoorn_ARID_DEF.UnitDelay2_DSTATE_l && rtb_TmpSignalConversionAticem_e) ||
    HvCoorn_bFanAftRunPwrUp));

  /* Logic: '<S30>/AND9' incorporates:
   *  Constant: '<S49>/NormShut1'
   *  Logic: '<S49>/AND'
   *  Logic: '<S49>/OR'
   *
   * Block description for '<S49>/NormShut1':
   *  [1]
   */
  rtb_AND9_c = ((rtb_UnitDelay_njy && HvCoorn_bECCPwrUpEna_C) ||
                HvCoorn_bFanAftRunPwrUp);

  /* SignalConversion generated from: '<S1>/icicm_stHVReq' incorporates:
   *  Inport: '<Root>/icicm_stHVReq'
   */
  (void)Rte_Read_icicm_stHVReq_Value(&rtb_TmpSignalConversionAticic_h);

  /* Logic: '<S30>/AND26' incorporates:
   *  Constant: '<S50>/uint8'
   *  Logic: '<S50>/AND'
   *  RelationalOperator: '<S50>/Equal'
   */
  rtb_AND26_o = (rtb_TmpSignalConversionAticic_a &&
                 (rtb_TmpSignalConversionAticic_h == ((uint8)1U)));

  /* SignalConversion generated from: '<S1>/ved_bInhbEngStrt' incorporates:
   *  Inport: '<Root>/ved_bInhbEngStrt'
   */
  (void)Rte_Read_ved_bInhbEngStrt_Value(&rtb_TmpSignalConversionAtved_bI);

  /* SignalConversion generated from: '<S1>/iclbms_stLvRemChrgReq' incorporates:
   *  Inport: '<Root>/iclbms_stLvRemChrgReq'
   */
  (void)Rte_Read_iclbms_stLvRemChrgReq_Value(&rtb_TmpSignalConversionAticlbms);

  /* UnitDelay: '<S53>/UnitDelay' */
  rtb_UnitDelay_jn = HvCoorn_bLbmsLvBatMntnReq;

  /* Switch: '<S158>/Switch' incorporates:
   *  UnitDelay: '<S53>/UnitDelay'
   */
  if (HvCoorn_bLbmsLvBatMntnReq) {
    /* Sum: '<S158>/Subtract1' incorporates:
     *  Constant: '<S158>/single1'
     *  UnitDelay: '<S158>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ah < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ah)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ah > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ah)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ah + 1;
    }

    /* End of Sum: '<S158>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S158>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S158>/Switch' */

  /* Update for UnitDelay: '<S158>/Unit Delay' incorporates:
   *  Saturate: '<S158>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ah = rtb_DataTypeConversion_jq;

  /* Product: '<S158>/Divide' incorporates:
   *  Constant: '<S53>/hpp_tiRemHvBatPrecdngSet_C1'
   *
   * Block description for '<S53>/hpp_tiRemHvBatPrecdngSet_C1':
   *  [3600]
   */
  tmpRead_i = HvCoorn_tiMntnLbmsInvldThd_C / HvCoorn_ConstB.Max_iw;

  /* DataTypeConversion: '<S158>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S157>/Logical Operator1' incorporates:
   *  Constant: '<S53>/uint2'
   *  Constant: '<S53>/uint3'
   *  Logic: '<S53>/OR3'
   *  Logic: '<S53>/OR4'
   *  RelationalOperator: '<S53>/Equal3'
   *  RelationalOperator: '<S53>/Equal4'
   */
  rtb_UnitDelay_njy = ((rtb_TmpSignalConversionAticlbms != ((uint8)4U)) &&
                       (rtb_TmpSignalConversionAticlbms != ((uint8)0U)));

  /* Logic: '<S157>/Logical_Operator4' incorporates:
   *  DataTypeConversion: '<S158>/DataTypeConversion'
   *  Logic: '<S157>/Logical Operator1'
   *  Logic: '<S157>/Logical_Operator5'
   *  Logic: '<S53>/AND'
   *  Logic: '<S53>/Not1'
   *  RelationalOperator: '<S158>/Relational Operator1'
   *  Saturate: '<S158>/Saturation2'
   *  UnitDelay: '<S157>/Unit Delay'
   */
  rtb_Logical_Operator4_hp = (rtb_UnitDelay_njy && (((!rtb_Logical_Operator4_hp)
    && (rtb_DataTypeConversion_jq > (sint32)tmpRead_i)) ||
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_bd));

  /* Logic: '<S156>/Logical_Operator4' incorporates:
   *  Constant: '<S53>/uint8'
   *  Logic: '<S156>/Logical Operator1'
   *  Logic: '<S156>/Logical_Operator5'
   *  Logic: '<S53>/OR4'
   *  RelationalOperator: '<S53>/Equal1'
   *  UnitDelay: '<S156>/Unit Delay'
   */
  HvCoorn_bLbmsLvBatMntnReq = (rtb_UnitDelay_njy && (!rtb_Logical_Operator4_hp) &&
    rtb_RelationalOperator_f_tmp && ((rtb_TmpSignalConversionAticlbms == ((uint8)
    1U)) || HvCoorn_bLbmsLvBatMntnReq));

  /* SignalConversion generated from: '<S1>/VehCfg_stLvBattTyp' incorporates:
   *  Inport: '<Root>/VehCfg_stLvBattTyp'
   */
  (void)Rte_Read_VehCfg_stLvBattTyp_Value(&rtb_TmpSignalConversionAtVehCfg);

  /* RelationalOperator: '<S54>/Equal3' incorporates:
   *  Constant: '<S54>/Constant84'
   *
   * Block description for '<S54>/Constant84':
   *  [1]
   */
  rtb_Equal3_a = (rtb_TmpSignalConversionAtVehCfg == ((uint8)1U));

  /* UnitDelay: '<S52>/UnitDelay' */
  rtb_UnitDelay_njy = HvCoorn_bLvBatMntnReq;

  /* Switch: '<S141>/Switch' incorporates:
   *  UnitDelay: '<S52>/UnitDelay'
   */
  if (HvCoorn_bLvBatMntnReq) {
    /* Sum: '<S141>/Subtract1' incorporates:
     *  Constant: '<S141>/single1'
     *  UnitDelay: '<S141>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_op < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_op)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_op > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_op)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_op + 1;
    }

    /* End of Sum: '<S141>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S141>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S141>/Switch' */

  /* Update for UnitDelay: '<S141>/Unit Delay' incorporates:
   *  Saturate: '<S141>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_op = rtb_DataTypeConversion_jq;

  /* SignalConversion generated from: '<S1>/icebs_pctLvBatSoc' incorporates:
   *  Inport: '<Root>/icebs_pctLvBatSoc'
   */
  (void)Rte_Read_icebs_pctLvBatSoc_Value(&rtb_TmpSignalConversionAticebs_);

  /* SignalConversion generated from: '<S1>/icebs_stSocPrcsn' incorporates:
   *  Inport: '<Root>/icebs_stSocPrcsn'
   */
  (void)Rte_Read_icebs_stSocPrcsn_Value(&rtb_TmpSignalConversionAticeb_a);

  /* Product: '<S141>/Divide' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C8'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C8':
   *  [1200]
   */
  tmpRead_i = HvCoorn_tiRemMntnSocMaxExThd_C / HvCoorn_ConstB.Max_nb;

  /* DataTypeConversion: '<S141>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S52>/AND5' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C9'
   *  Constant: '<S52>/uint1'
   *  DataTypeConversion: '<S141>/DataTypeConversion'
   *  RelationalOperator: '<S141>/Relational Operator1'
   *  RelationalOperator: '<S52>/Greater10'
   *  RelationalOperator: '<S52>/Greater9'
   *  Saturate: '<S141>/Saturation2'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C9':
   *  [90]
   */
  rtb_TmpSignalConversionAticem_e = ((rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i) && (rtb_TmpSignalConversionAticebs_ >=
                   HvCoorn_pctLvBatSocRemMntnEx_C) &&
    (rtb_TmpSignalConversionAticeb_a == ((uint8)2U)));

  /* Logic: '<S122>/Logical Operator' incorporates:
   *  Logic: '<S122>/Logical Operator1'
   *  UnitDelay: '<S122>/Unit Delay2'
   */
  rtb_LogicalOperator_mf = (rtb_TmpSignalConversionAtidi_bK &&
    (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_p));

  /* RelationalOperator: '<S149>/Relational Operator' incorporates:
   *  Constant: '<S149>/single4'
   *  UnitDelay: '<S149>/Unit Delay'
   */
  rtb_RelationalOperator_e2 = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_j > 0);

  /* Switch: '<S142>/Switch' incorporates:
   *  UnitDelay: '<S52>/UnitDelay'
   */
  if (HvCoorn_bLvBatMntnReq) {
    /* Sum: '<S142>/Subtract1' incorporates:
     *  Constant: '<S142>/single1'
     *  UnitDelay: '<S142>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5 < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5 > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5 + 1;
    }

    /* End of Sum: '<S142>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S142>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S142>/Switch' */

  /* Update for UnitDelay: '<S142>/Unit Delay' incorporates:
   *  Saturate: '<S142>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5 = rtb_DataTypeConversion_jq;

  /* Product: '<S142>/Divide' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C11'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C11':
   *  [5400]
   */
  tmpRead_i = HvCoorn_tiRemMntnActvOverThd_C / HvCoorn_ConstB.Max_m;

  /* DataTypeConversion: '<S142>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S30>/AND15' incorporates:
   *  DataTypeConversion: '<S142>/DataTypeConversion'
   *  RelationalOperator: '<S142>/Relational Operator1'
   *  Saturate: '<S142>/Saturation2'
   */
  rtb_AND15_f = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Logic: '<S149>/Logical Operator2' */
  rtb_LogicalOperator2_m5 = (rtb_RelationalOperator_e2 || rtb_AND15_f);

  /* Logic: '<S52>/AND14' incorporates:
   *  Logic: '<S52>/AND33'
   *  Logic: '<S52>/AND34'
   */
  rtb_Logical_Operator4_i5 = !rtb_LogicalOperator_mf;

  /* Logic: '<S137>/Logical_Operator4' incorporates:
   *  Logic: '<S119>/Logical Operator'
   *  Logic: '<S119>/Logical Operator1'
   *  Logic: '<S137>/Logical Operator1'
   *  Logic: '<S137>/Logical_Operator5'
   *  Logic: '<S52>/AND14'
   *  UnitDelay: '<S119>/Unit Delay2'
   *  UnitDelay: '<S137>/Unit Delay'
   */
  rtb_Logical_Operator4_en = ((rtb_LogicalOperator2_m5 ||
    (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_cd)) && rtb_Logical_Operator4_i5 &&
    (rtb_AND15_f || HvCoorn_ARID_DEF.UnitDelay_DSTATE_nj));

  /* Switch: '<S52>/Switch9' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C24'
   *  Constant: '<S52>/single2'
   *  Logic: '<S52>/AND30'
   *  RelationalOperator: '<S52>/Equal2'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C24':
   *  [1]
   */
  if (HvCoorn_bSmtBatSocZeroOvrdEna_C && (rtb_TmpSignalConversionAticbms_ <
       0.01F)) {
    /* Abs: '<S20>/Abs2' incorporates:
     *  Constant: '<S52>/single3'
     */
    rtb_TmpSignalConversionAtian__o = 100.0F;
  } else {
    /* Abs: '<S20>/Abs2' */
    rtb_TmpSignalConversionAtian__o = rtb_TmpSignalConversionAticbms_;
  }

  /* End of Switch: '<S52>/Switch9' */

  /* RelationalOperator: '<S52>/Greater26' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C18'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C18':
   *  [8]
   */
  rtb_Greater26 = (rtb_TmpSignalConversionAtian__o <=
                   HvCoorn_pctHvBatSocRemMntnExThd_C);

  /* UnitDelay: '<S52>/UnitDelay1' */
  rtb_TmpSignalConversionAtictcp_ = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_gx;

  /* Logic: '<S30>/AND14' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C1'
   *  RelationalOperator: '<S52>/Greater1'
   *  UnitDelay: '<S52>/UnitDelay1'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C1':
   *  [3]
   */
  rtb_AND14_l = (HvCoorn_ARID_DEF.UnitDelay1_DSTATE_gx <
                 HvCoorn_ctSmtBatMntnFailThd_C);

  /* RelationalOperator: '<S150>/Relational Operator' incorporates:
   *  Constant: '<S150>/single4'
   *  UnitDelay: '<S150>/Unit Delay'
   */
  rtb_RelationalOperator_ce_idx_0 = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_g1[0] > 0);
  rtb_RelationalOperator_ce_idx_1 = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_g1[1] > 0);

  /* SignalConversion generated from: '<S1>/icebs_uLvBat' incorporates:
   *  Inport: '<Root>/icebs_uLvBat'
   */
  (void)Rte_Read_icebs_uLvBat_Value(&rtb_TmpSignalConversionAticeb_g);

  /* Delay: '<S132>/Delay' */
  if (HvCoorn_ARID_DEF.icLoad) {
    HvCoorn_ARID_DEF.Delay_DSTATE = rtb_TmpSignalConversionAticeb_g;
  }

  /* Switch: '<S132>/Switch2' incorporates:
   *  Constant: '<S52>/FALSE5'
   *  Constant: '<S52>/TRUE2'
   *  Switch: '<S132>/Switch3'
   *
   * Block description for '<S52>/FALSE5':
   *  FALSE
   *
   * Block description for '<S52>/TRUE2':
   *  TRUE
   */
  if (false) {
    /* Switch: '<S132>/Switch2' */
    rtb_Switch3_e3j = rtb_TmpSignalConversionAticeb_g;
  } else {
    if (true) {
      /* Switch: '<S132>/Switch3' incorporates:
       *  Delay: '<S132>/Delay'
       */
      rtb_Switch3_e3j = HvCoorn_ARID_DEF.Delay_DSTATE;
    } else {
      /* Switch: '<S132>/Switch3' */
      rtb_Switch3_e3j = rtb_TmpSignalConversionAticeb_g;
    }

    /* Switch: '<S132>/Switch2' incorporates:
     *  Constant: '<S132>/single'
     *  Constant: '<S52>/CrCtl_tiFltVeh_C'
     *  Constant: '<S52>/TaskTime_s11'
     *  MinMax: '<S132>/MinMax1'
     *  Product: '<S132>/K'
     *  Product: '<S132>/Product'
     *  Sum: '<S132>/Subtract'
     *  Sum: '<S132>/dif'
     *
     * Block description for '<S52>/CrCtl_tiFltVeh_C':
     *  [0.02]
     */
    rtb_Switch3_e3j += 0.01F / fmaxf(fmaxf(0.01F, HvCoorn_tiFiltLvVolt_C),
      1.0E-5F) * (rtb_TmpSignalConversionAticeb_g - rtb_Switch3_e3j);
  }

  /* End of Switch: '<S132>/Switch2' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/ipf_bLIN9EBS0x34NodLostErr' */
  (void)Rte_Read_ipf_bLIN9EBS0x34NodLostErr_Value(&rtb_Not1_eo);

  /* Inport: '<Root>/idi_uPwrSply' */
  (void)Rte_Read_idi_uPwrSply_Value(&tmpRead_a);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Switch: '<S132>/Switch1' incorporates:
   *  Constant: '<S52>/TRUE2'
   *
   * Block description for '<S52>/TRUE2':
   *  TRUE
   */
  if (true) {
    /* Switch: '<S132>/Switch1' */
    HvCoorn_uLvBat = rtb_Switch3_e3j;
  } else {
    /* Switch: '<S132>/Switch1' */
    HvCoorn_uLvBat = rtb_TmpSignalConversionAticeb_g;
  }

  /* End of Switch: '<S132>/Switch1' */

  /* Logic: '<S52>/Not1' */
  rtb_Not1_eo = !rtb_Not1_eo;

  /* Switch: '<S52>/Switch8' */
  if (rtb_Not1_eo) {
    /* Abs: '<S20>/Abs1' */
    rtb_TmpSignalConversionAticeb_g = HvCoorn_uLvBat;
  } else {
    /* Abs: '<S20>/Abs1' */
    rtb_TmpSignalConversionAticeb_g = tmpRead_a;
  }

  /* End of Switch: '<S52>/Switch8' */

  /* Switch: '<S144>/Switch' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C13'
   *  Logic: '<S52>/AND7'
   *  RelationalOperator: '<S52>/Greater12'
   *  UnitDelay: '<S52>/UnitDelay'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C13':
   *  [13]
   */
  if (HvCoorn_bLvBatMntnReq && (rtb_TmpSignalConversionAticeb_g <
       HvCoorn_uLvBatRemMntnExThd_C)) {
    /* Sum: '<S144>/Subtract1' incorporates:
     *  Constant: '<S144>/single1'
     *  UnitDelay: '<S144>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_c < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_c)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_c > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_c)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_c + 1;
    }

    /* End of Sum: '<S144>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S144>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S144>/Switch' */

  /* Update for UnitDelay: '<S144>/Unit Delay' incorporates:
   *  Saturate: '<S144>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_c = rtb_DataTypeConversion_jq;

  /* Product: '<S144>/Divide' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C14'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C14':
   *  [15]
   */
  tmpRead_i = HvCoorn_tiRemMntnLvVoltExThd_C / HvCoorn_ConstB.Max_na;

  /* DataTypeConversion: '<S144>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S30>/AND12' incorporates:
   *  DataTypeConversion: '<S144>/DataTypeConversion'
   *  RelationalOperator: '<S144>/Relational Operator1'
   *  Saturate: '<S144>/Saturation2'
   */
  rtb_AND12_o = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Switch: '<S143>/Switch' incorporates:
   *  Constant: '<S52>/icdc_disconnected'
   *  Logic: '<S52>/AND6'
   *  RelationalOperator: '<S52>/Relational Operator5'
   *  UnitDelay: '<S52>/UnitDelay'
   *
   * Block description for '<S52>/icdc_disconnected':
   *  [1]
   */
  if (HvCoorn_bLvBatMntnReq && (rtb_TmpSignalConversionAticdc_s != ((uint8)3U)))
  {
    /* Sum: '<S143>/Subtract1' incorporates:
     *  Constant: '<S143>/single1'
     *  UnitDelay: '<S143>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_e < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_e)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_e > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_e)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_e + 1;
    }

    /* End of Sum: '<S143>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S143>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S143>/Switch' */

  /* Update for UnitDelay: '<S143>/Unit Delay' incorporates:
   *  Saturate: '<S143>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_e = rtb_DataTypeConversion_jq;

  /* Product: '<S143>/Divide' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C12'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C12':
   *  [15]
   */
  tmpRead_i = HvCoorn_tiRemMntnDcdcNoBuckEx_C / HvCoorn_ConstB.Max_d0;

  /* DataTypeConversion: '<S143>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S30>/AND23' incorporates:
   *  DataTypeConversion: '<S143>/DataTypeConversion'
   *  RelationalOperator: '<S143>/Relational Operator1'
   *  Saturate: '<S143>/Saturation2'
   */
  rtb_AND23 = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Logic: '<S150>/Logical Operator2' */
  rtb_LogicalOperator2_bz_idx_0 = (rtb_RelationalOperator_ce_idx_0 ||
    rtb_AND12_o);
  rtb_LogicalOperator2_bz_idx_1 = (rtb_RelationalOperator_ce_idx_1 || rtb_AND23);

  /* Logic: '<S136>/Logical_Operator4' incorporates:
   *  Logic: '<S120>/Logical Operator'
   *  Logic: '<S120>/Logical Operator1'
   *  Logic: '<S136>/Logical Operator1'
   *  Logic: '<S136>/Logical_Operator5'
   *  Logic: '<S52>/AND33'
   *  UnitDelay: '<S120>/Unit Delay2'
   *  UnitDelay: '<S136>/Unit Delay'
   */
  rtb_Logical_Operator4_mf_idx_0 = ((rtb_LogicalOperator2_bz_idx_0 ||
    (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_f[0])) && rtb_Logical_Operator4_i5 &&
    (rtb_AND12_o || HvCoorn_ARID_DEF.UnitDelay_DSTATE_cx[0]));
  rtb_Logical_Operator4_mf_idx_1 = ((rtb_LogicalOperator2_bz_idx_1 ||
    (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_f[1])) && rtb_Logical_Operator4_i5 &&
    (rtb_AND23 || HvCoorn_ARID_DEF.UnitDelay_DSTATE_cx[1]));

  /* RelationalOperator: '<S152>/Relational Operator' incorporates:
   *  Constant: '<S152>/single4'
   *  UnitDelay: '<S152>/Unit Delay'
   */
  rtb_RelationalOperator_f = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_i1 > 0);

  /* SignalConversion generated from: '<S1>/ved_bInhbHvOn' incorporates:
   *  Inport: '<Root>/ved_bInhbHvOn'
   */
  (void)Rte_Read_ved_bInhbHvOn_Value(&rtb_TmpSignalConversionAtved__l);

  /* Logic: '<S152>/Logical Operator2' */
  rtb_LogicalOperator2_go = (rtb_RelationalOperator_f ||
    rtb_TmpSignalConversionAtved__l);

  /* RelationalOperator: '<S148>/Relational Operator' incorporates:
   *  Constant: '<S148>/single4'
   *  UnitDelay: '<S148>/Unit Delay'
   */
  rtb_RelationalOperator_iq = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_m > 0);

  /* RelationalOperator: '<S31>/Equal12' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C6'
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C7'
   *  Constant: '<S52>/single'
   *  Constant: '<S52>/single1'
   *  Constant: '<S52>/uint8'
   *  Logic: '<S148>/Logical Operator2'
   *  Logic: '<S52>/AND1'
   *  Logic: '<S52>/AND17'
   *  Logic: '<S52>/AND18'
   *  Logic: '<S52>/AND24'
   *  Logic: '<S52>/AND3'
   *  Logic: '<S52>/Not'
   *  RelationalOperator: '<S52>/Greater13'
   *  RelationalOperator: '<S52>/Greater14'
   *  RelationalOperator: '<S52>/Greater6'
   *  RelationalOperator: '<S52>/Greater7'
   *  RelationalOperator: '<S52>/Greater8'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C6':
   *  [70]
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C7':
   *  [11.8]
   */
  rtb_Equal12_a = ((((rtb_TmpSignalConversionAticebs_ <=
                      HvCoorn_pctLvBatSocRemMntnThd_C) &&
                     (rtb_TmpSignalConversionAticeb_a == ((uint8)2U))) ||
                    ((rtb_TmpSignalConversionAticeb_g <
                      HvCoorn_uLvBatRemMntnThd_C) &&
                     ((!rtb_RelationalOperator_iq) &&
                      rtb_RelationalOperator_f_tmp))) &&
                   ((rtb_TmpSignalConversionAticebs_ > 0.1F) &&
                    (rtb_TmpSignalConversionAticeb_g > 0.1F)));

  /* Logic: '<S52>/AND' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C2'
   *  Constant: '<S52>/uint6'
   *  Constant: '<S52>/uint7'
   *  Logic: '<S52>/AND19'
   *  RelationalOperator: '<S52>/Greater15'
   *  RelationalOperator: '<S52>/Greater16'
   *  RelationalOperator: '<S52>/Greater2'
   *  UnitDelay: '<S3>/Unit Delay2'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C2':
   *  [8]
   */
  HvCoorn_bLvBatMntnReqSetRaw = (rtb_RelationalOperator_f_tmp && ((HvCoorn_stHVP
    != ((uint8)89U)) && (HvCoorn_stHVP != ((uint8)90U))) && rtb_AND14_l &&
    (rtb_TmpSignalConversionAtian__o > HvCoorn_pctHvBatSocRemMntnThd_C) &&
    rtb_Equal12_a);

  /* Switch: '<S146>/Switch' */
  if (HvCoorn_bLvBatMntnReqSetRaw) {
    /* Sum: '<S146>/Subtract1' incorporates:
     *  Constant: '<S146>/single1'
     *  UnitDelay: '<S146>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_aha < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_aha)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_aha > 0) && (1 > MAX_int32_T -
                HvCoorn_ARID_DEF.UnitDelay_DSTATE_aha)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_aha + 1;
    }

    /* End of Sum: '<S146>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S146>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S146>/Switch' */

  /* Update for UnitDelay: '<S146>/Unit Delay' incorporates:
   *  Saturate: '<S146>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_aha = rtb_DataTypeConversion_jq;

  /* Product: '<S146>/Divide' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C29'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C29':
   *  [0.1]
   */
  tmpRead_i = HvCoorn_tiLvBatMntnReqThd_C / HvCoorn_ConstB.Max_ji;

  /* DataTypeConversion: '<S146>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S146>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S146>/DataTypeConversion'
   *  Saturate: '<S146>/Saturation2'
   */
  HvCoorn_bLvBatMntnReqSet = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Logic: '<S52>/OR4' incorporates:
   *  Logic: '<S134>/Logical_Operator5'
   *  UnitDelay: '<S52>/UnitDelay'
   */
  rtb_AND1_al = (HvCoorn_bLvBatMntnReqSet || HvCoorn_bLvBatMntnReq);

  /* Logic: '<S138>/Logical_Operator4' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C23'
   *  Logic: '<S118>/Logical Operator'
   *  Logic: '<S118>/Logical Operator1'
   *  Logic: '<S138>/Logical Operator1'
   *  Logic: '<S138>/Logical_Operator5'
   *  Logic: '<S52>/AND12'
   *  Logic: '<S52>/AND29'
   *  Logic: '<S52>/AND34'
   *  Logic: '<S52>/OR4'
   *  UnitDelay: '<S118>/Unit Delay2'
   *  UnitDelay: '<S138>/Unit Delay'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C23':
   *  [0]
   */
  rtb_Logical_Operator4_i5 = ((rtb_LogicalOperator2_go ||
    (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_fw) ||
    (!HvCoorn_bRemMntnFailKeepRstEna_C)) && rtb_Logical_Operator4_i5 &&
    ((rtb_AND1_al && rtb_TmpSignalConversionAtved__l) ||
     HvCoorn_ARID_DEF.UnitDelay_DSTATE_mw));

  /* Logic: '<S52>/AND28' */
  HvCoorn_bRemLvBatMntnFail = (rtb_Logical_Operator4_mf_idx_0 ||
    rtb_Logical_Operator4_mf_idx_1 || rtb_Logical_Operator4_i5);

  /* Logic: '<S52>/AND4' incorporates:
   *  Logic: '<S52>/AND21'
   *  Logic: '<S52>/OR'
   *  Logic: '<S52>/OR2'
   */
  HvCoorn_bRemLvBatMntnEx_tmp = (rtb_TmpSignalConversionAticem_e ||
    rtb_LogicalOperator_mf);

  /* Logic: '<S52>/Not2' incorporates:
   *  Logic: '<S52>/Not4'
   */
  rtb_AND14_l = !rtb_AND14_l;

  /* Logic: '<S52>/AND25' incorporates:
   *  Logic: '<S52>/AND27'
   *  Logic: '<S52>/Not2'
   */
  HvCoorn_bRemLvBatMntnEx_tmp_0 = (rtb_Greater26 || rtb_AND14_l);

  /* Logic: '<S52>/AND4' incorporates:
   *  Logic: '<S52>/AND11'
   *  Logic: '<S52>/AND25'
   */
  HvCoorn_bRemLvBatMntnEx = (HvCoorn_bRemLvBatMntnEx_tmp ||
    rtb_TmpSignalConversionAticic_a || rtb_Logical_Operator4_en ||
    (HvCoorn_bRemLvBatMntnEx_tmp_0 || HvCoorn_bRemLvBatMntnFail));

  /* Logic: '<S134>/Logical_Operator4' incorporates:
   *  Logic: '<S134>/Logical Operator1'
   */
  HvCoorn_bLvBatMntnReq = ((!HvCoorn_bRemLvBatMntnEx) && rtb_AND1_al);

  /* Switch: '<S54>/Switch1' */
  if (rtb_Equal3_a) {
    /* Switch: '<S54>/Switch1' */
    HvCoorn_bRemLvBatMntnReq = HvCoorn_bLbmsLvBatMntnReq;
  } else {
    /* Switch: '<S54>/Switch1' */
    HvCoorn_bRemLvBatMntnReq = HvCoorn_bLvBatMntnReq;
  }

  /* End of Switch: '<S54>/Switch1' */

  /* Logic: '<S51>/OR5' incorporates:
   *  Logic: '<S323>/Not'
   */
  tmp_0 = !rtb_TmpSignalConversionAtved_bI;

  /* Switch: '<S114>/Switch' incorporates:
   *  Constant: '<S51>/Calibration6'
   *  Constant: '<S51>/TaskTime_s1'
   *  Constant: '<S51>/TaskTime_s2'
   *  Constant: '<S51>/sup_percSocAdj4HvOn_C'
   *  Constant: '<S51>/uint1'
   *  Logic: '<S51>/AND'
   *  Logic: '<S51>/Not'
   *  Logic: '<S51>/OR4'
   *  Logic: '<S51>/OR5'
   *  RelationalOperator: '<S51>/Equal2'
   *  RelationalOperator: '<S51>/Equal4'
   *  RelationalOperator: '<S51>/Equal5'
   *  RelationalOperator: '<S51>/Equal6'
   *  RelationalOperator: '<S51>/Relational Operator10'
   *
   * Block description for '<S51>/Calibration6':
   *  [3]
   *
   * Block description for '<S51>/TaskTime_s1':
   *  [4]
   *
   * Block description for '<S51>/TaskTime_s2':
   *  [6]
   *
   * Block description for '<S51>/sup_percSocAdj4HvOn_C':
   *  [10]
   */
  if (((rtb_TmpSignalConversionAtGearLv != ((uint8)6U)) &&
       (rtb_TmpSignalConversionAtGearLv != ((uint8)4U))) ||
      (rtb_TmpSignalConversionAticbms_ > HvCoorn_pctSocTransptHvOff_C) ||
      (rtb_Switch7 != ((uint8)2U)) || ((tmpRead_f >=
        HvCoorn_volTankRmnFuLowrTranMod_C) && tmp_0)) {
    /* Sum: '<S114>/Subtract1' incorporates:
     *  Constant: '<S114>/single1'
     *  UnitDelay: '<S114>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ff < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ff)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ff > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ff)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ff + 1;
    }

    /* End of Sum: '<S114>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S114>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S114>/Switch' */

  /* Update for UnitDelay: '<S114>/Unit Delay' incorporates:
   *  Saturate: '<S114>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ff = rtb_DataTypeConversion_jq;

  /* Product: '<S114>/Divide' incorporates:
   *  Constant: '<S51>/hpp_percBatDchgSocThre_C6'
   *
   * Block description for '<S51>/hpp_percBatDchgSocThre_C6':
   *  [0.3]
   */
  tmpRead_i = HvCoorn_tiCarModPwrOffDly_C / HvCoorn_ConstB.Max_eu;

  /* DataTypeConversion: '<S114>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S51>/AND1' incorporates:
   *  DataTypeConversion: '<S114>/DataTypeConversion'
   *  Logic: '<S51>/OR1'
   *  RelationalOperator: '<S114>/Relational Operator1'
   *  Saturate: '<S114>/Saturation2'
   *  UnitDelay: '<S3>/Unit Delay4'
   */
  rtb_AND1_al = ((HvCoorn_bRemPwrUp || HvCoorn_bKeyOnPwrUp || rtb_AND26_o ||
                  rtb_AND9_c || HvCoorn_bV2LActv || HvCoorn_bRemLvBatMntnReq) &&
                 (rtb_DataTypeConversion_jq > (sint32)tmpRead_i));

  /* DataTypeConversion: '<S113>/Data Type Conversion1' incorporates:
   *  ArithShift: '<S113>/Shift Arithmetic1'
   *  ArithShift: '<S113>/Shift Arithmetic2'
   *  ArithShift: '<S113>/Shift Arithmetic3'
   *  ArithShift: '<S113>/Shift Arithmetic4'
   *  ArithShift: '<S113>/Shift Arithmetic5'
   *  ArithShift: '<S113>/Shift Arithmetic6'
   *  ArithShift: '<S113>/Shift Arithmetic7'
   *  DataTypeConversion: '<S113>/Data Type Conversion2'
   *  DataTypeConversion: '<S113>/Data Type Conversion3'
   *  DataTypeConversion: '<S113>/Data Type Conversion4'
   *  DataTypeConversion: '<S113>/Data Type Conversion5'
   *  DataTypeConversion: '<S113>/Data Type Conversion6'
   *  DataTypeConversion: '<S113>/Data Type Conversion7'
   *  DataTypeConversion: '<S113>/Data Type Conversion8'
   *  DataTypeConversion: '<S113>/Data Type Conversion9'
   *  Sum: '<S113>/Add'
   *  UnitDelay: '<S3>/Unit Delay4'
   */
  HvCoorn_stStartUpReq = (uint8)((((((((uint32)(HvCoorn_bDCChrgPwrUp << 1) +
    HvCoorn_bACChrgPwrUp) + (uint32)(HvCoorn_bRemPwrUp << 2)) + (uint32)
    (HvCoorn_bKeyOnPwrUp << 3)) + (uint32)(rtb_AND26_o << 4)) + (uint32)
    (rtb_AND9_c << 5)) + (uint32)(HvCoorn_bV2LActv << 6)) + (uint32)
    (HvCoorn_bRemLvBatMntnReq << 7));

  /* Logic: '<S30>/AND9' incorporates:
   *  RelationalOperator: '<S7>/Equal'
   *  UnitDelay: '<S7>/Unit Delay'
   */
  rtb_AND9_c = (HvCoorn_stStartUpReq > HvCoorn_ARID_DEF.UnitDelay_DSTATE_fn);

  /* SignalConversion generated from: '<S1>/icfm_uAct' incorporates:
   *  Inport: '<Root>/icfm_uAct'
   */
  (void)Rte_Read_icfm_uAct_Value(&rtb_TmpSignalConversionAticfm_u);

  /* SignalConversion generated from: '<S1>/icdc_uHvAct' incorporates:
   *  Inport: '<Root>/icdc_uHvAct'
   */
  (void)Rte_Read_icdc_uHvAct_Value(&rtb_TmpSignalConversionAticdc_u);

  /* SignalConversion generated from: '<S1>/icbms_stDcChrg' incorporates:
   *  Inport: '<Root>/icbms_stDcChrg'
   */
  (void)Rte_Read_icbms_stDcChrg_Value(&rtb_TmpSignalConversionAticbm_p);

  /* MinMax: '<S7>/Min' incorporates:
   *  MinMax: '<S10>/Max'
   *  MinMax: '<S14>/Max'
   *  MinMax: '<S326>/Min'
   *  Switch: '<S10>/Switch'
   */
  tmpRead_f = fmaxf(rtb_TmpSignalConversionAticfm_u,
                    rtb_TmpSignalConversionAticrm_u);
  rtb_TmpSignalConversionAticeb_g = fmaxf(tmpRead_f,
    rtb_TmpSignalConversionAticdc_u);

  /* Switch: '<S7>/Switch1' incorporates:
   *  Constant: '<S7>/TRUE2'
   *  Constant: '<S7>/icm_ready'
   *  RelationalOperator: '<S7>/Relational Operator2'
   *
   * Block description for '<S7>/TRUE2':
   *  TRUE
   *
   * Block description for '<S7>/icm_ready':
   *  [3]
   */
  if (rtb_TmpSignalConversionAtVehC_i) {
    tmp_1 = true;
  } else {
    tmp_1 = (rtb_TmpSignalConversionAticfm_s == ((uint8)3U));
  }

  /* Switch: '<S7>/Switch3' incorporates:
   *  Constant: '<S7>/TRUE'
   *  Constant: '<S7>/icobc_connected'
   *  Constant: '<S7>/icobc_connected1'
   *  Logic: '<S7>/Logical Operator18'
   *  Logic: '<S7>/Logical Operator8'
   *  RelationalOperator: '<S7>/Relational Operator3'
   *  RelationalOperator: '<S7>/Relational Operator7'
   *
   * Block description for '<S7>/TRUE':
   *  TRUE
   *
   * Block description for '<S7>/icobc_connected':
   *  [2]
   *
   * Block description for '<S7>/icobc_connected1':
   *  [2]
   */
  if (rtb_Equal3_lx && rtb_RelationalOperator_f_tmp) {
    tmp_2 = ((rtb_TmpSignalConversionAticob_c == ((uint8)2U)) ||
             (rtb_TmpSignalConversionAticob_c == ((uint8)3U)));
  } else {
    tmp_2 = true;
  }

  /* Switch: '<S7>/Switch2' incorporates:
   *  Constant: '<S7>/TRUE1'
   *  Constant: '<S7>/uint3'
   *  Constant: '<S7>/uint4'
   *  Constant: '<S7>/uint5'
   *  Constant: '<S7>/uint6'
   *  Logic: '<S7>/Logical Operator15'
   *  Logic: '<S7>/Logical Operator16'
   *  Logic: '<S7>/Logical Operator3'
   *  RelationalOperator: '<S7>/Relational Operator10'
   *  RelationalOperator: '<S7>/Relational Operator11'
   *  RelationalOperator: '<S7>/Relational Operator13'
   *  RelationalOperator: '<S7>/Relational Operator14'
   *
   * Block description for '<S7>/TRUE1':
   *  TRUE
   *
   * Block description for '<S7>/uint3':
   *  NoActive
   *
   * Block description for '<S7>/uint4':
   *  Active
   *
   * Block description for '<S7>/uint5':
   *  DCPlug_WakeupInactive
   *
   * Block description for '<S7>/uint6':
   *  DCPlug_WakeupActive
   */
  if (rtb_RelationalOperator_f_tmp && ((rtb_TmpSignalConversionAticbm_l ==
        ((uint8)1U)) || (rtb_TmpSignalConversionAticbm_l == ((uint8)2U)))) {
    rtb_bGearOk = ((rtb_TmpSignalConversionAticbm_p == ((uint8)0U)) ||
                   (rtb_TmpSignalConversionAticbm_p == ((uint8)1U)));
  } else {
    rtb_bGearOk = true;
  }

  /* Logic: '<S7>/Logical Operator12' incorporates:
   *  Constant: '<S7>/icdc_connected'
   *  Constant: '<S7>/icm_ready1'
   *  Constant: '<S7>/sup_uThres_C'
   *  Constant: '<S7>/sup_vLowBatVoltLim_C1'
   *  Constant: '<S7>/sup_vLowBatVoltLim_C2'
   *  Constant: '<S7>/sup_vLowBatVoltLim_C4'
   *  Logic: '<S7>/AND'
   *  Logic: '<S7>/Logical Operator13'
   *  Logic: '<S7>/Logical Operator17'
   *  Logic: '<S7>/Logical Operator20'
   *  Logic: '<S7>/OR'
   *  MinMax: '<S7>/Min'
   *  RelationalOperator: '<S7>/Relational Operator1'
   *  RelationalOperator: '<S7>/Relational Operator12'
   *  RelationalOperator: '<S7>/Relational Operator6'
   *  Switch: '<S7>/Switch1'
   *  Switch: '<S7>/Switch2'
   *  Switch: '<S7>/Switch3'
   *
   * Block description for '<S7>/icdc_connected':
   *  [2]
   *
   * Block description for '<S7>/icm_ready1':
   *  [3]
   *
   * Block description for '<S7>/sup_uThres_C':
   *  [220]
   *
   * Block description for '<S7>/sup_vLowBatVoltLim_C1':
   *  [1]
   *
   * Block description for '<S7>/sup_vLowBatVoltLim_C2':
   *  [1]
   *
   * Block description for '<S7>/sup_vLowBatVoltLim_C4':
   *  [1]
   */
  HvCoorn_bHvLinkOk = (HvCoorn_bHvRlyClsAct && (fmaxf
    (rtb_TmpSignalConversionAticeb_g, rtb_TmpSignalConversionAticisg_) >=
    HvCoorn_uThd4PreChrg_C) && ((tmp_1 && (rtb_TmpSignalConversionAticrm_s ==
    ((uint8)3U))) || HvCoorn_bHvOnFailMCUModByp_C) &&
                       ((rtb_TmpSignalConversionAticdc_s == ((uint8)2U)) ||
                        HvCoorn_bHvOnDCDCByp_C) && ((tmp_2 && rtb_bGearOk) ||
    HvCoorn_bHvOnFailChrgStatByp_C));

  /* Logic: '<S30>/AND26' incorporates:
   *  Constant: '<S7>/sup_bHvCompReadyEnaMan_C'
   *  Logic: '<S7>/Logical Operator2'
   *
   * Block description for '<S7>/sup_bHvCompReadyEnaMan_C':
   *  [0]
   */
  rtb_AND26_o = (HvCoorn_bHvLinkOk || HvCoorn_bHvCptRdyEnaMan_C);

  /* Switch: '<S175>/Switch' incorporates:
   *  Constant: '<S7>/uint2'
   *  Logic: '<S7>/Logical Operator4'
   *  Logic: '<S7>/Logical Operator5'
   *  RelationalOperator: '<S7>/Relational Operator8'
   *  UnitDelay: '<S3>/Unit Delay2'
   *
   * Block description for '<S7>/uint2':
   *  HvContactorRequest
   */
  if ((!rtb_AND26_o) && (HvCoorn_stHVP == ((uint8)12U))) {
    /* Sum: '<S175>/Subtract1' incorporates:
     *  Constant: '<S175>/single1'
     *  UnitDelay: '<S175>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1 < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1 > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1 + 1;
    }

    /* End of Sum: '<S175>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S175>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S175>/Switch' */

  /* Update for UnitDelay: '<S175>/Unit Delay' incorporates:
   *  Saturate: '<S175>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1 = rtb_DataTypeConversion_jq;

  /* Product: '<S175>/Divide' incorporates:
   *  Constant: '<S7>/sup_tiHvOnFailSet_C'
   *
   * Block description for '<S7>/sup_tiHvOnFailSet_C':
   *  [5]
   */
  tmpRead_i = HvCoorn_tiHvOnFailSet_C / HvCoorn_ConstB.Max_l;

  /* DataTypeConversion: '<S175>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S174>/Logical Operator1' incorporates:
   *  Logic: '<S166>/Logical Operator1'
   */
  rtb_Logical_Operator4_ee = !rtb_AND9_c;

  /* Logic: '<S174>/Logical_Operator4' incorporates:
   *  DataTypeConversion: '<S175>/DataTypeConversion'
   *  Logic: '<S174>/Logical Operator1'
   *  Logic: '<S174>/Logical_Operator5'
   *  RelationalOperator: '<S175>/Relational Operator1'
   *  Saturate: '<S175>/Saturation2'
   *  UnitDelay: '<S174>/Unit Delay'
   */
  HvCoorn_bHvOnFail = (rtb_Logical_Operator4_ee && ((rtb_DataTypeConversion_jq >
    (sint32)tmpRead_i) || HvCoorn_bHvOnFail));

  /* Logic: '<S6>/Logical Operator6' incorporates:
   *  Constant: '<S1>/single1'
   *  Constant: '<S6>/sup_vLowBatVoltLim_C1'
   *  RelationalOperator: '<S165>/Relational Operator1'
   *
   * Block description for '<S6>/sup_vLowBatVoltLim_C1':
   *  [9]
   */
  rtb_LogicalOperator6_hy = (HvCoorn_uHiThdLvBatVolt_C <= 12.0F);

  /* Switch: '<S165>/Switch1' incorporates:
   *  Constant: '<S1>/single1'
   *  Constant: '<S6>/sup_vLowBatVoltLim_C'
   *  Logic: '<S165>/Logical Operator1'
   *  RelationalOperator: '<S165>/Relational Operator'
   *
   * Block description for '<S6>/sup_vLowBatVoltLim_C':
   *  [6]
   */
  if (rtb_LogicalOperator6_hy || (12.0F <= HvCoorn_uLoThdLvBatVolt_C)) {
    /* Switch: '<S165>/Switch1' */
    rtb_LogicalOperator20_a = rtb_LogicalOperator6_hy;
  } else {
    /* Switch: '<S165>/Switch1' incorporates:
     *  UnitDelay: '<S165>/Unit Delay1'
     */
    rtb_LogicalOperator20_a = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_h;
  }

  /* End of Switch: '<S165>/Switch1' */

  /* Switch: '<S5>/Switch' incorporates:
   *  RelationalOperator: '<S5>/Relational Operator2'
   *  UnitDelay: '<S3>/Unit Delay2'
   *  UnitDelay: '<S5>/Unit Delay1'
   */
  if (HvCoorn_stHVP != HvCoorn_ARID_DEF.UnitDelay1_DSTATE_gu) {
    /* Switch: '<S5>/Switch' incorporates:
     *  Constant: '<S5>/uint32'
     */
    rtb_DataTypeConversion = 0U;
  } else {
    /* Sum: '<S5>/Sum1' incorporates:
     *  Constant: '<S5>/uint1'
     *  UnitDelay: '<S5>/Unit Delay2'
     */
    rtb_DataTypeConversion = 1U + /*MW:OvSatOk*/
      HvCoorn_ARID_DEF.UnitDelay2_DSTATE;
    if (rtb_DataTypeConversion < 1U) {
      rtb_DataTypeConversion = MAX_uint32_T;
    }

    /* MinMax: '<S5>/MinMax' incorporates:
     *  Constant: '<S5>/uint2'
     *  Sum: '<S5>/Sum1'
     */
    if (rtb_DataTypeConversion > 65535U) {
      /* Switch: '<S5>/Switch' */
      rtb_DataTypeConversion = 65535U;
    }

    /* End of MinMax: '<S5>/MinMax' */
  }

  /* End of Switch: '<S5>/Switch' */

  /* Product: '<S5>/product' incorporates:
   *  Constant: '<S5>/TaskTime_s2'
   *  DataTypeConversion: '<S5>/DataTypeConversion'
   */
  HvCoorn_tiHVPStTimer = (float32)rtb_DataTypeConversion * 0.01F;

  /* Switch: '<S6>/Switch3' */
  if (rtb_Equal3_lx) {
    /* Logic: '<S6>/Logical Operator6' incorporates:
     *  Constant: '<S6>/icobc_connected'
     *  Constant: '<S6>/icobc_disconnected'
     *  Logic: '<S6>/Logical Operator12'
     *  RelationalOperator: '<S6>/Relational Operator11'
     *  RelationalOperator: '<S6>/Relational Operator12'
     *
     * Block description for '<S6>/icobc_connected':
     *  [2]
     *
     * Block description for '<S6>/icobc_disconnected':
     *  [1]
     */
    rtb_LogicalOperator6_hy = ((rtb_TmpSignalConversionAticob_c == ((uint8)1U)) ||
      (rtb_TmpSignalConversionAticob_c == ((uint8)2U)));
  } else {
    /* Logic: '<S6>/Logical Operator6' incorporates:
     *  Constant: '<S6>/TRUE'
     *
     * Block description for '<S6>/TRUE':
     *  TRUE
     */
    rtb_LogicalOperator6_hy = true;
  }

  /* End of Switch: '<S6>/Switch3' */

  /* Logic: '<S6>/Logical Operator10' incorporates:
   *  Logic: '<S31>/Not'
   */
  tmp_1 = !HvCoorn_bDCChrgLink;

  /* Switch: '<S6>/Switch2' incorporates:
   *  Logic: '<S6>/Logical Operator1'
   *  Logic: '<S6>/Logical Operator10'
   */
  if ((!rtb_Equal3_lx) && tmp_1) {
    /* RelationalOperator: '<S52>/Equal3' incorporates:
     *  Constant: '<S6>/sup_percSocAdj4HvOn_C'
     *  Constant: '<S6>/sup_pwrBatDchg4HvOn_C'
     *  Logic: '<S6>/Logical Operator23'
     *  RelationalOperator: '<S6>/Relational Operator10'
     *  RelationalOperator: '<S6>/Relational Operator17'
     *
     * Block description for '<S6>/sup_percSocAdj4HvOn_C':
     *  [-1]
     *
     * Block description for '<S6>/sup_pwrBatDchg4HvOn_C':
     *  [-1000]
     */
    rtb_Equal3_lx = ((rtb_TmpSignalConversionAticbms_ > HvCoorn_pctSocAdj4HvOn_C)
                     && (rtb_TmpSignalConversionAtPwrLim >
                         HvCoorn_pwrBatDChrg4HvOn_C));
  } else {
    /* RelationalOperator: '<S52>/Equal3' incorporates:
     *  Constant: '<S6>/TRUE1'
     *
     * Block description for '<S6>/TRUE1':
     *  TRUE
     */
    rtb_Equal3_lx = true;
  }

  /* End of Switch: '<S6>/Switch2' */

  /* SignalConversion generated from: '<S1>/icbms_bPrecResOverTemp' incorporates:
   *  Inport: '<Root>/icbms_bPrecResOverTemp'
   */
  (void)Rte_Read_icbms_bPrecResOverTemp_Value(&rtb_TmpSignalConversionAticbm_o);

  /* Logic: '<S31>/AND7' incorporates:
   *  Constant: '<S6>/uint3'
   *  RelationalOperator: '<S6>/Relational Operator15'
   *  UnitDelay: '<S3>/Unit Delay2'
   *
   * Block description for '<S6>/uint3':
   *  Wait4Communication
   */
  rtb_AND7_j = (HvCoorn_stHVP == ((uint8)11U));

  /* Switch: '<S167>/Switch' incorporates:
   *  Logic: '<S6>/Logical Operator15'
   */
  if (rtb_TmpSignalConversionAticbm_o && rtb_AND7_j) {
    /* Sum: '<S167>/Subtract1' incorporates:
     *  Constant: '<S167>/single1'
     *  UnitDelay: '<S167>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_jg < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_jg)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_jg > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_jg)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_jg + 1;
    }

    /* End of Sum: '<S167>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S167>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S167>/Switch' */

  /* Update for UnitDelay: '<S167>/Unit Delay' incorporates:
   *  Saturate: '<S167>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_jg = rtb_DataTypeConversion_jq;

  /* Product: '<S167>/Divide' incorporates:
   *  Constant: '<S6>/sup_tiWaitPrecResTemp_C'
   *
   * Block description for '<S6>/sup_tiWaitPrecResTemp_C':
   *  [3]
   */
  tmpRead_i = HvCoorn_tiWaitPrecResTemp_C / HvCoorn_ConstB.Max_jy;

  /* DataTypeConversion: '<S167>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S166>/Logical_Operator4' incorporates:
   *  DataTypeConversion: '<S167>/DataTypeConversion'
   *  Logic: '<S166>/Logical_Operator5'
   *  RelationalOperator: '<S167>/Relational Operator1'
   *  Saturate: '<S167>/Saturation2'
   *  UnitDelay: '<S166>/Unit Delay'
   */
  rtb_Logical_Operator4_ee = (rtb_Logical_Operator4_ee &&
    ((rtb_DataTypeConversion_jq > (sint32)tmpRead_i) ||
     HvCoorn_ARID_DEF.UnitDelay_DSTATE_cu));

  /* Switch: '<S6>/Switch1' incorporates:
   *  Constant: '<S6>/TRUE2'
   *  Constant: '<S6>/sup_pwrBatDchg4HvOn_C1'
   *  Constant: '<S6>/sup_pwrBatDchg4HvOn_C2'
   *  Logic: '<S6>/Logical Operator14'
   *  RelationalOperator: '<S6>/Relational Operator13'
   *  RelationalOperator: '<S6>/Relational Operator14'
   *
   * Block description for '<S6>/TRUE2':
   *  TRUE
   *
   * Block description for '<S6>/sup_pwrBatDchg4HvOn_C1':
   *  [6]
   *
   * Block description for '<S6>/sup_pwrBatDchg4HvOn_C2':
   *  [4]
   */
  if (rtb_TmpSignalConversionAtidi_bK) {
    tmp_2 = ((rtb_TmpSignalConversionAtGearLv == ((uint8)6U)) ||
             (rtb_TmpSignalConversionAtGearLv == ((uint8)4U)));
  } else {
    tmp_2 = true;
  }

  /* Logic: '<S6>/Logical Operator6' incorporates:
   *  Constant: '<S1>/single1'
   *  Constant: '<S6>/icbms_offline'
   *  Constant: '<S6>/icbms_offline1'
   *  Constant: '<S6>/icdc_connected'
   *  Constant: '<S6>/icdc_disconnected'
   *  Constant: '<S6>/icm_standby'
   *  Constant: '<S6>/icm_standby1'
   *  Constant: '<S6>/icm_standby2'
   *  Constant: '<S6>/icm_standby3'
   *  Constant: '<S6>/sup_bHVReqGearDisable_C'
   *  Constant: '<S6>/sup_tiWait4Comm_C'
   *  Constant: '<S6>/sup_vLowBatVoltLim_C2'
   *  Constant: '<S6>/sup_vLowBatVoltLim_C3'
   *  Logic: '<S6>/Logical Operator13'
   *  Logic: '<S6>/Logical Operator16'
   *  Logic: '<S6>/Logical Operator2'
   *  Logic: '<S6>/Logical Operator20'
   *  Logic: '<S6>/Logical Operator21'
   *  Logic: '<S6>/Logical Operator24'
   *  Logic: '<S6>/Logical Operator3'
   *  Logic: '<S6>/Logical Operator4'
   *  Logic: '<S6>/Logical Operator5'
   *  Logic: '<S6>/Logical Operator7'
   *  Logic: '<S6>/Logical Operator8'
   *  RelationalOperator: '<S6>/Lower'
   *  RelationalOperator: '<S6>/Relational Operator1'
   *  RelationalOperator: '<S6>/Relational Operator16'
   *  RelationalOperator: '<S6>/Relational Operator18'
   *  RelationalOperator: '<S6>/Relational Operator19'
   *  RelationalOperator: '<S6>/Relational Operator2'
   *  RelationalOperator: '<S6>/Relational Operator3'
   *  RelationalOperator: '<S6>/Relational Operator4'
   *  RelationalOperator: '<S6>/Relational Operator5'
   *  RelationalOperator: '<S6>/Relational Operator7'
   *  Switch: '<S6>/Switch1'
   *
   * Block description for '<S6>/icbms_offline':
   *  [1]
   *
   * Block description for '<S6>/icbms_offline1':
   *  [6]
   *
   * Block description for '<S6>/icdc_connected':
   *  [2]
   *
   * Block description for '<S6>/icdc_disconnected':
   *  [1]
   *
   * Block description for '<S6>/icm_standby':
   *  [2]
   *
   * Block description for '<S6>/icm_standby1':
   *  [2]
   *
   * Block description for '<S6>/icm_standby2':
   *  [1]
   *
   * Block description for '<S6>/icm_standby3':
   *  [1]
   *
   * Block description for '<S6>/sup_bHVReqGearDisable_C':
   *  [0]
   *
   * Block description for '<S6>/sup_tiWait4Comm_C':
   *  [0.02]
   *
   * Block description for '<S6>/sup_vLowBatVoltLim_C2':
   *  [16]
   *
   * Block description for '<S6>/sup_vLowBatVoltLim_C3':
   *  [1]
   */
  rtb_LogicalOperator6_hy = (((rtb_TmpSignalConversionAticbm_d == ((uint8)1U)) ||
    (rtb_TmpSignalConversionAticbm_d == ((uint8)6U))) &&
    ((rtb_TmpSignalConversionAticdc_s == ((uint8)1U)) ||
     (rtb_TmpSignalConversionAticdc_s == ((uint8)2U)) || HvCoorn_bHvOnDCDCByp_C)
    && ((rtb_TmpSignalConversionAticfm_s == ((uint8)2U)) ||
        (rtb_TmpSignalConversionAticfm_s == ((uint8)1U)) ||
        ((rtb_TmpSignalConversionAticrm_s == ((uint8)2U)) ||
         (rtb_TmpSignalConversionAticrm_s == ((uint8)1U)))) &&
    (rtb_LogicalOperator20_a && (12.0F < HvCoorn_uMaxLvBatVolt_C) &&
     (HvCoorn_tiHVPStTimer >= HvCoorn_tiWait4Comm_C) && HvCoorn_bHvilStOk) &&
    rtb_LogicalOperator6_hy && rtb_Equal3_lx && (tmp_2 ||
    HvCoorn_bHVReqGearDisable_C) && ((!rtb_TmpSignalConversionAticbm_o) &&
    (!rtb_Logical_Operator4_ee)));

  /* Logic: '<S6>/Logical Operator11' incorporates:
   *  Logic: '<S6>/Logical Operator17'
   */
  rtb_TmpSignalConversionAticbm_o = ((!rtb_LogicalOperator6_hy) && rtb_AND7_j);

  /* SignalConversion generated from: '<S1>/DTC_bDiagRst' incorporates:
   *  Inport: '<Root>/DTC_bDiagRst'
   */
  (void)Rte_Read_DTC_bDiagRst_Value(&rtb_TmpSignalConversionAtDTC_bD);

  /* SignalConversion generated from: '<S1>/DTC_bDiagEnaCdnWkupSho' incorporates:
   *  Inport: '<Root>/DTC_bDiagEnaCdnWkupSho'
   */
  (void)Rte_Read_DTC_bDiagEnaCdnWkupSho_Value(&rtb_TmpSignalConversionAtDTC__c);

  /* SignalConversion generated from: '<S1>/ipf_bPCAN0x130Vld' incorporates:
   *  Inport: '<Root>/ipf_bPCAN0x130Vld'
   */
  (void)Rte_Read_ipf_bPCAN0x130Vld_Value(&rtb_TmpSignalConversionAtipf_bP);

  /* SignalConversion generated from: '<S1>/ipf_bPCAN0x111S1Vld' incorporates:
   *  Inport: '<Root>/ipf_bPCAN0x111S1Vld'
   */
  (void)Rte_Read_ipf_bPCAN0x111S1Vld_Value(&rtb_TmpSignalConversionAtipf__i);

  /* Logic: '<S31>/AND7' incorporates:
   *  Constant: '<S6>/Calibration1'
   *  Logic: '<S6>/AND1'
   *
   * Block description for '<S6>/Calibration1':
   *  [0]
   */
  rtb_AND7_j = (rtb_TmpSignalConversionAtDTC__c &&
                rtb_TmpSignalConversionAtipf_bP &&
                rtb_TmpSignalConversionAtipf__i && HvCoorn_bHvInitFailEna_C);

  /* Logic: '<S6>/AND2' incorporates:
   *  Logic: '<S6>/AND4'
   */
  rtb_Equal3_lx = (rtb_TmpSignalConversionAtDTC_bD || rtb_AND9_c || (!rtb_AND7_j));

  /* Outputs for Enabled SubSystem: '<S164>/Debounce_OBD' incorporates:
   *  EnablePort: '<S170>/Enable'
   */
  /* Logic: '<S169>/Logical Operator' incorporates:
   *  Logic: '<S169>/Logical Operator1'
   *  Logic: '<S169>/Logical Operator2'
   *  Logic: '<S169>/Logical Operator3'
   *  RelationalOperator: '<S169>/Relational Operator'
   *  UnitDelay: '<S164>/Unit Delay1'
   *  UnitDelay: '<S164>/Unit Delay2'
   */
  if ((((!HvCoorn_ARID_DEF.outRanged_e) ||
        (HvCoorn_ARID_DEF.UnitDelay1_DSTATE_kl !=
         rtb_TmpSignalConversionAticbm_o)) && rtb_AND7_j) || rtb_Equal3_lx) {
    /* Switch: '<S170>/Switch2' incorporates:
     *  Constant: '<S170>/int1'
     *  Logic: '<S170>/Logical Operator'
     *  Logic: '<S171>/Logical Operator'
     *  Logic: '<S171>/Logical Operator1'
     *  RelationalOperator: '<S170>/Relational Operator'
     *  Switch: '<S170>/Switch'
     *  UnitDelay: '<S170>/Unit Delay'
     *  UnitDelay: '<S171>/Unit Delay2'
     */
    if (rtb_Equal3_lx) {
      /* Switch: '<S170>/Switch2' incorporates:
       *  Constant: '<S170>/int16'
       */
      rtb_Switch2_p5 = 0;
    } else if (rtb_TmpSignalConversionAticbm_o &&
               (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bz) &&
               (HvCoorn_ARID_DEF.UnitDelay_DSTATE_hx < 0)) {
      /* Switch: '<S170>/Switch' incorporates:
       *  Constant: '<S170>/int16'
       *  Switch: '<S170>/Switch2'
       */
      rtb_Switch2_p5 = 0;
    } else {
      /* Switch: '<S170>/Switch2' incorporates:
       *  UnitDelay: '<S170>/Unit Delay'
       */
      rtb_Switch2_p5 = HvCoorn_ARID_DEF.UnitDelay_DSTATE_hx;
    }

    /* End of Switch: '<S170>/Switch2' */

    /* Switch: '<S170>/Switch4' */
    if (rtb_TmpSignalConversionAticbm_o) {
      /* Sum: '<S170>/Sum1' incorporates:
       *  Constant: '<S6>/int16'
       */
      rtb_DataTypeConversion_jq = 1 + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S170>/Saturation2' incorporates:
       *  Sum: '<S170>/Sum1'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    } else {
      /* Sum: '<S170>/Sum2' incorporates:
       *  Constant: '<S6>/int1'
       */
      rtb_DataTypeConversion_jq = (-1) + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S170>/Saturation2' incorporates:
       *  Sum: '<S170>/Sum2'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    }

    /* End of Switch: '<S170>/Switch4' */

    /* Saturate: '<S170>/Saturation2' */
    if (rtb_Saturation2_jr > 32766) {
      /* Saturate: '<S170>/Saturation2' */
      rtb_Saturation2_jr = 32766;
    } else if (rtb_Saturation2_jr < (-32767)) {
      /* Saturate: '<S170>/Saturation2' */
      rtb_Saturation2_jr = (-32767);
    }

    /* End of Saturate: '<S170>/Saturation2' */

    /* RelationalOperator: '<S170>/ROUpLim' incorporates:
     *  Constant: '<S6>/Calibration6'
     *
     * Block description for '<S6>/Calibration6':
     *  [9999]
     */
    HvCoorn_ARID_DEF.outRanged_e = (HvCoorn_rHvInitFailThd_C <
      rtb_Saturation2_jr);

    /* Sum: '<S6>/Subtract1' incorporates:
     *  Constant: '<S6>/Calibration6'
     *  Constant: '<S6>/Calibration7'
     *
     * Block description for '<S6>/Calibration6':
     *  [9999]
     *
     * Block description for '<S6>/Calibration7':
     *  [1]
     */
    rtb_DataTypeConversion_jq = HvCoorn_rHvInitFailThd_C - HvCoorn_rHvInitRcv_C;
    if (rtb_DataTypeConversion_jq > 32767) {
      rtb_DataTypeConversion_jq = 32767;
    } else if (rtb_DataTypeConversion_jq < -32768) {
      rtb_DataTypeConversion_jq = -32768;
    }

    /* Logic: '<S172>/Logical_Operator4' incorporates:
     *  Logic: '<S170>/LORelay1'
     *  Logic: '<S172>/Logical Operator1'
     *  Logic: '<S172>/Logical_Operator5'
     *  RelationalOperator: '<S170>/ROLoLim'
     *  Sum: '<S6>/Subtract1'
     *  UnitDelay: '<S172>/Unit Delay'
     */
    HvCoorn_bHvInitFail = ((rtb_Saturation2_jr >= rtb_DataTypeConversion_jq) &&
      (!rtb_Equal3_lx) && (HvCoorn_ARID_DEF.outRanged_e ||
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_p3));

    /* Update for UnitDelay: '<S171>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bz = rtb_TmpSignalConversionAticbm_o;

    /* Switch: '<S170>/Switch3' */
    if (HvCoorn_ARID_DEF.outRanged_e) {
      /* Update for UnitDelay: '<S170>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_hx = rtb_Switch2_p5;
    } else {
      /* Update for UnitDelay: '<S170>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_hx = rtb_Saturation2_jr;
    }

    /* End of Switch: '<S170>/Switch3' */

    /* Update for UnitDelay: '<S172>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_p3 = HvCoorn_bHvInitFail;
  }

  /* End of Logic: '<S169>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S164>/Debounce_OBD' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/icbms_bHvShutOffReq' */
  (void)Rte_Read_icbms_bHvShutOffReq_Value(&rtb_AND20);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* SignalConversion generated from: '<S1>/ved_bHvShtdwn' incorporates:
   *  Inport: '<Root>/ved_bHvShtdwn'
   */
  (void)Rte_Read_ved_bHvShtdwn_Value(&rtb_TmpSignalConversionAtved_bH);

  /* Logic: '<S51>/OR3' incorporates:
   *  Logic: '<S13>/Logical Operator7'
   *  Logic: '<S15>/Logical Operator3'
   *  Logic: '<S52>/Not8'
   *  Logic: '<S5>/Logical Operator3'
   *  Logic: '<S7>/Logical Operator6'
   */
  HvCoorn_bStartUpReq_tmp = !rtb_TmpSignalConversionAtved__l;
  rtb_TmpSignalConversionAtved_bI = !HvCoorn_bHvOnFail;

  /* Logic: '<S51>/Logical Operator2' incorporates:
   *  Logic: '<S20>/Logical Operator2'
   */
  HvCoorn_bStartUpReq_tmp_0 = !rtb_TmpSignalConversionAtved_bH;

  /* Logic: '<S51>/Logical Operator26' incorporates:
   *  Constant: '<S50>/uint1'
   *  Constant: '<S51>/uint2'
   *  Constant: '<S51>/uint3'
   *  Logic: '<S50>/AND1'
   *  Logic: '<S51>/AND2'
   *  Logic: '<S51>/Logical Operator1'
   *  Logic: '<S51>/Logical Operator2'
   *  Logic: '<S51>/Logical Operator3'
   *  Logic: '<S51>/Logical Operator4'
   *  Logic: '<S51>/OR'
   *  Logic: '<S51>/OR2'
   *  Logic: '<S51>/OR3'
   *  RelationalOperator: '<S50>/Equal1'
   *  RelationalOperator: '<S51>/Equal1'
   *  RelationalOperator: '<S51>/Equal3'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  HvCoorn_bStartUpReq = ((HvCoorn_bACChrgPwrUp || HvCoorn_bDCChrgPwrUp ||
    rtb_AND1_al) && (!rtb_AND20) && HvCoorn_bStartUpReq_tmp_0 && (rtb_AND9_p_tmp
    || (rtb_TmpSignalConversionAticic_h != ((uint8)2U))) &&
    ((HvCoorn_bStartUpReq_tmp && rtb_TmpSignalConversionAtved_bI &&
      (!HvCoorn_bHvInitFail)) || ((HvCoorn_stHVP > ((uint8)10U)) &&
    (HvCoorn_stHVP < ((uint8)101U)))));

  /* Logic: '<S52>/Not7' incorporates:
   *  Logic: '<S52>/Not6'
   */
  rtb_bGearOk = !rtb_Not1_eo;

  /* Logic: '<S31>/AND7' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C10'
   *  Logic: '<S52>/AND10'
   *  Logic: '<S52>/AND13'
   *  Logic: '<S52>/Not7'
   *  RelationalOperator: '<S52>/Greater23'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C10':
   *  [70]
   */
  rtb_AND7_j = ((rtb_AND15_f && (rtb_TmpSignalConversionAticebs_ <=
    HvCoorn_pctHvBatSocMntnFailClr_C)) || rtb_bGearOk ||
                HvCoorn_bRemLvBatMntnFail);

  /* Logic: '<S52>/OR' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C15'
   *  Logic: '<S52>/AND9'
   *  RelationalOperator: '<S52>/Greater17'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C15':
   *  [70]
   */
  rtb_OR_lx = (HvCoorn_bRemLvBatMntnEx_tmp || (rtb_AND15_f &&
    (rtb_TmpSignalConversionAticebs_ > HvCoorn_pctHvBatSocMntnFailClr_C)));

  /* Logic: '<S30>/AND9' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C16'
   *  RelationalOperator: '<S52>/Greater18'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C16':
   *  [70]
   */
  rtb_AND9_c = (rtb_TmpSignalConversionAticebs_ >
                HvCoorn_pctHvBatSocMntnFailClr_C);

  /* Logic: '<S52>/AND20' */
  rtb_AND20 = (rtb_AND9_c && rtb_AND15_f);

  /* RelationalOperator: '<S52>/Equal3' incorporates:
   *  Constant: '<S52>/Constant84'
   *
   * Block description for '<S52>/Constant84':
   *  [1]
   */
  rtb_Equal3_lx = (rtb_TmpSignalConversionAtVehCfg != ((uint8)1U));

  /* Logic: '<S30>/AND9' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C27'
   *  Logic: '<S52>/AND26'
   *  Logic: '<S52>/AND27'
   *  Logic: '<S52>/AND31'
   *  Logic: '<S52>/AND32'
   *  Logic: '<S52>/Not3'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C27':
   *  [1]
   */
  rtb_AND9_c = (HvCoorn_bRemLvBatMntnEx_tmp_0 || ((rtb_AND12_o ||
    rtb_Logical_Operator4_i5 || rtb_AND23 || rtb_bGearOk || (rtb_AND15_f &&
    (!rtb_AND9_c))) && HvCoorn_bSocWkupInactvEna_C));

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* SignalConversion: '<S52>/Signal Copy3' incorporates:
   *  Inport: '<Root>/HvCoorn_bSocWkupEER'
   */
  (void)Rte_Read_HvCoorn_bSocWkupEER_Value((boolean *)&HvCoorn_bSocWkupEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Logic: '<S52>/OR8' incorporates:
   *  Constant: '<S52>/uint11'
   *  Constant: '<S52>/uint12'
   *  RelationalOperator: '<S52>/Greater11'
   *  RelationalOperator: '<S52>/Greater21'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  rtb_TmpSignalConversionAticbm_o = ((HvCoorn_stHVP == ((uint8)89U)) ||
    (HvCoorn_stHVP == ((uint8)90U)));

  /* Switch: '<S52>/Switch13' incorporates:
   *  Constant: '<S52>/FALSE2'
   *  Delay: '<S52>/Delay1'
   *  Logic: '<S124>/Logical Operator'
   *  Logic: '<S124>/Logical Operator1'
   *  UnitDelay: '<S124>/Unit Delay2'
   *
   * Block description for '<S52>/FALSE2':
   *  FALSE
   */
  if (HvCoorn_ARID_DEF.Delay1_DSTATE[0U]) {
    tmp_2 = (rtb_Not1_eo && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_iz));
  } else {
    tmp_2 = false;
  }

  /* Switch: '<S52>/Switch16' incorporates:
   *  Constant: '<S52>/FALSE6'
   *  Delay: '<S52>/Delay2'
   *  Logic: '<S117>/Logical Operator'
   *  Logic: '<S117>/Logical Operator1'
   *  UnitDelay: '<S117>/Unit Delay2'
   *
   * Block description for '<S52>/FALSE6':
   *  FALSE
   */
  if (HvCoorn_ARID_DEF.Delay2_DSTATE[0U]) {
    rtb_bGearOk = ((!rtb_Greater26) && HvCoorn_ARID_DEF.UnitDelay2_DSTATE_pk);
  } else {
    rtb_bGearOk = false;
  }

  /* Logic: '<S52>/OR6' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C30'
   *  Logic: '<S125>/Logical Operator'
   *  Logic: '<S125>/Logical Operator1'
   *  Logic: '<S128>/Logical Operator'
   *  Logic: '<S128>/Logical Operator1'
   *  Logic: '<S130>/Logical Operator'
   *  Logic: '<S130>/Logical Operator1'
   *  Logic: '<S131>/Logical Operator'
   *  Logic: '<S131>/Logical Operator1'
   *  Logic: '<S52>/AND36'
   *  Switch: '<S52>/Switch13'
   *  Switch: '<S52>/Switch16'
   *  UnitDelay: '<S125>/Unit Delay2'
   *  UnitDelay: '<S128>/Unit Delay2'
   *  UnitDelay: '<S130>/Unit Delay2'
   *  UnitDelay: '<S131>/Unit Delay2'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C30':
   *  [1]
   */
  rtb_bGearOk = ((rtb_AND20 && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_i)) ||
                 (rtb_TmpSignalConversionAticem_e &&
                  (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_g)) ||
                 (rtb_LogicalOperator_mf &&
                  (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_b)) || tmp_2 ||
                 (rtb_bGearOk && HvCoorn_bSocWkupEna_C) ||
                 (rtb_TmpSignalConversionAticbm_o &&
                  (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_d)));

  /* Delay: '<S52>/Delay' */
  if (HvCoorn_ARID_DEF.icLoad_b) {
    HvCoorn_ARID_DEF.Delay_DSTATE_i = HvCoorn_bSocWkupEER;
  }

  /* Logic: '<S140>/Logical Operator1' incorporates:
   *  Constant: '<S52>/FALSE4'
   *  Logic: '<S139>/Logical Operator1'
   *
   * Block description for '<S52>/FALSE4':
   *  FALSE
   */
  HvCoorn_bRemLvBatMntnEx_tmp_0 = !false;

  /* Logic: '<S140>/Logical_Operator4' incorporates:
   *  Logic: '<S140>/Logical Operator1'
   *  Logic: '<S140>/Logical_Operator5'
   *  Logic: '<S52>/OR7'
   *  UnitDelay: '<S140>/Unit Delay'
   */
  rtb_AND1_al = (HvCoorn_bRemLvBatMntnEx_tmp_0 && (rtb_AND9_c || rtb_bGearOk ||
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_mif));

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/idi_noBMSSocCounter' */
  (void)Rte_Read_idi_noBMSSocCounter_Value(&tmpRead_g);

  /* SignalConversion: '<S1>/Signal Conversion95' incorporates:
   *  Inport: '<Root>/HvCoorn_pctHVBatSocEER'
   */
  (void)Rte_Read_HvCoorn_pctHVBatSocEER_Value((float32 *)&HvCoorn_pctHVBatSocEER);

  /* Inport: '<Root>/idi_bTimerWkup' */
  (void)Rte_Read_idi_bTimerWkup_Value(&rtb_Logical_Operator4_ix);

  /* Inport: '<Root>/idi_bEBSLinWkup' */
  (void)Rte_Read_idi_bEBSLinWkup_Value(&rtb_LogicalOperator2_kb);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Switch: '<S52>/Switch6' incorporates:
   *  Constant: '<S52>/FALSE1'
   *  Switch: '<S52>/Switch11'
   *  Switch: '<S52>/Switch7'
   *
   * Block description for '<S52>/FALSE1':
   *  FALSE
   */
  if (rtb_AND9_c) {
    tmp_2 = false;
  } else if (rtb_bGearOk) {
    /* Switch: '<S52>/Switch7' incorporates:
     *  Constant: '<S52>/TRUE'
     *
     * Block description for '<S52>/TRUE':
     *  TRUE
     */
    tmp_2 = true;
  } else if (rtb_AND1_al) {
    /* Switch: '<S52>/Switch11' incorporates:
     *  Delay: '<S52>/Delay'
     *  Switch: '<S52>/Switch7'
     */
    tmp_2 = HvCoorn_ARID_DEF.Delay_DSTATE_i;
  } else {
    tmp_2 = HvCoorn_bSocWkupEER;
  }

  /* Logic: '<S52>/AND39' incorporates:
   *  Switch: '<S52>/Switch6'
   */
  HvCoorn_bSocWkup = (rtb_Equal3_lx && tmp_2);

  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C26'
   *  Logic: '<S52>/AND21'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C26':
   *  [0]
   */
  rtb_bGearOk = (HvCoorn_bRemLvBatMntnEx_tmp || HvCoorn_bSocWkup ||
                 rtb_Greater26 || rtb_AND14_l || HvCoorn_bTimerWkupReqShd_C);

  /* SignalConversion generated from: '<S1>/iud_bEEIniFnsd' incorporates:
   *  Inport: '<Root>/iud_bEEIniFnsd'
   */
  (void)Rte_Read_iud_bEEIniFnsd_Value(&rtb_TmpSignalConversionAtiud_bE);

  /* Switch: '<S147>/Switch' incorporates:
   *  Constant: '<S52>/uint15'
   *  RelationalOperator: '<S52>/Equal7'
   */
  if (tmpRead_g != ((uint8)0U)) {
    /* Sum: '<S147>/Subtract1' incorporates:
     *  Constant: '<S147>/single1'
     *  UnitDelay: '<S147>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_i31 < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_i31)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_i31 > 0) && (1 > MAX_int32_T -
                HvCoorn_ARID_DEF.UnitDelay_DSTATE_i31)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_i31 + 1;
    }

    /* End of Sum: '<S147>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S147>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S147>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* SignalConversion: '<S52>/Signal Copy4' incorporates:
   *  Inport: '<Root>/HvCoorn_bTimerWkupReqEER'
   */
  (void)Rte_Read_HvCoorn_bTimerWkupReqEER_Value((boolean *)
    &HvCoorn_bTimerWkupReqEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S147>/Unit Delay' incorporates:
   *  Saturate: '<S147>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_i31 = rtb_DataTypeConversion_jq;

  /* Product: '<S147>/Divide' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C33'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C33':
   *  [0.01]
   */
  tmpRead_i = HvCoorn_tiBMSSocCounterThd_C / HvCoorn_ConstB.Max_ix;

  /* DataTypeConversion: '<S147>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Switch: '<S52>/Switch17' incorporates:
   *  DataTypeConversion: '<S147>/DataTypeConversion'
   *  Logic: '<S52>/AND40'
   *  Logic: '<S52>/Not9'
   *  RelationalOperator: '<S147>/Relational Operator1'
   *  Saturate: '<S147>/Saturation2'
   */
  if (rtb_TmpSignalConversionAtiud_bE && (rtb_DataTypeConversion_jq <= (sint32)
       tmpRead_i)) {
    /* Switch: '<S52>/Switch17' */
    HvCoorn_pctHVBatSocEEW = HvCoorn_pctHVBatSocEER;
  } else {
    /* Switch: '<S52>/Switch17' */
    HvCoorn_pctHVBatSocEEW = rtb_TmpSignalConversionAticbms_;
  }

  /* End of Switch: '<S52>/Switch17' */

  /* Logic: '<S52>/AND23' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C25'
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C31'
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C32'
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C34'
   *  Logic: '<S52>/AND37'
   *  Logic: '<S52>/OR10'
   *  Logic: '<S52>/OR11'
   *  Logic: '<S52>/OR12'
   *  Logic: '<S52>/OR13'
   *  RelationalOperator: '<S52>/Equal5'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C25':
   *  [0]
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C31':
   *  [1]
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C32':
   *  [8]
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C34':
   *  [1]
   */
  HvCoorn_bVehNetWkupEna = (rtb_Equal12_a && (HvCoorn_bStartUpReq_tmp ||
    HvCoorn_bVehNetWkupInhbHvOnByp_C) && (((rtb_LogicalOperator2_kb ||
    rtb_Logical_Operator4_ix) && ((HvCoorn_pctHVBatSocEEW >=
    HvCoorn_pctHvBatSocNetWkupThd_C) || HvCoorn_bVehNetWkupSocByp_C)) ||
    HvCoorn_bVehNetWkupJudgByp_C));

  /* Switch: '<S26>/Switch7' incorporates:
   *  ArithShift: '<S133>/Shift Arithmetic1'
   *  ArithShift: '<S133>/Shift Arithmetic2'
   *  ArithShift: '<S133>/Shift Arithmetic3'
   *  ArithShift: '<S133>/Shift Arithmetic4'
   *  DataTypeConversion: '<S133>/Data Type Conversion2'
   *  DataTypeConversion: '<S133>/Data Type Conversion3'
   *  DataTypeConversion: '<S133>/Data Type Conversion4'
   *  DataTypeConversion: '<S133>/Data Type Conversion5'
   *  DataTypeConversion: '<S133>/Data Type Conversion6'
   *  Sum: '<S133>/Add'
   */
  rtb_Switch7 = (uint8)(((((uint32)(rtb_Logical_Operator4_mf_idx_0 << 1) +
    rtb_Logical_Operator4_i5) + (uint32)(rtb_Logical_Operator4_mf_idx_1 << 2)) +
    (uint32)(rtb_Greater26 << 3)) + (uint32)(rtb_TmpSignalConversionAtved__l <<
    4));

  /* Logic: '<S135>/Logical_Operator4' incorporates:
   *  Logic: '<S135>/Logical Operator1'
   *  Logic: '<S135>/Logical_Operator5'
   *  UnitDelay: '<S135>/Unit Delay'
   */
  rtb_Logical_Operator4_ix = ((!rtb_bGearOk) && (rtb_AND7_j ||
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_aj));

  /* Logic: '<S139>/Logical_Operator4' incorporates:
   *  Logic: '<S139>/Logical_Operator5'
   *  Logic: '<S52>/OR5'
   *  UnitDelay: '<S139>/Unit Delay'
   */
  HvCoorn_bTimerWkupKeep = (HvCoorn_bRemLvBatMntnEx_tmp_0 && (rtb_AND7_j ||
    rtb_bGearOk || HvCoorn_bTimerWkupKeep));

  /* Switch: '<S52>/Switch12' */
  if (HvCoorn_bTimerWkupKeep) {
    tmp_2 = rtb_Logical_Operator4_ix;
  } else {
    tmp_2 = HvCoorn_bTimerWkupReqEER;
  }

  /* Logic: '<S52>/AND38' incorporates:
   *  Switch: '<S52>/Switch12'
   */
  HvCoorn_bTimerWkupReq = (rtb_Equal3_lx && tmp_2);

  /* SignalConversion generated from: '<S1>/HvCoorn_ctSmtBatMntnFailEER' incorporates:
   *  Inport: '<Root>/HvCoorn_ctSmtBatMntnFailEER'
   */
  (void)Rte_Read_HvCoorn_ctSmtBatMntnFailEER_Value
    (&rtb_TmpSignalConversionAtHvCoor);

  /* SignalConversion: '<S52>/Signal Copy' */
  HvCoorn_ctSmtBatMntnFailEER = rtb_TmpSignalConversionAtHvCoor;

  /* RelationalOperator: '<S151>/Relational Operator' incorporates:
   *  Constant: '<S151>/single4'
   *  UnitDelay: '<S151>/Unit Delay'
   */
  rtb_AND7_j = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_hj > 0);

  /* Logic: '<S37>/OR' incorporates:
   *  Logic: '<S126>/Logical Operator'
   *  Logic: '<S126>/Logical Operator1'
   *  UnitDelay: '<S126>/Unit Delay2'
   */
  rtb_bGearOk = (HvCoorn_bRemLvBatMntnFail &&
                 (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_a));

  /* Logic: '<S151>/Logical Operator2' */
  rtb_LogicalOperator2_kb = (rtb_AND7_j || rtb_bGearOk);

  /* Switch: '<S52>/Switch1' incorporates:
   *  Logic: '<S121>/Logical Operator'
   *  Logic: '<S121>/Logical Operator1'
   *  UnitDelay: '<S121>/Unit Delay2'
   */
  if ((!rtb_LogicalOperator2_kb) && HvCoorn_ARID_DEF.UnitDelay2_DSTATE_kr) {
    /* Sum: '<S52>/Add1' incorporates:
     *  Constant: '<S52>/uint5'
     *  UnitDelay: '<S52>/Unit Delay'
     */
    rtb_DataTypeConversion_jq = (sint32)((uint32)
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_jm + ((uint8)1U));
    if ((uint32)rtb_DataTypeConversion_jq > 255U) {
      rtb_DataTypeConversion_jq = 255;
    }

    /* Switch: '<S52>/Switch1' incorporates:
     *  Sum: '<S52>/Add1'
     */
    rtb_TmpSignalConversionAticbm_l = (uint8)rtb_DataTypeConversion_jq;
  } else {
    /* Switch: '<S52>/Switch1' incorporates:
     *  UnitDelay: '<S52>/Unit Delay'
     */
    rtb_TmpSignalConversionAticbm_l = HvCoorn_ARID_DEF.UnitDelay_DSTATE_jm;
  }

  /* End of Switch: '<S52>/Switch1' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* SignalConversion: '<S52>/Signal Copy1' incorporates:
   *  Inport: '<Root>/HvCoorn_ctSmtBatMntnSucsEER'
   */
  (void)Rte_Read_HvCoorn_ctSmtBatMntnSucsEER_Value((uint16 *)
    &HvCoorn_ctSmtBatMntnSucsEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Switch: '<S52>/Switch5' incorporates:
   *  Logic: '<S116>/Logical Operator'
   *  Logic: '<S116>/Logical Operator1'
   *  Logic: '<S52>/AND22'
   *  UnitDelay: '<S116>/Unit Delay2'
   */
  if (HvCoorn_bRemLvBatMntnEx_tmp && ((!rtb_UnitDelay_njy) &&
       HvCoorn_ARID_DEF.UnitDelay2_DSTATE_pz)) {
    /* Sum: '<S52>/Add3' incorporates:
     *  Constant: '<S52>/uint16'
     *  UnitDelay: '<S52>/Unit Delay1'
     */
    tmp = (uint32)HvCoorn_ctSmtBatMntnSucsEEW + ((uint16)1U);
    if (tmp > 65535U) {
      tmp = 65535U;
    }

    /* Switch: '<S52>/Switch5' incorporates:
     *  Sum: '<S52>/Add3'
     */
    rtb_Switch5 = (uint16)tmp;
  } else {
    /* Switch: '<S52>/Switch5' incorporates:
     *  UnitDelay: '<S52>/Unit Delay1'
     */
    rtb_Switch5 = HvCoorn_ctSmtBatMntnSucsEEW;
  }

  /* End of Switch: '<S52>/Switch5' */

  /* Logic: '<S123>/Logical Operator' incorporates:
   *  Logic: '<S123>/Logical Operator1'
   *  UnitDelay: '<S123>/Unit Delay2'
   */
  rtb_Equal12_a = (rtb_TmpSignalConversionAtiud_bE &&
                   (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_kl));

  /* Switch: '<S145>/Switch' incorporates:
   *  Constant: '<S52>/icdc_disconnected1'
   *  RelationalOperator: '<S52>/Relational Operator1'
   *
   * Block description for '<S52>/icdc_disconnected1':
   *  [1]
   */
  if (rtb_TmpSignalConversionAticdc_s == ((uint8)3U)) {
    /* Sum: '<S145>/Subtract1' incorporates:
     *  Constant: '<S145>/single1'
     *  UnitDelay: '<S145>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_pw < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_pw)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_pw > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_pw)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_pw + 1;
    }

    /* End of Sum: '<S145>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S145>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S145>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* SignalConversion: '<S52>/Signal Copy7' incorporates:
   *  Inport: '<Root>/HvCoorn_stRemLvBatMntnFailRsnEER'
   */
  (void)Rte_Read_HvCoorn_stRemLvBatMntnFailRsnEER_Value((uint8 *)
    &HvCoorn_stRemLvBatMntnFailRsnEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S145>/Unit Delay' incorporates:
   *  Saturate: '<S145>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_pw = rtb_DataTypeConversion_jq;

  /* Product: '<S145>/Divide' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C28'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C28':
   *  [25]
   */
  tmpRead_i = HvCoorn_tiRemMntnDCBuckRst_C / HvCoorn_ConstB.Max_fo;

  /* DataTypeConversion: '<S145>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S52>/OR3' incorporates:
   *  DataTypeConversion: '<S145>/DataTypeConversion'
   *  RelationalOperator: '<S145>/Relational Operator1'
   *  Saturate: '<S145>/Saturation2'
   */
  rtb_Equal3_lx = ((rtb_DataTypeConversion_jq > (sint32)tmpRead_i) || rtb_OR_lx);

  /* SignalConversion: '<S52>/Signal Copy2' */
  HvCoorn_bSocWkupEEW = HvCoorn_bSocWkup;

  /* SignalConversion: '<S52>/Signal Copy5' */
  HvCoorn_bTimerWkupReqEEW = HvCoorn_bTimerWkupReq;

  /* Switch: '<S52>/Switch14' incorporates:
   *  Constant: '<S52>/uint13'
   *  Constant: '<S52>/uint14'
   *  Constant: '<S52>/uint9'
   *  Logic: '<S129>/Logical Operator'
   *  Logic: '<S129>/Logical Operator1'
   *  Logic: '<S52>/AND35'
   *  Logic: '<S52>/OR9'
   *  RelationalOperator: '<S52>/Equal4'
   *  RelationalOperator: '<S52>/Greater20'
   *  RelationalOperator: '<S52>/Greater22'
   *  Switch: '<S52>/Switch15'
   *  UnitDelay: '<S129>/Unit Delay2'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  if ((rtb_Switch7 != ((uint8)0U)) && ((HvCoorn_stHVP != ((uint8)89U)) &&
       (HvCoorn_stHVP != ((uint8)90U))) && rtb_TmpSignalConversionAtiud_bE) {
    /* Switch: '<S52>/Switch14' */
    HvCoorn_stRemLvBatMntnFailRsn = rtb_Switch7;
  } else if (rtb_TmpSignalConversionAtiud_bE &&
             (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_lw)) {
    /* Switch: '<S52>/Switch15' incorporates:
     *  Switch: '<S52>/Switch14'
     */
    HvCoorn_stRemLvBatMntnFailRsn = HvCoorn_stRemLvBatMntnFailRsnEER;
  }

  /* End of Switch: '<S52>/Switch14' */

  /* SignalConversion: '<S52>/Signal Copy6' */
  HvCoorn_stRemLvBatMntnFailRsnEEW = HvCoorn_stRemLvBatMntnFailRsn;

  /* Switch: '<S52>/Switch2' incorporates:
   *  Logic: '<S127>/Logical Operator'
   *  Logic: '<S127>/Logical Operator1'
   *  Logic: '<S52>/AND16'
   *  Logic: '<S52>/OR1'
   *  Switch: '<S52>/Switch'
   *  UnitDelay: '<S127>/Unit Delay2'
   */
  if (rtb_Equal3_lx && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_do)) {
    /* Switch: '<S52>/Switch2' incorporates:
     *  Constant: '<S52>/uint4'
     */
    rtb_TmpSignalConversionAticbm_l = ((uint8)0U);
  } else if ((!rtb_OR_lx) && rtb_Equal12_a) {
    /* Sum: '<S52>/Add' incorporates:
     *  Switch: '<S52>/Switch'
     */
    rtb_DataTypeConversion_jq = (sint32)((uint32)HvCoorn_ctSmtBatMntnFailEER +
      rtb_TmpSignalConversionAticbm_l);
    if ((uint32)rtb_DataTypeConversion_jq > 255U) {
      rtb_DataTypeConversion_jq = 255;
    }

    /* Switch: '<S52>/Switch2' incorporates:
     *  Sum: '<S52>/Add'
     *  Switch: '<S52>/Switch'
     */
    rtb_TmpSignalConversionAticbm_l = (uint8)rtb_DataTypeConversion_jq;
  }

  /* End of Switch: '<S52>/Switch2' */

  /* Switch: '<S52>/Switch3' incorporates:
   *  RelationalOperator: '<S52>/Greater19'
   *  Switch: '<S52>/Switch4'
   *  UnitDelay: '<S52>/UnitDelay1'
   *  UnitDelay: '<S52>/UnitDelay2'
   */
  if (HvCoorn_ARID_DEF.UnitDelay1_DSTATE_gx >
      HvCoorn_ARID_DEF.UnitDelay2_DSTATE_k2) {
    /* Switch: '<S52>/Switch3' incorporates:
     *  Constant: '<S52>/uint10'
     */
    HvCoorn_ctSmtBatMntnSucsEEW = ((uint16)0U);
  } else if (rtb_Equal12_a) {
    /* Sum: '<S52>/Add2' incorporates:
     *  Switch: '<S52>/Switch4'
     */
    tmp = (uint32)HvCoorn_ctSmtBatMntnSucsEER + rtb_Switch5;
    if (tmp > 65535U) {
      tmp = 65535U;
    }

    /* Switch: '<S52>/Switch3' incorporates:
     *  Sum: '<S52>/Add2'
     *  Switch: '<S52>/Switch4'
     */
    HvCoorn_ctSmtBatMntnSucsEEW = (uint16)tmp;
  } else {
    /* Switch: '<S52>/Switch3' incorporates:
     *  Switch: '<S52>/Switch4'
     */
    HvCoorn_ctSmtBatMntnSucsEEW = rtb_Switch5;
  }

  /* End of Switch: '<S52>/Switch3' */

  /* Switch: '<S148>/Switch' incorporates:
   *  Switch: '<S148>/Switch1'
   */
  if (rtb_TmpSignalConversionAtidi_bK) {
    /* Product: '<S148>/Divide' incorporates:
     *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C17'
     *
     * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C17':
     *  [180]
     */
    tmpRead_i = HvCoorn_tiMntnKeyOffThd_C / HvCoorn_ConstB.Max_mc;

    /* DataTypeConversion: '<S148>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S148>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S148>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_m = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S148>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S148>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_m = 0;
      }
    } else {
      /* Update for UnitDelay: '<S148>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       *  Saturate: '<S148>/Saturation2'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_m = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S148>/DataTypeConversion' */
  } else if (rtb_RelationalOperator_iq) {
    /* Update for UnitDelay: '<S148>/Unit Delay' incorporates:
     *  Constant: '<S148>/single5'
     *  Saturate: '<S148>/Saturation2'
     *  Sum: '<S148>/Subtract'
     *  Switch: '<S148>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_m -= 1;
  }

  /* End of Switch: '<S148>/Switch' */

  /* Switch: '<S149>/Switch' incorporates:
   *  Switch: '<S149>/Switch1'
   */
  if (rtb_AND15_f) {
    /* Product: '<S149>/Divide' incorporates:
     *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C19'
     *
     * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C19':
     *  [1800]
     */
    tmpRead_i = HvCoorn_tiRemMntnOverKeepRst_C / HvCoorn_ConstB.Max_ex;

    /* DataTypeConversion: '<S149>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S149>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S149>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_j = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S149>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S149>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_j = 0;
      }
    } else {
      /* Update for UnitDelay: '<S149>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       *  Saturate: '<S149>/Saturation2'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_j = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S149>/DataTypeConversion' */
  } else if (rtb_RelationalOperator_e2) {
    /* Update for UnitDelay: '<S149>/Unit Delay' incorporates:
     *  Constant: '<S149>/single5'
     *  Saturate: '<S149>/Saturation2'
     *  Sum: '<S149>/Subtract'
     *  Switch: '<S149>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_j -= 1;
  }

  /* End of Switch: '<S149>/Switch' */

  /* Product: '<S150>/Divide' incorporates:
   *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C20'
   *
   * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C20':
   *  [1800]
   */
  tmpRead_i = HvCoorn_tiRemMntnFailKeepRst_C / HvCoorn_ConstB.Max_px;

  /* DataTypeConversion: '<S150>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Switch: '<S150>/Switch' incorporates:
   *  Switch: '<S150>/Switch1'
   */
  if (rtb_AND12_o) {
    /* Update for UnitDelay: '<S150>/Unit Delay' incorporates:
     *  DataTypeConversion: '<S150>/DataTypeConversion'
     *  Switch: '<S150>/Switch'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_g1[0] = (sint32)tmpRead_i;
  } else if (rtb_RelationalOperator_ce_idx_0) {
    /* Switch: '<S150>/Switch1' incorporates:
     *  Constant: '<S150>/single5'
     *  Sum: '<S150>/Subtract'
     *  Switch: '<S150>/Switch'
     *  UnitDelay: '<S150>/Unit Delay'
     * */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_g1[0] -= 1;
  }

  if (rtb_AND23) {
    /* Update for UnitDelay: '<S150>/Unit Delay' incorporates:
     *  DataTypeConversion: '<S150>/DataTypeConversion'
     *  Switch: '<S150>/Switch'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_g1[1] = (sint32)tmpRead_i;
  } else if (rtb_RelationalOperator_ce_idx_1) {
    /* Switch: '<S150>/Switch1' incorporates:
     *  Constant: '<S150>/single5'
     *  Sum: '<S150>/Subtract'
     *  Switch: '<S150>/Switch'
     *  UnitDelay: '<S150>/Unit Delay'
     * */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_g1[1] -= 1;
  }

  /* End of Switch: '<S150>/Switch' */

  /* Switch: '<S151>/Switch' incorporates:
   *  Switch: '<S151>/Switch1'
   */
  if (rtb_bGearOk) {
    /* Product: '<S151>/Divide' incorporates:
     *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C21'
     *
     * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C21':
     *  [1]
     */
    tmpRead_i = HvCoorn_tiRemMntnFailCtDly_C / HvCoorn_ConstB.Max_ez;

    /* DataTypeConversion: '<S151>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S151>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S151>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_hj = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S151>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S151>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_hj = 0;
      }
    } else {
      /* Update for UnitDelay: '<S151>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       *  Saturate: '<S151>/Saturation2'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_hj = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S151>/DataTypeConversion' */
  } else if (rtb_AND7_j) {
    /* Update for UnitDelay: '<S151>/Unit Delay' incorporates:
     *  Constant: '<S151>/single5'
     *  Saturate: '<S151>/Saturation2'
     *  Sum: '<S151>/Subtract'
     *  Switch: '<S151>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_hj -= 1;
  }

  /* End of Switch: '<S151>/Switch' */

  /* Switch: '<S152>/Switch' incorporates:
   *  Switch: '<S152>/Switch1'
   */
  if (rtb_TmpSignalConversionAtved__l) {
    /* Product: '<S152>/Divide' incorporates:
     *  Constant: '<S52>/hpp_tiRemHvBatPrecdngSet_C22'
     *
     * Block description for '<S52>/hpp_tiRemHvBatPrecdngSet_C22':
     *  [1800]
     */
    tmpRead_i = HvCoorn_tiRemMntnFltKeepRst_C / HvCoorn_ConstB.Max_jt;

    /* DataTypeConversion: '<S152>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S152>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S152>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_i1 = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S152>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S152>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_i1 = 0;
      }
    } else {
      /* Update for UnitDelay: '<S152>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       *  Saturate: '<S152>/Saturation2'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_i1 = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S152>/DataTypeConversion' */
  } else if (rtb_RelationalOperator_f) {
    /* Update for UnitDelay: '<S152>/Unit Delay' incorporates:
     *  Constant: '<S152>/single5'
     *  Saturate: '<S152>/Saturation2'
     *  Sum: '<S152>/Subtract'
     *  Switch: '<S152>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_i1 -= 1;
  }

  /* End of Switch: '<S152>/Switch' */

  /* Switch: '<S159>/Switch' incorporates:
   *  Constant: '<S53>/uint1'
   *  Constant: '<S53>/uint6'
   *  Constant: '<S53>/uint7'
   *  Logic: '<S53>/AND1'
   *  Logic: '<S53>/AND19'
   *  RelationalOperator: '<S53>/Equal2'
   *  RelationalOperator: '<S53>/Greater15'
   *  RelationalOperator: '<S53>/Greater16'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  if ((HvCoorn_stHVP != ((uint8)89U)) && (HvCoorn_stHVP != ((uint8)90U)) &&
      (rtb_TmpSignalConversionAticlbms == ((uint8)1U))) {
    /* Sum: '<S159>/Subtract1' incorporates:
     *  Constant: '<S159>/single1'
     *  UnitDelay: '<S159>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_fs < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_fs)) {
      /* Saturate: '<S159>/Saturation2' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       */
      rtb_Saturation2_ic = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_fs > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_fs)) {
      /* Saturate: '<S159>/Saturation2' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       */
      rtb_Saturation2_ic = MAX_int32_T;
    } else {
      /* Saturate: '<S159>/Saturation2' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       */
      rtb_Saturation2_ic = HvCoorn_ARID_DEF.UnitDelay_DSTATE_fs + 1;
    }

    /* End of Sum: '<S159>/Subtract1' */
  } else {
    /* Saturate: '<S159>/Saturation2' incorporates:
     *  Constant: '<S159>/single2'
     *  DataTypeConversion: '<S287>/DataTypeConversion'
     */
    rtb_Saturation2_ic = 0;
  }

  /* End of Switch: '<S159>/Switch' */

  /* Switch: '<S160>/Switch' incorporates:
   *  Constant: '<S53>/icdc_disconnected'
   *  Logic: '<S53>/AND2'
   *  RelationalOperator: '<S53>/Relational Operator5'
   *
   * Block description for '<S53>/icdc_disconnected':
   *  [1]
   */
  if (rtb_UnitDelay_jn && (rtb_TmpSignalConversionAticdc_s != ((uint8)3U))) {
    /* Sum: '<S160>/Subtract1' incorporates:
     *  Constant: '<S160>/single1'
     *  UnitDelay: '<S160>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1l < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1l)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1l > 0) && (1 > MAX_int32_T -
                HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1l)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1l + 1;
    }

    /* End of Sum: '<S160>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S160>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S160>/Switch' */

  /* Update for UnitDelay: '<S160>/Unit Delay' incorporates:
   *  Saturate: '<S160>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_c1l = rtb_DataTypeConversion_jq;

  /* Product: '<S159>/Divide' incorporates:
   *  Constant: '<S53>/hpp_tiRemHvBatPrecdngSet_C8'
   *
   * Block description for '<S53>/hpp_tiRemHvBatPrecdngSet_C8':
   *  [15]
   */
  tmpRead_i = HvCoorn_tiMntnFailNoRdyThd_C / HvCoorn_ConstB.Max_de;

  /* DataTypeConversion: '<S159>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);

  /* Product: '<S160>/Divide' incorporates:
   *  Constant: '<S53>/hpp_tiRemHvBatPrecdngSet_C9'
   *
   * Block description for '<S53>/hpp_tiRemHvBatPrecdngSet_C9':
   *  [15]
   */
  rtb_TmpSignalConversionAtian__o = HvCoorn_tiMntnFailNoBuckThd_C /
    HvCoorn_ConstB.Max_dz;

  /* DataTypeConversion: '<S160>/DataTypeConversion' */
  rtb_TmpSignalConversionAticebs_ = fabsf(rtb_TmpSignalConversionAtian__o);

  /* DataTypeConversion: '<S159>/DataTypeConversion' */
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* DataTypeConversion: '<S160>/DataTypeConversion' */
  if (rtb_TmpSignalConversionAticebs_ < 8.388608E+6F) {
    if (rtb_TmpSignalConversionAticebs_ >= 0.5F) {
      rtb_TmpSignalConversionAtian__o = floorf(rtb_TmpSignalConversionAtian__o +
        0.5F);
    } else {
      rtb_TmpSignalConversionAtian__o = 0.0F;
    }
  }

  /* Logic: '<S53>/OR2' incorporates:
   *  DataTypeConversion: '<S159>/DataTypeConversion'
   *  DataTypeConversion: '<S160>/DataTypeConversion'
   *  RelationalOperator: '<S159>/Relational Operator1'
   *  RelationalOperator: '<S160>/Relational Operator1'
   *  Saturate: '<S160>/Saturation2'
   */
  rtb_TmpSignalConversionAtved__l = ((rtb_Saturation2_ic > (sint32)tmpRead_i) ||
    (rtb_DataTypeConversion_jq > (sint32)rtb_TmpSignalConversionAtian__o));

  /* Switch: '<S53>/Switch1' incorporates:
   *  Logic: '<S154>/Logical Operator'
   *  Logic: '<S154>/Logical Operator1'
   *  UnitDelay: '<S154>/Unit Delay2'
   */
  if (rtb_TmpSignalConversionAtved__l && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_a2))
  {
    /* Sum: '<S53>/Add1' incorporates:
     *  Constant: '<S53>/uint5'
     *  UnitDelay: '<S53>/Unit Delay'
     */
    rtb_DataTypeConversion_jq = (sint32)((uint32)
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_ay + ((uint8)1U));
    if ((uint32)rtb_DataTypeConversion_jq > 255U) {
      rtb_DataTypeConversion_jq = 255;
    }

    /* Switch: '<S53>/Switch1' incorporates:
     *  Sum: '<S53>/Add1'
     */
    rtb_TmpSignalConversionAticlbms = (uint8)rtb_DataTypeConversion_jq;
  } else {
    /* Switch: '<S53>/Switch1' incorporates:
     *  UnitDelay: '<S53>/Unit Delay'
     */
    rtb_TmpSignalConversionAticlbms = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ay;
  }

  /* End of Switch: '<S53>/Switch1' */

  /* RelationalOperator: '<S53>/Relational Operator1' incorporates:
   *  Constant: '<S53>/icdc_disconnected1'
   *
   * Block description for '<S53>/icdc_disconnected1':
   *  [1]
   */
  rtb_UnitDelay_jn = (rtb_TmpSignalConversionAticdc_s == ((uint8)3U));

  /* Switch: '<S53>/Switch2' incorporates:
   *  Logic: '<S153>/Logical Operator'
   *  Logic: '<S153>/Logical Operator1'
   *  Logic: '<S155>/Logical Operator'
   *  Logic: '<S155>/Logical Operator1'
   *  Switch: '<S53>/Switch'
   *  UnitDelay: '<S153>/Unit Delay2'
   *  UnitDelay: '<S155>/Unit Delay2'
   */
  if (rtb_UnitDelay_jn && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_d3)) {
    /* Switch: '<S53>/Switch2' incorporates:
     *  Constant: '<S53>/uint4'
     */
    rtb_TmpSignalConversionAticlbms = ((uint8)0U);
  } else if (rtb_TmpSignalConversionAtiud_bE &&
             (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_pi)) {
    /* Sum: '<S53>/Add' incorporates:
     *  Switch: '<S53>/Switch'
     */
    rtb_DataTypeConversion_jq = (sint32)((uint32)rtb_TmpSignalConversionAtHvCoor
      + rtb_TmpSignalConversionAticlbms);
    if ((uint32)rtb_DataTypeConversion_jq > 255U) {
      rtb_DataTypeConversion_jq = 255;
    }

    /* Switch: '<S53>/Switch2' incorporates:
     *  Sum: '<S53>/Add'
     *  Switch: '<S53>/Switch'
     */
    rtb_TmpSignalConversionAticlbms = (uint8)rtb_DataTypeConversion_jq;
  }

  /* End of Switch: '<S53>/Switch2' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/iczcu_stRMCUAuthent' */
  (void)Rte_Read_iczcu_stRMCUAuthent_Value(&rtb_Selector14);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Logic: '<S53>/Not' incorporates:
   *  Constant: '<S53>/hpp_tiRemHvBatPrecdngSet_C6'
   *  Constant: '<S53>/hpp_tiRemHvBatPrecdngSet_C7'
   *  Logic: '<S53>/OR1'
   *  RelationalOperator: '<S53>/Greater1'
   *  RelationalOperator: '<S53>/Greater2'
   *
   * Block description for '<S53>/hpp_tiRemHvBatPrecdngSet_C6':
   *  [10]
   *
   * Block description for '<S53>/hpp_tiRemHvBatPrecdngSet_C7':
   *  [3]
   */
  HvCoorn_bLbmsSocWkup = ((rtb_TmpSignalConversionAticbms_ >=
    HvCoorn_pctHvSocLbmsMntnDisb_C) && (rtb_TmpSignalConversionAticlbms <
    HvCoorn_ctFailLbmsMntnDisb_C));

  /* Constant: '<S53>/hpp_tiRemHvBatPrecdngSet_C2'
   *
   * Block description for '<S53>/hpp_tiRemHvBatPrecdngSet_C2':
   *  [50]
   */
  HvCoorn_pctLbmsSocMntnThd = HvCoorn_pctLbmsSocMntnThd_C;

  /* Switch: '<S54>/Switch' */
  if (rtb_Equal3_a) {
    /* Switch: '<S54>/Switch' */
    HvCoorn_ctSmtBatMntnFailEEW = rtb_TmpSignalConversionAticlbms;
  } else {
    /* Switch: '<S54>/Switch' */
    HvCoorn_ctSmtBatMntnFailEEW = rtb_TmpSignalConversionAticbm_l;
  }

  /* End of Switch: '<S54>/Switch' */

  /* Logic: '<S5>/Logical Operator4' incorporates:
   *  Logic: '<S15>/Logical Operator4'
   *  UnitDelay: '<S3>/Unit Delay1'
   */
  rtb_RelationalOperator_e2 = !HvCoorn_bActvDischargeErr;

  /* Logic: '<S5>/Logical Operator1' incorporates:
   *  Logic: '<S15>/Logical Operator2'
   */
  rtb_RelationalOperator_ce_idx_1 = !HvCoorn_bHvInitFail;

  /* Logic: '<S5>/Logical Operator' incorporates:
   *  Constant: '<S5>/sup_tiWaitIgnOn_C'
   *  Constant: '<S5>/sup_tiWaitIgnOn_C1'
   *  Constant: '<S5>/sup_tiWaitIgnOn_C2'
   *  Logic: '<S5>/AND'
   *  Logic: '<S5>/Logical Operator1'
   *  Logic: '<S5>/Logical Operator4'
   *  Logic: '<S5>/OR'
   *  Logic: '<S5>/OR1'
   *  RelationalOperator: '<S5>/Relational Operator'
   *
   * Block description for '<S5>/sup_tiWaitIgnOn_C':
   *  [0]
   *
   * Block description for '<S5>/sup_tiWaitIgnOn_C1':
   *  [1]
   *
   * Block description for '<S5>/sup_tiWaitIgnOn_C2':
   *  [1]
   */
  HvCoorn_bInit2StrtUp = ((HvCoorn_tiHVPStTimer > HvCoorn_tiWaitIgnOn_C) &&
    HvCoorn_bStartUpReq && ((rtb_TmpSignalConversionAtved_bI &&
    rtb_RelationalOperator_e2 && rtb_RelationalOperator_ce_idx_1) ||
    HvCoorn_bInitErrChkByp_C) && (HvCoorn_bHvRlyOpenAct ||
    HvCoorn_bInitRlyOpenChkByp_C));

  /* Logic: '<S6>/Logical Operator19' incorporates:
   *  Logic: '<S14>/Logical Operator3'
   *  Logic: '<S16>/Logical Operator5'
   *  Logic: '<S18>/Logical Operator5'
   *  Logic: '<S19>/Logical Operator5'
   *  Logic: '<S20>/Logical Operator7'
   *  Logic: '<S231>/Logical Operator'
   *  Logic: '<S322>/Not12'
   *  Logic: '<S322>/Not6'
   *  Logic: '<S7>/Logical Operator10'
   *  Logic: '<S8>/NOT'
   */
  rtb_AND9_c = !HvCoorn_bStartUpReq;

  /* Logic: '<S6>/Logical Operator18' incorporates:
   *  Logic: '<S6>/Logical Operator19'
   */
  HvCoorn_bComm2ShutECU = (HvCoorn_bHvInitFail || rtb_AND9_c);

  /* Logic: '<S6>/Logical Operator9' incorporates:
   *  Constant: '<S6>/sup_bHVReqEnaMan_C'
   *
   * Block description for '<S6>/sup_bHVReqEnaMan_C':
   *  [1]
   */
  HvCoorn_bComm2HVReq = (rtb_LogicalOperator6_hy || HvCoorn_bHVReqEnaMan_C);

  /* Logic: '<S7>/Logical Operator1' */
  HvCoorn_bHVReq2DCBuck = (HvCoorn_bStartUpReq && rtb_AND26_o &&
    rtb_TmpSignalConversionAtved_bI);

  /* Logic: '<S7>/Logical Operator9' */
  HvCoorn_bHVReq2ShutDown = (rtb_AND9_c || HvCoorn_bHvOnFail);

  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S8>/icdc_buckDcdc'
   *  RelationalOperator: '<S8>/Relational Operator3'
   *
   * Block description for '<S8>/icdc_buckDcdc':
   *  [3]
   */
  rtb_bGearOk = (rtb_TmpSignalConversionAticdc_s == ((uint8)3U));

  /* Logic: '<S8>/Logical Operator' incorporates:
   *  Constant: '<S8>/sup_tiWait4Comm_C'
   *  Constant: '<S8>/sup_vLowBatVoltLim_C3'
   *  Logic: '<S8>/Logical Operator1'
   *  RelationalOperator: '<S8>/Relational Operator'
   *
   * Block description for '<S8>/sup_tiWait4Comm_C':
   *  [0.02]
   *
   * Block description for '<S8>/sup_vLowBatVoltLim_C3':
   *  [1]
   */
  HvCoorn_bDCBuck2Rdy = (HvCoorn_bStartUpReq && (HvCoorn_tiHVPStTimer >
    HvCoorn_tiWait4Comm_C) && (rtb_bGearOk || HvCoorn_bBuck2RdyBypDCDCEna_C));

  /* Logic: '<S8>/Logical Operator2' incorporates:
   *  Constant: '<S8>/sup_bDCDCBuckEnaMan_C1'
   *  Constant: '<S8>/sup_tiWait4Comm_C1'
   *  Constant: '<S8>/uint8'
   *  Logic: '<S8>/AND'
   *  Logic: '<S8>/NOT1'
   *  RelationalOperator: '<S8>/Relational Operator1'
   *  RelationalOperator: '<S8>/Relational Operator2'
   *  UnitDelay: '<S3>/Unit Delay2'
   *
   * Block description for '<S8>/sup_bDCDCBuckEnaMan_C1':
   *  [0]
   *
   * Block description for '<S8>/sup_tiWait4Comm_C1':
   *  [2]
   *
   * Block description for '<S8>/uint8':
   *  DCDCBuckReq
   */
  HvCoorn_bDCBuck2Shtdwn = ((HvCoorn_bDCNotBuck2ShtdwnEna_C && (!rtb_bGearOk) &&
    (HvCoorn_stHVP == ((uint8)17U)) && (HvCoorn_tiHVPStTimer >
    HvCoorn_tiMaxWait4DCBuck_C)) || rtb_AND9_c);

  /* Switch: '<S9>/Switch' incorporates:
   *  Inport: '<Root>/iczcu_stFMCUAuthent'
   */
  if (rtb_TmpSignalConversionAtVehC_i) {
    /* Switch: '<S9>/Switch' incorporates:
     *  Constant: '<S9>/uint6'
     *  RelationalOperator: '<S9>/Relational Operator4'
     *
     * Block description for '<S9>/uint6':
     *  Authentication successed
     */
    HvCoorn_bMCUAuthentPass = (rtb_Selector14 == ((uint8)1U));
  } else {
    (void)Rte_Read_iczcu_stFMCUAuthent_Value(&rtb_Selector16);

    /* Switch: '<S9>/Switch' incorporates:
     *  Constant: '<S9>/uint1'
     *  Constant: '<S9>/uint6'
     *  Inport: '<Root>/iczcu_stFMCUAuthent'
     *  Logic: '<S9>/OR3'
     *  RelationalOperator: '<S9>/Relational Operator2'
     *  RelationalOperator: '<S9>/Relational Operator4'
     *
     * Block description for '<S9>/uint1':
     *  Authentication successed
     *
     * Block description for '<S9>/uint6':
     *  Authentication successed
     */
    HvCoorn_bMCUAuthentPass = ((rtb_Selector14 == ((uint8)1U)) ||
      (rtb_Selector16 == ((uint8)1U)));
  }

  /* End of Switch: '<S9>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/icbcm_bDrvrDoorAjarSigErr' */
  (void)Rte_Read_icbcm_bDrvrDoorAjarSigErr_Value(&rtb_AND8_k);

  /* Inport: '<Root>/icbcm_bDrvrDoorAjar' */
  (void)Rte_Read_icbcm_bDrvrDoorAjar_Value(&rtb_RelationalOperator_gn);

  /* Inport: '<Root>/icbcm_bStDrvrSeatBeltSigErr' */
  (void)Rte_Read_icbcm_bStDrvrSeatBeltSigErr_Value(&rtb_AND2_e);

  /* Inport: '<Root>/icbcm_stDrvrSeatBelt' */
  (void)Rte_Read_icbcm_stDrvrSeatBelt_Value(&rtb_Gain12);

  /* Inport: '<Root>/GearLvr_stCmpgMod' */
  (void)Rte_Read_GearLvr_stCmpgMod_Value(&tmpRead_9);

  /* Inport: '<Root>/icdkm_stLrcpReq' */
  (void)Rte_Read_icdkm_stLrcpReq_Value(&tmpRead_8);

  /* Inport: '<Root>/icbms_stIsolTst' */
  (void)Rte_Read_icbms_stIsolTst_Value(&tmpRead_6);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* RelationalOperator: '<S31>/Equal3' incorporates:
   *  Constant: '<S9>/uint4'
   *  RelationalOperator: '<S9>/Equal2'
   *
   * Block description for '<S9>/uint4':
   *  Authentication successed
   */
  rtb_RelationalOperator_ce_idx_0 = (tmpRead_8 == ((uint8)1U));

  /* Logic: '<S9>/AND2' incorporates:
   *  Constant: '<S9>/sup_pwrBatDchg4HvOn_C1'
   *  Constant: '<S9>/sup_tiKeyStrt_C5'
   *  Constant: '<S9>/uint7'
   *  Logic: '<S9>/Not1'
   *  Logic: '<S9>/Not2'
   *  Logic: '<S9>/Not3'
   *  Logic: '<S9>/Not4'
   *  Logic: '<S9>/Not5'
   *  Logic: '<S9>/OR5'
   *  RelationalOperator: '<S9>/Equal4'
   *  RelationalOperator: '<S9>/Relational Operator13'
   *
   * Block description for '<S9>/sup_pwrBatDchg4HvOn_C1':
   *  [6]
   *
   * Block description for '<S9>/sup_tiKeyStrt_C5':
   *  [1]
   */
  HvCoorn_bDrvrLevFlg = ((!rtb_RelationalOperator_ce_idx_0) &&
    (rtb_TmpSignalConversionAtGearLv == ((uint8)6U)) && (rtb_Gain12 == ((uint8)
    1U)) && (!rtb_AND2_e) && (rtb_RelationalOperator_gn && (!rtb_AND8_k)) &&
    (!rtb_TmpSignalConversionAtBrkPed) && HvCoorn_bDrvrLevNotRdyEna_C);

  /* SignalConversion generated from: '<S1>/GearLvr_bSentilMod' incorporates:
   *  Inport: '<Root>/GearLvr_bSentilMod'
   */
  (void)Rte_Read_GearLvr_bSentilMod_Value(&rtb_TmpSignalConversionAtGear_e);

  /* SignalConversion generated from: '<S1>/GearLvr_bOffVehPwrKeep' incorporates:
   *  Inport: '<Root>/GearLvr_bOffVehPwrKeep'
   */
  (void)Rte_Read_GearLvr_bOffVehPwrKeep_Value(&rtb_TmpSignalConversionAtGear_n);

  /* SignalConversion generated from: '<S1>/GearLvr_bNapModActv' incorporates:
   *  Inport: '<Root>/GearLvr_bNapModActv'
   */
  (void)Rte_Read_GearLvr_bNapModActv_Value(&rtb_TmpSignalConversionAtGear_m);

  /* Logic: '<S9>/Logical Operator3' incorporates:
   *  Logic: '<S9>/OR2'
   */
  rtb_bGearOk = !rtb_TmpSignalConversionAtDrvMod;

  /* Logic: '<S9>/Logical Operator11' incorporates:
   *  Logic: '<S9>/OR2'
   */
  rtb_TmpSignalConversionAtDrvMod = !rtb_TmpSignalConversionAtGear_e;

  /* Logic: '<S9>/Logical Operator12' incorporates:
   *  Logic: '<S9>/OR2'
   */
  rtb_TmpSignalConversionAtGear_n = !rtb_TmpSignalConversionAtGear_n;

  /* Logic: '<S9>/Logical Operator13' incorporates:
   *  Logic: '<S9>/OR2'
   */
  rtb_TmpSignalConversionAtGear_m = !rtb_TmpSignalConversionAtGear_m;

  /* Logic: '<S9>/Logical Operator14' incorporates:
   *  Constant: '<S9>/Constant7'
   *  Logic: '<S9>/OR2'
   *  RelationalOperator: '<S9>/Equal12'
   *
   * Block description for '<S9>/Constant7':
   *  [0]
   */
  rtb_TmpSignalConversionAtGear_e = (tmpRead_9 == ((uint8)0U));

  /* Logic: '<S31>/AND7' incorporates:
   *  Logic: '<S9>/Logical Operator1'
   *  Logic: '<S9>/Logical Operator11'
   *  Logic: '<S9>/Logical Operator12'
   *  Logic: '<S9>/Logical Operator13'
   *  Logic: '<S9>/Logical Operator14'
   *  Logic: '<S9>/Logical Operator3'
   */
  rtb_AND7_j = (rtb_bGearOk && rtb_TmpSignalConversionAtDrvMod &&
                rtb_TmpSignalConversionAtGear_n &&
                rtb_TmpSignalConversionAtGear_m &&
                rtb_TmpSignalConversionAtGear_e);

  /* RelationalOperator: '<S186>/Relational Operator' incorporates:
   *  Constant: '<S186>/single4'
   *  UnitDelay: '<S186>/Unit Delay'
   */
  rtb_AND26_o = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl > 0);

  /* RelationalOperator: '<S31>/Equal12' incorporates:
   *  Logic: '<S186>/Logical Operator2'
   */
  rtb_Equal12_a = (rtb_AND26_o || HvCoorn_bChrgLink);

  /* SignalConversion generated from: '<S1>/ved_bInhbRdy' incorporates:
   *  Inport: '<Root>/ved_bInhbRdy'
   */
  (void)Rte_Read_ved_bInhbRdy_Value(&rtb_TmpSignalConversionAtved__p);

  /* Logic: '<S30>/AND23' incorporates:
   *  Constant: '<S9>/uint2'
   *  RelationalOperator: '<S9>/Equal'
   *
   * Block description for '<S9>/uint2':
   *  IsolationTesting request
   */
  rtb_AND23 = (tmpRead_6 == ((uint8)1U));

  /* Switch: '<S184>/Switch' */
  if (HvCoorn_bDrvrLevFlg) {
    /* Sum: '<S184>/Subtract1' incorporates:
     *  Constant: '<S184>/single1'
     *  UnitDelay: '<S184>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_m5 < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_m5)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_m5 > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_m5)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_m5 + 1;
    }

    /* End of Sum: '<S184>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S184>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S184>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/VehCfg_stCycCdn' */
  (void)Rte_Read_VehCfg_stCycCdn_Value(&tmpRead_d);

  /* SignalConversion: '<S1>/Signal Conversion83' incorporates:
   *  Inport: '<Root>/VCCM_flg_SK_Recep_ok'
   */
  (void)Rte_Read_VCCM_flg_SK_Recep_ok_Value((boolean *)&VCCM_flg_SK_Recep_ok);

  /* SignalConversion: '<S1>/Signal Conversion82' incorporates:
   *  Inport: '<Root>/VCCM_flg_Antitheft_Start'
   */
  (void)Rte_Read_VCCM_flg_Antitheft_Start_Value((boolean *)
    &VCCM_flg_Antitheft_Start);

  /* SignalConversion: '<S1>/Signal Conversion81' incorporates:
   *  Inport: '<Root>/VCCM_flg_Antitheft_Overtime'
   */
  (void)Rte_Read_VCCM_flg_Antitheft_Overtime_Value((boolean *)
    &VCCM_flg_Antitheft_Overtime);

  /* SignalConversion: '<S1>/Signal Conversion80' incorporates:
   *  Inport: '<Root>/VCCM_flg_Allow_Antitheft'
   */
  (void)Rte_Read_VCCM_flg_Allow_Antitheft_Value((boolean *)
    &VCCM_flg_Allow_Antitheft);

  /* Inport: '<Root>/ictcp_stLostComWarn' */
  (void)Rte_Read_ictcp_stLostComWarn_Value(&HvCoorn_stHVP_f);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S184>/Unit Delay' incorporates:
   *  Saturate: '<S184>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_m5 = rtb_DataTypeConversion_jq;

  /* Product: '<S184>/Divide' incorporates:
   *  Constant: '<S9>/Calibration2'
   *
   * Block description for '<S9>/Calibration2':
   *  [30]
   */
  tmpRead_i = HvCoorn_tiDrvrLevNotRdyDly_C / HvCoorn_ConstB.Max_ms;

  /* DataTypeConversion: '<S184>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S30>/AND12' incorporates:
   *  DataTypeConversion: '<S184>/DataTypeConversion'
   *  RelationalOperator: '<S184>/Relational Operator1'
   *  Saturate: '<S184>/Saturation2'
   */
  rtb_AND12_o = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* DataTypeConversion: '<S9>/DataTypeConversion' incorporates:
   *  ArithShift: '<S181>/Shift Arithmetic1'
   *  ArithShift: '<S181>/Shift Arithmetic2'
   *  ArithShift: '<S181>/Shift Arithmetic3'
   *  ArithShift: '<S181>/Shift Arithmetic4'
   *  ArithShift: '<S181>/Shift Arithmetic5'
   *  ArithShift: '<S181>/Shift Arithmetic6'
   *  Constant: '<S9>/sup_tiKeyStrt_C4'
   *  DataTypeConversion: '<S181>/Data Type Conversion4'
   *  DataTypeConversion: '<S181>/Data Type Conversion5'
   *  DataTypeConversion: '<S181>/Data Type Conversion6'
   *  DataTypeConversion: '<S181>/Data Type Conversion7'
   *  DataTypeConversion: '<S181>/Data Type Conversion8'
   *  Logic: '<S9>/AND1'
   *  Logic: '<S9>/Logical Operator15'
   *  RelationalOperator: '<S9>/Equal1'
   *  Sum: '<S181>/Add'
   *
   * Block description for '<S9>/sup_tiKeyStrt_C4':
   *  [3]
   */
  HvCoorn_stRdy2RdyWait = (uint8)(((((((uint32)(rtb_TmpSignalConversionAticic_a &&
    (rtb_TmpSignalConversionAtVehSpd <= HvCoorn_vVehSpdOTAInhbRdyLim_C)) +
    (uint32)(!rtb_AND7_j << 1)) + (uint32)(rtb_RelationalOperator_f_tmp << 2)) +
    (uint32)(rtb_Equal12_a << 3)) + (uint32)(rtb_TmpSignalConversionAtved__p <<
    4)) + (uint32)(rtb_AND23 << 5)) + (uint32)(rtb_AND12_o << 6));

  /* SignalConversion generated from: '<S1>/ictcp_noAuthChlgOnReq' incorporates:
   *  Inport: '<Root>/ictcp_noAuthChlgOnReq'
   */
  (void)Rte_Read_ictcp_noAuthChlgOnReq_Value(rtb_TmpSignalConversionAtictc_h);

  /* SignalConversion generated from: '<S1>/ictcp_noAuthSts' incorporates:
   *  Inport: '<Root>/ictcp_noAuthSts'
   */
  (void)Rte_Read_ictcp_noAuthSts_Value(rtb_TmpSignalConversionAtictc_j);

  /* Outputs for Enabled SubSystem: '<S3>/A30_Authcation' incorporates:
   *  EnablePort: '<S33>/Enable'
   */
  /* Logic: '<S38>/AND' incorporates:
   *  Constant: '<S38>/Constant53'
   *  Constant: '<S38>/sup_bEmEnaDCUStMan_C'
   *  RelationalOperator: '<S38>/Equal1'
   *
   * Block description for '<S38>/Constant53':
   *  [0]
   *
   * Block description for '<S38>/sup_bEmEnaDCUStMan_C':
   *  [1]
   */
  if ((tmpRead_d == ((uint8)0U)) && HvCoorn_bAuthEnaSwt_C) {
    /* Switch: '<S33>/Switch4' incorporates:
     *  Constant: '<S33>/sup_bKeyStrtMan_C4'
     *
     * Block description for '<S33>/sup_bKeyStrtMan_C4':
     *  [0]
     */
    if (HvCoorn_TBOX_byte5_FBSet_C) {
      /* Switch: '<S33>/Switch4' incorporates:
       *  Constant: '<S33>/sup_bKeyStrtMan_C3'
       *
       * Block description for '<S33>/sup_bKeyStrtMan_C3':
       *  [0]
       */
      HvCoorn_stTboxByte5Fb = HvCoorn_TBOX_byte5_FBCal_C;
    } else {
      /* Switch: '<S33>/Switch4' incorporates:
       *  Constant: '<S33>/10'
       *  Selector: '<S33>/Selector3'
       *  SignalConversion generated from: '<S1>/ictcp_noAuthSts'
       */
      HvCoorn_stTboxByte5Fb = rtb_TmpSignalConversionAtictc_j[(sint32)3.0F - 1];
    }

    /* End of Switch: '<S33>/Switch4' */

    /* Logic: '<S33>/AND8' */
    rtb_AND8_k = (rtb_TmpSignalConversionAtidi_bK && VCCM_flg_Allow_Antitheft);

    /* Logic: '<S296>/Logical_Operator4' incorporates:
     *  Logic: '<S290>/Logical Operator'
     *  Logic: '<S290>/Logical Operator1'
     *  Logic: '<S296>/Logical Operator1'
     *  Logic: '<S296>/Logical_Operator5'
     *  UnitDelay: '<S290>/Unit Delay2'
     *  UnitDelay: '<S296>/Unit Delay'
     *  UnitDelay: '<S33>/Unit Delay3'
     */
    rtb_Logical_Operator4_cz = ((!HvCoorn_ARID_DEF.UnitDelay3_DSTATE_g) &&
      ((rtb_AND8_k && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_gc)) ||
       HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5y));

    /* Switch: '<S297>/Switch2' incorporates:
     *  Logic: '<S33>/AND6'
     *  Switch: '<S297>/Switch1'
     *  UnitDelay: '<S33>/Unit Delay4'
     */
    if (HvCoorn_ARID_DEF.UnitDelay4_DSTATE_n) {
      /* Switch: '<S297>/Switch2' incorporates:
       *  Constant: '<S297>/Number1'
       */
      rtb_TmpSignalConversionAtPwrLim = 0.0F;
    } else if (VCCM_flg_Allow_Antitheft && rtb_TmpSignalConversionAtidi_bK) {
      /* Switch: '<S297>/Switch1' incorporates:
       *  Constant: '<S33>/uint44'
       *  Sum: '<S297>/Sum1'
       *  Switch: '<S297>/Switch2'
       *  UnitDelay: '<S297>/Unit Delay1'
       */
      rtb_TmpSignalConversionAtPwrLim = 0.01F +
        HvCoorn_ARID_DEF.UnitDelay1_DSTATE_n;
    } else {
      /* Switch: '<S297>/Switch2' incorporates:
       *  Switch: '<S297>/Switch1'
       *  UnitDelay: '<S297>/Unit Delay1'
       */
      rtb_TmpSignalConversionAtPwrLim = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_n;
    }

    /* End of Switch: '<S297>/Switch2' */

    /* Logic: '<S33>/OR2' incorporates:
     *  Constant: '<S33>/sup_tiChgConndown_C'
     *  RelationalOperator: '<S33>/GreaterOrEqual'
     *
     * Block description for '<S33>/sup_tiChgConndown_C':
     *  [1800]
     */
    HvCoorn_bAntiTrig42C = (rtb_Logical_Operator4_cz ||
      (rtb_TmpSignalConversionAtPwrLim >= HvCoorn_tiAuthStartDly_C));

    /* Switch: '<S33>/Switch2' incorporates:
     *  Logic: '<S33>/Not2'
     *  Switch: '<S33>/Switch1'
     */
    if (!HvCoorn_bAntiTrig42C) {
      /* Switch: '<S33>/Switch2' incorporates:
       *  Constant: '<S33>/uint6'
       */
      HvCoorn_stVcuByte5Req = ((uint8)1U);

      /* Switch: '<S33>/Switch1' incorporates:
       *  Constant: '<S33>/uint3'
       */
      HvCoorn_stVcuByte4Req = ((uint8)100U);
    }

    /* End of Switch: '<S33>/Switch2' */

    /* Switch: '<S33>/Switch8' incorporates:
     *  Constant: '<S33>/sup_bKeyStrtMan_C1'
     *
     * Block description for '<S33>/sup_bKeyStrtMan_C1':
     *  [0]
     */
    if (HvCoorn_TBOX_byte4_FBSet_C) {
      /* Switch: '<S33>/Switch8' incorporates:
       *  Constant: '<S33>/sup_bKeyStrtMan_C2'
       *
       * Block description for '<S33>/sup_bKeyStrtMan_C2':
       *  [0]
       */
      HvCoorn_stTboxByte4Fb = HvCoorn_TBOX_byte4_FBCal_C;
    } else {
      /* Switch: '<S33>/Switch8' incorporates:
       *  Constant: '<S33>/11'
       *  Selector: '<S33>/Selector4'
       *  SignalConversion generated from: '<S1>/ictcp_noAuthSts'
       */
      HvCoorn_stTboxByte4Fb = rtb_TmpSignalConversionAtictc_j[(sint32)4.0F - 1];
    }

    /* End of Switch: '<S33>/Switch8' */

    /* Logic: '<S33>/AND1' incorporates:
     *  RelationalOperator: '<S33>/Equal3'
     *  RelationalOperator: '<S33>/Equal4'
     */
    rtb_AND15_f = ((HvCoorn_stTboxByte5Fb == HvCoorn_stVcuByte5Req) &&
                   (HvCoorn_stTboxByte4Fb == HvCoorn_stVcuByte4Req));

    /* Selector: '<S33>/Selector9' incorporates:
     *  Constant: '<S33>/4'
     *  Selector: '<S33>/Selector1'
     */
    HvCoorn_stTboxByte7Req_tmp = (sint32)1.0F - 1;

    /* SignalConversion: '<S33>/Signal Copy20' incorporates:
     *  Selector: '<S33>/Selector9'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthChlgOnReq'
     */
    HvCoorn_stTboxByte7Req =
      rtb_TmpSignalConversionAtictc_h[HvCoorn_stTboxByte7Req_tmp];

    /* MultiPortSwitch: '<S310>/Multiport Switch' incorporates:
     *  Constant: '<S298>/Constant2'
     */
    switch ((sint32)0.0) {
     case 0:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S310>/Data Type Conversion1'
       *  S-Function (sfix_bitop): '<S310>/Bitwise Operator'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)1U)) != 0);
      break;

     case 1:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S310>/Data Type Conversion2'
       *  S-Function (sfix_bitop): '<S310>/Bitwise Operator2'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)2U)) != 0);
      break;

     case 2:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S310>/Data Type Conversion3'
       *  S-Function (sfix_bitop): '<S310>/Bitwise Operator4'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)4U)) != 0);
      break;

     case 3:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S310>/Data Type Conversion4'
       *  S-Function (sfix_bitop): '<S310>/Bitwise Operator6'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)8U)) != 0);
      break;

     case 4:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S310>/Data Type Conversion5'
       *  S-Function (sfix_bitop): '<S310>/Bitwise Operator8'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)16U)) != 0);
      break;

     case 5:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S310>/Data Type Conversion6'
       *  S-Function (sfix_bitop): '<S310>/Bitwise Operator10'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)32U)) != 0);
      break;

     case 6:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S310>/Data Type Conversion7'
       *  S-Function (sfix_bitop): '<S310>/Bitwise Operator12'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)64U)) != 0);
      break;

     case 7:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S310>/Data Type Conversion8'
       *  S-Function (sfix_bitop): '<S310>/Bitwise Operator14'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)128U)) != 0);
      break;

     default:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S310>/Data Type Conversion9'
       */
      rtb_Selector16 = (uint8)(HvCoorn_stTboxByte7Req != 0);
      break;
    }

    /* End of MultiPortSwitch: '<S310>/Multiport Switch' */

    /* Gain: '<S298>/Gain12' incorporates:
     *  DataTypeConversion: '<S310>/Data Type Conversion10'
     */
    rtb_Gain12 = (uint8)(((uint32)(rtb_Selector16 != 0) * ((uint8)128U)) >> 7);

    /* MultiPortSwitch: '<S303>/Multiport Switch' incorporates:
     *  Constant: '<S298>/Constant11'
     */
    switch ((sint32)1.0) {
     case 0:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S303>/Data Type Conversion1'
       *  S-Function (sfix_bitop): '<S303>/Bitwise Operator'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)1U)) != 0);
      break;

     case 1:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S303>/Data Type Conversion2'
       *  S-Function (sfix_bitop): '<S303>/Bitwise Operator2'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)2U)) != 0);
      break;

     case 2:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S303>/Data Type Conversion3'
       *  S-Function (sfix_bitop): '<S303>/Bitwise Operator4'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)4U)) != 0);
      break;

     case 3:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S303>/Data Type Conversion4'
       *  S-Function (sfix_bitop): '<S303>/Bitwise Operator6'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)8U)) != 0);
      break;

     case 4:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S303>/Data Type Conversion5'
       *  S-Function (sfix_bitop): '<S303>/Bitwise Operator8'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)16U)) != 0);
      break;

     case 5:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S303>/Data Type Conversion6'
       *  S-Function (sfix_bitop): '<S303>/Bitwise Operator10'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)32U)) != 0);
      break;

     case 6:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S303>/Data Type Conversion7'
       *  S-Function (sfix_bitop): '<S303>/Bitwise Operator12'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)64U)) != 0);
      break;

     case 7:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S303>/Data Type Conversion8'
       *  S-Function (sfix_bitop): '<S303>/Bitwise Operator14'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)128U)) != 0);
      break;

     default:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S303>/Data Type Conversion9'
       */
      rtb_Selector16 = (uint8)(HvCoorn_stTboxByte7Req != 0);
      break;
    }

    /* End of MultiPortSwitch: '<S303>/Multiport Switch' */

    /* Selector: '<S33>/Selector15' incorporates:
     *  DataTypeConversion: '<S303>/Data Type Conversion10'
     *  Gain: '<S298>/Gain13'
     */
    rtb_TmpSignalConversionAtHvCoor = (uint8)(((uint32)(rtb_Selector16 != 0) *
      ((uint8)128U)) >> 6);

    /* MultiPortSwitch: '<S304>/Multiport Switch' incorporates:
     *  Constant: '<S298>/Constant12'
     */
    switch ((sint32)2.0) {
     case 0:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S304>/Data Type Conversion1'
       *  S-Function (sfix_bitop): '<S304>/Bitwise Operator'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)1U)) != 0);
      break;

     case 1:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S304>/Data Type Conversion2'
       *  S-Function (sfix_bitop): '<S304>/Bitwise Operator2'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)2U)) != 0);
      break;

     case 2:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S304>/Data Type Conversion3'
       *  S-Function (sfix_bitop): '<S304>/Bitwise Operator4'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)4U)) != 0);
      break;

     case 3:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S304>/Data Type Conversion4'
       *  S-Function (sfix_bitop): '<S304>/Bitwise Operator6'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)8U)) != 0);
      break;

     case 4:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S304>/Data Type Conversion5'
       *  S-Function (sfix_bitop): '<S304>/Bitwise Operator8'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)16U)) != 0);
      break;

     case 5:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S304>/Data Type Conversion6'
       *  S-Function (sfix_bitop): '<S304>/Bitwise Operator10'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)32U)) != 0);
      break;

     case 6:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S304>/Data Type Conversion7'
       *  S-Function (sfix_bitop): '<S304>/Bitwise Operator12'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)64U)) != 0);
      break;

     case 7:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S304>/Data Type Conversion8'
       *  S-Function (sfix_bitop): '<S304>/Bitwise Operator14'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)128U)) != 0);
      break;

     default:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S304>/Data Type Conversion9'
       */
      rtb_Selector16 = (uint8)(HvCoorn_stTboxByte7Req != 0);
      break;
    }

    /* End of MultiPortSwitch: '<S304>/Multiport Switch' */

    /* Selector: '<S33>/Selector14' incorporates:
     *  DataTypeConversion: '<S304>/Data Type Conversion10'
     *  Gain: '<S298>/Gain14'
     */
    rtb_Selector14 = (uint8)(((uint32)(rtb_Selector16 != 0) * ((uint8)128U)) >>
      5);

    /* MultiPortSwitch: '<S305>/Multiport Switch' incorporates:
     *  Constant: '<S298>/Constant13'
     */
    switch ((sint32)3.0) {
     case 0:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S305>/Data Type Conversion1'
       *  S-Function (sfix_bitop): '<S305>/Bitwise Operator'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)1U)) != 0);
      break;

     case 1:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S305>/Data Type Conversion2'
       *  S-Function (sfix_bitop): '<S305>/Bitwise Operator2'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)2U)) != 0);
      break;

     case 2:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S305>/Data Type Conversion3'
       *  S-Function (sfix_bitop): '<S305>/Bitwise Operator4'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)4U)) != 0);
      break;

     case 3:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S305>/Data Type Conversion4'
       *  S-Function (sfix_bitop): '<S305>/Bitwise Operator6'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)8U)) != 0);
      break;

     case 4:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S305>/Data Type Conversion5'
       *  S-Function (sfix_bitop): '<S305>/Bitwise Operator8'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)16U)) != 0);
      break;

     case 5:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S305>/Data Type Conversion6'
       *  S-Function (sfix_bitop): '<S305>/Bitwise Operator10'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)32U)) != 0);
      break;

     case 6:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S305>/Data Type Conversion7'
       *  S-Function (sfix_bitop): '<S305>/Bitwise Operator12'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)64U)) != 0);
      break;

     case 7:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S305>/Data Type Conversion8'
       *  S-Function (sfix_bitop): '<S305>/Bitwise Operator14'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)128U)) != 0);
      break;

     default:
      /* Selector: '<S33>/Selector16' incorporates:
       *  DataTypeConversion: '<S305>/Data Type Conversion9'
       */
      rtb_Selector16 = (uint8)(HvCoorn_stTboxByte7Req != 0);
      break;
    }

    /* End of MultiPortSwitch: '<S305>/Multiport Switch' */

    /* Sum: '<S298>/Add4' incorporates:
     *  DataTypeConversion: '<S305>/Data Type Conversion10'
     *  Gain: '<S298>/Gain15'
     */
    rtb_DataTypeConversion_jq = (sint32)((((((uint32)(rtb_Selector16 != 0) *
      ((uint8)128U)) >> 4) + rtb_Gain12) + rtb_TmpSignalConversionAtHvCoor) +
      rtb_Selector14);

    /* Saturate: '<S298>/Saturation' incorporates:
     *  Sum: '<S298>/Add4'
     */
    if ((uint8)rtb_DataTypeConversion_jq <= ((uint8)15U)) {
      /* Saturate: '<S298>/Saturation' */
      TBOX_receiver_module_req = (uint8)rtb_DataTypeConversion_jq;
    } else {
      /* Saturate: '<S298>/Saturation' */
      TBOX_receiver_module_req = ((uint8)15U);
    }

    /* End of Saturate: '<S298>/Saturation' */

    /* Logic: '<S33>/AND2' incorporates:
     *  Constant: '<S33>/uint24'
     *  Constant: '<S33>/uint25'
     *  RelationalOperator: '<S33>/Equal10'
     *  RelationalOperator: '<S33>/Equal11'
     */
    rtb_AND2_e = ((TBOX_receiver_module_req == ((uint8)0U)) ||
                  (TBOX_receiver_module_req == ((uint8)1U)));

    /* MultiPortSwitch: '<S306>/Multiport Switch' incorporates:
     *  Constant: '<S298>/Constant14'
     */
    switch ((sint32)4.0) {
     case 0:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S306>/Data Type Conversion1'
       *  S-Function (sfix_bitop): '<S306>/Bitwise Operator'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)1U)) != 0);
      break;

     case 1:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S306>/Data Type Conversion2'
       *  S-Function (sfix_bitop): '<S306>/Bitwise Operator2'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)2U)) != 0);
      break;

     case 2:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S306>/Data Type Conversion3'
       *  S-Function (sfix_bitop): '<S306>/Bitwise Operator4'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)4U)) != 0);
      break;

     case 3:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S306>/Data Type Conversion4'
       *  S-Function (sfix_bitop): '<S306>/Bitwise Operator6'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)8U)) != 0);
      break;

     case 4:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S306>/Data Type Conversion5'
       *  S-Function (sfix_bitop): '<S306>/Bitwise Operator8'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)16U)) != 0);
      break;

     case 5:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S306>/Data Type Conversion6'
       *  S-Function (sfix_bitop): '<S306>/Bitwise Operator10'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)32U)) != 0);
      break;

     case 6:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S306>/Data Type Conversion7'
       *  S-Function (sfix_bitop): '<S306>/Bitwise Operator12'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)64U)) != 0);
      break;

     case 7:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S306>/Data Type Conversion8'
       *  S-Function (sfix_bitop): '<S306>/Bitwise Operator14'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)128U)) != 0);
      break;

     default:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S306>/Data Type Conversion9'
       */
      rtb_Selector16 = (uint8)(HvCoorn_stTboxByte7Req != 0);
      break;
    }

    /* End of MultiPortSwitch: '<S306>/Multiport Switch' */

    /* Gain: '<S298>/Gain8' incorporates:
     *  DataTypeConversion: '<S306>/Data Type Conversion10'
     */
    rtb_Gain12 = (uint8)(((uint32)(rtb_Selector16 != 0) * ((uint8)128U)) >> 7);

    /* MultiPortSwitch: '<S307>/Multiport Switch' incorporates:
     *  Constant: '<S298>/Constant15'
     */
    switch ((sint32)5.0) {
     case 0:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S307>/Data Type Conversion1'
       *  S-Function (sfix_bitop): '<S307>/Bitwise Operator'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)1U)) != 0);
      break;

     case 1:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S307>/Data Type Conversion2'
       *  S-Function (sfix_bitop): '<S307>/Bitwise Operator2'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)2U)) != 0);
      break;

     case 2:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S307>/Data Type Conversion3'
       *  S-Function (sfix_bitop): '<S307>/Bitwise Operator4'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)4U)) != 0);
      break;

     case 3:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S307>/Data Type Conversion4'
       *  S-Function (sfix_bitop): '<S307>/Bitwise Operator6'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)8U)) != 0);
      break;

     case 4:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S307>/Data Type Conversion5'
       *  S-Function (sfix_bitop): '<S307>/Bitwise Operator8'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)16U)) != 0);
      break;

     case 5:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S307>/Data Type Conversion6'
       *  S-Function (sfix_bitop): '<S307>/Bitwise Operator10'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)32U)) != 0);
      break;

     case 6:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S307>/Data Type Conversion7'
       *  S-Function (sfix_bitop): '<S307>/Bitwise Operator12'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)64U)) != 0);
      break;

     case 7:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S307>/Data Type Conversion8'
       *  S-Function (sfix_bitop): '<S307>/Bitwise Operator14'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)128U)) != 0);
      break;

     default:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S307>/Data Type Conversion9'
       */
      rtb_Selector16 = (uint8)(HvCoorn_stTboxByte7Req != 0);
      break;
    }

    /* End of MultiPortSwitch: '<S307>/Multiport Switch' */

    /* Selector: '<S33>/Selector14' incorporates:
     *  DataTypeConversion: '<S307>/Data Type Conversion10'
     *  Gain: '<S298>/Gain9'
     */
    rtb_Selector14 = (uint8)(((uint32)(rtb_Selector16 != 0) * ((uint8)128U)) >>
      6);

    /* MultiPortSwitch: '<S308>/Multiport Switch' incorporates:
     *  Constant: '<S298>/Constant16'
     */
    switch ((sint32)6.0) {
     case 0:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S308>/Data Type Conversion1'
       *  S-Function (sfix_bitop): '<S308>/Bitwise Operator'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)1U)) != 0);
      break;

     case 1:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S308>/Data Type Conversion2'
       *  S-Function (sfix_bitop): '<S308>/Bitwise Operator2'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)2U)) != 0);
      break;

     case 2:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S308>/Data Type Conversion3'
       *  S-Function (sfix_bitop): '<S308>/Bitwise Operator4'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)4U)) != 0);
      break;

     case 3:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S308>/Data Type Conversion4'
       *  S-Function (sfix_bitop): '<S308>/Bitwise Operator6'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)8U)) != 0);
      break;

     case 4:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S308>/Data Type Conversion5'
       *  S-Function (sfix_bitop): '<S308>/Bitwise Operator8'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)16U)) != 0);
      break;

     case 5:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S308>/Data Type Conversion6'
       *  S-Function (sfix_bitop): '<S308>/Bitwise Operator10'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)32U)) != 0);
      break;

     case 6:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S308>/Data Type Conversion7'
       *  S-Function (sfix_bitop): '<S308>/Bitwise Operator12'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)64U)) != 0);
      break;

     case 7:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S308>/Data Type Conversion8'
       *  S-Function (sfix_bitop): '<S308>/Bitwise Operator14'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)128U)) != 0);
      break;

     default:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S308>/Data Type Conversion9'
       */
      rtb_Selector16 = (uint8)(HvCoorn_stTboxByte7Req != 0);
      break;
    }

    /* End of MultiPortSwitch: '<S308>/Multiport Switch' */

    /* Selector: '<S33>/Selector15' incorporates:
     *  DataTypeConversion: '<S308>/Data Type Conversion10'
     *  Gain: '<S298>/Gain10'
     */
    rtb_TmpSignalConversionAtHvCoor = (uint8)(((uint32)(rtb_Selector16 != 0) *
      ((uint8)128U)) >> 5);

    /* MultiPortSwitch: '<S309>/Multiport Switch' incorporates:
     *  Constant: '<S298>/Constant1'
     */
    switch ((sint32)7.0) {
     case 0:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S309>/Data Type Conversion1'
       *  S-Function (sfix_bitop): '<S309>/Bitwise Operator'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)1U)) != 0);
      break;

     case 1:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S309>/Data Type Conversion2'
       *  S-Function (sfix_bitop): '<S309>/Bitwise Operator2'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)2U)) != 0);
      break;

     case 2:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S309>/Data Type Conversion3'
       *  S-Function (sfix_bitop): '<S309>/Bitwise Operator4'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)4U)) != 0);
      break;

     case 3:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S309>/Data Type Conversion4'
       *  S-Function (sfix_bitop): '<S309>/Bitwise Operator6'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)8U)) != 0);
      break;

     case 4:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S309>/Data Type Conversion5'
       *  S-Function (sfix_bitop): '<S309>/Bitwise Operator8'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)16U)) != 0);
      break;

     case 5:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S309>/Data Type Conversion6'
       *  S-Function (sfix_bitop): '<S309>/Bitwise Operator10'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)32U)) != 0);
      break;

     case 6:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S309>/Data Type Conversion7'
       *  S-Function (sfix_bitop): '<S309>/Bitwise Operator12'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)64U)) != 0);
      break;

     case 7:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S309>/Data Type Conversion8'
       *  S-Function (sfix_bitop): '<S309>/Bitwise Operator14'
       */
      rtb_Selector16 = (uint8)((HvCoorn_stTboxByte7Req & ((uint8)128U)) != 0);
      break;

     default:
      /* Selector: '<S33>/Selector10' incorporates:
       *  DataTypeConversion: '<S309>/Data Type Conversion9'
       */
      rtb_Selector16 = (uint8)(HvCoorn_stTboxByte7Req != 0);
      break;
    }

    /* End of MultiPortSwitch: '<S309>/Multiport Switch' */

    /* Sum: '<S298>/Add3' incorporates:
     *  DataTypeConversion: '<S309>/Data Type Conversion10'
     *  Gain: '<S298>/Gain11'
     */
    rtb_DataTypeConversion_jq = (sint32)((((((uint32)(rtb_Selector16 != 0) *
      ((uint8)128U)) >> 4) + rtb_Gain12) + rtb_Selector14) +
      rtb_TmpSignalConversionAtHvCoor);

    /* Saturate: '<S298>/Saturation1' incorporates:
     *  Sum: '<S298>/Add3'
     */
    if ((uint8)rtb_DataTypeConversion_jq <= ((uint8)15U)) {
      /* Saturate: '<S298>/Saturation1' */
      TBOX_Instruction_Type_req = (uint8)rtb_DataTypeConversion_jq;
    } else {
      /* Saturate: '<S298>/Saturation1' */
      TBOX_Instruction_Type_req = ((uint8)15U);
    }

    /* End of Saturate: '<S298>/Saturation1' */

    /* Selector: '<S33>/Selector13' incorporates:
     *  Constant: '<S33>/3'
     *  Selector: '<S33>/Selector5'
     */
    rtb_Saturation2_ke = (sint32)5.0F - 1;

    /* SignalConversion: '<S33>/Signal Copy7' incorporates:
     *  Selector: '<S33>/Selector13'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthChlgOnReq'
     */
    HvCoorn_stTboxByte3Req = rtb_TmpSignalConversionAtictc_h[rtb_Saturation2_ke];

    /* Logic: '<S291>/Logical Operator' incorporates:
     *  Constant: '<S33>/uint28'
     *  RelationalOperator: '<S33>/Equal13'
     */
    rtb_Equal3_a = (HvCoorn_stTboxByte3Req == ((uint8)1U));

    /* Logic: '<S33>/AND3' incorporates:
     *  Constant: '<S33>/uint26'
     *  RelationalOperator: '<S33>/Equal8'
     */
    HvCoorn_bAuthHvStrtLim = (rtb_Equal3_a && (TBOX_Instruction_Type_req ==
      ((uint8)1U)) && rtb_AND2_e);

    /* Logic: '<S33>/AND4' incorporates:
     *  Constant: '<S33>/uint27'
     *  RelationalOperator: '<S33>/Equal12'
     */
    HvCoorn_bClearZero = (rtb_Equal3_a && (TBOX_Instruction_Type_req == ((uint8)
      4U)) && rtb_AND2_e);

    /* SignalConversion: '<S33>/Signal Copy16' incorporates:
     *  Selector: '<S33>/Selector1'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthSts'
     */
    HvCoorn_stTboxByte7Fb =
      rtb_TmpSignalConversionAtictc_j[HvCoorn_stTboxByte7Req_tmp];

    /* RelationalOperator: '<S319>/Relational Operator' incorporates:
     *  Constant: '<S319>/single4'
     *  UnitDelay: '<S319>/Unit Delay'
     */
    rtb_RelationalOperator_gn = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_ir > 0);

    /* Switch: '<S299>/Switch11' incorporates:
     *  Logic: '<S319>/Logical Operator2'
     *  Switch: '<S299>/Switch1'
     */
    if (rtb_RelationalOperator_gn || HvCoorn_bAntiTrig42C) {
      /* MultiPortSwitch: '<S314>/Multiport Switch' incorporates:
       *  Constant: '<S299>/Constant6'
       */
      switch ((sint32)3.0) {
       case 0:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S314>/Data Type Conversion1'
         *  S-Function (sfix_bitop): '<S314>/Bitwise Operator'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)1U)) != 0);
        break;

       case 1:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S314>/Data Type Conversion2'
         *  S-Function (sfix_bitop): '<S314>/Bitwise Operator2'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)2U)) != 0);
        break;

       case 2:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S314>/Data Type Conversion3'
         *  S-Function (sfix_bitop): '<S314>/Bitwise Operator4'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)4U)) != 0);
        break;

       case 3:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S314>/Data Type Conversion4'
         *  S-Function (sfix_bitop): '<S314>/Bitwise Operator6'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)8U)) != 0);
        break;

       case 4:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S314>/Data Type Conversion5'
         *  S-Function (sfix_bitop): '<S314>/Bitwise Operator8'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)16U)) != 0);
        break;

       case 5:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S314>/Data Type Conversion6'
         *  S-Function (sfix_bitop): '<S314>/Bitwise Operator10'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)32U)) != 0);
        break;

       case 6:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S314>/Data Type Conversion7'
         *  S-Function (sfix_bitop): '<S314>/Bitwise Operator12'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)64U)) != 0);
        break;

       case 7:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S314>/Data Type Conversion8'
         *  S-Function (sfix_bitop): '<S314>/Bitwise Operator14'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)128U)) != 0);
        break;

       default:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S314>/Data Type Conversion9'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)(HvCoorn_stTboxByte7Fb != 0);
        break;
      }

      /* End of MultiPortSwitch: '<S314>/Multiport Switch' */

      /* Gain: '<S299>/Gain7' incorporates:
       *  DataTypeConversion: '<S314>/Data Type Conversion10'
       */
      rtb_Selector14 = (uint8)(((uint32)(rtb_TmpSignalConversionAtHvCoor != 0) *
        ((uint8)128U)) >> 4);

      /* MultiPortSwitch: '<S313>/Multiport Switch' incorporates:
       *  Constant: '<S299>/Constant5'
       */
      switch ((sint32)2.0) {
       case 0:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S313>/Data Type Conversion1'
         *  S-Function (sfix_bitop): '<S313>/Bitwise Operator'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)1U)) != 0);
        break;

       case 1:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S313>/Data Type Conversion2'
         *  S-Function (sfix_bitop): '<S313>/Bitwise Operator2'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)2U)) != 0);
        break;

       case 2:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S313>/Data Type Conversion3'
         *  S-Function (sfix_bitop): '<S313>/Bitwise Operator4'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)4U)) != 0);
        break;

       case 3:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S313>/Data Type Conversion4'
         *  S-Function (sfix_bitop): '<S313>/Bitwise Operator6'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)8U)) != 0);
        break;

       case 4:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S313>/Data Type Conversion5'
         *  S-Function (sfix_bitop): '<S313>/Bitwise Operator8'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)16U)) != 0);
        break;

       case 5:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S313>/Data Type Conversion6'
         *  S-Function (sfix_bitop): '<S313>/Bitwise Operator10'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)32U)) != 0);
        break;

       case 6:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S313>/Data Type Conversion7'
         *  S-Function (sfix_bitop): '<S313>/Bitwise Operator12'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)64U)) != 0);
        break;

       case 7:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S313>/Data Type Conversion8'
         *  S-Function (sfix_bitop): '<S313>/Bitwise Operator14'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)128U)) != 0);
        break;

       default:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S313>/Data Type Conversion9'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)(HvCoorn_stTboxByte7Fb != 0);
        break;
      }

      /* End of MultiPortSwitch: '<S313>/Multiport Switch' */

      /* Gain: '<S299>/Gain6' incorporates:
       *  DataTypeConversion: '<S313>/Data Type Conversion10'
       */
      rtb_Selector16 = (uint8)(((uint32)(rtb_TmpSignalConversionAtHvCoor != 0) *
        ((uint8)128U)) >> 5);

      /* MultiPortSwitch: '<S312>/Multiport Switch' incorporates:
       *  Constant: '<S299>/Constant4'
       */
      switch ((sint32)1.0) {
       case 0:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S312>/Data Type Conversion1'
         *  S-Function (sfix_bitop): '<S312>/Bitwise Operator'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)1U)) != 0);
        break;

       case 1:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S312>/Data Type Conversion2'
         *  S-Function (sfix_bitop): '<S312>/Bitwise Operator2'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)2U)) != 0);
        break;

       case 2:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S312>/Data Type Conversion3'
         *  S-Function (sfix_bitop): '<S312>/Bitwise Operator4'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)4U)) != 0);
        break;

       case 3:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S312>/Data Type Conversion4'
         *  S-Function (sfix_bitop): '<S312>/Bitwise Operator6'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)8U)) != 0);
        break;

       case 4:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S312>/Data Type Conversion5'
         *  S-Function (sfix_bitop): '<S312>/Bitwise Operator8'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)16U)) != 0);
        break;

       case 5:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S312>/Data Type Conversion6'
         *  S-Function (sfix_bitop): '<S312>/Bitwise Operator10'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)32U)) != 0);
        break;

       case 6:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S312>/Data Type Conversion7'
         *  S-Function (sfix_bitop): '<S312>/Bitwise Operator12'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)64U)) != 0);
        break;

       case 7:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S312>/Data Type Conversion8'
         *  S-Function (sfix_bitop): '<S312>/Bitwise Operator14'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)128U)) != 0);
        break;

       default:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S312>/Data Type Conversion9'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)(HvCoorn_stTboxByte7Fb != 0);
        break;
      }

      /* End of MultiPortSwitch: '<S312>/Multiport Switch' */

      /* DataTypeConversion: '<S311>/Data Type Conversion10' incorporates:
       *  DataTypeConversion: '<S312>/Data Type Conversion10'
       */
      rtb_AND14_l = (rtb_TmpSignalConversionAtHvCoor != 0);

      /* MultiPortSwitch: '<S311>/Multiport Switch' incorporates:
       *  Constant: '<S299>/Constant3'
       */
      switch ((sint32)0.0) {
       case 0:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S311>/Data Type Conversion1'
         *  S-Function (sfix_bitop): '<S311>/Bitwise Operator'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)1U)) != 0);
        break;

       case 1:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S311>/Data Type Conversion2'
         *  S-Function (sfix_bitop): '<S311>/Bitwise Operator2'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)2U)) != 0);
        break;

       case 2:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S311>/Data Type Conversion3'
         *  S-Function (sfix_bitop): '<S311>/Bitwise Operator4'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)4U)) != 0);
        break;

       case 3:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S311>/Data Type Conversion4'
         *  S-Function (sfix_bitop): '<S311>/Bitwise Operator6'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)8U)) != 0);
        break;

       case 4:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S311>/Data Type Conversion5'
         *  S-Function (sfix_bitop): '<S311>/Bitwise Operator8'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)16U)) != 0);
        break;

       case 5:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S311>/Data Type Conversion6'
         *  S-Function (sfix_bitop): '<S311>/Bitwise Operator10'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)32U)) != 0);
        break;

       case 6:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S311>/Data Type Conversion7'
         *  S-Function (sfix_bitop): '<S311>/Bitwise Operator12'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)64U)) != 0);
        break;

       case 7:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S311>/Data Type Conversion8'
         *  S-Function (sfix_bitop): '<S311>/Bitwise Operator14'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)128U)) != 0);
        break;

       default:
        /* Sum: '<S299>/Add2' incorporates:
         *  DataTypeConversion: '<S311>/Data Type Conversion9'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)(HvCoorn_stTboxByte7Fb != 0);
        break;
      }

      /* End of MultiPortSwitch: '<S311>/Multiport Switch' */

      /* Sum: '<S299>/Add2' incorporates:
       *  DataTypeConversion: '<S299>/Data Type Conversion2'
       *  DataTypeConversion: '<S311>/Data Type Conversion10'
       *  Gain: '<S299>/Gain4'
       *  Gain: '<S299>/Gain5'
       */
      rtb_DataTypeConversion_jq = (sint32)((((((uint32)
        (rtb_TmpSignalConversionAtHvCoor != 0) * ((uint8)128U)) >> 7) +
        (((uint32)((uint8)128U) * rtb_AND14_l) >> 6)) + rtb_Selector16) +
        rtb_Selector14);

      /* Saturate: '<S299>/Saturation' incorporates:
       *  Sum: '<S299>/Add2'
       */
      if ((uint8)rtb_DataTypeConversion_jq <= ((uint8)15U)) {
        /* Switch: '<S299>/Switch11' */
        TBOX_Instruction_Type_FB = (uint8)rtb_DataTypeConversion_jq;
      } else {
        /* Switch: '<S299>/Switch11' */
        TBOX_Instruction_Type_FB = ((uint8)15U);
      }

      /* End of Saturate: '<S299>/Saturation' */

      /* MultiPortSwitch: '<S318>/Multiport Switch' incorporates:
       *  Constant: '<S299>/Constant10'
       */
      switch ((sint32)7.0) {
       case 0:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S318>/Data Type Conversion1'
         *  S-Function (sfix_bitop): '<S318>/Bitwise Operator'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)1U)) != 0);
        break;

       case 1:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S318>/Data Type Conversion2'
         *  S-Function (sfix_bitop): '<S318>/Bitwise Operator2'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)2U)) != 0);
        break;

       case 2:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S318>/Data Type Conversion3'
         *  S-Function (sfix_bitop): '<S318>/Bitwise Operator4'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)4U)) != 0);
        break;

       case 3:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S318>/Data Type Conversion4'
         *  S-Function (sfix_bitop): '<S318>/Bitwise Operator6'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)8U)) != 0);
        break;

       case 4:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S318>/Data Type Conversion5'
         *  S-Function (sfix_bitop): '<S318>/Bitwise Operator8'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)16U)) != 0);
        break;

       case 5:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S318>/Data Type Conversion6'
         *  S-Function (sfix_bitop): '<S318>/Bitwise Operator10'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)32U)) != 0);
        break;

       case 6:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S318>/Data Type Conversion7'
         *  S-Function (sfix_bitop): '<S318>/Bitwise Operator12'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)64U)) != 0);
        break;

       case 7:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S318>/Data Type Conversion8'
         *  S-Function (sfix_bitop): '<S318>/Bitwise Operator14'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)128U)) != 0);
        break;

       default:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S318>/Data Type Conversion9'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)(HvCoorn_stTboxByte7Fb != 0);
        break;
      }

      /* End of MultiPortSwitch: '<S318>/Multiport Switch' */

      /* Gain: '<S299>/Gain3' incorporates:
       *  DataTypeConversion: '<S318>/Data Type Conversion10'
       */
      rtb_Selector14 = (uint8)(((uint32)(rtb_TmpSignalConversionAtHvCoor != 0) *
        ((uint8)128U)) >> 4);

      /* MultiPortSwitch: '<S317>/Multiport Switch' incorporates:
       *  Constant: '<S299>/Constant9'
       */
      switch ((sint32)6.0) {
       case 0:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S317>/Data Type Conversion1'
         *  S-Function (sfix_bitop): '<S317>/Bitwise Operator'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)1U)) != 0);
        break;

       case 1:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S317>/Data Type Conversion2'
         *  S-Function (sfix_bitop): '<S317>/Bitwise Operator2'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)2U)) != 0);
        break;

       case 2:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S317>/Data Type Conversion3'
         *  S-Function (sfix_bitop): '<S317>/Bitwise Operator4'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)4U)) != 0);
        break;

       case 3:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S317>/Data Type Conversion4'
         *  S-Function (sfix_bitop): '<S317>/Bitwise Operator6'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)8U)) != 0);
        break;

       case 4:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S317>/Data Type Conversion5'
         *  S-Function (sfix_bitop): '<S317>/Bitwise Operator8'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)16U)) != 0);
        break;

       case 5:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S317>/Data Type Conversion6'
         *  S-Function (sfix_bitop): '<S317>/Bitwise Operator10'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)32U)) != 0);
        break;

       case 6:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S317>/Data Type Conversion7'
         *  S-Function (sfix_bitop): '<S317>/Bitwise Operator12'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)64U)) != 0);
        break;

       case 7:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S317>/Data Type Conversion8'
         *  S-Function (sfix_bitop): '<S317>/Bitwise Operator14'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)128U)) != 0);
        break;

       default:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S317>/Data Type Conversion9'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)(HvCoorn_stTboxByte7Fb != 0);
        break;
      }

      /* End of MultiPortSwitch: '<S317>/Multiport Switch' */

      /* Gain: '<S299>/Gain2' incorporates:
       *  DataTypeConversion: '<S317>/Data Type Conversion10'
       */
      rtb_Selector16 = (uint8)(((uint32)(rtb_TmpSignalConversionAtHvCoor != 0) *
        ((uint8)128U)) >> 5);

      /* MultiPortSwitch: '<S316>/Multiport Switch' incorporates:
       *  Constant: '<S299>/Constant8'
       */
      switch ((sint32)5.0) {
       case 0:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S316>/Data Type Conversion1'
         *  S-Function (sfix_bitop): '<S316>/Bitwise Operator'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)1U)) != 0);
        break;

       case 1:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S316>/Data Type Conversion2'
         *  S-Function (sfix_bitop): '<S316>/Bitwise Operator2'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)2U)) != 0);
        break;

       case 2:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S316>/Data Type Conversion3'
         *  S-Function (sfix_bitop): '<S316>/Bitwise Operator4'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)4U)) != 0);
        break;

       case 3:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S316>/Data Type Conversion4'
         *  S-Function (sfix_bitop): '<S316>/Bitwise Operator6'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)8U)) != 0);
        break;

       case 4:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S316>/Data Type Conversion5'
         *  S-Function (sfix_bitop): '<S316>/Bitwise Operator8'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)16U)) != 0);
        break;

       case 5:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S316>/Data Type Conversion6'
         *  S-Function (sfix_bitop): '<S316>/Bitwise Operator10'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)32U)) != 0);
        break;

       case 6:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S316>/Data Type Conversion7'
         *  S-Function (sfix_bitop): '<S316>/Bitwise Operator12'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)64U)) != 0);
        break;

       case 7:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S316>/Data Type Conversion8'
         *  S-Function (sfix_bitop): '<S316>/Bitwise Operator14'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)128U)) != 0);
        break;

       default:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S316>/Data Type Conversion9'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)(HvCoorn_stTboxByte7Fb != 0);
        break;
      }

      /* End of MultiPortSwitch: '<S316>/Multiport Switch' */

      /* DataTypeConversion: '<S315>/Data Type Conversion10' incorporates:
       *  DataTypeConversion: '<S316>/Data Type Conversion10'
       */
      rtb_AND14_l = (rtb_TmpSignalConversionAtHvCoor != 0);

      /* MultiPortSwitch: '<S315>/Multiport Switch' incorporates:
       *  Constant: '<S299>/Constant7'
       */
      switch ((sint32)4.0) {
       case 0:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S315>/Data Type Conversion1'
         *  S-Function (sfix_bitop): '<S315>/Bitwise Operator'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)1U)) != 0);
        break;

       case 1:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S315>/Data Type Conversion2'
         *  S-Function (sfix_bitop): '<S315>/Bitwise Operator2'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)2U)) != 0);
        break;

       case 2:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S315>/Data Type Conversion3'
         *  S-Function (sfix_bitop): '<S315>/Bitwise Operator4'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)4U)) != 0);
        break;

       case 3:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S315>/Data Type Conversion4'
         *  S-Function (sfix_bitop): '<S315>/Bitwise Operator6'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)8U)) != 0);
        break;

       case 4:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S315>/Data Type Conversion5'
         *  S-Function (sfix_bitop): '<S315>/Bitwise Operator8'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)16U)) != 0);
        break;

       case 5:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S315>/Data Type Conversion6'
         *  S-Function (sfix_bitop): '<S315>/Bitwise Operator10'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)32U)) != 0);
        break;

       case 6:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S315>/Data Type Conversion7'
         *  S-Function (sfix_bitop): '<S315>/Bitwise Operator12'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)64U)) != 0);
        break;

       case 7:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S315>/Data Type Conversion8'
         *  S-Function (sfix_bitop): '<S315>/Bitwise Operator14'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)((HvCoorn_stTboxByte7Fb &
          ((uint8)128U)) != 0);
        break;

       default:
        /* Sum: '<S299>/Add1' incorporates:
         *  DataTypeConversion: '<S315>/Data Type Conversion9'
         */
        rtb_TmpSignalConversionAtHvCoor = (uint8)(HvCoorn_stTboxByte7Fb != 0);
        break;
      }

      /* End of MultiPortSwitch: '<S315>/Multiport Switch' */

      /* Sum: '<S299>/Add1' incorporates:
       *  DataTypeConversion: '<S299>/Data Type Conversion6'
       *  DataTypeConversion: '<S315>/Data Type Conversion10'
       *  Gain: '<S299>/Gain'
       *  Gain: '<S299>/Gain1'
       */
      rtb_DataTypeConversion_jq = (sint32)((((((uint32)
        (rtb_TmpSignalConversionAtHvCoor != 0) * ((uint8)128U)) >> 7) +
        (((uint32)((uint8)128U) * rtb_AND14_l) >> 6)) + rtb_Selector16) +
        rtb_Selector14);

      /* Saturate: '<S299>/Saturation1' incorporates:
       *  Sum: '<S299>/Add1'
       */
      if ((uint8)rtb_DataTypeConversion_jq <= ((uint8)15U)) {
        /* Switch: '<S299>/Switch1' */
        TBOX_receiver_module_FB = (uint8)rtb_DataTypeConversion_jq;
      } else {
        /* Switch: '<S299>/Switch1' */
        TBOX_receiver_module_FB = ((uint8)15U);
      }

      /* End of Saturate: '<S299>/Saturation1' */
    } else {
      /* Switch: '<S299>/Switch11' incorporates:
       *  Constant: '<S299>/uint5'
       */
      TBOX_Instruction_Type_FB = ((uint8)0U);

      /* Switch: '<S299>/Switch1' incorporates:
       *  Constant: '<S299>/uint1'
       */
      TBOX_receiver_module_FB = ((uint8)0U);
    }

    /* End of Switch: '<S299>/Switch11' */

    /* Logic: '<S33>/AND5' incorporates:
     *  Constant: '<S33>/uint11'
     *  Constant: '<S33>/uint12'
     *  RelationalOperator: '<S33>/Equal6'
     *  RelationalOperator: '<S33>/Equal7'
     */
    HvCoorn_flg_Authtrigger = ((TBOX_Instruction_Type_FB == ((uint8)1U)) &&
      (TBOX_receiver_module_FB == ((uint8)2U)));

    /* Logic: '<S33>/AND9' incorporates:
     *  Constant: '<S33>/uint7'
     *  Logic: '<S33>/AND10'
     *  RelationalOperator: '<S33>/Equal2'
     */
    rtb_AND14_l = (HvCoorn_bClearZero || (VCCM_flg_SK_Recep_ok && rtb_AND2_e &&
      (TBOX_Instruction_Type_req == ((uint8)3U))));

    /* Logic: '<S33>/Logical Operator6' incorporates:
     *  Constant: '<S33>/sup_bKeyStrtMan_C'
     *
     * Block description for '<S33>/sup_bKeyStrtMan_C':
     *  [0]
     */
    rtb_AND2_e = (VCCM_flg_Antitheft_Start || HvCoorn_bAuthStrt_C);

    /* Logic: '<S295>/Logical_Operator4' incorporates:
     *  Logic: '<S292>/Logical Operator'
     *  Logic: '<S292>/Logical Operator1'
     *  Logic: '<S295>/Logical Operator1'
     *  Logic: '<S295>/Logical_Operator5'
     *  UnitDelay: '<S292>/Unit Delay2'
     *  UnitDelay: '<S295>/Unit Delay'
     *  UnitDelay: '<S33>/Unit Delay2'
     */
    HvCoorn_bAntiTrig430 = ((!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bq) &&
      ((rtb_AND2_e && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_ed)) ||
       HvCoorn_bAntiTrig430));

    /* Switch: '<S33>/Switch7' */
    if (HvCoorn_bAntiTrig430) {
      /* Switch: '<S33>/Switch7' */
      VCU_Instruction_Type_FB = TBOX_Instruction_Type_req;
    } else {
      /* Switch: '<S33>/Switch7' incorporates:
       *  Constant: '<S33>/uint40'
       */
      VCU_Instruction_Type_FB = ((uint8)0U);
    }

    /* End of Switch: '<S33>/Switch7' */

    /* Switch: '<S33>/Switch5' incorporates:
     *  Logic: '<S291>/Logical Operator'
     *  Logic: '<S291>/Logical Operator1'
     *  Switch: '<S33>/Switch6'
     *  UnitDelay: '<S291>/Unit Delay2'
     */
    if (HvCoorn_flg_Authtrigger && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_f3)) {
      /* Switch: '<S33>/Switch5' */
      authsuccess = rtb_AND15_f;

      /* Switch: '<S33>/Switch6' incorporates:
       *  Logic: '<S33>/Not1'
       */
      authfailed = !rtb_AND15_f;
    } else {
      /* Switch: '<S33>/Switch5' incorporates:
       *  Constant: '<S33>/uint39'
       */
      authsuccess = false;

      /* Switch: '<S33>/Switch6' incorporates:
       *  Constant: '<S33>/uint38'
       */
      authfailed = false;
    }

    /* End of Switch: '<S33>/Switch5' */

    /* Logic: '<S293>/Logical Operator' incorporates:
     *  Logic: '<S293>/Logical Operator1'
     *  UnitDelay: '<S293>/Unit Delay2'
     */
    rtb_Equal3_a = (VCCM_flg_Antitheft_Overtime &&
                    (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_br));

    /* RelationalOperator: '<S33>/Equal15' incorporates:
     *  Constant: '<S33>/uint41'
     */
    rtb_AND15_f = (TBOX_Instruction_Type_req == ((uint8)5U));

    /* Delay: '<S33>/Delay3' incorporates:
     *  Constant: '<S33>/uint5'
     */
    if (((uint8)10U) <= 0) {
      /* Delay: '<S33>/Delay3' incorporates:
       *  Constant: '<S33>/TRUE'
       *
       * Block description for '<S33>/TRUE':
       *  TRUE
       */
      rtb_LogicalOperator6_hy = true;
    } else {
      if (((uint8)10U) > 100) {
        rtb_ShiftArithmetic7 = 100U;
      } else {
        rtb_ShiftArithmetic7 = ((uint8)10U);
      }

      /* Delay: '<S33>/Delay3' */
      rtb_LogicalOperator6_hy = HvCoorn_ARID_DEF.Delay3_DSTATE[(uint8)(100U -
        rtb_ShiftArithmetic7)];
    }

    /* End of Delay: '<S33>/Delay3' */

    /* Chart: '<S33>/Auth_status' incorporates:
     *  Constant: '<S33>/uint1'
     *  Inport: '<Root>/VCU_E2_counterfaieldEER'
     *  Logic: '<S294>/Logical Operator'
     *  Logic: '<S294>/Logical Operator1'
     *  UnitDelay: '<S294>/Unit Delay2'
     */
    /* Gateway: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A30_Authcation/Auth_status */
    /* During: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A30_Authcation/Auth_status */
    if (HvCoorn_ARID_DEF.is_active_c1_HvCoorn == 0U) {
      (void)Rte_Read_VCU_E2_counterfaieldEER_Value
        (&HvCoorn_ARID_DEF.authfailed_n_conter);

      /* Entry: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A30_Authcation/Auth_status */
      HvCoorn_ARID_DEF.is_active_c1_HvCoorn = 1U;

      /* Entry Internal: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A30_Authcation/Auth_status */
      /* Transition: '<S288>:18' */
      HvCoorn_ARID_DEF.is_c1_HvCoorn = HvCoorn_IN_init;

      /* Entry 'init': '<S288>:17' */
      auth_enum = 0U;
    } else {
      switch (HvCoorn_ARID_DEF.is_c1_HvCoorn) {
       case HvCoorn_IN_Equal:
        auth_enum = 2U;

        /* During 'Equal': '<S288>:36' */
        if (HvCoorn_ARID_DEF.timer >= 10.0) {
          /* Transition: '<S288>:29' */
          HvCoorn_ARID_DEF.is_c1_HvCoorn = HvCoorn_IN_Wait;

          /* Entry 'Wait': '<S288>:34' */
          auth_enum = 1U;
        } else {
          HvCoorn_ARID_DEF.authfailed_n_conterEEW =
            HvCoorn_ARID_DEF.authfailed_n_conter;
          HvCoorn_ARID_DEF.timer++;
        }
        break;

       case HvCoorn_IN_ISO:
        auth_enum = 4U;

        /* During 'ISO': '<S288>:20' */
        if (HvCoorn_ARID_DEF.timer >= 10.0) {
          /* Transition: '<S288>:28' */
          /* Exit Internal 'ISO': '<S288>:20' */
          HvCoorn_ARID_DEF.is_c1_HvCoorn = HvCoorn_IN_Wait;

          /* Entry 'Wait': '<S288>:34' */
          auth_enum = 1U;
        } else if (authsuccess || rtb_AND14_l) {
          /* Transition: '<S288>:24' */
          /* Exit Internal 'ISO': '<S288>:20' */
          HvCoorn_ARID_DEF.is_c1_HvCoorn = HvCoorn_IN_Reset;

          /* Entry 'Reset': '<S288>:1' */
          auth_enum = 3U;
          HvCoorn_ARID_DEF.timer = 0.0;
          HvCoorn_ARID_DEF.authfailed_n_conter = 0U;
        } else {
          HvCoorn_ARID_DEF.authfailed_n_conterEEW =
            HvCoorn_ARID_DEF.authfailed_n_conter;
          HvCoorn_ARID_DEF.timer++;

          /* During 'Counter': '<S288>:6' */
        }
        break;

       case HvCoorn_IN_Reset:
        auth_enum = 3U;

        /* During 'Reset': '<S288>:1' */
        if (authfailed || rtb_Equal3_a) {
          /* Transition: '<S288>:25' */
          HvCoorn_ARID_DEF.is_c1_HvCoorn = HvCoorn_IN_ISO;

          /* Entry 'ISO': '<S288>:20' */
          HvCoorn_ARID_DEF.timer = 0.0;
          auth_enum = 4U;

          /* Entry Internal 'ISO': '<S288>:20' */
          /* Transition: '<S288>:21' */
          /* Entry 'Counter': '<S288>:6' */
          HvCoorn_ARID_DEF.authfailed_n_conter++;
        } else if (HvCoorn_ARID_DEF.timer >= 10.0) {
          /* Transition: '<S288>:38' */
          HvCoorn_ARID_DEF.is_c1_HvCoorn = HvCoorn_IN_Wait;

          /* Entry 'Wait': '<S288>:34' */
          auth_enum = 1U;
        } else {
          HvCoorn_ARID_DEF.authfailed_n_conterEEW =
            HvCoorn_ARID_DEF.authfailed_n_conter;
          HvCoorn_ARID_DEF.timer++;
        }
        break;

       case HvCoorn_IN_Wait:
        auth_enum = 1U;

        /* During 'Wait': '<S288>:34' */
        if (authsuccess || rtb_AND14_l) {
          /* Transition: '<S288>:15' */
          HvCoorn_ARID_DEF.is_c1_HvCoorn = HvCoorn_IN_Reset;

          /* Entry 'Reset': '<S288>:1' */
          auth_enum = 3U;
          HvCoorn_ARID_DEF.timer = 0.0;
          HvCoorn_ARID_DEF.authfailed_n_conter = 0U;
        } else if (authfailed || rtb_Equal3_a) {
          /* Transition: '<S288>:19' */
          HvCoorn_ARID_DEF.is_c1_HvCoorn = HvCoorn_IN_ISO;

          /* Entry 'ISO': '<S288>:20' */
          HvCoorn_ARID_DEF.timer = 0.0;
          auth_enum = 4U;

          /* Entry Internal 'ISO': '<S288>:20' */
          /* Transition: '<S288>:21' */
          /* Entry 'Counter': '<S288>:6' */
          HvCoorn_ARID_DEF.authfailed_n_conter++;
        } else if (rtb_AND15_f && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_f4)) {
          /* Transition: '<S288>:37' */
          HvCoorn_ARID_DEF.is_c1_HvCoorn = HvCoorn_IN_Equal;

          /* Entry 'Equal': '<S288>:36' */
          auth_enum = 2U;
          HvCoorn_ARID_DEF.timer = 0.0;
          HvCoorn_ARID_DEF.authfailed_n_conter = ((uint8)0U);
        }
        break;

       default:
        auth_enum = 0U;

        /* During 'init': '<S288>:17' */
        if (rtb_LogicalOperator6_hy) {
          /* Transition: '<S288>:35' */
          HvCoorn_ARID_DEF.is_c1_HvCoorn = HvCoorn_IN_Wait;

          /* Entry 'Wait': '<S288>:34' */
          auth_enum = 1U;
        }
        break;
      }
    }

    /* End of Chart: '<S33>/Auth_status' */

    /* Saturate: '<S33>/Saturation' */
    if (HvCoorn_ARID_DEF.authfailed_n_conter <= ((uint8)15U)) {
      /* Saturate: '<S33>/Saturation' */
      HvCoorn_authfailed_conter = HvCoorn_ARID_DEF.authfailed_n_conter;
    } else {
      /* Saturate: '<S33>/Saturation' */
      HvCoorn_authfailed_conter = ((uint8)15U);
    }

    /* End of Saturate: '<S33>/Saturation' */

    /* MultiPortSwitch: '<S33>/Multiport Switch' */
    switch (VCU_Instruction_Type_FB) {
     case 0:
      /* SignalConversion: '<S33>/Signal Copy' incorporates:
       *  Constant: '<S33>/uint37'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte7Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy1' incorporates:
       *  Constant: '<S33>/uint37'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte3Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy2' incorporates:
       *  Constant: '<S33>/uint37'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte2Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy3' incorporates:
       *  Constant: '<S33>/uint37'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte1Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy4' incorporates:
       *  Constant: '<S33>/uint37'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte0Fb = ((uint8)0U);
      break;

     case 1:
      /* SignalConversion: '<S33>/Signal Copy' incorporates:
       *  Constant: '<S33>/uint36'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte7Fb = ((uint8)20U);

      /* SignalConversion: '<S33>/Signal Copy1' incorporates:
       *  Constant: '<S33>/uint4'
       *  DataTypeConversion: '<S33>/Data Type Conversion1'
       *  Logic: '<S33>/AND7'
       *  Logic: '<S33>/Not4'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       *  RelationalOperator: '<S33>/Equal1'
       *  UnitDelay: '<S3>/Unit Delay2'
       *
       * Block description for '<S33>/uint4':
       *  SystemReadyWait
       */
      HvCoorn_stVcuByte3Fb = (uint8)((HvCoorn_stHVP != ((uint8)89U)) ||
        (!HvCoorn_bAuthHvStrtLim));

      /* SignalConversion: '<S33>/Signal Copy2' incorporates:
       *  Constant: '<S33>/uint34'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte2Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy3' incorporates:
       *  Constant: '<S33>/uint34'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte1Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy4' incorporates:
       *  Constant: '<S33>/uint34'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte0Fb = ((uint8)0U);
      break;

     case 2:
      /* SignalConversion: '<S33>/Signal Copy' incorporates:
       *  Constant: '<S33>/uint47'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte7Fb = ((uint8)36U);

      /* SignalConversion: '<S33>/Signal Copy1' incorporates:
       *  Constant: '<S33>/uint35'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte3Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy2' incorporates:
       *  Constant: '<S33>/uint35'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte2Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy3' incorporates:
       *  Constant: '<S33>/uint35'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte1Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy4' incorporates:
       *  Constant: '<S33>/uint35'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte0Fb = ((uint8)0U);
      break;

     case 3:
      /* SignalConversion: '<S33>/Signal Copy' incorporates:
       *  Constant: '<S33>/uint48'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte7Fb = ((uint8)52U);

      /* SignalConversion: '<S33>/Signal Copy1' incorporates:
       *  DataTypeConversion: '<S33>/Data Type Conversion2'
       *  Logic: '<S33>/Not5'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte3Fb = (uint8)!VCCM_flg_SK_Recep_ok;

      /* SignalConversion: '<S33>/Signal Copy2' incorporates:
       *  Constant: '<S33>/uint31'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte2Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy3' incorporates:
       *  Constant: '<S33>/uint31'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte1Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy4' incorporates:
       *  Constant: '<S33>/uint31'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte0Fb = ((uint8)0U);
      break;

     case 4:
      /* SignalConversion: '<S33>/Signal Copy' incorporates:
       *  Constant: '<S33>/uint49'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte7Fb = ((uint8)68U);

      /* SignalConversion: '<S33>/Signal Copy1' incorporates:
       *  Constant: '<S33>/uint33'
       *  DataTypeConversion: '<S33>/Data Type Conversion'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       *  RelationalOperator: '<S33>/Equal14'
       */
      HvCoorn_stVcuByte3Fb = (uint8)(HvCoorn_authfailed_conter != ((uint8)0U));

      /* SignalConversion: '<S33>/Signal Copy2' incorporates:
       *  Constant: '<S33>/uint29'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte2Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy3' incorporates:
       *  Constant: '<S33>/uint29'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte1Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy4' incorporates:
       *  Constant: '<S33>/uint29'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte0Fb = ((uint8)0U);
      break;

     default:
      /* SignalConversion: '<S33>/Signal Copy' incorporates:
       *  Constant: '<S33>/uint50'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte7Fb = ((uint8)84U);

      /* SignalConversion: '<S33>/Signal Copy1' incorporates:
       *  Constant: '<S33>/uint32'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte3Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy2' incorporates:
       *  Constant: '<S33>/uint32'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte2Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy3' incorporates:
       *  Constant: '<S33>/uint32'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte1Fb = ((uint8)0U);

      /* SignalConversion: '<S33>/Signal Copy4' incorporates:
       *  Constant: '<S33>/uint32'
       *  MultiPortSwitch: '<S33>/Multiport Switch'
       */
      HvCoorn_stVcuByte0Fb = ((uint8)0U);
      break;
    }

    /* End of MultiPortSwitch: '<S33>/Multiport Switch' */

    /* Assignment: '<S33>/Assignment' incorporates:
     *  Assignment: '<S33>/Assignment5'
     *  Assignment: '<S33>/Assignment6'
     */
    HvCoorn_noVcuAuthFb[0] = HvCoorn_stVcuByte7Fb;

    /* Assignment: '<S33>/Assignment14' incorporates:
     *  Assignment: '<S33>/Assignment5'
     *  Assignment: '<S33>/Assignment6'
     *  Constant: '<S33>/uint2'
     */
    HvCoorn_noVcuAuthFb[1] = ((uint8)17U);

    /* Switch: '<S33>/Switch9' incorporates:
     *  Constant: '<S33>/sup_bKeyStrtMan_C6'
     *
     * Block description for '<S33>/sup_bKeyStrtMan_C6':
     *  [0]
     */
    if (HvCoorn_TBOX_byte5_reqSet_C) {
      /* Switch: '<S33>/Switch9' incorporates:
       *  Constant: '<S33>/sup_bKeyStrtMan_C5'
       *
       * Block description for '<S33>/sup_bKeyStrtMan_C5':
       *  [0]
       */
      HvCoorn_stTboxByte5Req = HvCoorn_TBOX_byte5_reqCal_C;
    } else {
      /* Switch: '<S33>/Switch9' incorporates:
       *  Constant: '<S33>/1'
       *  Selector: '<S33>/Selector11'
       *  SignalConversion generated from: '<S1>/ictcp_noAuthChlgOnReq'
       */
      HvCoorn_stTboxByte5Req = rtb_TmpSignalConversionAtictc_h[(sint32)3.0F - 1];
    }

    /* End of Switch: '<S33>/Switch9' */

    /* Assignment: '<S33>/Assignment2' incorporates:
     *  Assignment: '<S33>/Assignment5'
     *  Assignment: '<S33>/Assignment6'
     */
    HvCoorn_noVcuAuthFb[2] = HvCoorn_stTboxByte5Req;

    /* Switch: '<S33>/Switch10' incorporates:
     *  Constant: '<S33>/sup_bKeyStrtMan_C8'
     *
     * Block description for '<S33>/sup_bKeyStrtMan_C8':
     *  [0]
     */
    if (HvCoorn_TBOX_byte4_reqSet_C) {
      /* Switch: '<S33>/Switch10' incorporates:
       *  Constant: '<S33>/sup_bKeyStrtMan_C7'
       *
       * Block description for '<S33>/sup_bKeyStrtMan_C7':
       *  [0]
       */
      HvCoorn_stTboxByte4Req = HvCoorn_TBOX_byte4_reqCal_C;
    } else {
      /* Switch: '<S33>/Switch10' incorporates:
       *  Constant: '<S33>/2'
       *  Selector: '<S33>/Selector12'
       *  SignalConversion generated from: '<S1>/ictcp_noAuthChlgOnReq'
       */
      HvCoorn_stTboxByte4Req = rtb_TmpSignalConversionAtictc_h[(sint32)4.0F - 1];
    }

    /* End of Switch: '<S33>/Switch10' */

    /* Assignment: '<S33>/Assignment3' incorporates:
     *  Assignment: '<S33>/Assignment5'
     *  Assignment: '<S33>/Assignment6'
     */
    HvCoorn_noVcuAuthFb[3] = HvCoorn_stTboxByte4Req;

    /* Assignment: '<S33>/Assignment4' incorporates:
     *  Assignment: '<S33>/Assignment5'
     *  Assignment: '<S33>/Assignment6'
     */
    HvCoorn_noVcuAuthFb[4] = HvCoorn_stVcuByte3Fb;

    /* Assignment: '<S33>/Assignment1' incorporates:
     *  Assignment: '<S33>/Assignment5'
     *  Assignment: '<S33>/Assignment6'
     */
    HvCoorn_noVcuAuthFb[5] = HvCoorn_stVcuByte2Fb;

    /* Switch: '<S33>/Switch3' */
    if (HvCoorn_bAntiTrig42C) {
      /* Switch: '<S33>/Switch3' incorporates:
       *  Constant: '<S33>/uint43'
       */
      HvCoorn_stVcuByte7Req = ((uint8)36U);
    } else {
      /* Switch: '<S33>/Switch3' incorporates:
       *  Constant: '<S33>/uint15'
       */
      HvCoorn_stVcuByte7Req = ((uint8)0U);
    }

    /* End of Switch: '<S33>/Switch3' */
    for (i = 0; i < 8; i++) {
      /* Assignment: '<S33>/Assignment13' incorporates:
       *  Assignment: '<S33>/Assignment12'
       *  Assignment: '<S33>/Assignment7'
       *  Constant: '<S33>/uint46'
       *
       * Block description for '<S33>/uint46':
       *  [0 0 0 0 0 0 0 0]
       */
      HvCoorn_noVcuAuthReq[i] = HvCoorn_uVCU2tboxReq_C[i];
    }

    /* Assignment: '<S33>/Assignment7' incorporates:
     *  Assignment: '<S33>/Assignment12'
     *  Assignment: '<S33>/Assignment13'
     */
    HvCoorn_noVcuAuthReq[0] = HvCoorn_stVcuByte7Req;

    /* Assignment: '<S33>/Assignment9' incorporates:
     *  Assignment: '<S33>/Assignment12'
     *  Assignment: '<S33>/Assignment13'
     */
    HvCoorn_noVcuAuthReq[2] = HvCoorn_stVcuByte5Req;

    /* Assignment: '<S33>/Assignment10' incorporates:
     *  Assignment: '<S33>/Assignment12'
     *  Assignment: '<S33>/Assignment13'
     */
    HvCoorn_noVcuAuthReq[3] = HvCoorn_stVcuByte4Req;

    /* Assignment: '<S33>/Assignment11' incorporates:
     *  Assignment: '<S33>/Assignment12'
     *  Assignment: '<S33>/Assignment13'
     *  Constant: '<S33>/uint13'
     */
    HvCoorn_noVcuAuthReq[4] = ((uint8)17U);

    /* Assignment: '<S33>/Assignment8' incorporates:
     *  Assignment: '<S33>/Assignment12'
     *  Assignment: '<S33>/Assignment13'
     *  Constant: '<S33>/uint21'
     */
    HvCoorn_noVcuAuthReq[5] = ((uint8)34U);

    /* Assignment: '<S33>/Assignment12' incorporates:
     *  Assignment: '<S33>/Assignment13'
     *  Constant: '<S33>/uint22'
     */
    HvCoorn_noVcuAuthReq[6] = ((uint8)51U);

    /* Assignment: '<S33>/Assignment13' incorporates:
     *  Constant: '<S33>/uint23'
     */
    HvCoorn_noVcuAuthReq[7] = ((uint8)68U);

    /* Assignment: '<S33>/Assignment5' incorporates:
     *  Assignment: '<S33>/Assignment6'
     */
    HvCoorn_noVcuAuthFb[6] = HvCoorn_stVcuByte1Fb;

    /* Assignment: '<S33>/Assignment6' */
    HvCoorn_noVcuAuthFb[7] = HvCoorn_stVcuByte0Fb;

    /* RelationalOperator: '<S302>/Relational Operator' incorporates:
     *  Constant: '<S302>/single4'
     *  UnitDelay: '<S302>/Unit Delay'
     */
    rtb_AND14_l = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_pe > 0);

    /* Logic: '<S301>/Logical_Operator4' incorporates:
     *  Constant: '<S289>/uint10'
     *  Logic: '<S289>/AND1'
     *  Logic: '<S289>/Not1'
     *  Logic: '<S300>/Logical Operator'
     *  Logic: '<S300>/Logical Operator1'
     *  Logic: '<S301>/Logical Operator1'
     *  Logic: '<S301>/Logical_Operator5'
     *  Logic: '<S302>/Logical Operator2'
     *  RelationalOperator: '<S289>/Equal'
     *  UnitDelay: '<S300>/Unit Delay2'
     *  UnitDelay: '<S301>/Unit Delay'
     */
    rtb_Equal3_a = ((rtb_AND14_l || rtb_TmpSignalConversionAtidi_bK) &&
                    ((rtb_TmpSignalConversionAtidi_bK &&
                      (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_gu) &&
                      (HvCoorn_authfailed_conter == ((uint8)15U))) ||
                     HvCoorn_ARID_DEF.UnitDelay_DSTATE_lc));

    /* Switch: '<S289>/Switch1' incorporates:
     *  Constant: '<S289>/sup_tiChgConndown_C3'
     *  Constant: '<S289>/uint1'
     *  Constant: '<S289>/uint17'
     *  Constant: '<S289>/uint8'
     *  RelationalOperator: '<S289>/Equal1'
     *  RelationalOperator: '<S289>/Equal2'
     *  RelationalOperator: '<S289>/Equal9'
     *  Switch: '<S289>/Switch'
     *  Switch: '<S289>/Switch10'
     *  Switch: '<S289>/Switch9'
     *
     * Block description for '<S289>/sup_tiChgConndown_C3':
     *  [0]
     */
    if (HvCoorn_stAuthChkFailLvlOvrd_C) {
      /* Switch: '<S289>/Switch1' incorporates:
       *  Constant: '<S289>/sup_tiChgConndown_C4'
       *
       * Block description for '<S289>/sup_tiChgConndown_C4':
       *  [0]
       */
      HvCoorn_stAuthChkFailLvl = HvCoorn_stAuthChkFailLvlOvrdVal_C;
    } else if (HvCoorn_authfailed_conter >= ((uint8)11U)) {
      /* Switch: '<S289>/Switch' incorporates:
       *  Constant: '<S289>/uint9'
       *  Switch: '<S289>/Switch1'
       */
      HvCoorn_stAuthChkFailLvl = ((uint8)3U);
    } else if (HvCoorn_authfailed_conter >= ((uint8)6U)) {
      /* Switch: '<S289>/Switch10' incorporates:
       *  Constant: '<S289>/uint4'
       *  Switch: '<S289>/Switch'
       *  Switch: '<S289>/Switch1'
       */
      HvCoorn_stAuthChkFailLvl = ((uint8)2U);
    } else if (HvCoorn_authfailed_conter >= ((uint8)3U)) {
      /* Switch: '<S289>/Switch9' incorporates:
       *  Constant: '<S289>/uint2'
       *  Switch: '<S289>/Switch'
       *  Switch: '<S289>/Switch1'
       *  Switch: '<S289>/Switch10'
       */
      HvCoorn_stAuthChkFailLvl = ((uint8)1U);
    } else {
      /* Switch: '<S289>/Switch1' incorporates:
       *  Constant: '<S289>/uint7'
       *  Switch: '<S289>/Switch'
       *  Switch: '<S289>/Switch10'
       *  Switch: '<S289>/Switch9'
       */
      HvCoorn_stAuthChkFailLvl = ((uint8)0U);
    }

    /* End of Switch: '<S289>/Switch1' */

    /* Switch: '<S289>/Switch2' incorporates:
     *  Constant: '<S289>/sup_tiChgConndown_C1'
     *
     * Block description for '<S289>/sup_tiChgConndown_C1':
     *  [0]
     */
    if (HvCoorn_bAuthFailSpdLimOvrd_C) {
      /* Switch: '<S289>/Switch2' incorporates:
       *  Constant: '<S289>/sup_tiChgConndown_C2'
       *
       * Block description for '<S289>/sup_tiChgConndown_C2':
       *  [0]
       */
      HvCoorn_bAuthFailSpdLim = HvCoorn_bAuthFailSpdLimOvrdVal_C;
    } else {
      /* Switch: '<S289>/Switch2' */
      HvCoorn_bAuthFailSpdLim = rtb_Equal3_a;
    }

    /* End of Switch: '<S289>/Switch2' */

    /* Switch: '<S302>/Switch' incorporates:
     *  Switch: '<S302>/Switch1'
     */
    if (rtb_TmpSignalConversionAtidi_bK) {
      /* Product: '<S302>/Divide' incorporates:
       *  Constant: '<S289>/sup_tiChgConndown_C'
       *
       * Block description for '<S289>/sup_tiChgConndown_C':
       *  [0.03]
       */
      tmpRead_i = HvCoorn_tiSpeed20LimitDly_C / HvCoorn_ConstB.Max_fm;

      /* DataTypeConversion: '<S302>/DataTypeConversion' */
      tmpRead_h = fabsf(tmpRead_i);
      if (tmpRead_h < 8.388608E+6F) {
        if (tmpRead_h >= 0.5F) {
          /* Update for UnitDelay: '<S302>/Unit Delay' incorporates:
           *  Saturate: '<S302>/Saturation2'
           *  Switch: '<S319>/Switch'
           */
          HvCoorn_ARID_DEF.UnitDelay_DSTATE_pe = (sint32)floorf(tmpRead_i + 0.5F);
        } else {
          /* Update for UnitDelay: '<S302>/Unit Delay' incorporates:
           *  Saturate: '<S302>/Saturation2'
           *  Switch: '<S319>/Switch'
           */
          HvCoorn_ARID_DEF.UnitDelay_DSTATE_pe = 0;
        }
      } else {
        /* Update for UnitDelay: '<S302>/Unit Delay' incorporates:
         *  Saturate: '<S302>/Saturation2'
         *  Switch: '<S319>/Switch'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_pe = (sint32)tmpRead_i;
      }

      /* End of DataTypeConversion: '<S302>/DataTypeConversion' */
    } else if (rtb_AND14_l) {
      /* Update for UnitDelay: '<S302>/Unit Delay' incorporates:
       *  Constant: '<S302>/single5'
       *  Saturate: '<S302>/Saturation2'
       *  Sum: '<S302>/Subtract'
       *  Switch: '<S302>/Switch1'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_pe -= 1;
    }

    /* End of Switch: '<S302>/Switch' */

    /* Delay: '<S33>/Delay' incorporates:
     *  Constant: '<S33>/sup_tiChgConndown_C1'
     *  Constant: '<S33>/sup_tiChgConndown_C2'
     *  Constant: '<S33>/sup_tiChgConndown_C3'
     *  Delay: '<S33>/Delay1'
     *  Delay: '<S33>/Delay2'
     *
     * Block description for '<S33>/sup_tiChgConndown_C1':
     *  [200]
     *
     * Block description for '<S33>/sup_tiChgConndown_C2':
     *  [200]
     *
     * Block description for '<S33>/sup_tiChgConndown_C3':
     *  [200]
     */
    if (HvCoorn_nAuthRstDly_C <= 0) {
      /* Update for UnitDelay: '<S33>/Unit Delay2' incorporates:
       *  Delay: '<S33>/Delay'
       */
      HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bq = HvCoorn_bAntiTrig430;

      /* Update for UnitDelay: '<S33>/Unit Delay4' incorporates:
       *  Delay: '<S33>/Delay1'
       */
      HvCoorn_ARID_DEF.UnitDelay4_DSTATE_n = HvCoorn_bAntiTrig42C;

      /* Update for UnitDelay: '<S33>/Unit Delay3' incorporates:
       *  Delay: '<S33>/Delay2'
       */
      HvCoorn_ARID_DEF.UnitDelay3_DSTATE_g = rtb_Logical_Operator4_cz;
    } else {
      if (HvCoorn_nAuthRstDly_C > 200) {
        rtb_ShiftArithmetic7 = 200U;
      } else {
        rtb_ShiftArithmetic7 = HvCoorn_nAuthRstDly_C;
      }

      /* Update for UnitDelay: '<S33>/Unit Delay2' incorporates:
       *  Delay: '<S33>/Delay'
       */
      HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bq = HvCoorn_ARID_DEF.Delay_DSTATE_l
        [(uint8)(200U - rtb_ShiftArithmetic7)];
      if (HvCoorn_nAuthRstDly_C > 200) {
        rtb_ShiftArithmetic7 = 200U;
      } else {
        rtb_ShiftArithmetic7 = HvCoorn_nAuthRstDly_C;
      }

      /* Update for UnitDelay: '<S33>/Unit Delay4' incorporates:
       *  Constant: '<S33>/sup_tiChgConndown_C1'
       *  Delay: '<S33>/Delay1'
       *
       * Block description for '<S33>/sup_tiChgConndown_C1':
       *  [200]
       */
      HvCoorn_ARID_DEF.UnitDelay4_DSTATE_n = HvCoorn_ARID_DEF.Delay1_DSTATE_h
        [(uint8)(200U - rtb_ShiftArithmetic7)];
      if (HvCoorn_nAuthRstDly_C > 200) {
        rtb_ShiftArithmetic7 = 200U;
      } else {
        rtb_ShiftArithmetic7 = HvCoorn_nAuthRstDly_C;
      }

      /* Update for UnitDelay: '<S33>/Unit Delay3' incorporates:
       *  Constant: '<S33>/sup_tiChgConndown_C3'
       *  Delay: '<S33>/Delay2'
       *
       * Block description for '<S33>/sup_tiChgConndown_C3':
       *  [200]
       */
      HvCoorn_ARID_DEF.UnitDelay3_DSTATE_g = HvCoorn_ARID_DEF.Delay2_DSTATE_l
        [(uint8)(200U - rtb_ShiftArithmetic7)];
    }

    /* End of Delay: '<S33>/Delay' */

    /* Saturate: '<S33>/Saturation1' */
    if (HvCoorn_ARID_DEF.authfailed_n_conterEEW <= ((uint8)15U)) {
      /* Saturate: '<S33>/Saturation1' */
      VCU_E2_counterfaieldEEW = HvCoorn_ARID_DEF.authfailed_n_conterEEW;
    } else {
      /* Saturate: '<S33>/Saturation1' */
      VCU_E2_counterfaieldEEW = ((uint8)15U);
    }

    /* End of Saturate: '<S33>/Saturation1' */

    /* Selector: '<S33>/Selector16' incorporates:
     *  Constant: '<S33>/15'
     *  Selector: '<S33>/Selector8'
     */
    rtb_DataTypeConversion_jq = (sint32)8.0F - 1;

    /* SignalConversion: '<S33>/Signal Copy10' incorporates:
     *  Selector: '<S33>/Selector16'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthChlgOnReq'
     */
    HvCoorn_stTboxByte0Req =
      rtb_TmpSignalConversionAtictc_h[rtb_DataTypeConversion_jq];

    /* Selector: '<S33>/Selector10' incorporates:
     *  Constant: '<S33>/16'
     *  Selector: '<S33>/Selector2'
     */
    HvCoorn_stTboxByte7Req_tmp = (sint32)2.0F - 1;

    /* SignalConversion: '<S33>/Signal Copy11' incorporates:
     *  Selector: '<S33>/Selector10'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthChlgOnReq'
     */
    HvCoorn_stTboxByte6Req =
      rtb_TmpSignalConversionAtictc_h[HvCoorn_stTboxByte7Req_tmp];

    /* SignalConversion: '<S33>/Signal Copy12' incorporates:
     *  Selector: '<S33>/Selector5'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthSts'
     */
    HvCoorn_stTboxByte3Fb = rtb_TmpSignalConversionAtictc_j[rtb_Saturation2_ke];

    /* SignalConversion: '<S33>/Signal Copy15' incorporates:
     *  Selector: '<S33>/Selector2'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthSts'
     */
    HvCoorn_stTboxByte6Fb =
      rtb_TmpSignalConversionAtictc_j[HvCoorn_stTboxByte7Req_tmp];

    /* Selector: '<S33>/Selector6' incorporates:
     *  Constant: '<S33>/6'
     *  Selector: '<S33>/Selector14'
     */
    rtb_Saturation2_ke = (sint32)6.0F - 1;

    /* SignalConversion: '<S33>/Signal Copy17' incorporates:
     *  Selector: '<S33>/Selector6'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthSts'
     */
    HvCoorn_stTboxByte2Fb = rtb_TmpSignalConversionAtictc_j[rtb_Saturation2_ke];

    /* Selector: '<S33>/Selector7' incorporates:
     *  Constant: '<S33>/7'
     *  Selector: '<S33>/Selector15'
     */
    HvCoorn_stTboxByte7Req_tmp = (sint32)7.0F - 1;

    /* SignalConversion: '<S33>/Signal Copy18' incorporates:
     *  Selector: '<S33>/Selector7'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthSts'
     */
    HvCoorn_stTboxByte1Fb =
      rtb_TmpSignalConversionAtictc_j[HvCoorn_stTboxByte7Req_tmp];

    /* SignalConversion: '<S33>/Signal Copy19' incorporates:
     *  Selector: '<S33>/Selector8'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthSts'
     */
    HvCoorn_stTboxByte0Fb =
      rtb_TmpSignalConversionAtictc_j[rtb_DataTypeConversion_jq];

    /* SignalConversion: '<S33>/Signal Copy8' incorporates:
     *  Selector: '<S33>/Selector14'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthChlgOnReq'
     */
    HvCoorn_stTboxByte2Req = rtb_TmpSignalConversionAtictc_h[rtb_Saturation2_ke];

    /* SignalConversion: '<S33>/Signal Copy9' incorporates:
     *  Selector: '<S33>/Selector15'
     *  SignalConversion generated from: '<S1>/ictcp_noAuthChlgOnReq'
     */
    HvCoorn_stTboxByte1Req =
      rtb_TmpSignalConversionAtictc_h[HvCoorn_stTboxByte7Req_tmp];

    /* Switch: '<S319>/Switch' incorporates:
     *  Switch: '<S319>/Switch1'
     */
    if (HvCoorn_bAntiTrig42C) {
      /* Product: '<S319>/Divide' incorporates:
       *  Constant: '<S299>/sup_tiChgConndown_C'
       *
       * Block description for '<S299>/sup_tiChgConndown_C':
       *  [3]
       */
      tmpRead_i = HvCoorn_ti430triggerDly_C / HvCoorn_ConstB.Max_hn;

      /* DataTypeConversion: '<S319>/DataTypeConversion' */
      tmpRead_h = fabsf(tmpRead_i);
      if (tmpRead_h < 8.388608E+6F) {
        if (tmpRead_h >= 0.5F) {
          /* Update for UnitDelay: '<S319>/Unit Delay' incorporates:
           *  Switch: '<S319>/Switch'
           */
          HvCoorn_ARID_DEF.UnitDelay_DSTATE_ir = (sint32)floorf(tmpRead_i + 0.5F);
        } else {
          /* Update for UnitDelay: '<S319>/Unit Delay' incorporates:
           *  Switch: '<S319>/Switch'
           */
          HvCoorn_ARID_DEF.UnitDelay_DSTATE_ir = 0;
        }
      } else {
        /* Update for UnitDelay: '<S319>/Unit Delay' incorporates:
         *  Switch: '<S319>/Switch'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_ir = (sint32)tmpRead_i;
      }

      /* End of DataTypeConversion: '<S319>/DataTypeConversion' */
    } else if (rtb_RelationalOperator_gn) {
      /* Update for UnitDelay: '<S319>/Unit Delay' incorporates:
       *  Constant: '<S319>/single5'
       *  Sum: '<S319>/Subtract'
       *  Switch: '<S319>/Switch'
       *  Switch: '<S319>/Switch1'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_ir -= 1;
    }

    /* End of Switch: '<S319>/Switch' */

    /* Update for UnitDelay: '<S290>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_gc = rtb_AND8_k;

    /* Update for UnitDelay: '<S296>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5y = rtb_Logical_Operator4_cz;

    /* Update for UnitDelay: '<S297>/Unit Delay1' */
    HvCoorn_ARID_DEF.UnitDelay1_DSTATE_n = rtb_TmpSignalConversionAtPwrLim;

    /* Update for UnitDelay: '<S292>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_ed = rtb_AND2_e;

    /* Update for UnitDelay: '<S291>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_f3 = HvCoorn_flg_Authtrigger;

    /* Update for UnitDelay: '<S293>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_br = VCCM_flg_Antitheft_Overtime;

    /* Update for UnitDelay: '<S294>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_f4 = rtb_AND15_f;

    /* Update for Delay: '<S33>/Delay3' incorporates:
     *  Constant: '<S33>/TRUE'
     *
     * Block description for '<S33>/TRUE':
     *  TRUE
     */
    for (i = 0; i < 99; i++) {
      HvCoorn_ARID_DEF.Delay3_DSTATE[i] = HvCoorn_ARID_DEF.Delay3_DSTATE[i + 1];
    }

    HvCoorn_ARID_DEF.Delay3_DSTATE[99] = true;

    /* End of Update for Delay: '<S33>/Delay3' */

    /* Update for UnitDelay: '<S300>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_gu = rtb_TmpSignalConversionAtidi_bK;

    /* Update for UnitDelay: '<S301>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_lc = rtb_Equal3_a;

    /* Update for Delay: '<S33>/Delay' */
    for (i = 0; i < 199; i++) {
      HvCoorn_ARID_DEF.Delay_DSTATE_l[i] = HvCoorn_ARID_DEF.Delay_DSTATE_l[i + 1];
    }

    HvCoorn_ARID_DEF.Delay_DSTATE_l[199] = HvCoorn_bAntiTrig430;

    /* End of Update for Delay: '<S33>/Delay' */

    /* Update for Delay: '<S33>/Delay1' */
    for (i = 0; i < 199; i++) {
      HvCoorn_ARID_DEF.Delay1_DSTATE_h[i] = HvCoorn_ARID_DEF.Delay1_DSTATE_h[i +
        1];
    }

    HvCoorn_ARID_DEF.Delay1_DSTATE_h[199] = HvCoorn_bAntiTrig42C;

    /* End of Update for Delay: '<S33>/Delay1' */

    /* Update for Delay: '<S33>/Delay2' */
    for (i = 0; i < 199; i++) {
      HvCoorn_ARID_DEF.Delay2_DSTATE_l[i] = HvCoorn_ARID_DEF.Delay2_DSTATE_l[i +
        1];
    }

    HvCoorn_ARID_DEF.Delay2_DSTATE_l[199] = rtb_Logical_Operator4_cz;

    /* End of Update for Delay: '<S33>/Delay2' */
  }

  /* End of Logic: '<S38>/AND' */
  /* End of Outputs for SubSystem: '<S3>/A30_Authcation' */

  /* Switch: '<S183>/Switch' incorporates:
   *  Constant: '<S9>/uint5'
   *  Logic: '<S9>/OR4'
   *  RelationalOperator: '<S9>/Equal3'
   */
  if (HvCoorn_bAuthHvStrtLim || (HvCoorn_stHVP_f == ((uint8)2U))) {
    /* Sum: '<S183>/Subtract1' incorporates:
     *  Constant: '<S183>/single1'
     *  UnitDelay: '<S183>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_em < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_em)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_em > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_em)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_em + 1;
    }

    /* End of Sum: '<S183>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S183>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S183>/Switch' */

  /* Update for UnitDelay: '<S183>/Unit Delay' incorporates:
   *  Saturate: '<S183>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_em = rtb_DataTypeConversion_jq;

  /* RelationalOperator: '<S185>/Relational Operator' incorporates:
   *  Constant: '<S185>/single4'
   *  UnitDelay: '<S185>/Unit Delay'
   */
  rtb_AND8_k = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_py > 0);

  /* Logic: '<S182>/Logical_Operator4' incorporates:
   *  Constant: '<S9>/uint3'
   *  Logic: '<S182>/Logical Operator1'
   *  Logic: '<S182>/Logical_Operator5'
   *  Logic: '<S9>/AND'
   *  Logic: '<S9>/Logical Operator10'
   *  Logic: '<S9>/OR2'
   *  RelationalOperator: '<S9>/Relational Operator3'
   *  UnitDelay: '<S182>/Unit Delay'
   *  UnitDelay: '<S3>/Unit Delay2'
   *
   * Block description for '<S9>/uint3':
   *  Authentication successed
   */
  HvCoorn_bAuthentPass = (rtb_TmpSignalConversionAtidi_bK && rtb_bGearOk &&
    rtb_TmpSignalConversionAtDrvMod && rtb_TmpSignalConversionAtGear_n &&
    rtb_TmpSignalConversionAtGear_m && rtb_TmpSignalConversionAtGear_e &&
    ((HvCoorn_bMCUAuthentPass && (HvCoorn_stHVP == ((uint8)89U))) ||
     HvCoorn_bAuthentPass));

  /* Product: '<S183>/Divide' incorporates:
   *  Constant: '<S9>/Calibration1'
   *
   * Block description for '<S9>/Calibration1':
   *  [0.03]
   */
  tmpRead_i = HvCoorn_tiLostComWarnDly_C / HvCoorn_ConstB.Max_av;

  /* DataTypeConversion: '<S183>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S9>/Logical Operator6' incorporates:
   *  Constant: '<S9>/sup_bKeyStrtMan_C'
   *  Constant: '<S9>/sup_tiKeyStrt_C2'
   *  DataTypeConversion: '<S183>/DataTypeConversion'
   *  Logic: '<S185>/Logical Operator2'
   *  Logic: '<S9>/Logical Operator16'
   *  Logic: '<S9>/Logical Operator4'
   *  Logic: '<S9>/Logical Operator5'
   *  Logic: '<S9>/Logical Operator7'
   *  Logic: '<S9>/Logical Operator9'
   *  Logic: '<S9>/Not'
   *  Logic: '<S9>/OR'
   *  Logic: '<S9>/OR1'
   *  RelationalOperator: '<S183>/Relational Operator1'
   *  Saturate: '<S183>/Saturation2'
   *
   * Block description for '<S9>/sup_bKeyStrtMan_C':
   *  [0]
   *
   * Block description for '<S9>/sup_tiKeyStrt_C2':
   *  [1]
   */
  HvCoorn_bRdyWait2Rdy = (((rtb_DataTypeConversion_jq <= (sint32)tmpRead_i) && (
    !rtb_TmpSignalConversionAtved__p) && HvCoorn_bStartUpReq &&
    HvCoorn_ConstB.RelationalOperator1 && (rtb_AND8_k ||
    rtb_TmpSignalConversionAtidi__j || HvCoorn_bHvRdyBypKeyStrt_C) &&
    HvCoorn_bAuthentPass && rtb_AND7_j && (rtb_Logical_Operator4_n_tmp ||
    rtb_RelationalOperator_ce_idx_0) && (!rtb_Equal12_a) &&
    rtb_TmpSignalConversionAtidi_bK && (!rtb_AND23) && rtb_AND9_p_tmp &&
    (!rtb_AND12_o)) || HvCoorn_bKeyStrtMan_C);

  /* RelationalOperator: '<S180>/Greater' incorporates:
   *  Constant: '<S180>/uint32'
   *  Constant: '<S9>/sup_tiKeyStrt_C3'
   *  DataTypeConversion: '<S180>/DataTypeConversion'
   *  DataTypeConversion: '<S180>/DataTypeConversion1'
   *  S-Function (sfix_bitop): '<S180>/Bitwise Operator'
   *
   * Block description for '<S9>/sup_tiKeyStrt_C3':
   *  [63]
   */
  HvCoorn_bRdy2RdyWait = (((uint32)HvCoorn_stRdy2RdyWait &
    HvCoorn_noRdy2RdyWaitEna_C) >= 1U);

  /* Switch: '<S185>/Switch' incorporates:
   *  Switch: '<S185>/Switch1'
   */
  if (rtb_TmpSignalConversionAtidi__j) {
    /* Product: '<S185>/Divide' incorporates:
     *  Constant: '<S9>/sup_tiKeyStrt_C'
     *
     * Block description for '<S9>/sup_tiKeyStrt_C':
     *  [2]
     */
    tmpRead_i = HvCoorn_tiDly4KeyStrt_C / HvCoorn_ConstB.Max_b;

    /* DataTypeConversion: '<S185>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S185>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S185>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_py = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S185>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S185>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_py = 0;
      }
    } else {
      /* Update for UnitDelay: '<S185>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       *  Saturate: '<S185>/Saturation2'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_py = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S185>/DataTypeConversion' */
  } else if (rtb_AND8_k) {
    /* Update for UnitDelay: '<S185>/Unit Delay' incorporates:
     *  Constant: '<S185>/single5'
     *  Saturate: '<S185>/Saturation2'
     *  Sum: '<S185>/Subtract'
     *  Switch: '<S185>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_py -= 1;
  }

  /* End of Switch: '<S185>/Switch' */

  /* Switch: '<S186>/Switch' incorporates:
   *  Switch: '<S186>/Switch1'
   */
  if (HvCoorn_bChrgLink) {
    /* Product: '<S186>/Divide' incorporates:
     *  Constant: '<S9>/sup_tiChgConndown_C'
     *
     * Block description for '<S9>/sup_tiChgConndown_C':
     *  [0.5]
     */
    tmpRead_i = HvCoorn_tiChrgrDisConn_C / HvCoorn_ConstB.Max_pq;

    /* DataTypeConversion: '<S186>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S186>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S186>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S186>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S186>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl = 0;
      }
    } else {
      /* Update for UnitDelay: '<S186>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       *  Saturate: '<S186>/Saturation2'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S186>/DataTypeConversion' */
  } else if (rtb_AND26_o) {
    /* Update for UnitDelay: '<S186>/Unit Delay' incorporates:
     *  Constant: '<S186>/single5'
     *  Saturate: '<S186>/Saturation2'
     *  Sum: '<S186>/Subtract'
     *  Switch: '<S186>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl -= 1;
  }

  /* End of Switch: '<S186>/Switch' */

  /* Switch: '<S10>/Switch' incorporates:
   *  Constant: '<S10>/icm_ready'
   *  Constant: '<S10>/icm_ready1'
   *  Constant: '<S10>/sup_uThres_C'
   *  Constant: '<S10>/sup_uThres_C1'
   *  Logic: '<S10>/OR'
   *  MinMax: '<S10>/Max'
   *  RelationalOperator: '<S10>/Equal'
   *  RelationalOperator: '<S10>/Relational Operator1'
   *  RelationalOperator: '<S10>/Relational Operator2'
   *
   * Block description for '<S10>/icm_ready':
   *  [3]
   *
   * Block description for '<S10>/icm_ready1':
   *  [3]
   *
   * Block description for '<S10>/sup_uThres_C':
   *  [220]
   *
   * Block description for '<S10>/sup_uThres_C1':
   *  [1]
   */
  if (HvCoorn_bMindChag2RdyChkMCUVolt_C) {
    tmp_2 = (fmaxf(tmpRead_f, rtb_TmpSignalConversionAticisg_) >=
             HvCoorn_uThd4PreChrg_C);
  } else {
    tmp_2 = ((rtb_TmpSignalConversionAticfm_s == ((uint8)3U)) ||
             (rtb_TmpSignalConversionAticrm_s == ((uint8)3U)));
  }

  /* Logic: '<S10>/Logical Operator' incorporates:
   *  Switch: '<S10>/Switch'
   */
  HvCoorn_bMindChag2Rdy = (tmp_2 && HvCoorn_bStartUpReq && HvCoorn_bHvRlyClsAct);

  /* Logic: '<S193>/Logical_Operator4' incorporates:
   *  Constant: '<S11>/int1'
   *  Logic: '<S193>/Logical Operator1'
   *  Logic: '<S193>/Logical_Operator5'
   *  RelationalOperator: '<S11>/Relational Operator7'
   *  UnitDelay: '<S11>/Unit Delay'
   *  UnitDelay: '<S11>/Unit Delay1'
   *  UnitDelay: '<S193>/Unit Delay'
   */
  rtb_TmpSignalConversionAtDrvMod = ((!HvCoorn_ARID_DEF.UnitDelay1_DSTATE_o) &&
    ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_me >= 1) ||
     HvCoorn_ARID_DEF.UnitDelay_DSTATE_ky));

  /* Switch: '<S194>/Switch' */
  if (rtb_TmpSignalConversionAtDrvMod) {
    /* Sum: '<S194>/Subtract1' incorporates:
     *  Constant: '<S194>/single1'
     *  UnitDelay: '<S194>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_f1 < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_f1)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_f1 > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_f1)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_f1 + 1;
    }

    /* End of Sum: '<S194>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S194>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S194>/Switch' */

  /* Update for UnitDelay: '<S194>/Unit Delay' incorporates:
   *  Saturate: '<S194>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_f1 = rtb_DataTypeConversion_jq;

  /* Product: '<S194>/Divide' incorporates:
   *  Constant: '<S11>/sup_tiWait4CountDown_C'
   *
   * Block description for '<S11>/sup_tiWait4CountDown_C':
   *  [2]
   */
  tmpRead_i = HvCoorn_tiWait4CountDown_C / HvCoorn_ConstB.Max_jo;

  /* DataTypeConversion: '<S194>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S194>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S194>/DataTypeConversion'
   *  Saturate: '<S194>/Saturation2'
   */
  rtb_TmpSignalConversionAtidi__j = (rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i);

  /* Switch: '<S11>/Switch' incorporates:
   *  Constant: '<S11>/int3'
   *  Constant: '<S11>/int8'
   *  Logic: '<S191>/Logical Operator'
   *  Logic: '<S191>/Logical Operator1'
   *  Logic: '<S192>/Logical Operator'
   *  Logic: '<S192>/Logical Operator1'
   *  Switch: '<S11>/Switch1'
   *  UnitDelay: '<S191>/Unit Delay2'
   *  UnitDelay: '<S192>/Unit Delay2'
   */
  if (HvCoorn_bStartUpReq && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_gj)) {
    rtb_Switch_ld = 1;
  } else if (rtb_TmpSignalConversionAtidi__j &&
             (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_kp)) {
    /* Switch: '<S11>/Switch1' incorporates:
     *  Constant: '<S11>/int2'
     */
    rtb_Switch_ld = (-1);
  } else {
    rtb_Switch_ld = 0;
  }

  /* Sum: '<S11>/Add' incorporates:
   *  Switch: '<S11>/Switch'
   *  UnitDelay: '<S11>/Unit Delay'
   */
  rtb_DataTypeConversion_jq = rtb_Switch_ld +
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_me;
  if (rtb_DataTypeConversion_jq > 127) {
    rtb_DataTypeConversion_jq = 127;
  } else if (rtb_DataTypeConversion_jq < -128) {
    rtb_DataTypeConversion_jq = -128;
  }

  /* Saturate: '<S11>/Saturation' incorporates:
   *  Sum: '<S11>/Add'
   */
  if ((sint8)rtb_DataTypeConversion_jq > 10) {
    /* Saturate: '<S11>/Saturation' */
    rtb_Switch_ld = 10;
  } else if ((sint8)rtb_DataTypeConversion_jq < 0) {
    /* Saturate: '<S11>/Saturation' */
    rtb_Switch_ld = 0;
  } else {
    /* Saturate: '<S11>/Saturation' */
    rtb_Switch_ld = (sint8)rtb_DataTypeConversion_jq;
  }

  /* End of Saturate: '<S11>/Saturation' */

  /* SignalConversion generated from: '<S1>/icbms_iHVBat' incorporates:
   *  Inport: '<Root>/icbms_iHVBat'
   */
  (void)Rte_Read_icbms_iHVBat_Value(&rtb_TmpSignalConversionAticb_ke);

  /* SignalConversion generated from: '<S1>/icisg_stMod' incorporates:
   *  Inport: '<Root>/icisg_stMod'
   */
  (void)Rte_Read_icisg_stMod_Value(&rtb_TmpSignalConversionAtici_ec);

  /* Abs: '<S11>/Abs1' incorporates:
   *  Abs: '<S20>/Abs1'
   */
  rtb_TmpSignalConversionAtPwrLim = fabsf(rtb_TmpSignalConversionAticb_ke);

  /* Switch: '<S195>/Switch' incorporates:
   *  Abs: '<S11>/Abs1'
   *  Constant: '<S11>/sup_iBatMax4RlyOpn_C'
   *  RelationalOperator: '<S11>/Relational Operator2'
   *
   * Block description for '<S11>/sup_iBatMax4RlyOpn_C':
   *  [5]
   */
  if (rtb_TmpSignalConversionAtPwrLim < HvCoorn_iBatMax4RlyOpen_C) {
    /* Sum: '<S195>/Subtract1' incorporates:
     *  Constant: '<S195>/single1'
     *  UnitDelay: '<S195>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_al < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_al)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_al > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_al)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_al + 1;
    }

    /* End of Sum: '<S195>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S195>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S195>/Switch' */

  /* Update for UnitDelay: '<S195>/Unit Delay' incorporates:
   *  Saturate: '<S195>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_al = rtb_DataTypeConversion_jq;

  /* Product: '<S195>/Divide' incorporates:
   *  Constant: '<S11>/sup_tiBatCurChk4RlyOpn_C'
   *
   * Block description for '<S11>/sup_tiBatCurChk4RlyOpn_C':
   *  [0.03]
   */
  tmpRead_i = HvCoorn_tiBatCurChk4RlyOpen_C / HvCoorn_ConstB.Max_ne;

  /* DataTypeConversion: '<S195>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S11>/Logical Operator5' incorporates:
   *  Constant: '<S11>/icdc_buckDcdc'
   *  Constant: '<S11>/icm_trqCtrl'
   *  Constant: '<S11>/icm_trqCtrl1'
   *  Constant: '<S11>/icobc_V2L'
   *  Constant: '<S11>/icobc_V2V'
   *  Constant: '<S11>/icobc_V2V1'
   *  Constant: '<S11>/icobc_charging'
   *  Constant: '<S11>/icobc_charging1'
   *  DataTypeConversion: '<S195>/DataTypeConversion'
   *  Logic: '<S11>/Logical Operator1'
   *  Logic: '<S11>/Logical Operator10'
   *  Logic: '<S11>/OR'
   *  RelationalOperator: '<S11>/Relational Operator1'
   *  RelationalOperator: '<S11>/Relational Operator10'
   *  RelationalOperator: '<S11>/Relational Operator11'
   *  RelationalOperator: '<S11>/Relational Operator12'
   *  RelationalOperator: '<S11>/Relational Operator13'
   *  RelationalOperator: '<S11>/Relational Operator5'
   *  RelationalOperator: '<S11>/Relational Operator8'
   *  RelationalOperator: '<S11>/Relational Operator9'
   *  RelationalOperator: '<S195>/Relational Operator1'
   *  Saturate: '<S195>/Saturation2'
   *
   * Block description for '<S11>/icdc_buckDcdc':
   *  [3]
   *
   * Block description for '<S11>/icm_trqCtrl':
   *  [4]
   *
   * Block description for '<S11>/icm_trqCtrl1':
   *  [4]
   *
   * Block description for '<S11>/icobc_V2L':
   *  [4]
   *
   * Block description for '<S11>/icobc_V2V':
   *  [5]
   *
   * Block description for '<S11>/icobc_V2V1':
   *  [5]
   *
   * Block description for '<S11>/icobc_charging':
   *  [3]
   *
   * Block description for '<S11>/icobc_charging1':
   *  [3]
   */
  HvCoorn_bHvNoLoad = (((rtb_TmpSignalConversionAticfm_s != ((uint8)4U)) ||
                        rtb_TmpSignalConversionAtVehC_i) &&
                       (rtb_TmpSignalConversionAticrm_s != ((uint8)4U)) &&
                       (rtb_TmpSignalConversionAticdc_s != ((uint8)3U)) &&
                       ((rtb_TmpSignalConversionAticob_c != ((uint8)3U)) &&
                        (rtb_TmpSignalConversionAticob_c != ((uint8)4U)) &&
                        (rtb_TmpSignalConversionAticob_c != ((uint8)5U))) &&
                       ((rtb_TmpSignalConversionAtici_ec != ((uint8)3U)) &&
                        (rtb_TmpSignalConversionAtici_ec != ((uint8)5U))) &&
                       (rtb_DataTypeConversion_jq > (sint32)tmpRead_i));

  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S11>/sup_tiTimeOutStandbyRdyHv_C'
   *  RelationalOperator: '<S11>/Relational Operator4'
   *
   * Block description for '<S11>/sup_tiTimeOutStandbyRdyHv_C':
   *  [5]
   */
  rtb_bGearOk = (HvCoorn_tiHVPStTimer > HvCoorn_tiTimeOutStdbyRdyHv_C);

  /* RelationalOperator: '<S31>/Equal3' incorporates:
   *  Abs: '<S44>/Abs1'
   *  Constant: '<S11>/sup_vForShutDown_C'
   *  RelationalOperator: '<S11>/Relational Operator6'
   *
   * Block description for '<S11>/sup_vForShutDown_C':
   *  [1.5]
   */
  rtb_RelationalOperator_ce_idx_0 = (tmpRead_tmp <= HvCoorn_v4ShutDown_C);

  /* Switch: '<S196>/Switch' incorporates:
   *  Constant: '<S11>/Wait4MindChange'
   *  Logic: '<S11>/Logical Operator7'
   *  Logic: '<S11>/Logical Operator8'
   *  RelationalOperator: '<S11>/Relational Operator15'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  if ((!rtb_RelationalOperator_ce_idx_0) && (HvCoorn_stHVP == ((uint8)95U))) {
    /* Sum: '<S196>/Subtract1' incorporates:
     *  Constant: '<S196>/single1'
     *  UnitDelay: '<S196>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_pc < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_pc)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_pc > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_pc)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_pc + 1;
    }

    /* End of Sum: '<S196>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S196>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S196>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/icisg_nAct' */
  (void)Rte_Read_icisg_nAct_Value(&tmpRead_4);

  /* Inport: '<Root>/icbms_uHVBat' */
  (void)Rte_Read_icbms_uHVBat_Value(&rtb_Switch2_as);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S196>/Unit Delay' incorporates:
   *  Saturate: '<S196>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_pc = rtb_DataTypeConversion_jq;

  /* Product: '<S196>/Divide' incorporates:
   *  Constant: '<S11>/sup_tiSpdWaitTimout_C'
   *
   * Block description for '<S11>/sup_tiSpdWaitTimout_C':
   *  [300]
   */
  tmpRead_i = HvCoorn_tiSpdWaitTimout_C / HvCoorn_ConstB.Max_h;

  /* DataTypeConversion: '<S196>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S11>/Logical Operator3' incorporates:
   *  DataTypeConversion: '<S196>/DataTypeConversion'
   *  Logic: '<S11>/Logical Operator'
   *  Logic: '<S11>/Logical Operator2'
   *  Logic: '<S11>/Logical Operator4'
   *  Logic: '<S11>/Logical Operator9'
   *  Lookup_n-D: '<S11>/1-D Lookup Table1'
   *  RelationalOperator: '<S11>/Relational Operator3'
   *  RelationalOperator: '<S196>/Relational Operator1'
   *  Saturate: '<S11>/Saturation'
   *  Saturate: '<S196>/Saturation2'
   */
  HvCoorn_bMindChag2ShutHV = (HvCoorn_bHvRlyOpenAct ||
    (rtb_TmpSignalConversionAtved_bH && rtb_bGearOk) || ((HvCoorn_tiHVPStTimer >
    look1_is8lftf_binlca(rtb_Switch_ld, (const sint8 *)
    &HvCoorn_tiWait4StdbyRdyHv_AX[0], (const float32 *)
    &HvCoorn_tiWait4StdbyRdyHv_T[0], 5U)) && (HvCoorn_bHvNoLoad || rtb_bGearOk) &&
    (rtb_RelationalOperator_ce_idx_0 || (rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i))));

  /* Logic: '<S11>/Logical Operator6' incorporates:
   *  Constant: '<S11>/sup_tiSpdWaitTimout_C1'
   *
   * Block description for '<S11>/sup_tiSpdWaitTimout_C1':
   *  [0]
   */
  rtb_TmpSignalConversionAtGear_e = (HvCoorn_bVehSpd4HvDownByp_C ||
    rtb_RelationalOperator_ce_idx_0);

  /* SignalConversion generated from: '<S1>/icfm_nAct' incorporates:
   *  Inport: '<Root>/icfm_nAct'
   */
  (void)Rte_Read_icfm_nAct_Value(&rtb_TmpSignalConversionAticfm_n);

  /* SignalConversion generated from: '<S1>/icrm_nAct' incorporates:
   *  Inport: '<Root>/icrm_nAct'
   */
  (void)Rte_Read_icrm_nAct_Value(&rtb_TmpSignalConversionAticrm_n);

  /* MinMax: '<S12>/Max' incorporates:
   *  Abs: '<S12>/Abs'
   *  Abs: '<S12>/Abs1'
   *  MinMax: '<S20>/Max'
   */
  rtb_TmpSignalConversionAticfm_n = fmaxf(fabsf(rtb_TmpSignalConversionAticfm_n),
    fabsf(rtb_TmpSignalConversionAticrm_n));

  /* Logic: '<S12>/Logical Operator2' incorporates:
   *  Abs: '<S12>/Abs2'
   *  Constant: '<S12>/Wait4MindChange'
   *  Constant: '<S12>/sup_nMotThres4Dcha_C'
   *  Constant: '<S12>/sup_tiTimeOutStandbyRdyHv_C'
   *  Logic: '<S12>/AND'
   *  Logic: '<S12>/AND1'
   *  MinMax: '<S12>/Max'
   *  RelationalOperator: '<S12>/Relational Operator15'
   *  RelationalOperator: '<S12>/Relational Operator4'
   *  RelationalOperator: '<S12>/Relational Operator6'
   *  UnitDelay: '<S3>/Unit Delay2'
   *
   * Block description for '<S12>/sup_nMotThres4Dcha_C':
   *  [60]
   *
   * Block description for '<S12>/sup_tiTimeOutStandbyRdyHv_C':
   *  [5]
   */
  HvCoorn_bShutHV2ShutDisCh = ((HvCoorn_bHvRlyOpenAct && (fmaxf
    (rtb_TmpSignalConversionAticfm_n, fabsf(tmpRead_4)) <=
    HvCoorn_nMotThrd4DChrg_C)) || ((HvCoorn_stHVP == ((uint8)101U)) &&
    (HvCoorn_tiHVPStTimer > HvCoorn_tiTimeOutShutHv2Dchrg_C)));

  /* SignalConversion generated from: '<S1>/icobc_uHvDcAct' incorporates:
   *  Inport: '<Root>/icobc_uHvDcAct'
   */
  (void)Rte_Read_icobc_uHvDcAct_Value(&rtb_TmpSignalConversionAticobc_);

  /* MinMax: '<S13>/MinMax' incorporates:
   *  MinMax: '<S20>/MinMax'
   *  MinMax: '<S37>/MinMax'
   *  Switch: '<S37>/Switch'
   */
  tmpRead_4 = fmaxf(rtb_TmpSignalConversionAticfm_u,
                    rtb_TmpSignalConversionAticdc_u);
  rtb_TmpSignalConversionAticobc_ = fmaxf(fmaxf(tmpRead_4,
    rtb_TmpSignalConversionAticobc_), rtb_TmpSignalConversionAticrm_u);

  /* Abs: '<S20>/Abs' incorporates:
   *  MinMax: '<S13>/MinMax'
   */
  rtb_TmpSignalConversionAticrm_n = fmaxf(rtb_TmpSignalConversionAticobc_,
    rtb_TmpSignalConversionAticisg_);

  /* SignalConversion generated from: '<S1>/icfm_stActvDchrg' incorporates:
   *  Inport: '<Root>/icfm_stActvDchrg'
   */
  (void)Rte_Read_icfm_stActvDchrg_Value(&rtb_TmpSignalConversionAticfm_d);

  /* SignalConversion generated from: '<S1>/icrm_stActvDchrg' incorporates:
   *  Inport: '<Root>/icrm_stActvDchrg'
   */
  (void)Rte_Read_icrm_stActvDchrg_Value(&rtb_TmpSignalConversionAticrm_p);

  /* Switch: '<S13>/Switch1' incorporates:
   *  Constant: '<S13>/TRUE1'
   *  Constant: '<S13>/icm_failure2'
   *  RelationalOperator: '<S13>/Relational Operator6'
   *
   * Block description for '<S13>/TRUE1':
   *  TRUE
   *
   * Block description for '<S13>/icm_failure2':
   *  [3]
   */
  if (rtb_TmpSignalConversionAtVehC_i) {
    tmp_2 = true;
  } else {
    tmp_2 = (rtb_TmpSignalConversionAticfm_d == ((uint8)3U));
  }

  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S13>/icm_failure3'
   *  Logic: '<S13>/Logical Operator11'
   *  RelationalOperator: '<S13>/Relational Operator8'
   *  Switch: '<S13>/Switch1'
   *
   * Block description for '<S13>/icm_failure3':
   *  [3]
   */
  rtb_bGearOk = (tmp_2 && (rtb_TmpSignalConversionAticrm_p == ((uint8)3U)));

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/EngStrtStop_stRefuMod' */
  (void)Rte_Read_EngStrtStop_stRefuMod_Value(&tmpRead_c);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Switch: '<S13>/Switch2' incorporates:
   *  Constant: '<S13>/TRUE'
   *  Constant: '<S13>/icm_failure4'
   *  RelationalOperator: '<S13>/Relational Operator9'
   *
   * Block description for '<S13>/TRUE':
   *  TRUE
   *
   * Block description for '<S13>/icm_failure4':
   *  [1]
   */
  if (rtb_TmpSignalConversionAtVehC_i) {
    tmp_2 = true;
  } else {
    tmp_2 = (rtb_TmpSignalConversionAticfm_d == ((uint8)1U));
  }

  /* RelationalOperator: '<S31>/Equal3' incorporates:
   *  Constant: '<S13>/icm_failure5'
   *  Logic: '<S13>/Logical Operator12'
   *  RelationalOperator: '<S13>/Relational Operator10'
   *  Switch: '<S13>/Switch2'
   *
   * Block description for '<S13>/icm_failure5':
   *  [1]
   */
  rtb_RelationalOperator_ce_idx_0 = (tmp_2 && (rtb_TmpSignalConversionAticrm_p ==
    ((uint8)1U)));

  /* Logic: '<S31>/AND7' incorporates:
   *  Constant: '<S13>/sup_uHvDiffOnThres_C'
   *  RelationalOperator: '<S13>/Relational Operator5'
   *  Sum: '<S13>/Add'
   *
   * Block description for '<S13>/sup_uHvDiffOnThres_C':
   *  [70]
   */
  rtb_AND7_j = (rtb_Switch2_as - rtb_TmpSignalConversionAticrm_n >
                HvCoorn_uHvDiffOnThrd_C);

  /* Logic: '<S13>/Logical Operator2' incorporates:
   *  Constant: '<S13>/sup_tiWait4DchaCanLost_C'
   *  Constant: '<S13>/sup_uIpuShutdown_C'
   *  Logic: '<S13>/Logical Operator4'
   *  Logic: '<S13>/Logical Operator5'
   *  Logic: '<S13>/Logical Operator6'
   *  RelationalOperator: '<S13>/Relational Operator1'
   *  RelationalOperator: '<S13>/Relational Operator7'
   *
   * Block description for '<S13>/sup_tiWait4DchaCanLost_C':
   *  [5]
   *
   * Block description for '<S13>/sup_uIpuShutdown_C':
   *  [60]
   */
  HvCoorn_bShutDisCh2ShutECU = (HvCoorn_bHvRlyOpenAct &&
    (rtb_RelationalOperator_ce_idx_0 || ((rtb_TmpSignalConversionAticrm_n <
    HvCoorn_uMax4Shutdown_C) && HvCoorn_ConstB.LogicalOperator9) ||
     (HvCoorn_tiHVPStTimer >= HvCoorn_tiWait4DchaCanLost_C) || (rtb_AND7_j &&
    rtb_TmpSignalConversionAtved_bI && HvCoorn_bStartUpReq)));

  /* Switch: '<S13>/Switch' incorporates:
   *  Constant: '<S13>/FALSE'
   *  Constant: '<S13>/icm_failure'
   *  RelationalOperator: '<S13>/Relational Operator2'
   *
   * Block description for '<S13>/FALSE':
   *  FALSE
   *
   * Block description for '<S13>/icm_failure':
   *  [8]
   */
  if (rtb_TmpSignalConversionAtVehC_i) {
    tmp_2 = false;
  } else {
    tmp_2 = (rtb_TmpSignalConversionAticfm_s == ((uint8)8U));
  }

  /* Logic: '<S13>/Logical Operator3' incorporates:
   *  Constant: '<S13>/icm_failure1'
   *  Constant: '<S13>/sup_bEnaDCUStMan_C'
   *  Constant: '<S13>/sup_tiWait4HvDcha_C'
   *  Logic: '<S13>/Logical Operator1'
   *  Logic: '<S13>/OR'
   *  RelationalOperator: '<S13>/Relational Operator3'
   *  RelationalOperator: '<S13>/Relational Operator4'
   *  Switch: '<S13>/Switch'
   *
   * Block description for '<S13>/icm_failure1':
   *  [8]
   *
   * Block description for '<S13>/sup_bEnaDCUStMan_C':
   *  [0]
   *
   * Block description for '<S13>/sup_tiWait4HvDcha_C':
   *  [120]
   */
  HvCoorn_bShutDisCh2ShutErr = ((HvCoorn_tiHVPStTimer >= HvCoorn_tiWait4HvDcha_C)
    || HvCoorn_bHvRlyStuck || ((tmp_2 || (rtb_TmpSignalConversionAticrm_s ==
    ((uint8)8U))) && HvCoorn_bEnaMCUStMan_C) || rtb_bGearOk);

  /* Logic: '<S14>/Logical Operator2' incorporates:
   *  Constant: '<S14>/sup_tiShutDownDlyLih_C'
   *  Constant: '<S14>/sup_uIpuShutdown_C'
   *  Logic: '<S14>/Logical Operator1'
   *  RelationalOperator: '<S14>/Relational Operator1'
   *  RelationalOperator: '<S14>/Relational Operator4'
   *  RelationalOperator: '<S14>/Relational Operator7'
   *
   * Block description for '<S14>/sup_tiShutDownDlyLih_C':
   *  [20]
   *
   * Block description for '<S14>/sup_uIpuShutdown_C':
   *  [60]
   */
  HvCoorn_bShutECU2AftRun = ((rtb_AND9_c && (tmpRead_f < HvCoorn_uMax4Shutdown_C)
    && (rtb_TmpSignalConversionAticdc_u < HvCoorn_uMax4Shutdown_C)) ||
    (HvCoorn_tiHVPStTimer >= HvCoorn_tiShutDownDlyLih_C));

  /* Logic: '<S15>/Logical Operator1' */
  HvCoorn_bShutECU2Comm = (HvCoorn_bStartUpReq &&
    rtb_TmpSignalConversionAtved_bI && rtb_RelationalOperator_e2 &&
    rtb_RelationalOperator_ce_idx_1 && rtb_AND7_j);

  /* Logic: '<S31>/AND7' incorporates:
   *  Constant: '<S16>/Calibration1'
   *  RelationalOperator: '<S16>/Equal1'
   *
   * Block description for '<S16>/Calibration1':
   *  [0]
   */
  rtb_AND7_j = (tmpRead_c == ((uint8)0U));

  /* Switch: '<S207>/Switch' incorporates:
   *  Logic: '<S16>/Not'
   */
  if (!rtb_AND7_j) {
    /* Sum: '<S207>/Subtract1' incorporates:
     *  Constant: '<S207>/single1'
     *  UnitDelay: '<S207>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_jd < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_jd)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_jd > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_jd)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_jd + 1;
    }

    /* End of Sum: '<S207>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S207>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S207>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/iud_bNetMaintn' */
  (void)Rte_Read_iud_bNetMaintn_Value(&tmpRead_7);

  /* Inport: '<Root>/ved_bEmgcyHvShtdwn' */
  (void)Rte_Read_ved_bEmgcyHvShtdwn_Value(&rtb_OR_jg);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S207>/Unit Delay' incorporates:
   *  Saturate: '<S207>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_jd = rtb_DataTypeConversion_jq;

  /* Product: '<S207>/Divide' incorporates:
   *  Constant: '<S16>/Calibration2'
   *
   * Block description for '<S16>/Calibration2':
   *  [300]
   */
  tmpRead_i = HvCoorn_tiRefuModOvti2NetManDly_C / HvCoorn_ConstB.Max_k;

  /* DataTypeConversion: '<S207>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S16>/Logical Operator6' incorporates:
   *  Constant: '<S16>/sup_tiWaitChgFullShutdown_C'
   *  Constant: '<S16>/sup_tiWaitChgFullShutdown_C1'
   *  DataTypeConversion: '<S207>/DataTypeConversion'
   *  Logic: '<S16>/OR'
   *  RelationalOperator: '<S16>/Relational Operator4'
   *  RelationalOperator: '<S207>/Relational Operator1'
   *  Saturate: '<S207>/Saturation2'
   *
   * Block description for '<S16>/sup_tiWaitChgFullShutdown_C':
   *  [1]
   *
   * Block description for '<S16>/sup_tiWaitChgFullShutdown_C1':
   *  [0]
   */
  HvCoorn_bAftRun2NetMan = ((HvCoorn_tiHVPStTimer >
    HvCoorn_tiWaitChrgFullShutdown_C) && rtb_AND9_c &&
    (HvCoorn_bRefuModOvti2NetManShd_C || rtb_AND7_j ||
     (rtb_DataTypeConversion_jq > (sint32)tmpRead_i)));

  /* Logic: '<S17>/Logical Operator4' incorporates:
   *  Constant: '<S17>/Wait4MindChange'
   *  Constant: '<S17>/sup_bLlswShutDownMan_C'
   *  Constant: '<S17>/sup_tiTimeOutStandbyRdyHv_C'
   *  Logic: '<S17>/AND'
   *  Logic: '<S17>/Not'
   *  RelationalOperator: '<S17>/Relational Operator15'
   *  RelationalOperator: '<S17>/Relational Operator4'
   *  UnitDelay: '<S3>/Unit Delay2'
   *
   * Block description for '<S17>/sup_bLlswShutDownMan_C':
   *  [0]
   *
   * Block description for '<S17>/sup_tiTimeOutStandbyRdyHv_C':
   *  [120]
   */
  HvCoorn_bNetMan2PwrShut = ((!tmpRead_7) || HvCoorn_bLlswShutDownMan_C ||
    ((HvCoorn_tiHVPStTimer > HvCoorn_tiTimeOutNetMan_C) && (HvCoorn_stHVP ==
    ((uint8)125U))));

  /* Logic: '<S18>/Logical Operator2' incorporates:
   *  Constant: '<S18>/sup_tiKeyOnCheck_C'
   *  RelationalOperator: '<S18>/Relational Operator4'
   *
   * Block description for '<S18>/sup_tiKeyOnCheck_C':
   *  [5]
   */
  HvCoorn_bWake2NetMan = (rtb_AND9_c && (HvCoorn_tiHVPStTimer >
    HvCoorn_tiKeyOnChk_C));

  /* Logic: '<S19>/Logical Operator2' incorporates:
   *  Constant: '<S19>/sup_tiWaitIgnOff_C'
   *  RelationalOperator: '<S19>/Relational Operator4'
   *
   * Block description for '<S19>/sup_tiWaitIgnOff_C':
   *  [5]
   */
  HvCoorn_bInit2AftRun = (rtb_AND9_c && (HvCoorn_tiHVPStTimer >
    HvCoorn_tiWaitIgnOff_C));

  /* Logic: '<S20>/Logical Operator1' incorporates:
   *  Constant: '<S20>/sup_tiWait4DchaCanLost_C'
   *  Constant: '<S20>/sup_uThresEmerg_C'
   *  Logic: '<S20>/Logical Operator11'
   *  RelationalOperator: '<S20>/Relational Operator5'
   *  RelationalOperator: '<S20>/Relational Operator8'
   *
   * Block description for '<S20>/sup_tiWait4DchaCanLost_C':
   *  [5]
   *
   * Block description for '<S20>/sup_uThresEmerg_C':
   *  [60]
   */
  rtb_AND7_j = (rtb_RelationalOperator_ce_idx_0 ||
                ((rtb_TmpSignalConversionAticobc_ < HvCoorn_uThd4EmergShutdown_C)
                 && HvCoorn_ConstB.LogicalOperator13) || (HvCoorn_tiHVPStTimer >=
    HvCoorn_tiWait4DchaCanLost_C));

  /* Logic: '<S21>/Logical Operator1' incorporates:
   *  Constant: '<S21>/NormShut2'
   *  Constant: '<S21>/NormShut3'
   *  RelationalOperator: '<S21>/Relational Operator12'
   *  RelationalOperator: '<S21>/Relational Operator3'
   *  UnitDelay: '<S3>/Unit Delay2'
   *
   * Block description for '<S21>/NormShut2':
   *  HvContactorRequest
   *
   * Block description for '<S21>/NormShut3':
   *  Shutdown_HV
   */
  HvCoorn_bEmgcyShutDownReq = (rtb_OR_jg && (HvCoorn_stHVP >= ((uint8)12U)) &&
    (HvCoorn_stHVP <= ((uint8)101U)));

  /* Switch: '<S320>/Switch' incorporates:
   *  Logic: '<S34>/Not'
   */
  if (!HvCoorn_bStartUpReq) {
    /* Sum: '<S320>/Subtract1' incorporates:
     *  Constant: '<S320>/single1'
     *  UnitDelay: '<S320>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ao < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ao)) {
      /* Saturate: '<S320>/Saturation2' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       */
      rtb_Saturation2_ke = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ao > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ao)) {
      /* Saturate: '<S320>/Saturation2' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       */
      rtb_Saturation2_ke = MAX_int32_T;
    } else {
      /* Saturate: '<S320>/Saturation2' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       */
      rtb_Saturation2_ke = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ao + 1;
    }

    /* End of Sum: '<S320>/Subtract1' */
  } else {
    /* Saturate: '<S320>/Saturation2' incorporates:
     *  Constant: '<S320>/single2'
     *  DataTypeConversion: '<S287>/DataTypeConversion'
     */
    rtb_Saturation2_ke = 0;
  }

  /* End of Switch: '<S320>/Switch' */

  /* SignalConversion generated from: '<S1>/icems_stEng' incorporates:
   *  Inport: '<Root>/icems_stEng'
   */
  (void)Rte_Read_icems_stEng_Value(&rtb_TmpSignalConversionAticem_j);

  /* SignalConversion generated from: '<S1>/icems_nAct' incorporates:
   *  Inport: '<Root>/icems_nAct'
   */
  (void)Rte_Read_icems_nAct_Value(&rtb_TmpSignalConversionAticems_);

  /* Switch: '<S321>/Switch' incorporates:
   *  Constant: '<S34>/Calibration2'
   *  Constant: '<S34>/icemsSt_Run_SC2'
   *  Logic: '<S34>/OR1'
   *  RelationalOperator: '<S34>/Lower'
   *  RelationalOperator: '<S34>/Relational Operator6'
   *
   * Block description for '<S34>/Calibration2':
   *  [50]
   *
   * Block description for '<S34>/icemsSt_Run_SC2':
   *  [3]
   */
  if ((rtb_TmpSignalConversionAticem_j != ((uint8)3U)) &&
      (rtb_TmpSignalConversionAticems_ < HvCoorn_nHvDownEngSpdMaxThd_C)) {
    /* Sum: '<S321>/Subtract1' incorporates:
     *  Constant: '<S321>/single1'
     *  UnitDelay: '<S321>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_du < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_du)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_du > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_du)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_du + 1;
    }

    /* End of Sum: '<S321>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S321>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S321>/Switch' */

  /* Update for UnitDelay: '<S321>/Unit Delay' incorporates:
   *  Saturate: '<S321>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_du = rtb_DataTypeConversion_jq;

  /* Product: '<S320>/Divide' incorporates:
   *  Constant: '<S34>/Calibration1'
   *
   * Block description for '<S34>/Calibration1':
   *  [1]
   */
  tmpRead_i = HvCoorn_tiISGNoRdyNoStrtReqDly_C / HvCoorn_ConstB.Max_pf;

  /* DataTypeConversion: '<S320>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);

  /* Product: '<S321>/Divide' incorporates:
   *  Constant: '<S34>/Calibration3'
   *
   * Block description for '<S34>/Calibration3':
   *  [0.1]
   */
  rtb_TmpSignalConversionAtian__o = HvCoorn_tiEngSpdHvDownAllwThd_C /
    HvCoorn_ConstB.Max_jn;

  /* DataTypeConversion: '<S321>/DataTypeConversion' */
  rtb_TmpSignalConversionAticebs_ = fabsf(rtb_TmpSignalConversionAtian__o);

  /* DataTypeConversion: '<S320>/DataTypeConversion' */
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* DataTypeConversion: '<S321>/DataTypeConversion' */
  if (rtb_TmpSignalConversionAticebs_ < 8.388608E+6F) {
    if (rtb_TmpSignalConversionAticebs_ >= 0.5F) {
      rtb_TmpSignalConversionAtian__o = floorf(rtb_TmpSignalConversionAtian__o +
        0.5F);
    } else {
      rtb_TmpSignalConversionAtian__o = 0.0F;
    }
  }

  /* Logic: '<S34>/OR' incorporates:
   *  Constant: '<S34>/uint1'
   *  Constant: '<S34>/uint8'
   *  DataTypeConversion: '<S320>/DataTypeConversion'
   *  DataTypeConversion: '<S321>/DataTypeConversion'
   *  Logic: '<S34>/AND1'
   *  RelationalOperator: '<S320>/Relational Operator1'
   *  RelationalOperator: '<S321>/Relational Operator1'
   *  RelationalOperator: '<S34>/Relational Operator3'
   *  RelationalOperator: '<S34>/Relational Operator4'
   *  Saturate: '<S321>/Saturation2'
   *  UnitDelay: '<S3>/Unit Delay2'
   */
  HvCoorn_bAPUNotRdy = ((rtb_Saturation2_ke > (sint32)tmpRead_i) ||
                        (rtb_DataTypeConversion_jq > (sint32)
    rtb_TmpSignalConversionAtian__o) || ((HvCoorn_stHVP != ((uint8)89U)) &&
    (HvCoorn_stHVP != ((uint8)90U))));

  /* Chart: '<S3>/A19_MainProcedure' incorporates:
   *  Constant: '<S20>/EmWait4KeyOff'
   *  Constant: '<S20>/icm_failure'
   *  Constant: '<S20>/icm_failure1'
   *  Constant: '<S20>/sup_bEmEnaDCUStMan_C'
   *  Constant: '<S20>/sup_iBatMax4RlyOpn_C'
   *  Constant: '<S20>/sup_nMotThres4Dcha_C'
   *  Constant: '<S20>/sup_tiHvesOpDlyEmerg_C'
   *  Constant: '<S20>/sup_tiWait4HvDcha_C'
   *  Constant: '<S20>/sup_tiWait4LlswEolShutdown_C'
   *  Constant: '<S20>/sup_tiWait4LlswEolShutdown_C1'
   *  Logic: '<S20>/Logical Operator3'
   *  Logic: '<S20>/Logical Operator4'
   *  Logic: '<S20>/Logical Operator5'
   *  Logic: '<S20>/Logical Operator6'
   *  Logic: '<S20>/Logical Operator8'
   *  Logic: '<S20>/Logical Operator9'
   *  Logic: '<S20>/OR'
   *  Logic: '<S20>/OR1'
   *  RelationalOperator: '<S20>/Relational Operator1'
   *  RelationalOperator: '<S20>/Relational Operator10'
   *  RelationalOperator: '<S20>/Relational Operator11'
   *  RelationalOperator: '<S20>/Relational Operator2'
   *  RelationalOperator: '<S20>/Relational Operator3'
   *  RelationalOperator: '<S20>/Relational Operator4'
   *  RelationalOperator: '<S20>/Relational Operator6'
   *  RelationalOperator: '<S20>/Relational Operator7'
   *  RelationalOperator: '<S20>/Relational Operator9'
   *  UnitDelay: '<S3>/Unit Delay2'
   *
   * Block description for '<S20>/EmWait4KeyOff':
   *  EmWait4KeyOff
   *
   * Block description for '<S20>/icm_failure':
   *  [8]
   *
   * Block description for '<S20>/icm_failure1':
   *  [8]
   *
   * Block description for '<S20>/sup_bEmEnaDCUStMan_C':
   *  [0]
   *
   * Block description for '<S20>/sup_iBatMax4RlyOpn_C':
   *  [5]
   *
   * Block description for '<S20>/sup_nMotThres4Dcha_C':
   *  [30000]
   *
   * Block description for '<S20>/sup_tiHvesOpDlyEmerg_C':
   *  [0.2]
   *
   * Block description for '<S20>/sup_tiWait4HvDcha_C':
   *  [120]
   *
   * Block description for '<S20>/sup_tiWait4LlswEolShutdown_C':
   *  [10]
   *
   * Block description for '<S20>/sup_tiWait4LlswEolShutdown_C1':
   *  [0.2]
   */
  /* Gateway: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A19_MainProcedure */
  if (HvCoorn_ARID_DEF.temporalCounter_i1 < 3U) {
    HvCoorn_ARID_DEF.temporalCounter_i1++;
  }

  /* During: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A19_MainProcedure */
  if (HvCoorn_ARID_DEF.is_active_c2_HvCoorn == 0U) {
    /* Entry: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A19_MainProcedure */
    HvCoorn_ARID_DEF.is_active_c2_HvCoorn = 1U;

    /* Entry Internal: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A19_MainProcedure */
    /* Transition: '<S22>:224' */
    HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_WakeUp;
    HvCoorn_ARID_DEF.temporalCounter_i1 = 0U;

    /* Entry 'WakeUp': '<S22>:230' */
    HvCoorn_stHVP_f = 1U;
  } else {
    switch (HvCoorn_ARID_DEF.is_c2_HvCoorn) {
     case HvCoorn_IN_Emergency_HV:
      /* During 'Emergency_HV': '<S22>:223' */
      if (rtb_AND7_j && (HvCoorn_stHVP >= ((uint8)156U)) &&
          HvCoorn_bStartUpReq_tmp_0) {
        /* Transition: '<S22>:221' */
        /* Exit Internal 'Emergency_HV': '<S22>:223' */
        HvCoorn_ARID_DEF.is_Emergency_HV = HvCoorn_IN_NO_ACTIVE_CHILD;
        HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_Initial_Settings;

        /* Entry 'Initial_Settings': '<S22>:232' */
        HvCoorn_stHVP_f = 10U;
      } else {
        switch (HvCoorn_ARID_DEF.is_Emergency_HV) {
         case HvCoorn_IN_Emergency_DisChErr:
          /* During 'Emergency_DisChErr': '<S22>:214' */
          /* Transition: '<S22>:217' */
          HvCoorn_ARID_DEF.is_Emergency_HV = HvCoor_IN_Emergency_Wait4KeyOff;

          /* Entry 'Emergency_Wait4KeyOff': '<S22>:210' */
          HvCoorn_stHVP_f = 156U;
          break;

         case HvCoo_IN_Emergency_MotDischarge:
          HvCoorn_stHVP_f = 154U;

          /* During 'Emergency_MotDischarge': '<S22>:211' */
          if ((HvCoorn_tiHVPStTimer >= HvCoorn_tiWait4HvDcha_C) || rtb_bGearOk ||
              HvCoorn_bHvRlyStuck || (((rtb_TmpSignalConversionAticfm_s ==
                 ((uint8)8U)) || (rtb_TmpSignalConversionAticrm_s == ((uint8)8U)))
               && HvCoorn_bEmEnaMCUStMan_C)) {
            /* Transition: '<S22>:251' */
            HvCoorn_ARID_DEF.is_Emergency_HV = HvCoorn_IN_Emergency_DisChErr;
            HvCoorn_ARID_DEF.temporalCounter_i1 = 0U;

            /* Entry 'Emergency_DisChErr': '<S22>:214' */
            HvCoorn_stHVP_f = 155U;
          } else if (rtb_AND7_j) {
            /* Transition: '<S22>:250' */
            HvCoorn_ARID_DEF.is_Emergency_HV = HvCoor_IN_Emergency_Wait4KeyOff;

            /* Entry 'Emergency_Wait4KeyOff': '<S22>:210' */
            HvCoorn_stHVP_f = 156U;
          }
          break;

         case HvCoor_IN_Emergency_NmHoldState:
          HvCoorn_stHVP_f = 158U;

          /* During 'Emergency_NmHoldState': '<S22>:215' */
          if (HvCoorn_bNetMan2PwrShut) {
            /* Transition: '<S22>:220' */
            HvCoorn_ARID_DEF.is_Emergency_HV = H_IN_Emergency_VcuPowerShutDown;

            /* Entry 'Emergency_VcuPowerShutDown': '<S22>:207' */
            HvCoorn_stHVP_f = 160U;
          }
          break;

         case HvCoor_IN_Emergency_ShutDownIni:
          HvCoorn_stHVP_f = 151U;

          /* During 'Emergency_ShutDownIni': '<S22>:209' */
          if ((rtb_TmpSignalConversionAtPwrLim < HvCoorn_iBatMax4RlyOpen_C) ||
              (HvCoorn_tiHVPStTimer > HvCoorn_tiHvOpenDlyEmerg_C)) {
            /* Transition: '<S22>:212' */
            HvCoorn_ARID_DEF.is_Emergency_HV = HvCoorn_IN_Emergency_ShutdownHV;

            /* Entry 'Emergency_ShutdownHV': '<S22>:213' */
            HvCoorn_stHVP_f = 152U;
          }
          break;

         case HvCoorn_IN_Emergency_ShutdownHV:
          HvCoorn_stHVP_f = 152U;

          /* During 'Emergency_ShutdownHV': '<S22>:213' */
          if ((HvCoorn_bHvRlyOpenAct && (rtb_TmpSignalConversionAticfm_n <=
                HvCoorn_nMotEmShutHv2DChrg_C)) || (HvCoorn_tiHVPStTimer >
               HvCoorn_tiWait4EmShutHv2DChrg_C)) {
            /* Transition: '<S22>:216' */
            HvCoorn_ARID_DEF.is_Emergency_HV = HvCoo_IN_Emergency_MotDischarge;

            /* Entry 'Emergency_MotDischarge': '<S22>:211' */
            HvCoorn_stHVP_f = 154U;
          }
          break;

         case H_IN_Emergency_VcuPowerShutDown:
          HvCoorn_stHVP_f = 160U;

          /* During 'Emergency_VcuPowerShutDown': '<S22>:207' */
          break;

         default:
          HvCoorn_stHVP_f = 156U;

          /* During 'Emergency_Wait4KeyOff': '<S22>:210' */
          if ((HvCoorn_tiHVPStTimer > HvCoorn_tiWait4LlswEolShutdown_C) &&
              rtb_AND9_c) {
            /* Transition: '<S22>:218' */
            HvCoorn_ARID_DEF.is_Emergency_HV = HvCoor_IN_Emergency_NmHoldState;

            /* Entry 'Emergency_NmHoldState': '<S22>:215' */
            HvCoorn_stHVP_f = 158U;
          }
          break;
        }
      }
      break;

     case HvCoorn_IN_Initial_Settings:
      HvCoorn_stHVP_f = 10U;

      /* During 'Initial_Settings': '<S22>:232' */
      if (HvCoorn_bInit2StrtUp) {
        /* Transition: '<S22>:270' */
        HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_Normal;
        HvCoorn_ARID_DEF.is_Normal = HvCoorn_IN_Startup;

        /* Entry Internal 'Startup': '<S22>:234' */
        /* Transition: '<S22>:229' */
        HvCoorn_ARID_DEF.is_Startup = HvCoorn_IN_Wait4Communication;

        /* Entry 'Wait4Communication': '<S22>:236' */
        HvCoorn_stHVP_f = 11U;
      } else if (HvCoorn_bInit2AftRun) {
        /* Transition: '<S22>:264' */
        HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_VcuAfterRun;

        /* Entry 'VcuAfterRun': '<S22>:261' */
        HvCoorn_stHVP_f = 121U;
      }
      break;

     case HvCoorn_IN_NmHoldState:
      HvCoorn_stHVP_f = 125U;

      /* During 'NmHoldState': '<S22>:260' */
      if (HvCoorn_bStartUpReq) {
        /* Transition: '<S22>:268' */
        HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_WakeUp;
        HvCoorn_ARID_DEF.temporalCounter_i1 = 0U;

        /* Entry 'WakeUp': '<S22>:230' */
        HvCoorn_stHVP_f = 1U;
      } else if (HvCoorn_bNetMan2PwrShut) {
        /* Transition: '<S22>:262' */
        HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_VcuPowerShutDown;

        /* Entry 'VcuPowerShutDown': '<S22>:231' */
        HvCoorn_stHVP_f = 130U;
      }
      break;

     case HvCoorn_IN_Normal:
      HvCoorn_Normal(&rtb_TmpSignalConversionAtGear_e, &HvCoorn_stHVP_f);
      break;

     case HvCoorn_IN_VcuAfterRun:
      HvCoorn_stHVP_f = 121U;

      /* During 'VcuAfterRun': '<S22>:261' */
      if (HvCoorn_bStartUpReq) {
        /* Transition: '<S22>:266' */
        HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_Initial_Settings;

        /* Entry 'Initial_Settings': '<S22>:232' */
        HvCoorn_stHVP_f = 10U;
      } else if (HvCoorn_bAftRun2NetMan) {
        /* Transition: '<S22>:265' */
        HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_NmHoldState;

        /* Entry 'NmHoldState': '<S22>:260' */
        HvCoorn_stHVP_f = 125U;
      }
      break;

     case HvCoorn_IN_VcuPowerShutDown:
      HvCoorn_stHVP_f = 130U;

      /* During 'VcuPowerShutDown': '<S22>:231' */
      if (HvCoorn_bStartUpReq) {
        /* Transition: '<S22>:219' */
        HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_WakeUp;
        HvCoorn_ARID_DEF.temporalCounter_i1 = 0U;

        /* Entry 'WakeUp': '<S22>:230' */
        HvCoorn_stHVP_f = 1U;
      }
      break;

     default:
      HvCoorn_stHVP_f = 1U;

      /* During 'WakeUp': '<S22>:230' */
      if (HvCoorn_bStartUpReq && (HvCoorn_ARID_DEF.temporalCounter_i1 >= 2)) {
        /* Transition: '<S22>:269' */
        HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_Initial_Settings;

        /* Entry 'Initial_Settings': '<S22>:232' */
        HvCoorn_stHVP_f = 10U;
      } else if (HvCoorn_bWake2NetMan) {
        /* Transition: '<S22>:263' */
        HvCoorn_ARID_DEF.is_c2_HvCoorn = HvCoorn_IN_NmHoldState;

        /* Entry 'NmHoldState': '<S22>:260' */
        HvCoorn_stHVP_f = 125U;
      }
      break;
    }
  }

  /* End of Chart: '<S3>/A19_MainProcedure' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/DTC_bBMSFltLvl8' */
  (void)Rte_Read_DTC_bBMSFltLvl8_Value(&rtb_RelationalOperator_no);

  /* Inport: '<Root>/DTC_bBMSFltLvl7' */
  (void)Rte_Read_DTC_bBMSFltLvl7_Value(&tmpRead_b);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Switch: '<S23>/Switch' incorporates:
   *  Constant: '<S23>/ocm_standby2'
   *
   * Block description for '<S23>/ocm_standby2':
   *  [0]
   */
  if (HvCoorn_bHVStOvrd_C) {
    /* Switch: '<S23>/Switch' incorporates:
     *  Constant: '<S23>/ocm_standby1'
     *
     * Block description for '<S23>/ocm_standby1':
     *  [90]
     */
    HvCoorn_stHVP = HvCoorn_noHVStOvrdVal_C;
  } else {
    /* Switch: '<S23>/Switch' */
    HvCoorn_stHVP = HvCoorn_stHVP_f;
  }

  /* End of Switch: '<S23>/Switch' */

  /* Logic: '<S24>/OR1' incorporates:
   *  Constant: '<S24>/uint2'
   *  Constant: '<S24>/uint4'
   *  RelationalOperator: '<S24>/Equal1'
   *  RelationalOperator: '<S24>/Equal3'
   *
   * Block description for '<S24>/uint2':
   *
   *
   * Block description for '<S24>/uint4':
   *
   */
  HvCoorn_bAllwSlep = ((HvCoorn_stHVP == ((uint8)160U)) || (HvCoorn_stHVP ==
    ((uint8)130U)));

  /* Logic: '<S24>/OR' incorporates:
   *  Constant: '<S24>/uint1'
   *  Constant: '<S24>/uint3'
   *  RelationalOperator: '<S24>/Equal'
   *  RelationalOperator: '<S24>/Equal2'
   *
   * Block description for '<S24>/uint1':
   *
   *
   * Block description for '<S24>/uint3':
   *
   */
  HvCoorn_bAllwShutNet = ((HvCoorn_stHVP == ((uint8)125U)) || (HvCoorn_stHVP ==
    ((uint8)158U)) || HvCoorn_bAllwSlep);

  /* SignalConversion generated from: '<S1>/EngStrtStop_bHVPRdy' incorporates:
   *  Inport: '<Root>/EngStrtStop_bHVPRdy'
   */
  (void)Rte_Read_EngStrtStop_bHVPRdy_Value(&rtb_TmpSignalConversionAtEngStr);

  /* Logic: '<S322>/OR' incorporates:
   *  Constant: '<S322>/Calibration5'
   *  Logic: '<S322>/AND2'
   *  Logic: '<S322>/Not'
   *
   * Block description for '<S322>/Calibration5':
   *  [0]
   */
  rtb_OR_jg = ((!rtb_TmpSignalConversionAtipf_bP) || rtb_RelationalOperator_no ||
               (tmpRead_b && HvCoorn_bVoltModBMSLvl7Ena_C));

  /* SignalConversion generated from: '<S1>/HybCoorn_bEngStrtFail' incorporates:
   *  Inport: '<Root>/HybCoorn_bEngStrtFail'
   */
  (void)Rte_Read_HybCoorn_bEngStrtFail_Value(&rtb_TmpSignalConversionAtHybCoo);

  /* Switch: '<S333>/Switch' incorporates:
   *  Constant: '<S322>/icbms_undefined7'
   *  RelationalOperator: '<S322>/Equal1'
   *  UnitDelay: '<S3>/UnitDelay'
   *
   * Block description for '<S322>/icbms_undefined7':
   *  [2]
   */
  if (HvCoorn_stVoltMod == ((uint8)2U)) {
    /* Sum: '<S333>/Subtract1' incorporates:
     *  Constant: '<S333>/single1'
     *  UnitDelay: '<S333>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_b < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_b)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_b > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_b)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_b + 1;
    }

    /* End of Sum: '<S333>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S333>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S333>/Switch' */

  /* Update for UnitDelay: '<S333>/Unit Delay' incorporates:
   *  Saturate: '<S333>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_b = rtb_DataTypeConversion_jq;

  /* Product: '<S333>/Divide' incorporates:
   *  Constant: '<S322>/Calibration2'
   *
   * Block description for '<S322>/Calibration2':
   *  [5]
   */
  tmpRead_i = HvCoorn_tiHvDisbTiOverThd_C / HvCoorn_ConstB.Max_cj;

  /* DataTypeConversion: '<S333>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S333>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S333>/DataTypeConversion'
   *  Saturate: '<S333>/Saturation2'
   */
  HvCoorn_bVoltModHvDisbOvtiErr = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Switch: '<S332>/Switch' incorporates:
   *  Constant: '<S322>/icbms_undefined1'
   *  RelationalOperator: '<S322>/Equal2'
   *  UnitDelay: '<S3>/UnitDelay'
   *
   * Block description for '<S322>/icbms_undefined1':
   *  [3]
   */
  if (HvCoorn_stVoltMod == ((uint8)3U)) {
    /* Sum: '<S332>/Subtract1' incorporates:
     *  Constant: '<S332>/single1'
     *  UnitDelay: '<S332>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ch < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ch)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ch > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ch)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ch + 1;
    }

    /* End of Sum: '<S332>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S332>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S332>/Switch' */

  /* Update for UnitDelay: '<S332>/Unit Delay' incorporates:
   *  Saturate: '<S332>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ch = rtb_DataTypeConversion_jq;

  /* Product: '<S332>/Divide' incorporates:
   *  Constant: '<S322>/Calibration1'
   *
   * Block description for '<S322>/Calibration1':
   *  [5]
   */
  tmpRead_i = HvCoorn_tiHvDcnctTiOverThd_C / HvCoorn_ConstB.Max_ii;

  /* DataTypeConversion: '<S332>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S332>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S332>/DataTypeConversion'
   *  Saturate: '<S332>/Saturation2'
   */
  HvCoorn_bVoltModHvDcnctOvtiErr = (rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i);

  /* Switch: '<S334>/Switch' incorporates:
   *  Constant: '<S322>/icbms_undefined2'
   *  RelationalOperator: '<S322>/Equal3'
   *  UnitDelay: '<S3>/UnitDelay'
   *
   * Block description for '<S322>/icbms_undefined2':
   *  [4]
   */
  if (HvCoorn_stVoltMod == ((uint8)4U)) {
    /* Sum: '<S334>/Subtract1' incorporates:
     *  Constant: '<S334>/single1'
     *  UnitDelay: '<S334>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_k < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_k)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_k > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_k)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_k + 1;
    }

    /* End of Sum: '<S334>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S334>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S334>/Switch' */

  /* Update for UnitDelay: '<S334>/Unit Delay' incorporates:
   *  Saturate: '<S334>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_k = rtb_DataTypeConversion_jq;

  /* Product: '<S334>/Divide' incorporates:
   *  Constant: '<S322>/Calibration3'
   *
   * Block description for '<S322>/Calibration3':
   *  [5]
   */
  tmpRead_i = HvCoorn_tiHvReqTiOverThd_C / HvCoorn_ConstB.Max_km;

  /* DataTypeConversion: '<S334>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S334>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S334>/DataTypeConversion'
   *  Saturate: '<S334>/Saturation2'
   */
  HvCoorn_bVoltModHvReqOvtiErr = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Logic: '<S322>/AND' incorporates:
   *  Constant: '<S322>/Calibration4'
   *  Logic: '<S322>/AND1'
   *  Logic: '<S322>/Not1'
   *  Logic: '<S322>/Not2'
   *  Logic: '<S322>/Not3'
   *  Logic: '<S322>/Not4'
   *
   * Block description for '<S322>/Calibration4':
   *  [0]
   */
  HvCoorn_bDft2EngStrtRaw = (rtb_TmpSignalConversionAtEngStr && rtb_OR_jg &&
    (!rtb_TmpSignalConversionAtHybCoo) && HvCoorn_bVoltModDft2EngStrtEna_C && ((
    !HvCoorn_bVoltModHvDisbOvtiErr) && (!HvCoorn_bVoltModHvDcnctOvtiErr) &&
    (!HvCoorn_bVoltModHvReqOvtiErr)));

  /* SignalConversion generated from: '<S1>/EngStrtStop_bEngStrtAllw' incorporates:
   *  Inport: '<Root>/EngStrtStop_bEngStrtAllw'
   */
  (void)Rte_Read_EngStrtStop_bEngStrtAllw_Value(&rtb_TmpSignalConversionAtEngS_n);

  /* Logic: '<S322>/AND9' */
  HvCoorn_bDft2EngStrt = (HvCoorn_bDft2EngStrtRaw &&
    rtb_TmpSignalConversionAtEngS_n);

  /* Switch: '<S339>/Switch' incorporates:
   *  Constant: '<S323>/icemsSt_Run_SC1'
   *  Constant: '<S323>/icemsSt_Run_SC2'
   *  Constant: '<S323>/icemsSt_Run_SC3'
   *  Logic: '<S323>/AND'
   *  Logic: '<S323>/AND1'
   *  RelationalOperator: '<S323>/Relational Operator1'
   *  RelationalOperator: '<S323>/Relational Operator4'
   *  RelationalOperator: '<S323>/Relational Operator6'
   *
   * Block description for '<S323>/icemsSt_Run_SC1':
   *  [1100]
   *
   * Block description for '<S323>/icemsSt_Run_SC2':
   *  [3]
   *
   * Block description for '<S323>/icemsSt_Run_SC3':
   *  [900]
   */
  if ((rtb_TmpSignalConversionAticem_j == ((uint8)3U)) && tmp_0 &&
      ((rtb_TmpSignalConversionAticems_ <= HvCoorn_nEngStrt2HvDisbUppr_C) &&
       (rtb_TmpSignalConversionAticems_ >= HvCoorn_nEngStrt2HvDisbLowr_C))) {
    /* Sum: '<S339>/Subtract1' incorporates:
     *  Constant: '<S339>/single1'
     *  UnitDelay: '<S339>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_cp < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_cp)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_cp > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_cp)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_cp + 1;
    }

    /* End of Sum: '<S339>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S339>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S339>/Switch' */

  /* Update for UnitDelay: '<S339>/Unit Delay' incorporates:
   *  Saturate: '<S339>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_cp = rtb_DataTypeConversion_jq;

  /* Product: '<S339>/Divide' incorporates:
   *  Constant: '<S323>/Calibration1'
   *
   * Block description for '<S323>/Calibration1':
   *  [0.5]
   */
  tmpRead_i = HvCoorn_tiEngStrt2HvDisbThd_C / HvCoorn_ConstB.Max_dl;

  /* DataTypeConversion: '<S339>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S339>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S339>/DataTypeConversion'
   *  Saturate: '<S339>/Saturation2'
   */
  HvCoorn_bEngStrt2HvDisb = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Logic: '<S324>/OR' incorporates:
   *  Constant: '<S324>/icbms_undefined7'
   *  Constant: '<S324>/icbms_undefined8'
   *  RelationalOperator: '<S324>/Relational Operator1'
   *  RelationalOperator: '<S324>/Relational Operator8'
   *
   * Block description for '<S324>/icbms_undefined7':
   *  [1]
   *
   * Block description for '<S324>/icbms_undefined8':
   *  [1]
   */
  HvCoorn_bHvDcnct2HvReq = ((rtb_TmpSignalConversionAticbm_b == ((uint8)1U)) ||
    (rtb_TmpSignalConversionAticb_dk == ((uint8)1U)));

  /* Switch: '<S340>/Switch' incorporates:
   *  Constant: '<S324>/icbms_undefined1'
   *  Constant: '<S324>/icemsSt_Run_SC3'
   *  Logic: '<S324>/AND'
   *  RelationalOperator: '<S324>/Equal1'
   *  RelationalOperator: '<S324>/Relational Operator2'
   *  UnitDelay: '<S3>/UnitDelay'
   *
   * Block description for '<S324>/icbms_undefined1':
   *  [2]
   *
   * Block description for '<S324>/icemsSt_Run_SC3':
   *  [5]
   */
  if ((HvCoorn_stVoltMod == ((uint8)2U)) && (rtb_TmpSignalConversionAticb_ke <
       HvCoorn_iHvBatHvDisb2HvDcnctThd_C)) {
    /* Sum: '<S340>/Subtract1' incorporates:
     *  Constant: '<S340>/single1'
     *  UnitDelay: '<S340>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_gm < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_gm)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_gm > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_gm)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_gm + 1;
    }

    /* End of Sum: '<S340>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S340>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S340>/Switch' */

  /* Update for UnitDelay: '<S340>/Unit Delay' incorporates:
   *  Saturate: '<S340>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_gm = rtb_DataTypeConversion_jq;

  /* Product: '<S340>/Divide' incorporates:
   *  Constant: '<S324>/Calibration2'
   *
   * Block description for '<S324>/Calibration2':
   *  [0.03]
   */
  tmpRead_i = HvCoorn_tiHvDisb2HvDcnctThd_C / HvCoorn_ConstB.Max_ob;

  /* DataTypeConversion: '<S340>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S324>/OR1' incorporates:
   *  DataTypeConversion: '<S340>/DataTypeConversion'
   *  RelationalOperator: '<S340>/Relational Operator1'
   *  Saturate: '<S340>/Saturation2'
   */
  HvCoorn_bHvDisb2HvDcnct = (HvCoorn_bHvDcnct2HvReq ||
    (rtb_DataTypeConversion_jq > (sint32)tmpRead_i));

  /* Switch: '<S341>/Switch' incorporates:
   *  Constant: '<S325>/sup_uIpuShutdown_C'
   *  Constant: '<S325>/uint8'
   *  Logic: '<S325>/AND'
   *  MinMax: '<S325>/MinMax'
   *  RelationalOperator: '<S325>/Equal1'
   *  RelationalOperator: '<S325>/Relational Operator7'
   *
   * Block description for '<S325>/sup_uIpuShutdown_C':
   *  [220]
   */
  if ((fmaxf(fmaxf(rtb_TmpSignalConversionAticfm_u,
                   rtb_TmpSignalConversionAticrm_u),
             rtb_TmpSignalConversionAticisg_) > HvCoorn_uMax4VoltModRdy_C) &&
      (rtb_TmpSignalConversionAtici_ec == ((uint8)4U))) {
    /* Sum: '<S341>/Subtract1' incorporates:
     *  Constant: '<S341>/single1'
     *  UnitDelay: '<S341>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl2 < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl2)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl2 > 0) && (1 > MAX_int32_T -
                HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl2)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl2 + 1;
    }

    /* End of Sum: '<S341>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S341>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S341>/Switch' */

  /* Update for UnitDelay: '<S341>/Unit Delay' incorporates:
   *  Saturate: '<S341>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_dl2 = rtb_DataTypeConversion_jq;

  /* Product: '<S341>/Divide' incorporates:
   *  Constant: '<S325>/Calibration3'
   *
   * Block description for '<S325>/Calibration3':
   *  [1]
   */
  tmpRead_i = HvCoorn_tiHvReq2VoltModRdyThd_C / HvCoorn_ConstB.Max_b1;

  /* DataTypeConversion: '<S341>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S341>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S341>/DataTypeConversion'
   *  Saturate: '<S341>/Saturation2'
   */
  HvCoorn_bHvReq2VoltModRdy = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S322>/Calibration7'
   *  Constant: '<S322>/uint8'
   *  Logic: '<S322>/AND3'
   *  Logic: '<S322>/Not5'
   *  Logic: '<S322>/OR1'
   *  Logic: '<S322>/OR4'
   *  RelationalOperator: '<S322>/Equal'
   *
   * Block description for '<S322>/Calibration7':
   *  [0]
   */
  rtb_bGearOk = ((((HvCoorn_stHVP == ((uint8)89U)) ||
                   HvCoorn_bEngStrt2DftHVP89Shd_C) &&
                  (!rtb_TmpSignalConversionAtEngStr)) || rtb_AND9_c);

  /* Logic: '<S327>/Logical Operator1' incorporates:
   *  Logic: '<S329>/Logical Operator1'
   */
  rtb_RelationalOperator_no = !rtb_OR_jg;

  /* Logic: '<S329>/Logical_Operator4' incorporates:
   *  Logic: '<S327>/Logical Operator'
   *  Logic: '<S327>/Logical Operator1'
   *  Logic: '<S329>/Logical_Operator5'
   *  UnitDelay: '<S327>/Unit Delay2'
   *  UnitDelay: '<S329>/Unit Delay'
   */
  rtb_TmpSignalConversionAtved_bI = (rtb_RelationalOperator_no &&
    ((rtb_RelationalOperator_no && HvCoorn_ARID_DEF.UnitDelay2_DSTATE_mh) ||
     HvCoorn_ARID_DEF.UnitDelay_DSTATE_mj));

  /* Switch: '<S331>/Switch' */
  if (rtb_TmpSignalConversionAtved_bI) {
    /* Sum: '<S331>/Subtract1' incorporates:
     *  Constant: '<S331>/single1'
     *  UnitDelay: '<S331>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_jy < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_jy)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_jy > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_jy)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_jy + 1;
    }

    /* End of Sum: '<S331>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S331>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S331>/Switch' */

  /* Update for UnitDelay: '<S331>/Unit Delay' incorporates:
   *  Saturate: '<S331>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_jy = rtb_DataTypeConversion_jq;

  /* Product: '<S331>/Divide' incorporates:
   *  Constant: '<S322>/Calibration6'
   *
   * Block description for '<S322>/Calibration6':
   *  [1]
   */
  tmpRead_i = HvCoorn_tiEngStrt2DftFltRcvThd_C / HvCoorn_ConstB.Max_l5;

  /* DataTypeConversion: '<S331>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S31>/Equal3' incorporates:
   *  DataTypeConversion: '<S331>/DataTypeConversion'
   *  RelationalOperator: '<S331>/Relational Operator1'
   *  Saturate: '<S331>/Saturation2'
   */
  rtb_RelationalOperator_ce_idx_0 = (rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i);

  /* Logic: '<S322>/Not8' incorporates:
   *  Logic: '<S322>/Not10'
   *  Logic: '<S322>/Not11'
   *  Logic: '<S322>/Not7'
   *  Logic: '<S322>/Not9'
   */
  rtb_TmpSignalConversionAtEngS_n = !rtb_TmpSignalConversionAtEngS_n;

  /* Logic: '<S322>/OR2' incorporates:
   *  Logic: '<S322>/Not8'
   */
  HvCoorn_bEngStrt2Dft = (rtb_bGearOk || rtb_RelationalOperator_ce_idx_0 ||
    rtb_TmpSignalConversionAtEngS_n || rtb_TmpSignalConversionAtHybCoo);

  /* Logic: '<S322>/AND5' incorporates:
   *  Abs: '<S44>/Abs1'
   *  Constant: '<S322>/sup_pwrBatDchg4HvOn_C1'
   *  Constant: '<S322>/sup_pwrBatDchg4HvOn_C2'
   *  Constant: '<S322>/sup_tiKeyStrt_C4'
   *  Logic: '<S322>/AND4'
   *  Logic: '<S322>/OR5'
   *  Logic: '<S322>/OR6'
   *  RelationalOperator: '<S322>/Equal4'
   *  RelationalOperator: '<S322>/Relational Operator1'
   *  RelationalOperator: '<S322>/Relational Operator13'
   *
   * Block description for '<S322>/sup_pwrBatDchg4HvOn_C1':
   *  [6]
   *
   * Block description for '<S322>/sup_pwrBatDchg4HvOn_C2':
   *  [4]
   *
   * Block description for '<S322>/sup_tiKeyStrt_C4':
   *  [3]
   */
  HvCoorn_bBMSFltRcvGearPN = (((rtb_TmpSignalConversionAtGearLv == ((uint8)6U)) ||
    (rtb_TmpSignalConversionAtGearLv == ((uint8)4U)) ||
    (rtb_TmpSignalConversionAtBrkPed && (tmpRead_tmp <=
    HvCoorn_vVehSpdVoltModQuit_C))) && rtb_RelationalOperator_ce_idx_0);

  /* Logic: '<S322>/OR3' */
  HvCoorn_bHvDisb2Dft = (HvCoorn_bBMSFltRcvGearPN || rtb_bGearOk ||
    HvCoorn_bVoltModHvDisbOvtiErr || rtb_TmpSignalConversionAtEngS_n);

  /* Logic: '<S322>/OR7' */
  HvCoorn_bHvDcnct2Dft = (rtb_bGearOk || HvCoorn_bVoltModHvDcnctOvtiErr ||
    rtb_TmpSignalConversionAtEngS_n);

  /* Logic: '<S322>/OR8' */
  HvCoorn_bHvReq2Dft = (rtb_bGearOk || HvCoorn_bVoltModHvReqOvtiErr ||
                        rtb_TmpSignalConversionAtEngS_n);

  /* Logic: '<S322>/OR9' */
  HvCoorn_bVoltModRdy2Dft = (rtb_bGearOk || rtb_TmpSignalConversionAtEngS_n);

  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S322>/uint1'
   *  Constant: '<S322>/uint2'
   *  Logic: '<S322>/AND6'
   *  Logic: '<S322>/OR10'
   *  RelationalOperator: '<S322>/Equal5'
   *  RelationalOperator: '<S322>/Equal6'
   */
  rtb_bGearOk = (((HvCoorn_stHVP != ((uint8)89U)) && (HvCoorn_stHVP != ((uint8)
    90U))) || rtb_AND9_c);

  /* Switch: '<S336>/Switch' incorporates:
   *  Constant: '<S322>/icbms_undefined4'
   *  RelationalOperator: '<S322>/Equal8'
   *  UnitDelay: '<S3>/UnitDelay'
   *
   * Block description for '<S322>/icbms_undefined4':
   *  [6]
   */
  if (HvCoorn_stVoltMod == ((uint8)6U)) {
    /* Sum: '<S336>/Subtract1' incorporates:
     *  Constant: '<S336>/single1'
     *  UnitDelay: '<S336>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_av < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_av)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_av > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_av)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_av + 1;
    }

    /* End of Sum: '<S336>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S336>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S336>/Switch' */

  /* Update for UnitDelay: '<S336>/Unit Delay' incorporates:
   *  Saturate: '<S336>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_av = rtb_DataTypeConversion_jq;

  /* Product: '<S336>/Divide' incorporates:
   *  Constant: '<S322>/Calibration9'
   *
   * Block description for '<S322>/Calibration9':
   *  [5]
   */
  tmpRead_i = HvCoorn_tiHvInitTiOverThd_C / HvCoorn_ConstB.Max_dj;

  /* DataTypeConversion: '<S336>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S322>/OR11' incorporates:
   *  DataTypeConversion: '<S336>/DataTypeConversion'
   *  RelationalOperator: '<S336>/Relational Operator1'
   *  Saturate: '<S336>/Saturation2'
   */
  HvCoorn_bHvInit2Dft = (rtb_bGearOk || (rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i));

  /* Switch: '<S337>/Switch' incorporates:
   *  Constant: '<S322>/icbms_undefined5'
   *  RelationalOperator: '<S322>/Equal9'
   *  UnitDelay: '<S3>/UnitDelay'
   *
   * Block description for '<S322>/icbms_undefined5':
   *  [7]
   */
  if (HvCoorn_stVoltMod == ((uint8)7U)) {
    /* Sum: '<S337>/Subtract1' incorporates:
     *  Constant: '<S337>/single1'
     *  UnitDelay: '<S337>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ni < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ni)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ni > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ni)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ni + 1;
    }

    /* End of Sum: '<S337>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S337>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S337>/Switch' */

  /* Update for UnitDelay: '<S337>/Unit Delay' incorporates:
   *  Saturate: '<S337>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ni = rtb_DataTypeConversion_jq;

  /* Product: '<S337>/Divide' incorporates:
   *  Constant: '<S322>/Calibration10'
   *
   * Block description for '<S322>/Calibration10':
   *  [5]
   */
  tmpRead_i = HvCoorn_tiHvCntTiOverThd_C / HvCoorn_ConstB.Max_jv;

  /* DataTypeConversion: '<S337>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S322>/OR12' incorporates:
   *  DataTypeConversion: '<S337>/DataTypeConversion'
   *  RelationalOperator: '<S337>/Relational Operator1'
   *  Saturate: '<S337>/Saturation2'
   */
  HvCoorn_bHvCnt2Dft = (rtb_bGearOk || (rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i));

  /* Switch: '<S338>/Switch' incorporates:
   *  Constant: '<S322>/icbms_undefined10'
   *  RelationalOperator: '<S322>/Equal12'
   *  UnitDelay: '<S3>/UnitDelay'
   *
   * Block description for '<S322>/icbms_undefined10':
   *  [8]
   */
  if (HvCoorn_stVoltMod == ((uint8)8U)) {
    /* Sum: '<S338>/Subtract1' incorporates:
     *  Constant: '<S338>/single1'
     *  UnitDelay: '<S338>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_af < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_af)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_af > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_af)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_af + 1;
    }

    /* End of Sum: '<S338>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S338>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S338>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/HvGrid_pwrLoadAct' */
  (void)Rte_Read_HvGrid_pwrLoadAct_Value(&tmpRead_e);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S338>/Unit Delay' incorporates:
   *  Saturate: '<S338>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_af = rtb_DataTypeConversion_jq;

  /* Product: '<S338>/Divide' incorporates:
   *  Constant: '<S322>/Calibration11'
   *
   * Block description for '<S322>/Calibration11':
   *  [0.1]
   */
  tmpRead_i = HvCoorn_tiDCBuckTiOverThd_C / HvCoorn_ConstB.Max_al;

  /* DataTypeConversion: '<S338>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S338>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S338>/DataTypeConversion'
   *  Saturate: '<S338>/Saturation2'
   */
  HvCoorn_bDCBuck2Dft = (rtb_DataTypeConversion_jq > (sint32)tmpRead_i);

  /* Logic: '<S326>/AND' incorporates:
   *  Constant: '<S326>/uint1'
   *  Constant: '<S326>/uint8'
   *  Logic: '<S326>/OR2'
   *  RelationalOperator: '<S326>/Equal'
   *  RelationalOperator: '<S326>/Equal1'
   */
  HvCoorn_bHvDcnct2HvInit = (((HvCoorn_stHVP == ((uint8)89U)) || (HvCoorn_stHVP ==
    ((uint8)90U))) && HvCoorn_bStartUpReq && HvCoorn_bBMSFltRcvGearPN);

  /* Logic: '<S326>/AND2' incorporates:
   *  Constant: '<S326>/Constant1'
   *  Constant: '<S326>/Constant3'
   *  Constant: '<S326>/sup_tiKeyStrt_C4'
   *  Constant: '<S326>/uint2'
   *  Constant: '<S326>/uint3'
   *  Constant: '<S326>/uint5'
   *  Logic: '<S326>/AND1'
   *  Logic: '<S326>/OR'
   *  Logic: '<S326>/OR1'
   *  RelationalOperator: '<S326>/Equal2'
   *  RelationalOperator: '<S326>/Equal3'
   *  RelationalOperator: '<S326>/Equal4'
   *  RelationalOperator: '<S326>/Equal5'
   *  RelationalOperator: '<S326>/Equal6'
   *  RelationalOperator: '<S326>/Equal7'
   *
   * Block description for '<S326>/Constant1':
   *  [2]
   *
   * Block description for '<S326>/Constant3':
   *  [2]
   *
   * Block description for '<S326>/sup_tiKeyStrt_C4':
   *  [500]
   */
  HvCoorn_bHvInit2HvCnt = (HvCoorn_bHvDcnct2HvInit &&
    (((rtb_TmpSignalConversionAticfm_s == ((uint8)2U)) ||
      rtb_TmpSignalConversionAtVehC_i) && (rtb_TmpSignalConversionAticrm_s ==
    ((uint8)2U)) && (rtb_TmpSignalConversionAticdc_s == ((uint8)2U)) &&
     ((rtb_TmpSignalConversionAtici_ec == ((uint8)1U)) ||
      (rtb_TmpSignalConversionAtici_ec == ((uint8)2U))) && (tmpRead_e <
    HvCoorn_pwrLoadActHvInit2HvCnt_C)));

  /* Logic: '<S326>/AND3' incorporates:
   *  Constant: '<S326>/sup_uThres_C'
   *  RelationalOperator: '<S326>/Relational Operator1'
   *
   * Block description for '<S326>/sup_uThres_C':
   *  [220]
   */
  HvCoorn_bHvCnt2DCBuck = (HvCoorn_bHvDcnct2HvInit &&
    (rtb_TmpSignalConversionAticeb_g >= HvCoorn_uThd4HvCnt2DCBuck_C));

  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S322>/icbms_undefined3'
   *  RelationalOperator: '<S322>/Equal7'
   *  UnitDelay: '<S3>/UnitDelay'
   *
   * Block description for '<S322>/icbms_undefined3':
   *  [6]
   */
  rtb_bGearOk = (HvCoorn_stVoltMod == ((uint8)6U));

  /* RelationalOperator: '<S31>/Equal3' incorporates:
   *  Constant: '<S322>/icbms_undefined6'
   *  RelationalOperator: '<S322>/Equal10'
   *  UnitDelay: '<S3>/UnitDelay'
   *
   * Block description for '<S322>/icbms_undefined6':
   *  [7]
   */
  rtb_RelationalOperator_ce_idx_0 = (HvCoorn_stVoltMod == ((uint8)7U));

  /* Logic: '<S31>/AND7' incorporates:
   *  Constant: '<S322>/icbms_undefined8'
   *  RelationalOperator: '<S322>/Equal11'
   *  UnitDelay: '<S3>/UnitDelay'
   *
   * Block description for '<S322>/icbms_undefined8':
   *  [8]
   */
  rtb_AND7_j = (HvCoorn_stVoltMod == ((uint8)8U));

  /* RelationalOperator: '<S31>/Equal12' incorporates:
   *  Logic: '<S328>/Logical Operator'
   *  Logic: '<S328>/Logical Operator1'
   *  UnitDelay: '<S328>/Unit Delay2'
   */
  rtb_Equal12_a = (HvCoorn_bDft2EngStrt &&
                   (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_oc));

  /* Logic: '<S330>/Logical_Operator4' incorporates:
   *  Logic: '<S322>/AND7'
   *  Logic: '<S322>/AND8'
   *  Logic: '<S322>/Not13'
   *  Logic: '<S322>/Not14'
   *  Logic: '<S330>/Logical Operator1'
   *  Logic: '<S330>/Logical_Operator5'
   *  UnitDelay: '<S330>/Unit Delay'
   */
  rtb_AND8_k = (HvCoorn_bDft2EngStrt && rtb_bGearOk && ((rtb_bGearOk &&
    rtb_Equal12_a) || HvCoorn_ARID_DEF.UnitDelay_DSTATE_hk[0]));
  rtb_RelationalOperator_gn = (HvCoorn_bDft2EngStrt &&
    rtb_RelationalOperator_ce_idx_0 && ((rtb_RelationalOperator_ce_idx_0 &&
    rtb_Equal12_a) || HvCoorn_ARID_DEF.UnitDelay_DSTATE_hk[1]));
  rtb_AND2_e = (HvCoorn_bDft2EngStrt && rtb_AND7_j && ((rtb_AND7_j &&
    rtb_Equal12_a) || HvCoorn_ARID_DEF.UnitDelay_DSTATE_hk[2]));

  /* Product: '<S335>/Divide' incorporates:
   *  Constant: '<S322>/Calibration8'
   *
   * Block description for '<S322>/Calibration8':
   *  [1]
   */
  tmpRead_i = HvCoorn_tiVoltModActvAgainThd_C / HvCoorn_ConstB.Max_bw;

  /* DataTypeConversion: '<S335>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      rtb_TmpSignalConversionAtPwrLim = floorf(tmpRead_i + 0.5F);
    } else {
      rtb_TmpSignalConversionAtPwrLim = 0.0F;
    }
  } else {
    rtb_TmpSignalConversionAtPwrLim = tmpRead_i;
  }

  /* Switch: '<S335>/Switch' */
  if (rtb_AND8_k) {
    /* Sum: '<S335>/Subtract1' incorporates:
     *  Constant: '<S335>/single1'
     *  UnitDelay: '<S335>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[0] < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[0])) {
      /* Switch: '<S335>/Switch' */
      HvCoorn_stTboxByte7Req_tmp = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[0] > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[0])) {
      /* Switch: '<S335>/Switch' */
      HvCoorn_stTboxByte7Req_tmp = MAX_int32_T;
    } else {
      /* Switch: '<S335>/Switch' */
      HvCoorn_stTboxByte7Req_tmp = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[0] + 1;
    }
  } else {
    /* Switch: '<S335>/Switch' incorporates:
     *  Constant: '<S335>/single2'
     */
    HvCoorn_stTboxByte7Req_tmp = 0;
  }

  /* SignalConversion: '<S322>/Signal Copy' incorporates:
   *  DataTypeConversion: '<S335>/DataTypeConversion'
   *  RelationalOperator: '<S335>/Relational Operator1'
   */
  HvCoorn_bHvInit2EngStrt = (HvCoorn_stTboxByte7Req_tmp > (sint32)
    rtb_TmpSignalConversionAtPwrLim);

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Switch: '<S335>/Switch' */
  rtb_Switch_k_idx_0 = HvCoorn_stTboxByte7Req_tmp;

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Switch: '<S335>/Switch' */
  if (rtb_RelationalOperator_gn) {
    /* Sum: '<S335>/Subtract1' incorporates:
     *  Constant: '<S335>/single1'
     *  UnitDelay: '<S335>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[1] < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[1])) {
      /* Switch: '<S335>/Switch' */
      HvCoorn_stTboxByte7Req_tmp = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[1] > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[1])) {
      /* Switch: '<S335>/Switch' */
      HvCoorn_stTboxByte7Req_tmp = MAX_int32_T;
    } else {
      /* Switch: '<S335>/Switch' */
      HvCoorn_stTboxByte7Req_tmp = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[1] + 1;
    }
  } else {
    /* Switch: '<S335>/Switch' incorporates:
     *  Constant: '<S335>/single2'
     */
    HvCoorn_stTboxByte7Req_tmp = 0;
  }

  /* SignalConversion: '<S322>/Signal Copy1' incorporates:
   *  DataTypeConversion: '<S335>/DataTypeConversion'
   *  RelationalOperator: '<S335>/Relational Operator1'
   */
  HvCoorn_bHvCnt2EngStrt = (HvCoorn_stTboxByte7Req_tmp > (sint32)
    rtb_TmpSignalConversionAtPwrLim);

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Switch: '<S335>/Switch' */
  rtb_Switch_k_idx_1 = HvCoorn_stTboxByte7Req_tmp;

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Switch: '<S335>/Switch' */
  if (rtb_AND2_e) {
    /* Sum: '<S335>/Subtract1' incorporates:
     *  Constant: '<S335>/single1'
     *  UnitDelay: '<S335>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[2] < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[2])) {
      /* Switch: '<S335>/Switch' */
      HvCoorn_stTboxByte7Req_tmp = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[2] > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[2])) {
      /* Switch: '<S335>/Switch' */
      HvCoorn_stTboxByte7Req_tmp = MAX_int32_T;
    } else {
      /* Switch: '<S335>/Switch' */
      HvCoorn_stTboxByte7Req_tmp = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[2] + 1;
    }
  } else {
    /* Switch: '<S335>/Switch' incorporates:
     *  Constant: '<S335>/single2'
     */
    HvCoorn_stTboxByte7Req_tmp = 0;
  }

  /* DataTypeConversion: '<S335>/DataTypeConversion' */
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* SignalConversion: '<S322>/Signal Copy2' incorporates:
   *  DataTypeConversion: '<S335>/DataTypeConversion'
   *  RelationalOperator: '<S335>/Relational Operator1'
   */
  HvCoorn_bDCBuck2EngStrt = (HvCoorn_stTboxByte7Req_tmp > (sint32)tmpRead_i);

  /* Chart: '<S3>/A32_VoltModSts' */
  /* Gateway: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A32_VoltModSts */
  /* During: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A32_VoltModSts */
  if (HvCoorn_ARID_DEF.is_active_c3_HvCoorn == 0U) {
    /* Entry: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A32_VoltModSts */
    HvCoorn_ARID_DEF.is_active_c3_HvCoorn = 1U;

    /* Entry Internal: HvCoorn/HVP_HighVoltagePowerOnOffProcedure/A32_VoltModSts */
    /* Transition: '<S36>:2' */
    HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_Default;

    /* Entry 'Default': '<S36>:1' */
    HvCoorn_stVoltMod = HvCoorn_VoltMod_stDft_SC;

    /* 0 */
    HvCoorn_bVoltModStbReq = false;
  } else {
    switch (HvCoorn_ARID_DEF.is_c3_HvCoorn) {
     case HvCoorn_IN_DCDCBuck:
      HvCoorn_stVoltMod = HvCoorn_VoltMod_stDCBuck_SC;
      HvCoorn_bVoltModStbReq = true;

      /* During 'DCDCBuck': '<S36>:46' */
      if (HvCoorn_bDCBuck2Dft) {
        /* Transition: '<S36>:49' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_Default;

        /* Entry 'Default': '<S36>:1' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stDft_SC;

        /* 0 */
        HvCoorn_bVoltModStbReq = false;
      } else if (HvCoorn_bDCBuck2EngStrt) {
        /* Transition: '<S36>:51' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_EngStrt;

        /* Entry 'EngStrt': '<S36>:3' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stEngStrt_SC;

        /* 1 */
        HvCoorn_bVoltModStbReq = false;
      }
      break;

     case HvCoorn_IN_Default:
      HvCoorn_stVoltMod = HvCoorn_VoltMod_stDft_SC;
      HvCoorn_bVoltModStbReq = false;

      /* During 'Default': '<S36>:1' */
      if (HvCoorn_bDft2EngStrt) {
        /* Transition: '<S36>:5' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_EngStrt;

        /* Entry 'EngStrt': '<S36>:3' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stEngStrt_SC;

        /* 1 */
      }
      break;

     case HvCoorn_IN_EngStrt:
      HvCoorn_stVoltMod = HvCoorn_VoltMod_stEngStrt_SC;
      HvCoorn_bVoltModStbReq = false;

      /* During 'EngStrt': '<S36>:3' */
      if (HvCoorn_bEngStrt2HvDisb) {
        /* Transition: '<S36>:8' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_HvDisb;

        /* Entry 'HvDisb': '<S36>:6' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stHvDisb_SC;

        /* 2 */
        HvCoorn_bVoltModStbReq = true;
      } else if (HvCoorn_bEngStrt2Dft) {
        /* Transition: '<S36>:33' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_Default;

        /* Entry 'Default': '<S36>:1' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stDft_SC;

        /* 0 */
      }
      break;

     case HvCoorn_IN_HvCnt:
      HvCoorn_stVoltMod = HvCoorn_VoltMod_stHvCnt_SC;
      HvCoorn_bVoltModStbReq = true;

      /* During 'HvCnt': '<S36>:42' */
      if (HvCoorn_bHvCnt2DCBuck) {
        /* Transition: '<S36>:47' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_DCDCBuck;

        /* Entry 'DCDCBuck': '<S36>:46' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stDCBuck_SC;

        /* 8 */
      } else if (HvCoorn_bHvCnt2Dft) {
        /* Transition: '<S36>:48' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_Default;

        /* Entry 'Default': '<S36>:1' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stDft_SC;

        /* 0 */
        HvCoorn_bVoltModStbReq = false;
      } else if (HvCoorn_bHvCnt2EngStrt) {
        /* Transition: '<S36>:50' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_EngStrt;

        /* Entry 'EngStrt': '<S36>:3' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stEngStrt_SC;

        /* 1 */
        HvCoorn_bVoltModStbReq = false;
      }
      break;

     case HvCoorn_IN_HvDisb:
      HvCoorn_stVoltMod = HvCoorn_VoltMod_stHvDisb_SC;
      HvCoorn_bVoltModStbReq = true;

      /* During 'HvDisb': '<S36>:6' */
      if (HvCoorn_bHvDisb2HvDcnct) {
        /* Transition: '<S36>:11' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_VoltMod;
        HvCoorn_ARID_DEF.is_VoltMod = HvCoorn_IN_HvDcnct;

        /* Entry 'HvDcnct': '<S36>:9' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stHvDcnct_SC;

        /* 3 */
      } else if (HvCoorn_bHvDisb2Dft) {
        /* Transition: '<S36>:35' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_Default;

        /* Entry 'Default': '<S36>:1' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stDft_SC;

        /* 0 */
        HvCoorn_bVoltModStbReq = false;
      }
      break;

     case HvCoorn_IN_HvInitial:
      HvCoorn_stVoltMod = HvCoorn_VoltMod_stHvInitial_SC;
      HvCoorn_bVoltModStbReq = true;

      /* During 'HvInitial': '<S36>:38' */
      if (HvCoorn_bHvInit2HvCnt) {
        /* Transition: '<S36>:43' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_HvCnt;

        /* Entry 'HvCnt': '<S36>:42' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stHvCnt_SC;

        /* 7 */
      } else if (HvCoorn_bHvInit2Dft) {
        /* Transition: '<S36>:44' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_Default;

        /* Entry 'Default': '<S36>:1' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stDft_SC;

        /* 0 */
        HvCoorn_bVoltModStbReq = false;
      } else if (HvCoorn_bHvInit2EngStrt) {
        /* Transition: '<S36>:45' */
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_EngStrt;

        /* Entry 'EngStrt': '<S36>:3' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stEngStrt_SC;

        /* 1 */
        HvCoorn_bVoltModStbReq = false;
      }
      break;

     default:
      /* During 'VoltMod': '<S36>:16' */
      if (HvCoorn_bHvDcnct2HvInit) {
        /* Transition: '<S36>:39' */
        /* Exit Internal 'VoltMod': '<S36>:16' */
        HvCoorn_ARID_DEF.is_VoltMod = HvCoorn_IN_NO_ACTIVE_CHILD;
        HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_HvInitial;

        /* Entry 'HvInitial': '<S36>:38' */
        HvCoorn_stVoltMod = HvCoorn_VoltMod_stHvInitial_SC;

        /* 6 */
        HvCoorn_bVoltModStbReq = true;
      } else {
        switch (HvCoorn_ARID_DEF.is_VoltMod) {
         case HvCoorn_IN_HvDcnct:
          HvCoorn_stVoltMod = HvCoorn_VoltMod_stHvDcnct_SC;
          HvCoorn_bVoltModStbReq = true;

          /* During 'HvDcnct': '<S36>:9' */
          if (HvCoorn_bHvDcnct2HvReq) {
            /* Transition: '<S36>:13' */
            HvCoorn_ARID_DEF.is_VoltMod = HvCoorn_IN_HvReq;

            /* Entry 'HvReq': '<S36>:12' */
            HvCoorn_stVoltMod = HvCoorn_VoltMod_stHvReq_SC;

            /* 4 */
          } else if (HvCoorn_bHvDcnct2Dft) {
            /* Transition: '<S36>:37' */
            HvCoorn_ARID_DEF.is_VoltMod = HvCoorn_IN_NO_ACTIVE_CHILD;
            HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_Default;

            /* Entry 'Default': '<S36>:1' */
            HvCoorn_stVoltMod = HvCoorn_VoltMod_stDft_SC;

            /* 0 */
            HvCoorn_bVoltModStbReq = false;
          }
          break;

         case HvCoorn_IN_HvReq:
          HvCoorn_stVoltMod = HvCoorn_VoltMod_stHvReq_SC;
          HvCoorn_bVoltModStbReq = true;

          /* During 'HvReq': '<S36>:12' */
          if (HvCoorn_bHvReq2VoltModRdy) {
            /* Transition: '<S36>:15' */
            HvCoorn_ARID_DEF.is_VoltMod = HvCoorn_IN_VoltModRdy;

            /* Entry 'VoltModRdy': '<S36>:14' */
            HvCoorn_stVoltMod = HvCoorn_VoltMod_stVoltModRdy_SC;

            /* 5 */
            HvCoorn_bVoltModStbReq = false;
          } else if (HvCoorn_bHvReq2Dft) {
            /* Transition: '<S36>:40' */
            HvCoorn_ARID_DEF.is_VoltMod = HvCoorn_IN_NO_ACTIVE_CHILD;
            HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_Default;

            /* Entry 'Default': '<S36>:1' */
            HvCoorn_stVoltMod = HvCoorn_VoltMod_stDft_SC;

            /* 0 */
            HvCoorn_bVoltModStbReq = false;
          }
          break;

         default:
          HvCoorn_stVoltMod = HvCoorn_VoltMod_stVoltModRdy_SC;
          HvCoorn_bVoltModStbReq = false;

          /* During 'VoltModRdy': '<S36>:14' */
          if (HvCoorn_bVoltModRdy2Dft) {
            /* Transition: '<S36>:41' */
            HvCoorn_ARID_DEF.is_VoltMod = HvCoorn_IN_NO_ACTIVE_CHILD;
            HvCoorn_ARID_DEF.is_c3_HvCoorn = HvCoorn_IN_Default;

            /* Entry 'Default': '<S36>:1' */
            HvCoorn_stVoltMod = HvCoorn_VoltMod_stDft_SC;

            /* 0 */
          }
          break;
        }
      }
      break;
    }
  }

  /* End of Chart: '<S3>/A32_VoltModSts' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/Chrg_stChrg' */
  (void)Rte_Read_Chrg_stChrg_Value(&tmpRead_0);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S25>/Calibration4'
   *  Constant: '<S25>/ocm_discharge10'
   *  Logic: '<S25>/AND'
   *  RelationalOperator: '<S25>/Equal10'
   *  UnitDelay: '<S25>/UnitDelay'
   *
   * Block description for '<S25>/Calibration4':
   *  [0]
   *
   * Block description for '<S25>/ocm_discharge10':
   *  [0]
   */
  rtb_bGearOk = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_f15 && (HvCoorn_stVoltMod ==
    ((uint8)0U)) && HvCoorn_bVoltModHv2DftEna_C);

  /* RelationalOperator: '<S31>/Equal3' incorporates:
   *  Logic: '<S25>/Logical Operator10'
   */
  rtb_RelationalOperator_ce_idx_0 = !HvCoorn_bVoltModStbReq;

  /* Logic: '<S31>/AND7' incorporates:
   *  Constant: '<S25>/uint5'
   *  RelationalOperator: '<S25>/Relational Operator8'
   *
   * Block description for '<S25>/uint5':
   *  Ready
   */
  rtb_AND7_j = (HvCoorn_stHVP == ((uint8)90U));

  /* RelationalOperator: '<S31>/Equal12' incorporates:
   *  Constant: '<S25>/Calibration3'
   *  Constant: '<S25>/ocm_discharge9'
   *  Logic: '<S25>/Logical Operator14'
   *  Logic: '<S25>/OR5'
   *  RelationalOperator: '<S25>/Equal9'
   *
   * Block description for '<S25>/Calibration3':
   *  [0]
   *
   * Block description for '<S25>/ocm_discharge9':
   *  [5]
   */
  rtb_Equal12_a = (rtb_AND7_j || ((HvCoorn_stVoltMod == ((uint8)5U)) &&
    HvCoorn_bVoltModRdyDrvRdyEna_C));

  /* Logic: '<S25>/AND1' incorporates:
   *  Constant: '<S25>/ocm_discharge3'
   *  Constant: '<S25>/ocm_discharge5'
   *  Logic: '<S25>/OR'
   *  RelationalOperator: '<S25>/Equal4'
   *  RelationalOperator: '<S25>/Equal6'
   *
   * Block description for '<S25>/ocm_discharge3':
   *  [5]
   *
   * Block description for '<S25>/ocm_discharge5':
   *  [1]
   */
  HvCoorn_bRdyLamp = (rtb_RelationalOperator_ce_idx_0 && rtb_Equal12_a &&
                      ((rtb_TmpSignalConversionAtGearLv == ((uint8)5U)) ||
                       (rtb_TmpSignalConversionAtGearLv == ((uint8)1U))));

  /* RelationalOperator: '<S25>/Relational Operator7' incorporates:
   *  Constant: '<S25>/ChgFull'
   */
  rtb_TmpSignalConversionAtEngS_n = (tmpRead_0 < ((uint8)48U));

  /* RelationalOperator: '<S25>/Relational Operator5' incorporates:
   *  Constant: '<S25>/uint3'
   *
   * Block description for '<S25>/uint3':
   *  Ready
   */
  rtb_TmpSignalConversionAtEngStr = (HvCoorn_stHVP < ((uint8)90U));

  /* Logic: '<S25>/OR2' incorporates:
   *  Constant: '<S25>/ocm_discharge1'
   *  Constant: '<S25>/ocm_discharge2'
   *  Constant: '<S25>/ocm_discharge6'
   *  RelationalOperator: '<S25>/Equal1'
   *  RelationalOperator: '<S25>/Equal2'
   *  RelationalOperator: '<S25>/Equal5'
   *
   * Block description for '<S25>/ocm_discharge1':
   *  [4]
   *
   * Block description for '<S25>/ocm_discharge2':
   *  [3]
   *
   * Block description for '<S25>/ocm_discharge6':
   *  [5]
   */
  rtb_TmpSignalConversionAtBrkPed = ((HvCoorn_stVoltMod == ((uint8)4U)) ||
    (HvCoorn_stVoltMod == ((uint8)3U)) || (HvCoorn_stVoltMod == ((uint8)5U)));

  /* RelationalOperator: '<S219>/Relational Operator' incorporates:
   *  Constant: '<S219>/single4'
   *  UnitDelay: '<S219>/Unit Delay'
   */
  rtb_RelationalOperator_no = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_oo > 0);

  /* Switch: '<S25>/Switch7' incorporates:
   *  Constant: '<S25>/Calibration6'
   *  Constant: '<S25>/ocm_discharge7'
   *  Constant: '<S25>/ocm_discharge8'
   *  Constant: '<S25>/uint1'
   *  Constant: '<S25>/uint2'
   *  Constant: '<S25>/uint8'
   *  Logic: '<S219>/Logical Operator2'
   *  Logic: '<S25>/Logical Operator15'
   *  Logic: '<S25>/Logical Operator2'
   *  Logic: '<S25>/OR3'
   *  Logic: '<S25>/OR4'
   *  Logic: '<S25>/OR6'
   *  RelationalOperator: '<S25>/Equal7'
   *  RelationalOperator: '<S25>/Equal8'
   *  RelationalOperator: '<S25>/Relational Operator1'
   *  RelationalOperator: '<S25>/Relational Operator2'
   *  RelationalOperator: '<S25>/Relational Operator3'
   *  Switch: '<S25>/Switch1'
   *  Switch: '<S25>/Switch3'
   *
   * Block description for '<S25>/Calibration6':
   *  [0]
   *
   * Block description for '<S25>/ocm_discharge7':
   *  [8]
   *
   * Block description for '<S25>/ocm_discharge8':
   *  [7]
   *
   * Block description for '<S25>/uint1':
   *  Shutdown_HV
   *
   * Block description for '<S25>/uint2':
   *  SystemEmergencyShutDown
   *
   * Block description for '<S25>/uint8':
   *  HvContactorRequest
   */
  if (rtb_TmpSignalConversionAtBrkPed || (rtb_RelationalOperator_no ||
       rtb_bGearOk)) {
    /* Switch: '<S25>/Switch7' incorporates:
     *  Constant: '<S25>/FALSE1'
     *
     * Block description for '<S25>/FALSE1':
     *  FALSE
     */
    HvCoorn_bHvOnReq = false;
  } else if ((HvCoorn_stVoltMod == ((uint8)7U)) || (HvCoorn_stVoltMod == ((uint8)
               8U)) || ((HvCoorn_stHVP >= ((uint8)12U)) && (HvCoorn_stHVP <
               ((uint8)101U)))) {
    /* Switch: '<S25>/Switch7' incorporates:
     *  Constant: '<S25>/TRUE'
     *  Switch: '<S25>/Switch3'
     *
     * Block description for '<S25>/TRUE':
     *  TRUE
     */
    HvCoorn_bHvOnReq = true;
  } else if ((HvCoorn_stHVP != ((uint8)151U)) || (!HvCoorn_bEmgyShtDwnReqEna_C))
  {
    /* Switch: '<S25>/Switch7' incorporates:
     *  Constant: '<S25>/FALSE'
     *  Switch: '<S25>/Switch1'
     *  Switch: '<S25>/Switch3'
     *
     * Block description for '<S25>/FALSE':
     *  FALSE
     */
    HvCoorn_bHvOnReq = false;
  }

  /* End of Switch: '<S25>/Switch7' */

  /* Logic: '<S218>/Logical_Operator4' incorporates:
   *  Logic: '<S218>/Logical_Operator5'
   *  Logic: '<S25>/Logical Operator6'
   *  UnitDelay: '<S218>/Unit Delay'
   */
  rtb_TmpSignalConversionAtHybCoo = (HvCoorn_bACChrgLink &&
    (HvCoorn_bACChrgLinkOk || HvCoorn_ARID_DEF.UnitDelay_DSTATE_hv));

  /* Logic: '<S25>/Logical Operator11' incorporates:
   *  Constant: '<S25>/Calibration2'
   *  Logic: '<S25>/Logical Operator13'
   *
   * Block description for '<S25>/Calibration2':
   *  [0]
   */
  HvCoorn_bDrvRdy = (rtb_Equal12_a && (rtb_RelationalOperator_ce_idx_0 ||
    HvCoorn_bVoltModRdyDrvRdyShd_C));

  /* Logic: '<S25>/OR1' incorporates:
   *  Constant: '<S25>/uint6'
   *  RelationalOperator: '<S25>/Relational Operator9'
   *
   * Block description for '<S25>/uint6':
   *  ReadyWait
   */
  HvCoorn_bHvReady = ((HvCoorn_stHVP == ((uint8)89U)) || rtb_AND7_j);

  /* Logic: '<S25>/Logical Operator5' incorporates:
   *  Constant: '<S25>/Calibration1'
   *  Constant: '<S25>/ocm_discharge4'
   *  Logic: '<S25>/Logical Operator12'
   *  RelationalOperator: '<S25>/Equal3'
   *
   * Block description for '<S25>/Calibration1':
   *  [1]
   *
   * Block description for '<S25>/ocm_discharge4':
   *  [5]
   */
  HvCoorn_bEccEna = (((HvCoorn_stVoltMod != ((uint8)5U)) ||
                      HvCoorn_bVoltModRdyEccEna_C) && HvCoorn_bHvReady &&
                     rtb_RelationalOperator_ce_idx_0);

  /* Switch: '<S25>/Switch4' incorporates:
   *  Constant: '<S1>/TRUE'
   *  Constant: '<S25>/ocb_acCharge2'
   *  Constant: '<S25>/uint4'
   *  Logic: '<S25>/Logical Operator1'
   *  Logic: '<S25>/Logical Operator4'
   *  RelationalOperator: '<S25>/Relational Operator4'
   *  RelationalOperator: '<S25>/Relational Operator6'
   *  Switch: '<S25>/Switch2'
   *  Switch: '<S25>/Switch5'
   *  Switch: '<S25>/Switch6'
   *  UnitDelay: '<S25>/Unit Delay1'
   *
   * Block description for '<S1>/TRUE':
   *  TRUE
   *
   * Block description for '<S25>/ocb_acCharge2':
   *  [3]
   *
   * Block description for '<S25>/uint4':
   *  SystemEmergencyShutDown
   */
  if ((HvCoorn_stBMSModeReq != ((uint8)3U)) && true &&
      rtb_TmpSignalConversionAtChrg_a && HvCoorn_bHvOnReq &&
      rtb_TmpSignalConversionAtEngStr && rtb_TmpSignalConversionAtEngS_n) {
    /* Switch: '<S25>/Switch4' incorporates:
     *  Constant: '<S25>/ocb_acCharge1'
     *
     * Block description for '<S25>/ocb_acCharge1':
     *  [4]
     */
    HvCoorn_stBMSModeReq = ((uint8)4U);
  } else if (rtb_TmpSignalConversionAtEngS_n && rtb_TmpSignalConversionAtEngStr &&
             HvCoorn_bHvOnReq && rtb_TmpSignalConversionAtChr_kb &&
             rtb_TmpSignalConversionAtHybCoo) {
    /* Switch: '<S25>/Switch2' incorporates:
     *  Constant: '<S25>/ocb_acCharge'
     *  Switch: '<S25>/Switch4'
     *
     * Block description for '<S25>/ocb_acCharge':
     *  [3]
     */
    HvCoorn_stBMSModeReq = ((uint8)3U);
  } else if (HvCoorn_bHvOnReq) {
    /* Switch: '<S25>/Switch5' incorporates:
     *  Constant: '<S25>/ocb_online'
     *  Switch: '<S25>/Switch2'
     *  Switch: '<S25>/Switch4'
     *
     * Block description for '<S25>/ocb_online':
     *  [2]
     */
    HvCoorn_stBMSModeReq = ((uint8)2U);
  } else if (HvCoorn_stHVP >= ((uint8)151U)) {
    /* Switch: '<S25>/Switch6' incorporates:
     *  Constant: '<S25>/ocb_emergencyOffline'
     *  Switch: '<S25>/Switch2'
     *  Switch: '<S25>/Switch4'
     *  Switch: '<S25>/Switch5'
     *
     * Block description for '<S25>/ocb_emergencyOffline':
     *  [5]
     */
    HvCoorn_stBMSModeReq = ((uint8)5U);
  } else {
    /* Switch: '<S25>/Switch4' incorporates:
     *  Constant: '<S25>/ocb_offline'
     *  Switch: '<S25>/Switch2'
     *  Switch: '<S25>/Switch5'
     *  Switch: '<S25>/Switch6'
     *
     * Block description for '<S25>/ocb_offline':
     *  [1]
     */
    HvCoorn_stBMSModeReq = ((uint8)1U);
  }

  /* Switch: '<S219>/Switch' incorporates:
   *  Switch: '<S219>/Switch1'
   */
  if (rtb_bGearOk) {
    /* Product: '<S219>/Divide' incorporates:
     *  Constant: '<S25>/Calibration5'
     *
     * Block description for '<S25>/Calibration5':
     *  [0.3]
     */
    tmpRead_i = HvCoorn_tiVoltModHv2DftReqThd_C / HvCoorn_ConstB.Max_an;

    /* DataTypeConversion: '<S219>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S219>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_oo = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S219>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_oo = 0;
      }
    } else {
      /* Update for UnitDelay: '<S219>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_oo = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S219>/DataTypeConversion' */
  } else if (rtb_RelationalOperator_no) {
    /* Update for UnitDelay: '<S219>/Unit Delay' incorporates:
     *  Constant: '<S219>/single5'
     *  DataTypeConversion: '<S287>/DataTypeConversion'
     *  Sum: '<S219>/Subtract'
     *  Switch: '<S219>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_oo -= 1;
  }

  /* End of Switch: '<S219>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/icbms_bPlsHeatReq' */
  (void)Rte_Read_icbms_bPlsHeatReq_Value(&tmpRead_1);

  /* Inport: '<Root>/icecc_bStalHeatReq' */
  (void)Rte_Read_icecc_bStalHeatReq_Value(&tmpRead);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S26>/Constant'
   *  RelationalOperator: '<S26>/Lower'
   *
   * Block description for '<S26>/Constant':
   *  [2]
   */
  rtb_bGearOk = (rtb_TmpSignalConversionAtVehSpd < HvCoorn_vMax4MCUPlsHeatgEna_C);

  /* SignalConversion generated from: '<S1>/icrm_stPlsHeatg' incorporates:
   *  Inport: '<Root>/icrm_stPlsHeatg'
   */
  (void)Rte_Read_icrm_stPlsHeatg_Value(&rtb_TmpSignalConversionAticrm_i);

  /* Logic: '<S26>/AND' incorporates:
   *  Constant: '<S26>/Constant1'
   *  Constant: '<S26>/icbms_online'
   *  Constant: '<S26>/ocm_discharge1'
   *  Constant: '<S26>/ocm_discharge3'
   *  Constant: '<S26>/ocm_discharge5'
   *  Logic: '<S26>/OR'
   *  RelationalOperator: '<S26>/Equal1'
   *  RelationalOperator: '<S26>/Equal2'
   *  RelationalOperator: '<S26>/Equal4'
   *  RelationalOperator: '<S26>/Equal6'
   *
   * Block description for '<S26>/Constant1':
   *  [0]
   *
   * Block description for '<S26>/icbms_online':
   *  [4]
   *
   * Block description for '<S26>/ocm_discharge1':
   *  [3]
   *
   * Block description for '<S26>/ocm_discharge3':
   *  [5]
   *
   * Block description for '<S26>/ocm_discharge5':
   *  [1]
   */
  HvCoorn_bRMCUPlsHeatgActvRaw = (HvCoorn_bRMCUPlsHeatgEna_C &&
    (rtb_TmpSignalConversionAticbm_d == ((uint8)4U)) && rtb_bGearOk &&
    ((rtb_TmpSignalConversionAtGearLv != ((uint8)5U)) &&
     (rtb_TmpSignalConversionAtGearLv != ((uint8)1U))) && tmpRead_1 &&
    (rtb_TmpSignalConversionAticrm_i != ((uint8)3U)));

  /* SignalConversion generated from: '<S1>/icrm_stStalHeatg' incorporates:
   *  Inport: '<Root>/icrm_stStalHeatg'
   */
  (void)Rte_Read_icrm_stStalHeatg_Value(&rtb_TmpSignalConversionAticr_lo);

  /* Logic: '<S26>/OR3' incorporates:
   *  Constant: '<S26>/Constant5'
   *  Constant: '<S26>/icbms_online2'
   *  Constant: '<S26>/ocm_discharge6'
   *  Constant: '<S26>/ocm_discharge7'
   *  Constant: '<S26>/ocm_discharge9'
   *  RelationalOperator: '<S26>/Equal10'
   *  RelationalOperator: '<S26>/Equal12'
   *  RelationalOperator: '<S26>/Equal8'
   *  RelationalOperator: '<S26>/Equal9'
   *
   * Block description for '<S26>/Constant5':
   *  [1]
   *
   * Block description for '<S26>/icbms_online2':
   *  [8]
   *
   * Block description for '<S26>/ocm_discharge6':
   *  [3]
   *
   * Block description for '<S26>/ocm_discharge7':
   *  [2]
   *
   * Block description for '<S26>/ocm_discharge9':
   *  [6]
   */
  HvCoorn_bRMCUStalHeatgActvRaw = (HvCoorn_bRMCUStalHeatgEna_C &&
    HvCoorn_bChrgLink && (rtb_TmpSignalConversionAtGearLv == ((uint8)6U)) &&
    rtb_bGearOk && (rtb_TmpSignalConversionAticbm_d == ((uint8)8U)) && tmpRead &&
    (rtb_TmpSignalConversionAticr_lo != ((uint8)3U)) &&
    (rtb_TmpSignalConversionAticr_lo != ((uint8)2U)));

  /* Switch: '<S224>/Switch2' incorporates:
   *  RelationalOperator: '<S222>/Relational Operator'
   *  Switch: '<S224>/Switch1'
   *  UnitDelay: '<S222>/Unit Delay2'
   */
  if (HvCoorn_bRMCUPlsHeatgActvRaw != HvCoorn_ARID_DEF.UnitDelay2_DSTATE_h) {
    /* Switch: '<S224>/Switch2' incorporates:
     *  Constant: '<S224>/Number1'
     */
    rtb_TmpSignalConversionAticb_ke = 0.0F;
  } else if (HvCoorn_bRMCUPlsHeatgActvRaw) {
    /* Switch: '<S224>/Switch1' incorporates:
     *  Constant: '<S26>/TaskTime_s2'
     *  Sum: '<S224>/Sum1'
     *  Switch: '<S224>/Switch2'
     *  UnitDelay: '<S224>/Unit Delay1'
     */
    rtb_TmpSignalConversionAticb_ke = 0.01F +
      HvCoorn_ARID_DEF.UnitDelay1_DSTATE_a;
  } else {
    /* Switch: '<S224>/Switch2' incorporates:
     *  Switch: '<S224>/Switch1'
     *  UnitDelay: '<S224>/Unit Delay1'
     */
    rtb_TmpSignalConversionAticb_ke = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_a;
  }

  /* End of Switch: '<S224>/Switch2' */

  /* Switch: '<S225>/Switch2' incorporates:
   *  RelationalOperator: '<S223>/Relational Operator'
   *  Switch: '<S225>/Switch1'
   *  UnitDelay: '<S223>/Unit Delay2'
   */
  if (HvCoorn_bRMCUStalHeatgActvRaw != HvCoorn_ARID_DEF.UnitDelay2_DSTATE_iq) {
    /* Switch: '<S225>/Switch2' incorporates:
     *  Constant: '<S225>/Number1'
     */
    rtb_Switch2_as = 0.0F;
  } else if (HvCoorn_bRMCUStalHeatgActvRaw) {
    /* Switch: '<S225>/Switch1' incorporates:
     *  Constant: '<S26>/TaskTime_s1'
     *  Sum: '<S225>/Sum1'
     *  Switch: '<S225>/Switch2'
     *  UnitDelay: '<S225>/Unit Delay1'
     */
    rtb_Switch2_as = 0.01F + HvCoorn_ARID_DEF.UnitDelay1_DSTATE_ae;
  } else {
    /* Switch: '<S225>/Switch2' incorporates:
     *  Switch: '<S225>/Switch1'
     *  UnitDelay: '<S225>/Unit Delay1'
     */
    rtb_Switch2_as = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_ae;
  }

  /* End of Switch: '<S225>/Switch2' */

  /* Logic: '<S26>/OR1' incorporates:
   *  Constant: '<S26>/Constant2'
   *  Constant: '<S26>/ocm_discharge2'
   *  Constant: '<S26>/ocm_discharge4'
   *  RelationalOperator: '<S26>/Equal3'
   *  RelationalOperator: '<S26>/Equal5'
   *  RelationalOperator: '<S26>/GreaterOrEqual'
   *
   * Block description for '<S26>/Constant2':
   *  [2]
   *
   * Block description for '<S26>/ocm_discharge2':
   *  [2]
   *
   * Block description for '<S26>/ocm_discharge4':
   *  [1]
   */
  HvCoorn_bRMCUPlsHeatgFlt = ((rtb_TmpSignalConversionAticb_ke >=
    HvCoorn_tiMCUPlsHeatgFlt_C) && (rtb_TmpSignalConversionAticrm_i != ((uint8)
    1U)) && (rtb_TmpSignalConversionAticrm_i != ((uint8)2U)));

  /* Logic: '<S26>/OR2' incorporates:
   *  Logic: '<S26>/NOT'
   */
  HvCoorn_bRMCUPlsHeatgReq = (HvCoorn_bRMCUPlsHeatgActvRaw &&
    (!HvCoorn_bRMCUPlsHeatgFlt));

  /* Logic: '<S26>/OR5' incorporates:
   *  Constant: '<S26>/Constant6'
   *  Constant: '<S26>/ocm_discharge8'
   *  RelationalOperator: '<S26>/Equal11'
   *  RelationalOperator: '<S26>/GreaterOrEqual1'
   *
   * Block description for '<S26>/Constant6':
   *  [2]
   *
   * Block description for '<S26>/ocm_discharge8':
   *  [1]
   */
  HvCoorn_bRMCUStalHeatgFlt = ((rtb_Switch2_as >= HvCoorn_tiMCUStalHeatgFlt_C) &&
    (rtb_TmpSignalConversionAticr_lo != ((uint8)1U)));

  /* Logic: '<S26>/OR7' incorporates:
   *  Logic: '<S26>/NOT1'
   */
  HvCoorn_bRMCUStalHeatgReq = (HvCoorn_bRMCUStalHeatgActvRaw &&
    (!HvCoorn_bRMCUStalHeatgFlt));

  /* Switch: '<S26>/Switch3' incorporates:
   *  Constant: '<S26>/Emergency_DisChErr'
   *  Constant: '<S26>/uint1'
   *  Constant: '<S26>/uint10'
   *  Constant: '<S26>/uint11'
   *  Constant: '<S26>/uint12'
   *  Constant: '<S26>/uint2'
   *  Constant: '<S26>/uint3'
   *  Constant: '<S26>/uint4'
   *  Constant: '<S26>/uint5'
   *  Constant: '<S26>/uint6'
   *  Constant: '<S26>/uint7'
   *  Constant: '<S26>/uint8'
   *  Constant: '<S26>/uint9'
   *  Logic: '<S26>/Logical Operator1'
   *  Logic: '<S26>/Logical Operator2'
   *  Logic: '<S26>/Logical Operator3'
   *  Logic: '<S26>/Logical Operator4'
   *  Logic: '<S26>/Logical Operator5'
   *  Logic: '<S26>/Logical Operator6'
   *  Logic: '<S26>/Logical Operator7'
   *  RelationalOperator: '<S26>/Relational Operator1'
   *  RelationalOperator: '<S26>/Relational Operator10'
   *  RelationalOperator: '<S26>/Relational Operator11'
   *  RelationalOperator: '<S26>/Relational Operator12'
   *  RelationalOperator: '<S26>/Relational Operator13'
   *  RelationalOperator: '<S26>/Relational Operator2'
   *  RelationalOperator: '<S26>/Relational Operator3'
   *  RelationalOperator: '<S26>/Relational Operator4'
   *  RelationalOperator: '<S26>/Relational Operator5'
   *  RelationalOperator: '<S26>/Relational Operator6'
   *  RelationalOperator: '<S26>/Relational Operator7'
   *  RelationalOperator: '<S26>/Relational Operator8'
   *  RelationalOperator: '<S26>/Relational Operator9'
   *  Switch: '<S26>/Switch1'
   *  Switch: '<S26>/Switch2'
   *  Switch: '<S26>/Switch5'
   *  Switch: '<S26>/Switch8'
   *
   * Block description for '<S26>/uint1':
   *  Shutdown_DisChErr
   *
   * Block description for '<S26>/uint10':
   *  Shutdown_MotDischarge
   *
   * Block description for '<S26>/uint11':
   *  Emergency_MotDischarge
   *
   * Block description for '<S26>/uint12':
   *  Ready
   *
   * Block description for '<S26>/uint2':
   *  HcuPowerShutDown
   *
   * Block description for '<S26>/uint3':
   *  HvContactorRequest
   *
   * Block description for '<S26>/uint4':
   *  SystemReadyWait
   *
   * Block description for '<S26>/uint5':
   *  Wait4ComMindChange
   *
   * Block description for '<S26>/uint6':
   *  Shutdown_HV
   *
   * Block description for '<S26>/uint7':
   *  Emergency_ShutDownIni
   *
   * Block description for '<S26>/uint8':
   *  Wait4Communication
   *
   * Block description for '<S26>/uint9':
   *  Emergency_ShutdownHV
   */
  if ((HvCoorn_stHVP <= ((uint8)11U)) || ((HvCoorn_stHVP >= ((uint8)110U)) &&
       (HvCoorn_stHVP <= ((uint8)130U))) || (HvCoorn_stHVP >= ((uint8)155U))) {
    /* Switch: '<S26>/Switch3' incorporates:
     *  Constant: '<S26>/ocm_standby'
     *
     * Block description for '<S26>/ocm_standby':
     *  [2]
     */
    rtb_TmpSignalConversionAticbm_d = ((uint8)2U);
  } else if (HvCoorn_bVoltModStbReq) {
    /* Switch: '<S26>/Switch8' incorporates:
     *  Constant: '<S26>/ocm_standby3'
     *  Switch: '<S26>/Switch3'
     *
     * Block description for '<S26>/ocm_standby3':
     *  [2]
     */
    rtb_TmpSignalConversionAticbm_d = ((uint8)2U);
  } else if (((HvCoorn_stHVP >= ((uint8)12U)) && (HvCoorn_stHVP <= ((uint8)90U)))
             || ((HvCoorn_stHVP >= ((uint8)91U)) && (HvCoorn_stHVP <= ((uint8)
                101U))) || ((HvCoorn_stHVP >= ((uint8)151U)) && (HvCoorn_stHVP <=
    ((uint8)152U)))) {
    /* Switch: '<S26>/Switch1' incorporates:
     *  Constant: '<S26>/ocm_ready'
     *  Switch: '<S26>/Switch3'
     *  Switch: '<S26>/Switch8'
     *
     * Block description for '<S26>/ocm_ready':
     *  [3]
     */
    rtb_TmpSignalConversionAticbm_d = ((uint8)3U);
  } else if ((HvCoorn_stHVP == ((uint8)105U)) || (HvCoorn_stHVP == ((uint8)154U)))
  {
    /* Switch: '<S26>/Switch5' incorporates:
     *  Constant: '<S26>/ocm_discharge'
     *  Switch: '<S26>/Switch1'
     *  Switch: '<S26>/Switch3'
     *  Switch: '<S26>/Switch8'
     *
     * Block description for '<S26>/ocm_discharge':
     *  [6]
     */
    rtb_TmpSignalConversionAticbm_d = ((uint8)6U);
  } else if (HvCoorn_stHVP == ((uint8)90U)) {
    /* Switch: '<S26>/Switch2' incorporates:
     *  Constant: '<S26>/ocm_trqCtrl'
     *  Switch: '<S26>/Switch1'
     *  Switch: '<S26>/Switch3'
     *  Switch: '<S26>/Switch5'
     *  Switch: '<S26>/Switch8'
     *
     * Block description for '<S26>/ocm_trqCtrl':
     *  [4]
     */
    rtb_TmpSignalConversionAticbm_d = ((uint8)4U);
  } else {
    /* Switch: '<S26>/Switch3' incorporates:
     *  Constant: '<S26>/ocm_standby1'
     *  Switch: '<S26>/Switch1'
     *  Switch: '<S26>/Switch2'
     *  Switch: '<S26>/Switch5'
     *  Switch: '<S26>/Switch8'
     *
     * Block description for '<S26>/ocm_standby1':
     *  [2]
     */
    rtb_TmpSignalConversionAticbm_d = ((uint8)2U);
  }

  /* End of Switch: '<S26>/Switch3' */

  /* Switch: '<S26>/Switch7' incorporates:
   *  Constant: '<S26>/uint13'
   *  RelationalOperator: '<S26>/Relational Operator14'
   *
   * Block description for '<S26>/uint13':
   *  Emergency_MotDischarge
   */
  if (HvCoorn_stHVP == ((uint8)154U)) {
    /* SignalConversion: '<S26>/Signal Copy' incorporates:
     *  Constant: '<S26>/uint14'
     */
    HvCoorn_stISGModeReq = ((uint8)7U);
  } else {
    /* SignalConversion: '<S26>/Signal Copy' */
    HvCoorn_stISGModeReq = rtb_TmpSignalConversionAticbm_d;
  }

  /* End of Switch: '<S26>/Switch7' */

  /* Switch: '<S26>/Switch4' */
  if (rtb_TmpSignalConversionAtVehC_i) {
    /* Switch: '<S26>/Switch4' incorporates:
     *  Constant: '<S26>/ocm_standby2'
     *
     * Block description for '<S26>/ocm_standby2':
     *  [2]
     */
    HvCoorn_stFMCUModeReq = ((uint8)2U);
  } else {
    /* Switch: '<S26>/Switch4' */
    HvCoorn_stFMCUModeReq = rtb_TmpSignalConversionAticbm_d;
  }

  /* End of Switch: '<S26>/Switch4' */

  /* Switch: '<S26>/Switch6' incorporates:
   *  Logic: '<S26>/Logical Operator10'
   */
  if (HvCoorn_bRMCUPlsHeatgReq || HvCoorn_bRMCUStalHeatgReq) {
    /* Switch: '<S26>/Switch6' incorporates:
     *  Constant: '<S26>/ocm_trqCtrl1'
     *
     * Block description for '<S26>/ocm_trqCtrl1':
     *  [4]
     */
    HvCoorn_stRMCUModeReq = ((uint8)4U);
  } else {
    /* Switch: '<S26>/Switch6' */
    HvCoorn_stRMCUModeReq = rtb_TmpSignalConversionAticbm_d;
  }

  /* End of Switch: '<S26>/Switch6' */

  /* RelationalOperator: '<S228>/Relational Operator' incorporates:
   *  Constant: '<S228>/single4'
   *  UnitDelay: '<S228>/Unit Delay'
   */
  rtb_TmpSignalConversionAtVehC_i = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_kf > 0);

  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S27>/uint1'
   *  RelationalOperator: '<S27>/Relational Operator3'
   *
   * Block description for '<S27>/uint1':
   *  DCDCBuckReq
   */
  rtb_bGearOk = (HvCoorn_stHVP < ((uint8)17U));

  /* Switch: '<S27>/Switch3' incorporates:
   *  Constant: '<S27>/ocm_discharge4'
   *  Constant: '<S27>/sup_vForShutDown_C'
   *  Constant: '<S27>/uint2'
   *  Constant: '<S27>/uint5'
   *  Logic: '<S228>/Logical Operator2'
   *  Logic: '<S27>/Logical Operator1'
   *  Logic: '<S27>/Logical Operator2'
   *  Logic: '<S27>/Logical Operator3'
   *  Logic: '<S27>/Logical Operator4'
   *  Logic: '<S27>/Logical Operator5'
   *  RelationalOperator: '<S27>/Equal3'
   *  RelationalOperator: '<S27>/Relational Operator1'
   *  RelationalOperator: '<S27>/Relational Operator2'
   *  RelationalOperator: '<S27>/Relational Operator6'
   *
   * Block description for '<S27>/ocm_discharge4':
   *  [8]
   *
   * Block description for '<S27>/sup_vForShutDown_C':
   *  [1.5]
   *
   * Block description for '<S27>/uint2':
   *  Wait4MindChange
   *
   * Block description for '<S27>/uint5':
   *  Wait4ComMindChange
   */
  if (rtb_TmpSignalConversionAtVehC_i || rtb_bGearOk || ((HvCoorn_stHVP >
        ((uint8)91U)) && ((HvCoorn_stHVP != ((uint8)95U)) || (tmpRead_tmp <=
         HvCoorn_v4ShutDown_C))) || (HvCoorn_bVoltModStbReq &&
       (HvCoorn_stVoltMod != ((uint8)8U)))) {
    /* Switch: '<S27>/Switch3' incorporates:
     *  Constant: '<S27>/ocdc_standbyDcdc'
     *
     * Block description for '<S27>/ocdc_standbyDcdc':
     *  [1]
     */
    HvCoorn_stDCDCModeReq = ((uint8)1U);
  } else {
    /* Switch: '<S27>/Switch3' incorporates:
     *  Constant: '<S27>/ocdc_buckDcdc'
     *
     * Block description for '<S27>/ocdc_buckDcdc':
     *  [2]
     */
    HvCoorn_stDCDCModeReq = ((uint8)2U);
  }

  /* End of Switch: '<S27>/Switch3' */

  /* Switch: '<S228>/Switch' incorporates:
   *  Switch: '<S228>/Switch1'
   */
  if (rtb_bGearOk) {
    /* Product: '<S228>/Divide' incorporates:
     *  Constant: '<S27>/Calibration2'
     *
     * Block description for '<S27>/Calibration2':
     *  [0.5]
     */
    tmpRead_i = HvCoorn_tiHvOnDCDCBuckDly_C / HvCoorn_ConstB.Max_la;

    /* DataTypeConversion: '<S228>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S228>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S228>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_kf = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S228>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         *  Saturate: '<S228>/Saturation2'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_kf = 0;
      }
    } else {
      /* Update for UnitDelay: '<S228>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       *  Saturate: '<S228>/Saturation2'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_kf = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S228>/DataTypeConversion' */
  } else if (rtb_TmpSignalConversionAtVehC_i) {
    /* Update for UnitDelay: '<S228>/Unit Delay' incorporates:
     *  Constant: '<S228>/single5'
     *  Saturate: '<S228>/Saturation2'
     *  Sum: '<S228>/Subtract'
     *  Switch: '<S228>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_kf -= 1;
  }

  /* End of Switch: '<S228>/Switch' */

  /* Switch: '<S28>/Switch3' incorporates:
   *  Constant: '<S28>/WakeUp'
   *  Constant: '<S28>/WakeUp1'
   *  Constant: '<S28>/WakeUp2'
   *  Constant: '<S28>/WakeUp3'
   *  Constant: '<S28>/WakeUp4'
   *  Logic: '<S28>/Logical Operator1'
   *  Logic: '<S28>/Logical Operator2'
   *  Logic: '<S28>/Logical Operator3'
   *  RelationalOperator: '<S28>/Relational Operator1'
   *  RelationalOperator: '<S28>/Relational Operator2'
   *  RelationalOperator: '<S28>/Relational Operator3'
   *  RelationalOperator: '<S28>/Relational Operator4'
   *  RelationalOperator: '<S28>/Relational Operator5'
   *  Switch: '<S28>/Switch1'
   *
   * Block description for '<S28>/WakeUp':
   *  WakeUp
   *
   * Block description for '<S28>/WakeUp1':
   *  Initial_Settings
   *
   * Block description for '<S28>/WakeUp2':
   *  NmHoldState
   *
   * Block description for '<S28>/WakeUp3':
   *  Emergency_ShutDownIni
   *
   * Block description for '<S28>/WakeUp4':
   *  Emergency_NmHoldState
   */
  if (((HvCoorn_stHVP >= ((uint8)10U)) && (HvCoorn_stHVP <= ((uint8)125U))) ||
      ((HvCoorn_stHVP >= ((uint8)151U)) && (HvCoorn_stHVP <= ((uint8)158U)))) {
    /* Switch: '<S28>/Switch3' incorporates:
     *  Constant: '<S28>/TRUE'
     *
     * Block description for '<S28>/TRUE':
     *  TRUE
     */
    HvCoorn_bHvilClsReq = true;
  } else if (HvCoorn_stHVP != ((uint8)1U)) {
    /* Switch: '<S28>/Switch3' incorporates:
     *  Constant: '<S28>/FALSE'
     *  Switch: '<S28>/Switch1'
     *
     * Block description for '<S28>/FALSE':
     *  FALSE
     */
    HvCoorn_bHvilClsReq = false;
  }

  /* End of Switch: '<S28>/Switch3' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/ipf_bPCAN0x343S2Vld' */
  (void)Rte_Read_ipf_bPCAN0x343S2Vld_Value(&rtb_AND13);

  /* Inport: '<Root>/ipf_bPCANBusOffErr' */
  (void)Rte_Read_ipf_bPCANBusOffErr_Value(&rtb_AND20_i);

  /* Inport: '<Root>/ipf_bPCAN0x110S1Vld' */
  (void)Rte_Read_ipf_bPCAN0x110S1Vld_Value(&rtb_AND21);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Logic: '<S232>/Logical_Operator4' incorporates:
   *  Constant: '<S29>/uint1'
   *  Constant: '<S29>/uint6'
   *  Logic: '<S231>/Logical Operator'
   *  Logic: '<S232>/Logical Operator1'
   *  Logic: '<S232>/Logical_Operator5'
   *  Logic: '<S29>/Logical Operator2'
   *  RelationalOperator: '<S29>/Relational Operator1'
   *  RelationalOperator: '<S29>/Relational Operator3'
   *  UnitDelay: '<S231>/Unit Delay2'
   *  UnitDelay: '<S232>/Unit Delay'
   *
   * Block description for '<S29>/uint1':
   *  Emergency_DisChErr
   *
   * Block description for '<S29>/uint6':
   *  Shutdown_DisChErr
   */
  HvCoorn_bActvDischargeErr = ((rtb_AND9_c ||
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_be) && ((HvCoorn_stHVP == ((uint8)110U)) ||
    (HvCoorn_stHVP == ((uint8)155U)) || HvCoorn_bActvDischargeErr));

  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S30>/uint5'
   *  Constant: '<S30>/uint6'
   *  Logic: '<S30>/AND29'
   *  RelationalOperator: '<S30>/Equal6'
   *  RelationalOperator: '<S30>/Equal7'
   */
  rtb_bGearOk = ((HvCoorn_stHVP >= ((uint8)17U)) && (HvCoorn_stHVP <= ((uint8)
    95U)));

  /* Logic: '<S30>/AND' */
  rtb_TmpSignalConversionAtChr_kb = (rtb_bGearOk && HvCoorn_bHvRlyOpenAct);

  /* SignalConversion generated from: '<S1>/DTC_bDiagEnaCdnWkupLong' incorporates:
   *  Inport: '<Root>/DTC_bDiagEnaCdnWkupLong'
   */
  (void)Rte_Read_DTC_bDiagEnaCdnWkupLong_Value(&rtb_TmpSignalConversionAtDTC__j);

  /* RelationalOperator: '<S31>/Equal3' incorporates:
   *  Constant: '<S30>/icbms_undefined9'
   *  RelationalOperator: '<S30>/Equal3'
   *
   * Block description for '<S30>/icbms_undefined9':
   *  [0]
   */
  rtb_RelationalOperator_ce_idx_0 = (HvCoorn_stVoltMod == ((uint8)0U));

  /* RelationalOperator: '<S245>/Relational Operator' incorporates:
   *  Constant: '<S245>/single4'
   *  UnitDelay: '<S245>/Unit Delay'
   */
  rtb_TmpSignalConversionAtVehC_i = (HvCoorn_ARID_DEF.UnitDelay_DSTATE_ds > 0);

  /* SignalConversion generated from: '<S1>/icbms_stChrgSts' incorporates:
   *  Inport: '<Root>/icbms_stChrgSts'
   */
  (void)Rte_Read_icbms_stChrgSts_Value(&rtb_TmpSignalConversionAticbm_j);

  /* Logic: '<S31>/AND7' incorporates:
   *  Constant: '<S30>/uint4'
   *  RelationalOperator: '<S30>/Equal'
   */
  rtb_AND7_j = (rtb_TmpSignalConversionAticbm_j == ((uint8)5U));

  /* Logic: '<S30>/Not' incorporates:
   *  Logic: '<S245>/Logical Operator2'
   */
  HvCoorn_bHeatgDly4ChkErr = ((!rtb_TmpSignalConversionAtVehC_i) && (!rtb_AND7_j));

  /* Logic: '<S30>/AND1' incorporates:
   *  Logic: '<S30>/AND12'
   *  Logic: '<S30>/AND23'
   *  Logic: '<S30>/AND25'
   */
  tmpRead_1 = (rtb_TmpSignalConversionAtDTC__j &&
               rtb_TmpSignalConversionAtipf_bP);

  /* RelationalOperator: '<S31>/Equal12' incorporates:
   *  Logic: '<S30>/AND1'
   */
  rtb_Equal12_a = (tmpRead_1 && rtb_AND13 && rtb_RelationalOperator_ce_idx_0 &&
                   HvCoorn_bHeatgDly4ChkErr);

  /* Logic: '<S30>/AND12' incorporates:
   *  Constant: '<S30>/uint3'
   *  RelationalOperator: '<S30>/Equal5'
   */
  rtb_AND12_o = (tmpRead_1 && (HvCoorn_stHVP == ((uint8)12U)));

  /* Logic: '<S30>/AND13' incorporates:
   *  Logic: '<S30>/AND11'
   */
  rtb_AND13 = (rtb_TmpSignalConversionAtDTC_bD || (!rtb_AND12_o));

  /* Logic: '<S30>/AND14' */
  rtb_AND14_l = (rtb_TmpSignalConversionAtDTC__j &&
                 rtb_TmpSignalConversionAtipf__i && rtb_AND21);

  /* Logic: '<S30>/AND15' incorporates:
   *  Logic: '<S30>/AND18'
   */
  rtb_AND15_f = (rtb_TmpSignalConversionAtDTC__c && (!rtb_AND20_i));

  /* Logic: '<S30>/AND17' incorporates:
   *  Logic: '<S30>/AND16'
   */
  rtb_TmpSignalConversionAtipf__i = (rtb_TmpSignalConversionAtDTC_bD ||
    (!rtb_AND15_f));

  /* Logic: '<S30>/AND2' incorporates:
   *  Logic: '<S30>/AND4'
   */
  rtb_TmpSignalConversionAtChrg_a = (rtb_TmpSignalConversionAtDTC_bD ||
    (!rtb_Equal12_a));

  /* Switch: '<S244>/Switch' incorporates:
   *  Constant: '<S30>/uint1'
   *  RelationalOperator: '<S30>/LowerOrEqual1'
   */
  if (HvCoorn_stHVP == ((uint8)105U)) {
    /* Sum: '<S244>/Subtract1' incorporates:
     *  Constant: '<S244>/single1'
     *  UnitDelay: '<S244>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_lh < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_lh)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_lh > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_lh)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_lh + 1;
    }

    /* End of Sum: '<S244>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S244>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S244>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/DTC_bBMSFltLvl6' */
  (void)Rte_Read_DTC_bBMSFltLvl6_Value(&rtb_AND32_f);

  /* Inport: '<Root>/icbms_bIsolFlt' */
  (void)Rte_Read_icbms_bIsolFlt_Value(&rtb_AND7_g);

  /* Inport: '<Root>/ipf_bPCAN0x340S1Vld' */
  (void)Rte_Read_ipf_bPCAN0x340S1Vld_Value(&rtb_AND5_g);

  /* Inport: '<Root>/ipf_bPCAN0x353Vld' */
  (void)Rte_Read_ipf_bPCAN0x353Vld_Value(&rtb_AND8_p);

  /* Inport: '<Root>/icbms_uDCLnk' */
  (void)Rte_Read_icbms_uDCLnk_Value(&tmpRead_2);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Update for UnitDelay: '<S244>/Unit Delay' incorporates:
   *  Saturate: '<S244>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_lh = rtb_DataTypeConversion_jq;

  /* Product: '<S244>/Divide' incorporates:
   *  Constant: '<S30>/Calibration17'
   *
   * Block description for '<S30>/Calibration17':
   *  [3]
   */
  tmpRead_i = HvCoorn_tiDchrgOvtiChkThd_C / HvCoorn_ConstB.Max_bg;

  /* DataTypeConversion: '<S244>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S30>/AND20' incorporates:
   *  Constant: '<S30>/Calibration18'
   *  DataTypeConversion: '<S244>/DataTypeConversion'
   *  MinMax: '<S30>/Min1'
   *  RelationalOperator: '<S244>/Relational Operator1'
   *  RelationalOperator: '<S30>/Equal4'
   *  Saturate: '<S244>/Saturation2'
   *
   * Block description for '<S30>/Calibration18':
   *  [60]
   */
  rtb_AND20_i = ((rtb_DataTypeConversion_jq > (sint32)tmpRead_i) && (fmaxf
    (rtb_TmpSignalConversionAticrm_u, rtb_TmpSignalConversionAticfm_u) >=
    HvCoorn_uMotThd4DisChrgOvtiChk_C));

  /* Logic: '<S30>/AND21' incorporates:
   *  Logic: '<S30>/AND19'
   */
  rtb_AND21 = (rtb_TmpSignalConversionAtDTC_bD || (!rtb_AND14_l));

  /* Logic: '<S30>/AND9' incorporates:
   *  Constant: '<S30>/uint7'
   *  Constant: '<S30>/uint8'
   *  Constant: '<S30>/uint9'
   *  Logic: '<S30>/AND31'
   *  RelationalOperator: '<S30>/Equal10'
   *  RelationalOperator: '<S30>/Equal8'
   *  RelationalOperator: '<S30>/Equal9'
   */
  rtb_AND9_c = (rtb_TmpSignalConversionAtDTC__c && rtb_AND5_g &&
                ((rtb_TmpSignalConversionAticbm_j != ((uint8)1U)) &&
                 (rtb_TmpSignalConversionAticbm_j != ((uint8)2U)) &&
                 (rtb_TmpSignalConversionAticbm_j != ((uint8)3U))));

  /* Logic: '<S30>/AND26' */
  rtb_AND26_o = (rtb_TmpSignalConversionAtDTC__j && rtb_AND8_p &&
                 HvCoorn_bHeatgDly4ChkErr);

  /* Logic: '<S30>/AND24' incorporates:
   *  Logic: '<S30>/AND27'
   */
  rtb_TmpSignalConversionAtDTC__c = (rtb_TmpSignalConversionAtDTC_bD ||
    (!rtb_AND26_o));

  /* RelationalOperator: '<S31>/Equal3' incorporates:
   *  Constant: '<S30>/Calibration20'
   *  Logic: '<S30>/AND25'
   *
   * Block description for '<S30>/Calibration20':
   *  [0]
   */
  rtb_RelationalOperator_ce_idx_0 = (tmpRead_1 &&
    HvCoorn_bBMSUnexpdDcnctFailEna_C && HvCoorn_bHeatgDly4ChkErr &&
    rtb_RelationalOperator_ce_idx_0);

  /* Logic: '<S30>/AND28' incorporates:
   *  Constant: '<S30>/Calibration15'
   *  RelationalOperator: '<S30>/Equal1'
   *
   * Block description for '<S30>/Calibration15':
   *  [220]
   */
  rtb_TmpSignalConversionAtipf_bP = (rtb_bGearOk &&
    (rtb_TmpSignalConversionAticdc_u <= HvCoorn_uDCUnexpdDcnctChk_C));

  /* Logic: '<S30>/AND3' incorporates:
   *  Constant: '<S30>/Calibration3'
   *  RelationalOperator: '<S30>/LowerOrEqual'
   *
   * Block description for '<S30>/Calibration3':
   *  [0]
   */
  rtb_TmpSignalConversionAtDTC__j = (rtb_bGearOk && (tmpRead_2 <=
    HvCoorn_uBMSUnexpdDcnctThd_C));

  /* Logic: '<S30>/AND32' */
  rtb_AND32_f = (rtb_AND32_f && rtb_AND7_g);

  /* Logic: '<S30>/AND5' incorporates:
   *  Logic: '<S30>/AND6'
   */
  rtb_AND5_g = (rtb_TmpSignalConversionAtDTC_bD ||
                (!rtb_RelationalOperator_ce_idx_0));

  /* Logic: '<S30>/AND7' incorporates:
   *  Logic: '<S30>/AND22'
   */
  rtb_AND7_g = (rtb_TmpSignalConversionAtDTC_bD || (!rtb_AND9_c));

  /* Logic: '<S30>/AND8' incorporates:
   *  Logic: '<S30>/AND10'
   */
  rtb_AND8_p = (rtb_TmpSignalConversionAtDTC_bD || (!tmpRead_1));

  /* Outputs for Enabled SubSystem: '<S234>/Debounce_OBD' incorporates:
   *  EnablePort: '<S247>/Enable'
   */
  /* Logic: '<S246>/Logical Operator' incorporates:
   *  Logic: '<S246>/Logical Operator1'
   *  Logic: '<S246>/Logical Operator2'
   *  Logic: '<S246>/Logical Operator3'
   *  RelationalOperator: '<S246>/Relational Operator'
   *  UnitDelay: '<S234>/Unit Delay1'
   *  UnitDelay: '<S234>/Unit Delay2'
   */
  if ((((!HvCoorn_ARID_DEF.outRanged_b) ||
        (HvCoorn_ARID_DEF.UnitDelay1_DSTATE_hm !=
         rtb_TmpSignalConversionAtChr_kb)) && rtb_Equal12_a) ||
      rtb_TmpSignalConversionAtChrg_a) {
    /* Switch: '<S247>/Switch2' incorporates:
     *  Constant: '<S247>/int1'
     *  Logic: '<S247>/Logical Operator'
     *  Logic: '<S248>/Logical Operator'
     *  Logic: '<S248>/Logical Operator1'
     *  RelationalOperator: '<S247>/Relational Operator'
     *  Switch: '<S247>/Switch'
     *  UnitDelay: '<S247>/Unit Delay'
     *  UnitDelay: '<S248>/Unit Delay2'
     */
    if (rtb_TmpSignalConversionAtChrg_a) {
      /* Switch: '<S247>/Switch2' incorporates:
       *  Constant: '<S247>/int16'
       */
      rtb_Switch2_p5 = 0;
    } else if (rtb_TmpSignalConversionAtChr_kb &&
               (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_li) &&
               (HvCoorn_ARID_DEF.UnitDelay_DSTATE_de < 0)) {
      /* Switch: '<S247>/Switch' incorporates:
       *  Constant: '<S247>/int16'
       *  Switch: '<S247>/Switch2'
       */
      rtb_Switch2_p5 = 0;
    } else {
      /* Switch: '<S247>/Switch2' incorporates:
       *  UnitDelay: '<S247>/Unit Delay'
       */
      rtb_Switch2_p5 = HvCoorn_ARID_DEF.UnitDelay_DSTATE_de;
    }

    /* End of Switch: '<S247>/Switch2' */

    /* Switch: '<S247>/Switch4' */
    if (rtb_TmpSignalConversionAtChr_kb) {
      /* Sum: '<S247>/Sum1' incorporates:
       *  Constant: '<S30>/int16'
       */
      rtb_DataTypeConversion_jq = 1 + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S247>/Saturation2' incorporates:
       *  Sum: '<S247>/Sum1'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    } else {
      /* Sum: '<S247>/Sum2' incorporates:
       *  Constant: '<S30>/int1'
       */
      rtb_DataTypeConversion_jq = (-1) + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S247>/Saturation2' incorporates:
       *  Sum: '<S247>/Sum2'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    }

    /* End of Switch: '<S247>/Switch4' */

    /* Saturate: '<S247>/Saturation2' */
    if (rtb_Saturation2_jr > 32766) {
      /* Saturate: '<S247>/Saturation2' */
      rtb_Saturation2_jr = 32766;
    } else if (rtb_Saturation2_jr < (-32767)) {
      /* Saturate: '<S247>/Saturation2' */
      rtb_Saturation2_jr = (-32767);
    }

    /* End of Saturate: '<S247>/Saturation2' */

    /* RelationalOperator: '<S247>/ROUpLim' incorporates:
     *  Constant: '<S30>/Calibration6'
     *
     * Block description for '<S30>/Calibration6':
     *  [500]
     */
    HvCoorn_ARID_DEF.outRanged_b = (HvCoorn_rHvRlyUnexpdDcnctFailThd_C <
      rtb_Saturation2_jr);

    /* Sum: '<S30>/Subtract1' incorporates:
     *  Constant: '<S30>/Calibration6'
     *  Constant: '<S30>/Calibration7'
     *
     * Block description for '<S30>/Calibration6':
     *  [500]
     *
     * Block description for '<S30>/Calibration7':
     *  [20]
     */
    rtb_DataTypeConversion_jq = HvCoorn_rHvRlyUnexpdDcnctFailThd_C -
      HvCoorn_rHvRlyUnexpdDcnctRcv_C;
    if (rtb_DataTypeConversion_jq > 32767) {
      rtb_DataTypeConversion_jq = 32767;
    } else if (rtb_DataTypeConversion_jq < -32768) {
      rtb_DataTypeConversion_jq = -32768;
    }

    /* Logic: '<S249>/Logical_Operator4' incorporates:
     *  Logic: '<S247>/LORelay1'
     *  Logic: '<S249>/Logical Operator1'
     *  Logic: '<S249>/Logical_Operator5'
     *  RelationalOperator: '<S247>/ROLoLim'
     *  Sum: '<S30>/Subtract1'
     *  UnitDelay: '<S249>/Unit Delay'
     */
    HvCoorn_bHvRlyUnexpdDcnctErr = ((rtb_Saturation2_jr >=
      rtb_DataTypeConversion_jq) && (!rtb_TmpSignalConversionAtChrg_a) &&
      (HvCoorn_ARID_DEF.outRanged_b || HvCoorn_ARID_DEF.UnitDelay_DSTATE_lkh));

    /* Update for UnitDelay: '<S248>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_li = rtb_TmpSignalConversionAtChr_kb;

    /* Switch: '<S247>/Switch3' */
    if (HvCoorn_ARID_DEF.outRanged_b) {
      /* Update for UnitDelay: '<S247>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_de = rtb_Switch2_p5;
    } else {
      /* Update for UnitDelay: '<S247>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_de = rtb_Saturation2_jr;
    }

    /* End of Switch: '<S247>/Switch3' */

    /* Update for UnitDelay: '<S249>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_lkh = HvCoorn_bHvRlyUnexpdDcnctErr;
  }

  /* End of Logic: '<S246>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S234>/Debounce_OBD' */

  /* Outputs for Enabled SubSystem: '<S235>/Debounce_OBD' incorporates:
   *  EnablePort: '<S251>/Enable'
   */
  /* Logic: '<S250>/Logical Operator' incorporates:
   *  Logic: '<S250>/Logical Operator1'
   *  Logic: '<S250>/Logical Operator2'
   *  Logic: '<S250>/Logical Operator3'
   *  RelationalOperator: '<S250>/Relational Operator'
   *  UnitDelay: '<S235>/Unit Delay1'
   *  UnitDelay: '<S235>/Unit Delay2'
   */
  if ((((!HvCoorn_ARID_DEF.outRanged_iq) ||
        (HvCoorn_ARID_DEF.UnitDelay1_DSTATE_l != rtb_TmpSignalConversionAtDTC__j))
       && rtb_RelationalOperator_ce_idx_0) || rtb_AND5_g) {
    /* Switch: '<S251>/Switch2' incorporates:
     *  Constant: '<S251>/int1'
     *  Logic: '<S251>/Logical Operator'
     *  Logic: '<S252>/Logical Operator'
     *  Logic: '<S252>/Logical Operator1'
     *  RelationalOperator: '<S251>/Relational Operator'
     *  Switch: '<S251>/Switch'
     *  UnitDelay: '<S251>/Unit Delay'
     *  UnitDelay: '<S252>/Unit Delay2'
     */
    if (rtb_AND5_g) {
      /* Switch: '<S251>/Switch2' incorporates:
       *  Constant: '<S251>/int16'
       */
      rtb_Switch2_p5 = 0;
    } else if (rtb_TmpSignalConversionAtDTC__j &&
               (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_j2) &&
               (HvCoorn_ARID_DEF.UnitDelay_DSTATE_aw < 0)) {
      /* Switch: '<S251>/Switch' incorporates:
       *  Constant: '<S251>/int16'
       *  Switch: '<S251>/Switch2'
       */
      rtb_Switch2_p5 = 0;
    } else {
      /* Switch: '<S251>/Switch2' incorporates:
       *  UnitDelay: '<S251>/Unit Delay'
       */
      rtb_Switch2_p5 = HvCoorn_ARID_DEF.UnitDelay_DSTATE_aw;
    }

    /* End of Switch: '<S251>/Switch2' */

    /* Switch: '<S251>/Switch4' */
    if (rtb_TmpSignalConversionAtDTC__j) {
      /* Sum: '<S251>/Sum1' incorporates:
       *  Constant: '<S30>/int3'
       */
      rtb_DataTypeConversion_jq = 1 + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S251>/Saturation2' incorporates:
       *  Sum: '<S251>/Sum1'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    } else {
      /* Sum: '<S251>/Sum2' incorporates:
       *  Constant: '<S30>/int2'
       */
      rtb_DataTypeConversion_jq = (-1) + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S251>/Saturation2' incorporates:
       *  Sum: '<S251>/Sum2'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    }

    /* End of Switch: '<S251>/Switch4' */

    /* Saturate: '<S251>/Saturation2' */
    if (rtb_Saturation2_jr > 32766) {
      /* Saturate: '<S251>/Saturation2' */
      rtb_Saturation2_jr = 32766;
    } else if (rtb_Saturation2_jr < (-32767)) {
      /* Saturate: '<S251>/Saturation2' */
      rtb_Saturation2_jr = (-32767);
    }

    /* End of Saturate: '<S251>/Saturation2' */

    /* RelationalOperator: '<S251>/ROUpLim' incorporates:
     *  Constant: '<S30>/Calibration1'
     *
     * Block description for '<S30>/Calibration1':
     *  [500]
     */
    HvCoorn_ARID_DEF.outRanged_iq = (HvCoorn_rBMSUnexpdDcnctFailThd_C <
      rtb_Saturation2_jr);

    /* Sum: '<S30>/Subtract2' incorporates:
     *  Constant: '<S30>/Calibration1'
     *  Constant: '<S30>/Calibration2'
     *
     * Block description for '<S30>/Calibration1':
     *  [500]
     *
     * Block description for '<S30>/Calibration2':
     *  [20]
     */
    rtb_DataTypeConversion_jq = HvCoorn_rBMSUnexpdDcnctFailThd_C -
      HvCoorn_rBMSUnexpdDcnctRcv_C;
    if (rtb_DataTypeConversion_jq > 32767) {
      rtb_DataTypeConversion_jq = 32767;
    } else if (rtb_DataTypeConversion_jq < -32768) {
      rtb_DataTypeConversion_jq = -32768;
    }

    /* Logic: '<S253>/Logical_Operator4' incorporates:
     *  Logic: '<S251>/LORelay1'
     *  Logic: '<S253>/Logical Operator1'
     *  Logic: '<S253>/Logical_Operator5'
     *  RelationalOperator: '<S251>/ROLoLim'
     *  Sum: '<S30>/Subtract2'
     *  UnitDelay: '<S253>/Unit Delay'
     */
    HvCoorn_bBMSUnexpdDcnctErr = ((rtb_Saturation2_jr >=
      rtb_DataTypeConversion_jq) && (!rtb_AND5_g) &&
      (HvCoorn_ARID_DEF.outRanged_iq || HvCoorn_ARID_DEF.UnitDelay_DSTATE_pv));

    /* Update for UnitDelay: '<S252>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_j2 = rtb_TmpSignalConversionAtDTC__j;

    /* Switch: '<S251>/Switch3' */
    if (HvCoorn_ARID_DEF.outRanged_iq) {
      /* Update for UnitDelay: '<S251>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_aw = rtb_Switch2_p5;
    } else {
      /* Update for UnitDelay: '<S251>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_aw = rtb_Saturation2_jr;
    }

    /* End of Switch: '<S251>/Switch3' */

    /* Update for UnitDelay: '<S253>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_pv = HvCoorn_bBMSUnexpdDcnctErr;
  }

  /* End of Logic: '<S250>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S235>/Debounce_OBD' */

  /* Outputs for Enabled SubSystem: '<S236>/Debounce_OBD' incorporates:
   *  EnablePort: '<S255>/Enable'
   */
  /* Logic: '<S254>/Logical Operator' incorporates:
   *  Logic: '<S254>/Logical Operator1'
   *  Logic: '<S254>/Logical Operator2'
   *  Logic: '<S254>/Logical Operator3'
   *  RelationalOperator: '<S254>/Relational Operator'
   *  UnitDelay: '<S236>/Unit Delay1'
   *  UnitDelay: '<S236>/Unit Delay2'
   */
  if ((((!HvCoorn_ARID_DEF.outRanged_iy) ||
        (HvCoorn_ARID_DEF.UnitDelay1_DSTATE_oc != HvCoorn_bHvOnFail)) &&
       tmpRead_1) || rtb_AND8_p) {
    /* Switch: '<S255>/Switch2' incorporates:
     *  Constant: '<S255>/int1'
     *  Logic: '<S255>/Logical Operator'
     *  Logic: '<S256>/Logical Operator'
     *  Logic: '<S256>/Logical Operator1'
     *  RelationalOperator: '<S255>/Relational Operator'
     *  Switch: '<S255>/Switch'
     *  UnitDelay: '<S255>/Unit Delay'
     *  UnitDelay: '<S256>/Unit Delay2'
     */
    if (rtb_AND8_p) {
      /* Switch: '<S255>/Switch2' incorporates:
       *  Constant: '<S255>/int16'
       */
      rtb_Switch2_p5 = 0;
    } else if (HvCoorn_bHvOnFail && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_gf) &&
               (HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5z < 0)) {
      /* Switch: '<S255>/Switch' incorporates:
       *  Constant: '<S255>/int16'
       *  Switch: '<S255>/Switch2'
       */
      rtb_Switch2_p5 = 0;
    } else {
      /* Switch: '<S255>/Switch2' incorporates:
       *  UnitDelay: '<S255>/Unit Delay'
       */
      rtb_Switch2_p5 = HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5z;
    }

    /* End of Switch: '<S255>/Switch2' */

    /* Switch: '<S255>/Switch4' */
    if (HvCoorn_bHvOnFail) {
      /* Sum: '<S255>/Sum1' incorporates:
       *  Constant: '<S30>/int5'
       */
      rtb_DataTypeConversion_jq = 1 + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S255>/Saturation2' incorporates:
       *  Sum: '<S255>/Sum1'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    } else {
      /* Sum: '<S255>/Sum2' incorporates:
       *  Constant: '<S30>/int4'
       */
      rtb_DataTypeConversion_jq = (-1) + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S255>/Saturation2' incorporates:
       *  Sum: '<S255>/Sum2'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    }

    /* End of Switch: '<S255>/Switch4' */

    /* Saturate: '<S255>/Saturation2' */
    if (rtb_Saturation2_jr > 32766) {
      /* Saturate: '<S255>/Saturation2' */
      rtb_Saturation2_jr = 32766;
    } else if (rtb_Saturation2_jr < (-32767)) {
      /* Saturate: '<S255>/Saturation2' */
      rtb_Saturation2_jr = (-32767);
    }

    /* End of Saturate: '<S255>/Saturation2' */

    /* RelationalOperator: '<S255>/ROUpLim' incorporates:
     *  Constant: '<S30>/Calibration5'
     *
     * Block description for '<S30>/Calibration5':
     *  [5]
     */
    HvCoorn_ARID_DEF.outRanged_iy = (HvCoorn_rMainRlyClsFailThd_C <
      rtb_Saturation2_jr);

    /* Sum: '<S30>/Subtract3' incorporates:
     *  Constant: '<S30>/Calibration5'
     *  Constant: '<S30>/Calibration8'
     *
     * Block description for '<S30>/Calibration5':
     *  [5]
     *
     * Block description for '<S30>/Calibration8':
     *  [5]
     */
    rtb_DataTypeConversion_jq = HvCoorn_rMainRlyClsFailThd_C -
      HvCoorn_rMainRlyClsRcv_C;
    if (rtb_DataTypeConversion_jq > 32767) {
      rtb_DataTypeConversion_jq = 32767;
    } else if (rtb_DataTypeConversion_jq < -32768) {
      rtb_DataTypeConversion_jq = -32768;
    }

    /* Logic: '<S257>/Logical_Operator4' incorporates:
     *  Logic: '<S255>/LORelay1'
     *  Logic: '<S257>/Logical Operator1'
     *  Logic: '<S257>/Logical_Operator5'
     *  RelationalOperator: '<S255>/ROLoLim'
     *  Sum: '<S30>/Subtract3'
     *  UnitDelay: '<S257>/Unit Delay'
     */
    HvCoorn_bMainRlyFail2ClsErr = ((rtb_Saturation2_jr >=
      rtb_DataTypeConversion_jq) && (!rtb_AND8_p) &&
      (HvCoorn_ARID_DEF.outRanged_iy || HvCoorn_ARID_DEF.UnitDelay_DSTATE_ph));

    /* Update for UnitDelay: '<S256>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_gf = HvCoorn_bHvOnFail;

    /* Switch: '<S255>/Switch3' */
    if (HvCoorn_ARID_DEF.outRanged_iy) {
      /* Update for UnitDelay: '<S255>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5z = rtb_Switch2_p5;
    } else {
      /* Update for UnitDelay: '<S255>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_f5z = rtb_Saturation2_jr;
    }

    /* End of Switch: '<S255>/Switch3' */

    /* Update for UnitDelay: '<S257>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_ph = HvCoorn_bMainRlyFail2ClsErr;
  }

  /* End of Logic: '<S254>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S236>/Debounce_OBD' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* Inport: '<Root>/icbms_stPrechrgMod' */
  (void)Rte_Read_icbms_stPrechrgMod_Value(&tmpRead_3);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Switch: '<S243>/Switch' incorporates:
   *  Constant: '<S30>/uint2'
   *  RelationalOperator: '<S30>/Equal2'
   */
  if (tmpRead_3 == ((uint8)1U)) {
    /* Sum: '<S243>/Subtract1' incorporates:
     *  Constant: '<S243>/single1'
     *  UnitDelay: '<S243>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_jb < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_jb)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_jb > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_jb)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_jb + 1;
    }

    /* End of Sum: '<S243>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S243>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S243>/Switch' */

  /* Update for UnitDelay: '<S243>/Unit Delay' incorporates:
   *  Saturate: '<S243>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_jb = rtb_DataTypeConversion_jq;

  /* Product: '<S243>/Divide' incorporates:
   *  Constant: '<S30>/Calibration9'
   *
   * Block description for '<S30>/Calibration9':
   *  [6]
   */
  tmpRead_i = HvCoorn_tiPrechrgOvtiChk_C / HvCoorn_ConstB.Max_ik;

  /* DataTypeConversion: '<S243>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S243>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S243>/DataTypeConversion'
   *  Saturate: '<S243>/Saturation2'
   */
  rtb_TmpSignalConversionAtDTC__j = (rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i);

  /* Outputs for Enabled SubSystem: '<S237>/Debounce_OBD' incorporates:
   *  EnablePort: '<S259>/Enable'
   */
  /* Logic: '<S258>/Logical Operator' incorporates:
   *  Logic: '<S258>/Logical Operator1'
   *  Logic: '<S258>/Logical Operator2'
   *  Logic: '<S258>/Logical Operator3'
   *  RelationalOperator: '<S258>/Relational Operator'
   *  UnitDelay: '<S237>/Unit Delay1'
   *  UnitDelay: '<S237>/Unit Delay2'
   */
  if ((((!HvCoorn_ARID_DEF.outRanged_o) ||
        (HvCoorn_ARID_DEF.UnitDelay1_DSTATE_lu !=
         rtb_TmpSignalConversionAtDTC__j)) && rtb_AND12_o) || rtb_AND13) {
    /* Switch: '<S259>/Switch2' incorporates:
     *  Constant: '<S259>/int1'
     *  Logic: '<S259>/Logical Operator'
     *  Logic: '<S260>/Logical Operator'
     *  Logic: '<S260>/Logical Operator1'
     *  RelationalOperator: '<S259>/Relational Operator'
     *  Switch: '<S259>/Switch'
     *  UnitDelay: '<S259>/Unit Delay'
     *  UnitDelay: '<S260>/Unit Delay2'
     */
    if (rtb_AND13) {
      /* Switch: '<S259>/Switch2' incorporates:
       *  Constant: '<S259>/int16'
       */
      rtb_Switch2_p5 = 0;
    } else if (rtb_TmpSignalConversionAtDTC__j &&
               (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_pg) &&
               (HvCoorn_ARID_DEF.UnitDelay_DSTATE_on < 0)) {
      /* Switch: '<S259>/Switch' incorporates:
       *  Constant: '<S259>/int16'
       *  Switch: '<S259>/Switch2'
       */
      rtb_Switch2_p5 = 0;
    } else {
      /* Switch: '<S259>/Switch2' incorporates:
       *  UnitDelay: '<S259>/Unit Delay'
       */
      rtb_Switch2_p5 = HvCoorn_ARID_DEF.UnitDelay_DSTATE_on;
    }

    /* End of Switch: '<S259>/Switch2' */

    /* Switch: '<S259>/Switch4' */
    if (rtb_TmpSignalConversionAtDTC__j) {
      /* Sum: '<S259>/Sum1' incorporates:
       *  Constant: '<S30>/int7'
       */
      rtb_DataTypeConversion_jq = 1 + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S259>/Saturation2' incorporates:
       *  Sum: '<S259>/Sum1'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    } else {
      /* Sum: '<S259>/Sum2' incorporates:
       *  Constant: '<S30>/int6'
       */
      rtb_DataTypeConversion_jq = (-1) + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S259>/Saturation2' incorporates:
       *  Sum: '<S259>/Sum2'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    }

    /* End of Switch: '<S259>/Switch4' */

    /* Saturate: '<S259>/Saturation2' */
    if (rtb_Saturation2_jr > 32766) {
      /* Saturate: '<S259>/Saturation2' */
      rtb_Saturation2_jr = 32766;
    } else if (rtb_Saturation2_jr < (-32767)) {
      /* Saturate: '<S259>/Saturation2' */
      rtb_Saturation2_jr = (-32767);
    }

    /* End of Saturate: '<S259>/Saturation2' */

    /* RelationalOperator: '<S259>/ROUpLim' incorporates:
     *  Constant: '<S30>/Calibration10'
     *
     * Block description for '<S30>/Calibration10':
     *  [5]
     */
    HvCoorn_ARID_DEF.outRanged_o = (HvCoorn_rPrechrgOvtiFailThd_C <
      rtb_Saturation2_jr);

    /* Sum: '<S30>/Subtract' incorporates:
     *  Constant: '<S30>/Calibration10'
     *  Constant: '<S30>/Calibration11'
     *
     * Block description for '<S30>/Calibration10':
     *  [5]
     *
     * Block description for '<S30>/Calibration11':
     *  [5]
     */
    rtb_DataTypeConversion_jq = HvCoorn_rPrechrgOvtiFailThd_C -
      HvCoorn_rPrechrgOvtiRcv_C;
    if (rtb_DataTypeConversion_jq > 32767) {
      rtb_DataTypeConversion_jq = 32767;
    } else if (rtb_DataTypeConversion_jq < -32768) {
      rtb_DataTypeConversion_jq = -32768;
    }

    /* Logic: '<S261>/Logical_Operator4' incorporates:
     *  Logic: '<S259>/LORelay1'
     *  Logic: '<S261>/Logical Operator1'
     *  Logic: '<S261>/Logical_Operator5'
     *  RelationalOperator: '<S259>/ROLoLim'
     *  Sum: '<S30>/Subtract'
     *  UnitDelay: '<S261>/Unit Delay'
     */
    HvCoorn_bPrechrgOvtiErr = ((rtb_Saturation2_jr >= rtb_DataTypeConversion_jq)
      && (!rtb_AND13) && (HvCoorn_ARID_DEF.outRanged_o ||
                          HvCoorn_ARID_DEF.UnitDelay_DSTATE_hy));

    /* Update for UnitDelay: '<S260>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_pg = rtb_TmpSignalConversionAtDTC__j;

    /* Switch: '<S259>/Switch3' */
    if (HvCoorn_ARID_DEF.outRanged_o) {
      /* Update for UnitDelay: '<S259>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_on = rtb_Switch2_p5;
    } else {
      /* Update for UnitDelay: '<S259>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_on = rtb_Saturation2_jr;
    }

    /* End of Switch: '<S259>/Switch3' */

    /* Update for UnitDelay: '<S261>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_hy = HvCoorn_bPrechrgOvtiErr;
  }

  /* End of Logic: '<S258>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S237>/Debounce_OBD' */
  for (i = 0; i < 9; i++) {
    /* RelationalOperator: '<S262>/Relational Operator' incorporates:
     *  UnitDelay: '<S238>/Unit Delay1'
     */
    tmpForInput[i] = HvCoorn_ARID_DEF.UnitDelay1_DSTATE_pi[i];
  }

  /* Logic: '<S262>/Logical Operator1' incorporates:
   *  RelationalOperator: '<S262>/Relational Operator'
   *  UnitDelay: '<S238>/Unit Delay2'
   */
  rtb_LogicalOperator1_b2[0] = (HvCoorn_ARID_DEF.outRanged_c[0] && (tmpForInput
    [0] == rtb_OR));
  rtb_LogicalOperator1_b2[1] = (HvCoorn_ARID_DEF.outRanged_c[1] && (tmpForInput
    [1] == rtb_Equal2));
  rtb_LogicalOperator1_b2[2] = (HvCoorn_ARID_DEF.outRanged_c[2] && (tmpForInput
    [2] == rtb_RelationalOperator27));
  rtb_LogicalOperator1_b2[3] = (HvCoorn_ARID_DEF.outRanged_c[3] && (tmpForInput
    [3] == rtb_RelationalOperator28));
  rtb_LogicalOperator1_b2[4] = (HvCoorn_ARID_DEF.outRanged_c[4] && (tmpForInput
    [4] == rtb_RelationalOperator29));
  rtb_LogicalOperator1_b2[5] = (HvCoorn_ARID_DEF.outRanged_c[5] && (tmpForInput
    [5] == rtb_RelationalOperator30));
  rtb_LogicalOperator1_b2[6] = (HvCoorn_ARID_DEF.outRanged_c[6] && (tmpForInput
    [6] == rtb_AND3));
  rtb_LogicalOperator1_b2[7] = (HvCoorn_ARID_DEF.outRanged_c[7] && (tmpForInput
    [7] == rtb_AND4));
  rtb_LogicalOperator1_b2[8] = (HvCoorn_ARID_DEF.outRanged_c[8] && (tmpForInput
    [8] == rtb_TmpSignalConversionAticis_b));

  /* Logic: '<S262>/Logical Operator4' */
  rtb_Equal12_a = rtb_LogicalOperator1_b2[0];
  for (rtb_DataTypeConversion_jq = 0; rtb_DataTypeConversion_jq < 8;
       rtb_DataTypeConversion_jq++) {
    rtb_Equal12_a = (rtb_Equal12_a &&
                     rtb_LogicalOperator1_b2[rtb_DataTypeConversion_jq + 1]);
  }

  /* Sum: '<S30>/Subtract4' incorporates:
   *  Constant: '<S30>/Calibration12'
   *  Constant: '<S30>/Calibration13'
   *
   * Block description for '<S30>/Calibration12':
   *  [50]
   *
   * Block description for '<S30>/Calibration13':
   *  [20]
   */
  rtb_DataTypeConversion_jq = HvCoorn_rHvilFailThd_C - HvCoorn_rHvilRcv_C;
  if (rtb_DataTypeConversion_jq > 32767) {
    rtb_DataTypeConversion_jq = 32767;
  } else if (rtb_DataTypeConversion_jq < -32768) {
    rtb_DataTypeConversion_jq = -32768;
  }

  /* Outputs for Enabled SubSystem: '<S238>/Debounce_OBD' incorporates:
   *  EnablePort: '<S263>/Enable'
   */
  /* Logic: '<S262>/Logical Operator' incorporates:
   *  Logic: '<S262>/Logical Operator2'
   *  Logic: '<S262>/Logical Operator3'
   *  Logic: '<S262>/Logical Operator4'
   *  RelationalOperator: '<S263>/ROUpLim'
   */
  if (((!rtb_Equal12_a) && rtb_AND15_f) || rtb_TmpSignalConversionAtipf__i) {
    /* Switch: '<S263>/Switch2' */
    if (rtb_TmpSignalConversionAtipf__i) {
      /* Switch: '<S263>/Switch2' incorporates:
       *  Constant: '<S263>/int16'
       */
      for (i = 0; i < 9; i++) {
        rtb_Switch2_ld[i] = 0;
      }
    } else {
      for (i = 0; i < 9; i++) {
        /* Logic: '<S264>/Logical Operator' incorporates:
         *  Logic: '<S264>/Logical Operator1'
         *  UnitDelay: '<S264>/Unit Delay2'
         */
        tmpForInput[i] = !HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bh[i];
      }

      /* Switch: '<S263>/Switch' incorporates:
       *  Constant: '<S263>/int1'
       *  Logic: '<S263>/Logical Operator'
       *  Logic: '<S264>/Logical Operator'
       *  RelationalOperator: '<S263>/Relational Operator'
       *  UnitDelay: '<S263>/Unit Delay'
       */
      if (rtb_OR && tmpForInput[0] && (HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[0] <
           0)) {
        /* Switch: '<S263>/Switch2' incorporates:
         *  Constant: '<S263>/int16'
         */
        rtb_Switch2_ld[0] = 0;
      } else {
        /* Switch: '<S263>/Switch2' */
        rtb_Switch2_ld[0] = HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[0];
      }

      if (rtb_Equal2 && tmpForInput[1] && (HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm
           [1] < 0)) {
        /* Switch: '<S263>/Switch2' incorporates:
         *  Constant: '<S263>/int16'
         */
        rtb_Switch2_ld[1] = 0;
      } else {
        /* Switch: '<S263>/Switch2' */
        rtb_Switch2_ld[1] = HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[1];
      }

      if (rtb_RelationalOperator27 && tmpForInput[2] &&
          (HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[2] < 0)) {
        /* Switch: '<S263>/Switch2' incorporates:
         *  Constant: '<S263>/int16'
         */
        rtb_Switch2_ld[2] = 0;
      } else {
        /* Switch: '<S263>/Switch2' */
        rtb_Switch2_ld[2] = HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[2];
      }

      if (rtb_RelationalOperator28 && tmpForInput[3] &&
          (HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[3] < 0)) {
        /* Switch: '<S263>/Switch2' incorporates:
         *  Constant: '<S263>/int16'
         */
        rtb_Switch2_ld[3] = 0;
      } else {
        /* Switch: '<S263>/Switch2' */
        rtb_Switch2_ld[3] = HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[3];
      }

      if (rtb_RelationalOperator29 && tmpForInput[4] &&
          (HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[4] < 0)) {
        /* Switch: '<S263>/Switch2' incorporates:
         *  Constant: '<S263>/int16'
         */
        rtb_Switch2_ld[4] = 0;
      } else {
        /* Switch: '<S263>/Switch2' */
        rtb_Switch2_ld[4] = HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[4];
      }

      if (rtb_RelationalOperator30 && tmpForInput[5] &&
          (HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[5] < 0)) {
        /* Switch: '<S263>/Switch2' incorporates:
         *  Constant: '<S263>/int16'
         */
        rtb_Switch2_ld[5] = 0;
      } else {
        /* Switch: '<S263>/Switch2' */
        rtb_Switch2_ld[5] = HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[5];
      }

      if (rtb_AND3 && tmpForInput[6] && (HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[6]
           < 0)) {
        /* Switch: '<S263>/Switch2' incorporates:
         *  Constant: '<S263>/int16'
         */
        rtb_Switch2_ld[6] = 0;
      } else {
        /* Switch: '<S263>/Switch2' */
        rtb_Switch2_ld[6] = HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[6];
      }

      if (rtb_AND4 && tmpForInput[7] && (HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[7]
           < 0)) {
        /* Switch: '<S263>/Switch2' incorporates:
         *  Constant: '<S263>/int16'
         */
        rtb_Switch2_ld[7] = 0;
      } else {
        /* Switch: '<S263>/Switch2' */
        rtb_Switch2_ld[7] = HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[7];
      }

      if (rtb_TmpSignalConversionAticis_b && tmpForInput[8] &&
          (HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[8] < 0)) {
        /* Switch: '<S263>/Switch2' incorporates:
         *  Constant: '<S263>/int16'
         */
        rtb_Switch2_ld[8] = 0;
      } else {
        /* Switch: '<S263>/Switch2' */
        rtb_Switch2_ld[8] = HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[8];
      }

      /* End of Switch: '<S263>/Switch' */
    }

    /* End of Switch: '<S263>/Switch2' */

    /* Switch: '<S263>/Switch4' incorporates:
     *  Sum: '<S263>/Sum1'
     *  Sum: '<S263>/Sum2'
     */
    if (rtb_OR) {
      /* Sum: '<S263>/Sum1' incorporates:
       *  Constant: '<S30>/int8'
       */
      i = rtb_Switch2_ld[0] + 1;
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    } else {
      /* Sum: '<S263>/Sum2' incorporates:
       *  Constant: '<S30>/int9'
       */
      i = rtb_Switch2_ld[0] + (-1);
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    }

    /* Saturate: '<S263>/Saturation2' */
    if (rtb_Switch2_p5 > 32766) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[0] = 32766;
    } else if (rtb_Switch2_p5 < (-32767)) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[0] = (-32767);
    } else {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[0] = rtb_Switch2_p5;
    }

    /* Switch: '<S263>/Switch4' incorporates:
     *  Sum: '<S263>/Sum1'
     *  Sum: '<S263>/Sum2'
     */
    if (rtb_Equal2) {
      /* Sum: '<S263>/Sum1' incorporates:
       *  Constant: '<S30>/int8'
       */
      i = rtb_Switch2_ld[1] + 1;
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    } else {
      /* Sum: '<S263>/Sum2' incorporates:
       *  Constant: '<S30>/int9'
       */
      i = rtb_Switch2_ld[1] + (-1);
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    }

    /* Saturate: '<S263>/Saturation2' */
    if (rtb_Switch2_p5 > 32766) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[1] = 32766;
    } else if (rtb_Switch2_p5 < (-32767)) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[1] = (-32767);
    } else {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[1] = rtb_Switch2_p5;
    }

    /* Switch: '<S263>/Switch4' incorporates:
     *  Sum: '<S263>/Sum1'
     *  Sum: '<S263>/Sum2'
     */
    if (rtb_RelationalOperator27) {
      /* Sum: '<S263>/Sum1' incorporates:
       *  Constant: '<S30>/int8'
       */
      i = rtb_Switch2_ld[2] + 1;
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    } else {
      /* Sum: '<S263>/Sum2' incorporates:
       *  Constant: '<S30>/int9'
       */
      i = rtb_Switch2_ld[2] + (-1);
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    }

    /* Saturate: '<S263>/Saturation2' */
    if (rtb_Switch2_p5 > 32766) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[2] = 32766;
    } else if (rtb_Switch2_p5 < (-32767)) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[2] = (-32767);
    } else {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[2] = rtb_Switch2_p5;
    }

    /* Switch: '<S263>/Switch4' incorporates:
     *  Sum: '<S263>/Sum1'
     *  Sum: '<S263>/Sum2'
     */
    if (rtb_RelationalOperator28) {
      /* Sum: '<S263>/Sum1' incorporates:
       *  Constant: '<S30>/int8'
       */
      i = rtb_Switch2_ld[3] + 1;
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    } else {
      /* Sum: '<S263>/Sum2' incorporates:
       *  Constant: '<S30>/int9'
       */
      i = rtb_Switch2_ld[3] + (-1);
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    }

    /* Saturate: '<S263>/Saturation2' */
    if (rtb_Switch2_p5 > 32766) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[3] = 32766;
    } else if (rtb_Switch2_p5 < (-32767)) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[3] = (-32767);
    } else {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[3] = rtb_Switch2_p5;
    }

    /* Switch: '<S263>/Switch4' incorporates:
     *  Sum: '<S263>/Sum1'
     *  Sum: '<S263>/Sum2'
     */
    if (rtb_RelationalOperator29) {
      /* Sum: '<S263>/Sum1' incorporates:
       *  Constant: '<S30>/int8'
       */
      i = rtb_Switch2_ld[4] + 1;
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    } else {
      /* Sum: '<S263>/Sum2' incorporates:
       *  Constant: '<S30>/int9'
       */
      i = rtb_Switch2_ld[4] + (-1);
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    }

    /* Saturate: '<S263>/Saturation2' */
    if (rtb_Switch2_p5 > 32766) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[4] = 32766;
    } else if (rtb_Switch2_p5 < (-32767)) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[4] = (-32767);
    } else {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[4] = rtb_Switch2_p5;
    }

    /* Switch: '<S263>/Switch4' incorporates:
     *  Sum: '<S263>/Sum1'
     *  Sum: '<S263>/Sum2'
     */
    if (rtb_RelationalOperator30) {
      /* Sum: '<S263>/Sum1' incorporates:
       *  Constant: '<S30>/int8'
       */
      i = rtb_Switch2_ld[5] + 1;
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    } else {
      /* Sum: '<S263>/Sum2' incorporates:
       *  Constant: '<S30>/int9'
       */
      i = rtb_Switch2_ld[5] + (-1);
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    }

    /* Saturate: '<S263>/Saturation2' */
    if (rtb_Switch2_p5 > 32766) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[5] = 32766;
    } else if (rtb_Switch2_p5 < (-32767)) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[5] = (-32767);
    } else {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[5] = rtb_Switch2_p5;
    }

    /* Switch: '<S263>/Switch4' incorporates:
     *  Sum: '<S263>/Sum1'
     *  Sum: '<S263>/Sum2'
     */
    if (rtb_AND3) {
      /* Sum: '<S263>/Sum1' incorporates:
       *  Constant: '<S30>/int8'
       */
      i = rtb_Switch2_ld[6] + 1;
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    } else {
      /* Sum: '<S263>/Sum2' incorporates:
       *  Constant: '<S30>/int9'
       */
      i = rtb_Switch2_ld[6] + (-1);
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    }

    /* Saturate: '<S263>/Saturation2' */
    if (rtb_Switch2_p5 > 32766) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[6] = 32766;
    } else if (rtb_Switch2_p5 < (-32767)) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[6] = (-32767);
    } else {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[6] = rtb_Switch2_p5;
    }

    /* Switch: '<S263>/Switch4' incorporates:
     *  Sum: '<S263>/Sum1'
     *  Sum: '<S263>/Sum2'
     */
    if (rtb_AND4) {
      /* Sum: '<S263>/Sum1' incorporates:
       *  Constant: '<S30>/int8'
       */
      i = rtb_Switch2_ld[7] + 1;
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    } else {
      /* Sum: '<S263>/Sum2' incorporates:
       *  Constant: '<S30>/int9'
       */
      i = rtb_Switch2_ld[7] + (-1);
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    }

    /* Saturate: '<S263>/Saturation2' */
    if (rtb_Switch2_p5 > 32766) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[7] = 32766;
    } else if (rtb_Switch2_p5 < (-32767)) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[7] = (-32767);
    } else {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[7] = rtb_Switch2_p5;
    }

    /* Switch: '<S263>/Switch4' incorporates:
     *  Sum: '<S263>/Sum1'
     *  Sum: '<S263>/Sum2'
     */
    if (rtb_TmpSignalConversionAticis_b) {
      /* Sum: '<S263>/Sum1' incorporates:
       *  Constant: '<S30>/int8'
       */
      i = rtb_Switch2_ld[8] + 1;
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    } else {
      /* Sum: '<S263>/Sum2' incorporates:
       *  Constant: '<S30>/int9'
       */
      i = rtb_Switch2_ld[8] + (-1);
      if (i > 32767) {
        i = 32767;
      } else if (i < -32768) {
        i = -32768;
      }

      rtb_Switch2_p5 = (sint16)i;
    }

    /* Saturate: '<S263>/Saturation2' */
    if (rtb_Switch2_p5 > 32766) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[8] = 32766;
    } else if (rtb_Switch2_p5 < (-32767)) {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[8] = (-32767);
    } else {
      /* Saturate: '<S263>/Saturation2' */
      rtb_Saturation2_gh[8] = rtb_Switch2_p5;
    }

    /* Logic: '<S263>/LORelay1' */
    rtb_TmpSignalConversionAtipf__i = !rtb_TmpSignalConversionAtipf__i;

    /* Update for UnitDelay: '<S264>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bh[0] = rtb_OR;
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bh[1] = rtb_Equal2;
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bh[2] = rtb_RelationalOperator27;
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bh[3] = rtb_RelationalOperator28;
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bh[4] = rtb_RelationalOperator29;
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bh[5] = rtb_RelationalOperator30;
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bh[6] = rtb_AND3;
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bh[7] = rtb_AND4;
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_bh[8] = rtb_TmpSignalConversionAticis_b;
    for (i = 0; i < 9; i++) {
      rtb_Switch2_p5 = rtb_Saturation2_gh[i];

      /* RelationalOperator: '<S263>/ROUpLim' incorporates:
       *  Constant: '<S30>/Calibration12'
       *
       * Block description for '<S30>/Calibration12':
       *  [50]
       */
      HvCoorn_ARID_DEF.outRanged_c[i] = (HvCoorn_rHvilFailThd_C < rtb_Switch2_p5);

      /* Logic: '<S265>/Logical_Operator4' incorporates:
       *  Logic: '<S263>/LORelay1'
       *  Logic: '<S265>/Logical Operator1'
       *  Logic: '<S265>/Logical_Operator5'
       *  RelationalOperator: '<S263>/ROLoLim'
       *  Sum: '<S30>/Subtract4'
       *  UnitDelay: '<S265>/Unit Delay'
       */
      HvCoorn_ARID_DEF.Logical_Operator4[i] = ((rtb_Switch2_p5 >= (sint16)
        rtb_DataTypeConversion_jq) && rtb_TmpSignalConversionAtipf__i &&
        (HvCoorn_ARID_DEF.outRanged_c[i] || HvCoorn_ARID_DEF.Logical_Operator4[i]));

      /* Switch: '<S263>/Switch3' */
      if (HvCoorn_ARID_DEF.outRanged_c[i]) {
        /* Update for UnitDelay: '<S263>/Unit Delay' */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[i] = rtb_Switch2_ld[i];
      } else {
        /* Update for UnitDelay: '<S263>/Unit Delay' */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_mm[i] = rtb_Switch2_p5;
      }

      /* End of Switch: '<S263>/Switch3' */
    }
  }

  /* End of Logic: '<S262>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S238>/Debounce_OBD' */

  /* Outputs for Enabled SubSystem: '<S239>/Debounce_OBD' incorporates:
   *  EnablePort: '<S267>/Enable'
   */
  /* Logic: '<S266>/Logical Operator' incorporates:
   *  Logic: '<S266>/Logical Operator1'
   *  Logic: '<S266>/Logical Operator2'
   *  Logic: '<S266>/Logical Operator3'
   *  RelationalOperator: '<S266>/Relational Operator'
   *  UnitDelay: '<S239>/Unit Delay1'
   *  UnitDelay: '<S239>/Unit Delay2'
   */
  if ((((!HvCoorn_ARID_DEF.outRanged_i) ||
        (HvCoorn_ARID_DEF.UnitDelay1_DSTATE_am != rtb_AND20_i)) && rtb_AND14_l) ||
      rtb_AND21) {
    /* Switch: '<S267>/Switch2' incorporates:
     *  Constant: '<S267>/int1'
     *  Logic: '<S267>/Logical Operator'
     *  Logic: '<S268>/Logical Operator'
     *  Logic: '<S268>/Logical Operator1'
     *  RelationalOperator: '<S267>/Relational Operator'
     *  Switch: '<S267>/Switch'
     *  UnitDelay: '<S267>/Unit Delay'
     *  UnitDelay: '<S268>/Unit Delay2'
     */
    if (rtb_AND21) {
      /* Switch: '<S267>/Switch2' incorporates:
       *  Constant: '<S267>/int16'
       */
      rtb_Switch2_p5 = 0;
    } else if (rtb_AND20_i && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_ng) &&
               (HvCoorn_ARID_DEF.UnitDelay_DSTATE_a0 < 0)) {
      /* Switch: '<S267>/Switch' incorporates:
       *  Constant: '<S267>/int16'
       *  Switch: '<S267>/Switch2'
       */
      rtb_Switch2_p5 = 0;
    } else {
      /* Switch: '<S267>/Switch2' incorporates:
       *  UnitDelay: '<S267>/Unit Delay'
       */
      rtb_Switch2_p5 = HvCoorn_ARID_DEF.UnitDelay_DSTATE_a0;
    }

    /* End of Switch: '<S267>/Switch2' */

    /* Switch: '<S267>/Switch4' */
    if (rtb_AND20_i) {
      /* Sum: '<S267>/Sum1' incorporates:
       *  Constant: '<S30>/int10'
       */
      rtb_DataTypeConversion_jq = 1 + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S267>/Saturation2' incorporates:
       *  Sum: '<S267>/Sum1'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    } else {
      /* Sum: '<S267>/Sum2' incorporates:
       *  Constant: '<S30>/int11'
       */
      rtb_DataTypeConversion_jq = (-1) + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S267>/Saturation2' incorporates:
       *  Sum: '<S267>/Sum2'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    }

    /* End of Switch: '<S267>/Switch4' */

    /* Saturate: '<S267>/Saturation2' */
    if (rtb_Saturation2_jr > 32766) {
      /* Saturate: '<S267>/Saturation2' */
      rtb_Saturation2_jr = 32766;
    } else if (rtb_Saturation2_jr < (-32767)) {
      /* Saturate: '<S267>/Saturation2' */
      rtb_Saturation2_jr = (-32767);
    }

    /* End of Saturate: '<S267>/Saturation2' */

    /* RelationalOperator: '<S267>/ROUpLim' incorporates:
     *  Constant: '<S30>/Calibration14'
     *
     * Block description for '<S30>/Calibration14':
     *  [5]
     */
    HvCoorn_ARID_DEF.outRanged_i = (HvCoorn_rDchrgOvtiFailThd_C <
      rtb_Saturation2_jr);

    /* Sum: '<S30>/Subtract5' incorporates:
     *  Constant: '<S30>/Calibration14'
     *  Constant: '<S30>/Calibration16'
     *
     * Block description for '<S30>/Calibration14':
     *  [5]
     *
     * Block description for '<S30>/Calibration16':
     *  [5]
     */
    rtb_DataTypeConversion_jq = HvCoorn_rDchrgOvtiFailThd_C -
      HvCoorn_rDchrgOvtiRcv_C;
    if (rtb_DataTypeConversion_jq > 32767) {
      rtb_DataTypeConversion_jq = 32767;
    } else if (rtb_DataTypeConversion_jq < -32768) {
      rtb_DataTypeConversion_jq = -32768;
    }

    /* Logic: '<S269>/Logical_Operator4' incorporates:
     *  Logic: '<S267>/LORelay1'
     *  Logic: '<S269>/Logical Operator1'
     *  Logic: '<S269>/Logical_Operator5'
     *  RelationalOperator: '<S267>/ROLoLim'
     *  Sum: '<S30>/Subtract5'
     *  UnitDelay: '<S269>/Unit Delay'
     */
    HvCoorn_bDchrgOvtiErr = ((rtb_Saturation2_jr >= rtb_DataTypeConversion_jq) &&
      (!rtb_AND21) && (HvCoorn_ARID_DEF.outRanged_i ||
                       HvCoorn_ARID_DEF.UnitDelay_DSTATE_ald));

    /* Update for UnitDelay: '<S268>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_ng = rtb_AND20_i;

    /* Switch: '<S267>/Switch3' */
    if (HvCoorn_ARID_DEF.outRanged_i) {
      /* Update for UnitDelay: '<S267>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_a0 = rtb_Switch2_p5;
    } else {
      /* Update for UnitDelay: '<S267>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_a0 = rtb_Saturation2_jr;
    }

    /* End of Switch: '<S267>/Switch3' */

    /* Update for UnitDelay: '<S269>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_ald = HvCoorn_bDchrgOvtiErr;
  }

  /* End of Logic: '<S266>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S239>/Debounce_OBD' */

  /* Outputs for Enabled SubSystem: '<S240>/Debounce_OBD' incorporates:
   *  EnablePort: '<S271>/Enable'
   */
  /* Logic: '<S270>/Logical Operator' incorporates:
   *  Logic: '<S270>/Logical Operator1'
   *  Logic: '<S270>/Logical Operator2'
   *  Logic: '<S270>/Logical Operator3'
   *  RelationalOperator: '<S270>/Relational Operator'
   *  UnitDelay: '<S240>/Unit Delay1'
   *  UnitDelay: '<S240>/Unit Delay2'
   */
  if ((((!HvCoorn_ARID_DEF.outRanged_g) || (HvCoorn_ARID_DEF.UnitDelay1_DSTATE_e
         != rtb_TmpSignalConversionAtipf_bP)) && rtb_AND26_o) ||
      rtb_TmpSignalConversionAtDTC__c) {
    /* Switch: '<S271>/Switch2' incorporates:
     *  Constant: '<S271>/int1'
     *  Logic: '<S271>/Logical Operator'
     *  Logic: '<S272>/Logical Operator'
     *  Logic: '<S272>/Logical Operator1'
     *  RelationalOperator: '<S271>/Relational Operator'
     *  Switch: '<S271>/Switch'
     *  UnitDelay: '<S271>/Unit Delay'
     *  UnitDelay: '<S272>/Unit Delay2'
     */
    if (rtb_TmpSignalConversionAtDTC__c) {
      /* Switch: '<S271>/Switch2' incorporates:
       *  Constant: '<S271>/int16'
       */
      rtb_Switch2_p5 = 0;
    } else if (rtb_TmpSignalConversionAtipf_bP &&
               (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_p0) &&
               (HvCoorn_ARID_DEF.UnitDelay_DSTATE_of < 0)) {
      /* Switch: '<S271>/Switch' incorporates:
       *  Constant: '<S271>/int16'
       *  Switch: '<S271>/Switch2'
       */
      rtb_Switch2_p5 = 0;
    } else {
      /* Switch: '<S271>/Switch2' incorporates:
       *  UnitDelay: '<S271>/Unit Delay'
       */
      rtb_Switch2_p5 = HvCoorn_ARID_DEF.UnitDelay_DSTATE_of;
    }

    /* End of Switch: '<S271>/Switch2' */

    /* Switch: '<S271>/Switch4' */
    if (rtb_TmpSignalConversionAtipf_bP) {
      /* Sum: '<S271>/Sum1' incorporates:
       *  Constant: '<S30>/int12'
       */
      rtb_DataTypeConversion_jq = 1 + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S271>/Saturation2' incorporates:
       *  Sum: '<S271>/Sum1'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    } else {
      /* Sum: '<S271>/Sum2' incorporates:
       *  Constant: '<S30>/int13'
       */
      rtb_DataTypeConversion_jq = (-1) + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S271>/Saturation2' incorporates:
       *  Sum: '<S271>/Sum2'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    }

    /* End of Switch: '<S271>/Switch4' */

    /* Saturate: '<S271>/Saturation2' */
    if (rtb_Saturation2_jr > 32766) {
      /* Saturate: '<S271>/Saturation2' */
      rtb_Saturation2_jr = 32766;
    } else if (rtb_Saturation2_jr < (-32767)) {
      /* Saturate: '<S271>/Saturation2' */
      rtb_Saturation2_jr = (-32767);
    }

    /* End of Saturate: '<S271>/Saturation2' */

    /* RelationalOperator: '<S271>/ROUpLim' incorporates:
     *  Constant: '<S30>/Calibration19'
     *
     * Block description for '<S30>/Calibration19':
     *  [500]
     */
    HvCoorn_ARID_DEF.outRanged_g = (HvCoorn_rDCUnexpdDcnctFailThd_C <
      rtb_Saturation2_jr);

    /* Sum: '<S30>/Subtract6' incorporates:
     *  Constant: '<S30>/Calibration19'
     *  Constant: '<S30>/Calibration21'
     *
     * Block description for '<S30>/Calibration19':
     *  [500]
     *
     * Block description for '<S30>/Calibration21':
     *  [20]
     */
    rtb_DataTypeConversion_jq = HvCoorn_rDCUnexpdDcnctFailThd_C -
      HvCoorn_rDCUnexpdDcnctRcv_C;
    if (rtb_DataTypeConversion_jq > 32767) {
      rtb_DataTypeConversion_jq = 32767;
    } else if (rtb_DataTypeConversion_jq < -32768) {
      rtb_DataTypeConversion_jq = -32768;
    }

    /* Logic: '<S273>/Logical_Operator4' incorporates:
     *  Logic: '<S271>/LORelay1'
     *  Logic: '<S273>/Logical Operator1'
     *  Logic: '<S273>/Logical_Operator5'
     *  RelationalOperator: '<S271>/ROLoLim'
     *  Sum: '<S30>/Subtract6'
     *  UnitDelay: '<S273>/Unit Delay'
     */
    HvCoorn_bDCUnexpdDcnctErr = ((rtb_Saturation2_jr >=
      rtb_DataTypeConversion_jq) && (!rtb_TmpSignalConversionAtDTC__c) &&
      (HvCoorn_ARID_DEF.outRanged_g || HvCoorn_ARID_DEF.UnitDelay_DSTATE_as));

    /* Update for UnitDelay: '<S272>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_p0 = rtb_TmpSignalConversionAtipf_bP;

    /* Switch: '<S271>/Switch3' */
    if (HvCoorn_ARID_DEF.outRanged_g) {
      /* Update for UnitDelay: '<S271>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_of = rtb_Switch2_p5;
    } else {
      /* Update for UnitDelay: '<S271>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_of = rtb_Saturation2_jr;
    }

    /* End of Switch: '<S271>/Switch3' */

    /* Update for UnitDelay: '<S273>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_as = HvCoorn_bDCUnexpdDcnctErr;
  }

  /* End of Logic: '<S270>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S240>/Debounce_OBD' */

  /* Outputs for Enabled SubSystem: '<S241>/Debounce_OBD' incorporates:
   *  EnablePort: '<S275>/Enable'
   */
  /* Logic: '<S274>/Logical Operator' incorporates:
   *  Logic: '<S274>/Logical Operator1'
   *  Logic: '<S274>/Logical Operator2'
   *  Logic: '<S274>/Logical Operator3'
   *  RelationalOperator: '<S274>/Relational Operator'
   *  UnitDelay: '<S241>/Unit Delay1'
   *  UnitDelay: '<S241>/Unit Delay2'
   */
  if ((((!HvCoorn_ARID_DEF.outRanged) || (HvCoorn_ARID_DEF.UnitDelay1_DSTATE_o1
         != rtb_AND32_f)) && rtb_AND9_c) || rtb_AND7_g) {
    /* Switch: '<S275>/Switch2' incorporates:
     *  Constant: '<S275>/int1'
     *  Logic: '<S275>/Logical Operator'
     *  Logic: '<S276>/Logical Operator'
     *  Logic: '<S276>/Logical Operator1'
     *  RelationalOperator: '<S275>/Relational Operator'
     *  Switch: '<S275>/Switch'
     *  UnitDelay: '<S275>/Unit Delay'
     *  UnitDelay: '<S276>/Unit Delay2'
     */
    if (rtb_AND7_g) {
      /* Switch: '<S275>/Switch2' incorporates:
       *  Constant: '<S275>/int16'
       */
      rtb_Switch2_p5 = 0;
    } else if (rtb_AND32_f && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_fu) &&
               (HvCoorn_ARID_DEF.UnitDelay_DSTATE_fc < 0)) {
      /* Switch: '<S275>/Switch' incorporates:
       *  Constant: '<S275>/int16'
       *  Switch: '<S275>/Switch2'
       */
      rtb_Switch2_p5 = 0;
    } else {
      /* Switch: '<S275>/Switch2' incorporates:
       *  UnitDelay: '<S275>/Unit Delay'
       */
      rtb_Switch2_p5 = HvCoorn_ARID_DEF.UnitDelay_DSTATE_fc;
    }

    /* End of Switch: '<S275>/Switch2' */

    /* Switch: '<S275>/Switch4' */
    if (rtb_AND32_f) {
      /* Sum: '<S275>/Sum1' incorporates:
       *  Constant: '<S30>/int14'
       */
      rtb_DataTypeConversion_jq = 1 + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S275>/Saturation2' incorporates:
       *  Sum: '<S275>/Sum1'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    } else {
      /* Sum: '<S275>/Sum2' incorporates:
       *  Constant: '<S30>/int15'
       */
      rtb_DataTypeConversion_jq = (-1) + rtb_Switch2_p5;
      if (rtb_DataTypeConversion_jq > 32767) {
        rtb_DataTypeConversion_jq = 32767;
      } else if (rtb_DataTypeConversion_jq < -32768) {
        rtb_DataTypeConversion_jq = -32768;
      }

      /* Saturate: '<S275>/Saturation2' incorporates:
       *  Sum: '<S275>/Sum2'
       */
      rtb_Saturation2_jr = (sint16)rtb_DataTypeConversion_jq;
    }

    /* End of Switch: '<S275>/Switch4' */

    /* Saturate: '<S275>/Saturation2' */
    if (rtb_Saturation2_jr > 32766) {
      /* Saturate: '<S275>/Saturation2' */
      rtb_Saturation2_jr = 32766;
    } else if (rtb_Saturation2_jr < (-32767)) {
      /* Saturate: '<S275>/Saturation2' */
      rtb_Saturation2_jr = (-32767);
    }

    /* End of Saturate: '<S275>/Saturation2' */

    /* RelationalOperator: '<S275>/ROUpLim' incorporates:
     *  Constant: '<S30>/Calibration23'
     *
     * Block description for '<S30>/Calibration23':
     *  [10]
     */
    HvCoorn_ARID_DEF.outRanged = (HvCoorn_rBMSIsoFailThd_C < rtb_Saturation2_jr);

    /* Sum: '<S30>/Subtract7' incorporates:
     *  Constant: '<S30>/Calibration23'
     *  Constant: '<S30>/Calibration24'
     *
     * Block description for '<S30>/Calibration23':
     *  [10]
     *
     * Block description for '<S30>/Calibration24':
     *  [20]
     */
    rtb_DataTypeConversion_jq = HvCoorn_rBMSIsoFailThd_C - HvCoorn_rBMSIsoRcv_C;
    if (rtb_DataTypeConversion_jq > 32767) {
      rtb_DataTypeConversion_jq = 32767;
    } else if (rtb_DataTypeConversion_jq < -32768) {
      rtb_DataTypeConversion_jq = -32768;
    }

    /* Logic: '<S277>/Logical_Operator4' incorporates:
     *  Logic: '<S275>/LORelay1'
     *  Logic: '<S277>/Logical Operator1'
     *  Logic: '<S277>/Logical_Operator5'
     *  RelationalOperator: '<S275>/ROLoLim'
     *  Sum: '<S30>/Subtract7'
     *  UnitDelay: '<S277>/Unit Delay'
     */
    HvCoorn_bBMSIsoErr = ((rtb_Saturation2_jr >= rtb_DataTypeConversion_jq) && (
      !rtb_AND7_g) && (HvCoorn_ARID_DEF.outRanged ||
                       HvCoorn_ARID_DEF.UnitDelay_DSTATE_owp));

    /* Update for UnitDelay: '<S276>/Unit Delay2' */
    HvCoorn_ARID_DEF.UnitDelay2_DSTATE_fu = rtb_AND32_f;

    /* Switch: '<S275>/Switch3' */
    if (HvCoorn_ARID_DEF.outRanged) {
      /* Update for UnitDelay: '<S275>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_fc = rtb_Switch2_p5;
    } else {
      /* Update for UnitDelay: '<S275>/Unit Delay' */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_fc = rtb_Saturation2_jr;
    }

    /* End of Switch: '<S275>/Switch3' */

    /* Update for UnitDelay: '<S277>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_owp = HvCoorn_bBMSIsoErr;
  }

  /* End of Logic: '<S274>/Logical Operator' */
  /* End of Outputs for SubSystem: '<S241>/Debounce_OBD' */

  /* Logic: '<S242>/Logical Operator1' */
  rtb_TmpSignalConversionAticis_b = !rtb_TmpSignalConversionAtDTC_bD;
  for (i = 0; i < 9; i++) {
    /* Logic: '<S242>/Logical_Operator4' incorporates:
     *  Logic: '<S242>/Logical_Operator5'
     *  UnitDelay: '<S242>/Unit Delay'
     */
    tmpForInput[i] = (rtb_TmpSignalConversionAticis_b &&
                      (HvCoorn_ARID_DEF.Logical_Operator4[i] ||
                       HvCoorn_ARID_DEF.UnitDelay_DSTATE_jj[i]));
  }

  /* SignalConversion: '<S30>/Signal Copy' */
  HvCoorn_bBMSHvilErr = tmpForInput[0];

  /* SignalConversion: '<S30>/Signal Copy1' */
  HvCoorn_bFMCUHvilErr = tmpForInput[1];

  /* SignalConversion: '<S30>/Signal Copy2' */
  HvCoorn_bRMCUHvilErr = tmpForInput[2];

  /* SignalConversion: '<S30>/Signal Copy3' */
  HvCoorn_bOBCHvilErr = tmpForInput[3];

  /* SignalConversion: '<S30>/Signal Copy4' */
  HvCoorn_bDCDCHvilErr = tmpForInput[4];

  /* SignalConversion: '<S30>/Signal Copy5' */
  HvCoorn_bHWHvilErr = tmpForInput[5];

  /* SignalConversion: '<S30>/Signal Copy6' */
  HvCoorn_bWPTCHvilErr = tmpForInput[6];

  /* SignalConversion: '<S30>/Signal Copy7' */
  HvCoorn_bEASHvilErr = tmpForInput[7];

  /* SignalConversion: '<S30>/Signal Copy8' */
  HvCoorn_bISGHvilErr = tmpForInput[8];

  /* Switch: '<S245>/Switch' incorporates:
   *  Switch: '<S245>/Switch1'
   */
  if (rtb_AND7_j) {
    /* Product: '<S245>/Divide' incorporates:
     *  Constant: '<S30>/Calibration4'
     *
     * Block description for '<S30>/Calibration4':
     *  [15]
     */
    tmpRead_i = HvCoorn_tiHeatgDly4ChkErr_C / HvCoorn_ConstB.Max_pa;

    /* DataTypeConversion: '<S245>/DataTypeConversion' */
    tmpRead_h = fabsf(tmpRead_i);
    if (tmpRead_h < 8.388608E+6F) {
      if (tmpRead_h >= 0.5F) {
        /* Update for UnitDelay: '<S245>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_ds = (sint32)floorf(tmpRead_i + 0.5F);
      } else {
        /* Update for UnitDelay: '<S245>/Unit Delay' incorporates:
         *  DataTypeConversion: '<S287>/DataTypeConversion'
         */
        HvCoorn_ARID_DEF.UnitDelay_DSTATE_ds = 0;
      }
    } else {
      /* Update for UnitDelay: '<S245>/Unit Delay' incorporates:
       *  DataTypeConversion: '<S287>/DataTypeConversion'
       */
      HvCoorn_ARID_DEF.UnitDelay_DSTATE_ds = (sint32)tmpRead_i;
    }

    /* End of DataTypeConversion: '<S245>/DataTypeConversion' */
  } else if (rtb_TmpSignalConversionAtVehC_i) {
    /* Update for UnitDelay: '<S245>/Unit Delay' incorporates:
     *  Constant: '<S245>/single5'
     *  DataTypeConversion: '<S287>/DataTypeConversion'
     *  Sum: '<S245>/Subtract'
     *  Switch: '<S245>/Switch1'
     */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_ds -= 1;
  }

  /* End of Switch: '<S245>/Switch' */
  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */

  /* SignalConversion: '<S31>/Signal Copy' incorporates:
   *  Inport: '<Root>/HvCoorn_pctSOCV2XLimSetEER'
   */
  (void)Rte_Read_HvCoorn_pctSOCV2XLimSetEER_Value((float32 *)
    &HvCoorn_pctSOCV2XLimSetEER);

  /* RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
   *  SubSystem: '<Root>/HvCoorn'
   */
  /* Logic: '<S37>/OR' incorporates:
   *  Constant: '<S31>/uint8'
   *  RelationalOperator: '<S31>/Equal'
   */
  rtb_bGearOk = (HvCoorn_stHVP == ((uint8)89U));

  /* SignalConversion generated from: '<S1>/icicm_stIvtrSwt' incorporates:
   *  Inport: '<Root>/icicm_stIvtrSwt'
   */
  (void)Rte_Read_icicm_stIvtrSwt_Value(&rtb_TmpSignalConversionAticic_m);

  /* SignalConversion generated from: '<S1>/PwrLimBatt_pwrContnsDChrg' incorporates:
   *  Inport: '<Root>/PwrLimBatt_pwrContnsDChrg'
   */
  (void)Rte_Read_PwrLimBatt_pwrContnsDChrg_Value
    (&rtb_TmpSignalConversionAtPwrL_i);

  /* RelationalOperator: '<S31>/Equal3' incorporates:
   *  Constant: '<S31>/Calibration1'
   *
   * Block description for '<S31>/Calibration1':
   *  [6600]
   */
  rtb_RelationalOperator_ce_idx_0 = (rtb_TmpSignalConversionAtPwrL_i >=
    HvCoorn_pwrV2LEnaLowLim_C);

  /* SignalConversion generated from: '<S1>/EngStrtStop_bFuChrgActvEEW' incorporates:
   *  Inport: '<Root>/EngStrtStop_bFuChrgActvEEW'
   */
  (void)Rte_Read_EngStrtStop_bFuChrgActvEEW_Value
    (&rtb_TmpSignalConversionAtEngS_k);

  /* SignalConversion generated from: '<S1>/icicm_pctSOCV2XLimSet' incorporates:
   *  Inport: '<Root>/icicm_pctSOCV2XLimSet'
   */
  (void)Rte_Read_icicm_pctSOCV2XLimSet_Value(&rtb_TmpSignalConversionAticicm_);

  /* Switch: '<S31>/Switch1' incorporates:
   *  Constant: '<S31>/uint3'
   *  Constant: '<S31>/uint4'
   *  Constant: '<S31>/uint6'
   *  Constant: '<S31>/uint7'
   *  Logic: '<S31>/AND4'
   *  Logic: '<S31>/AND5'
   *  RelationalOperator: '<S31>/Equal10'
   *  RelationalOperator: '<S31>/Equal11'
   *  RelationalOperator: '<S31>/Equal12'
   *  RelationalOperator: '<S31>/Equal9'
   *  Switch: '<S31>/Switch'
   */
  if ((rtb_TmpSignalConversionAticicm_ <= ((uint8)100U)) &&
      (rtb_TmpSignalConversionAticicm_ >= ((uint8)20U))) {
    /* Switch: '<S31>/Switch1' */
    HvCoorn_pctSOCV2XLimSetEEW = rtb_TmpSignalConversionAticicm_;
  } else if ((HvCoorn_pctSOCV2XLimSetEER <= ((uint8)100U)) &&
             (HvCoorn_pctSOCV2XLimSetEER >= ((uint8)20U))) {
    /* Switch: '<S31>/Switch' incorporates:
     *  Switch: '<S31>/Switch1'
     */
    HvCoorn_pctSOCV2XLimSetEEW = HvCoorn_pctSOCV2XLimSetEER;
  } else {
    /* Switch: '<S31>/Switch1' incorporates:
     *  Constant: '<S31>/uint5'
     *  Switch: '<S31>/Switch'
     *
     * Block description for '<S31>/uint5':
     *  [20]
     */
    HvCoorn_pctSOCV2XLimSetEEW = HvCoorn_pctSOCV2XLimSetDft_C;
  }

  /* End of Switch: '<S31>/Switch1' */

  /* Switch: '<S31>/Switch2' */
  if (rtb_TmpSignalConversionAtEngS_k) {
    /* Switch: '<S31>/Switch2' incorporates:
     *  Constant: '<S31>/TRUE'
     *
     * Block description for '<S31>/TRUE':
     *  TRUE
     */
    rtb_AND3 = true;
  } else {
    /* Switch: '<S31>/Switch2' incorporates:
     *  RelationalOperator: '<S31>/Equal5'
     */
    rtb_AND3 = (rtb_TmpSignalConversionAticbms_ > HvCoorn_pctSOCV2XLimSetEEW);
  }

  /* End of Switch: '<S31>/Switch2' */

  /* Logic: '<S31>/AND' incorporates:
   *  Constant: '<S31>/Constant1'
   *  Constant: '<S31>/Constant6'
   *  Constant: '<S31>/uint1'
   *  Logic: '<S31>/OR'
   *  RelationalOperator: '<S31>/Equal1'
   *  RelationalOperator: '<S31>/Equal4'
   *  RelationalOperator: '<S31>/Equal8'
   *
   * Block description for '<S31>/Constant1':
   *  [3]
   *
   * Block description for '<S31>/Constant6':
   *  [7]
   */
  HvCoorn_bV2LReqSet = (rtb_bGearOk && (rtb_TmpSignalConversionAticic_m ==
    ((uint8)2U)) && rtb_RelationalOperator_ce_idx_0 &&
                        rtb_TmpSignalConversionAticob_m &&
                        HvCoorn_bParked4ChDchg && rtb_AND3 &&
                        ((rtb_TmpSignalConversionAticob_c != ((uint8)3U)) &&
    (rtb_TmpSignalConversionAticob_c != ((uint8)7U))) && tmp_1);

  /* Logic: '<S31>/AND7' incorporates:
   *  Constant: '<S31>/Constant2'
   *  Constant: '<S31>/Constant5'
   *  RelationalOperator: '<S31>/Equal14'
   *  RelationalOperator: '<S31>/Equal6'
   *
   * Block description for '<S31>/Constant2':
   *  [9]
   *
   * Block description for '<S31>/Constant5':
   *  [4]
   */
  rtb_AND7_j = ((rtb_TmpSignalConversionAticob_c == ((uint8)4U)) ||
                (rtb_TmpSignalConversionAticob_c == ((uint8)9U)));

  /* Logic: '<S31>/Not5' */
  rtb_TmpSignalConversionAtDTC_bD = !rtb_bGearOk;

  /* RelationalOperator: '<S31>/Equal2' incorporates:
   *  Constant: '<S31>/uint2'
   */
  rtb_TmpSignalConversionAticis_b = (rtb_TmpSignalConversionAticic_m == ((uint8)
    1U));

  /* Switch: '<S31>/Switch3' */
  if (rtb_TmpSignalConversionAtEngS_k) {
    /* Logic: '<S37>/OR' incorporates:
     *  Constant: '<S31>/Calibration3'
     *  RelationalOperator: '<S31>/Equal13'
     *
     * Block description for '<S31>/Calibration3':
     *  [5]
     */
    rtb_bGearOk = (rtb_TmpSignalConversionAticbms_ < HvCoorn_pctBatSocV2LExThd_C);
  } else {
    /* Logic: '<S37>/OR' incorporates:
     *  Logic: '<S31>/Not7'
     */
    rtb_bGearOk = !rtb_AND3;
  }

  /* End of Switch: '<S31>/Switch3' */

  /* SignalConversion generated from: '<S1>/icobc_stV2LFltTyp' incorporates:
   *  Inport: '<Root>/icobc_stV2LFltTyp'
   */
  (void)Rte_Read_icobc_stV2LFltTyp_Value(&rtb_TmpSignalConversionAtico_em);

  /* Logic: '<S280>/Logical_Operator4' incorporates:
   *  Constant: '<S31>/uint10'
   *  Constant: '<S31>/uint11'
   *  Constant: '<S31>/uint9'
   *  Logic: '<S280>/Logical_Operator5'
   *  Logic: '<S31>/Not6'
   *  Logic: '<S31>/OR1'
   *  RelationalOperator: '<S31>/Equal15'
   *  RelationalOperator: '<S31>/Equal16'
   *  RelationalOperator: '<S31>/Equal17'
   *  UnitDelay: '<S280>/Unit Delay'
   */
  rtb_TmpSignalConversionAtEngS_k = (rtb_TmpSignalConversionAticob_m &&
    ((rtb_TmpSignalConversionAtico_em == ((uint8)1U)) ||
     (rtb_TmpSignalConversionAtico_em == ((uint8)2U)) ||
     (rtb_TmpSignalConversionAtico_em == ((uint8)3U)) ||
     HvCoorn_ARID_DEF.UnitDelay_DSTATE_lb));

  /* UnitDelay: '<S31>/Unit Delay' */
  HvCoorn_bV2LReqOvtiRst = HvCoorn_ARID_DEF.UnitDelay_DSTATE_pf;

  /* Logic: '<S31>/AND3' incorporates:
   *  Constant: '<S31>/Constant4'
   *  Logic: '<S278>/Logical Operator'
   *  Logic: '<S278>/Logical Operator1'
   *  Logic: '<S31>/Not2'
   *  Logic: '<S31>/Not3'
   *  Logic: '<S31>/Not4'
   *  RelationalOperator: '<S31>/Equal7'
   *  UnitDelay: '<S278>/Unit Delay2'
   *
   * Block description for '<S31>/Constant4':
   *  [7]
   */
  HvCoorn_bV2LReqRst = (rtb_TmpSignalConversionAtDTC_bD ||
                        (rtb_TmpSignalConversionAticis_b &&
    (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_pj)) ||
                        (!rtb_RelationalOperator_ce_idx_0) ||
                        (!rtb_TmpSignalConversionAticob_m) ||
                        (!HvCoorn_bParked4ChDchg) || rtb_bGearOk ||
                        HvCoorn_bDCChrgLink || (rtb_TmpSignalConversionAticob_c ==
    ((uint8)7U)) || rtb_TmpSignalConversionAticic_a ||
                        rtb_TmpSignalConversionAtEngS_k ||
                        HvCoorn_bV2LReqOvtiRst);

  /* Logic: '<S279>/Logical_Operator4' incorporates:
   *  Logic: '<S279>/Logical Operator1'
   *  Logic: '<S279>/Logical_Operator5'
   *  UnitDelay: '<S279>/Unit Delay'
   */
  HvCoorn_bV2LReq = ((!HvCoorn_bV2LReqRst) && (HvCoorn_bV2LReqSet ||
    HvCoorn_bV2LReq));

  /* Switch: '<S281>/Switch' */
  if (HvCoorn_bV2LReq) {
    /* Sum: '<S281>/Subtract1' incorporates:
     *  Constant: '<S281>/single1'
     *  UnitDelay: '<S281>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ak < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ak)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ak > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ak)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ak + 1;
    }

    /* End of Sum: '<S281>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S281>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S281>/Switch' */

  /* Update for UnitDelay: '<S281>/Unit Delay' incorporates:
   *  Saturate: '<S281>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ak = rtb_DataTypeConversion_jq;

  /* Product: '<S281>/Divide' incorporates:
   *  Constant: '<S31>/Calibration2'
   *
   * Block description for '<S31>/Calibration2':
   *  [5]
   */
  tmpRead_i = HvCoorn_tiV2LWaitOBCRsp_C / HvCoorn_ConstB.Max_eo;

  /* DataTypeConversion: '<S281>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* RelationalOperator: '<S281>/Relational Operator1' incorporates:
   *  DataTypeConversion: '<S281>/DataTypeConversion'
   *  Saturate: '<S281>/Saturation2'
   */
  rtb_TmpSignalConversionAticob_m = (rtb_DataTypeConversion_jq > (sint32)
    tmpRead_i);

  /* Logic: '<S31>/AND2' */
  HvCoorn_bV2LActv = (HvCoorn_bV2LReq && rtb_AND7_j);

  /* SignalConversion generated from: '<S1>/icicm_stIvtrEnaSwt' incorporates:
   *  Inport: '<Root>/icicm_stIvtrEnaSwt'
   */
  (void)Rte_Read_icicm_stIvtrEnaSwt_Value(&rtb_TmpSignalConversionAticic_k);

  /* SignalConversion generated from: '<S1>/ibsw_bCnctElecDvce' incorporates:
   *  Inport: '<Root>/ibsw_bCnctElecDvce'
   */
  (void)Rte_Read_ibsw_bCnctElecDvce_Value(&rtb_TmpSignalConversionAtibsw_b);

  /* Logic: '<S32>/AND' incorporates:
   *  Constant: '<S32>/Calibration1'
   *  Constant: '<S32>/Constant5'
   *  Constant: '<S32>/Constant6'
   *  Constant: '<S32>/Constant9'
   *  Constant: '<S32>/hpp_tiRemHvBatPrecdngSet_C2'
   *  Constant: '<S32>/uint1'
   *  Constant: '<S32>/uint2'
   *  Constant: '<S32>/uint8'
   *  Logic: '<S284>/Logical Operator'
   *  Logic: '<S284>/Logical Operator1'
   *  Logic: '<S32>/OR'
   *  Logic: '<S32>/OR1'
   *  Logic: '<S32>/OR8'
   *  RelationalOperator: '<S32>/Equal'
   *  RelationalOperator: '<S32>/Equal1'
   *  RelationalOperator: '<S32>/Equal2'
   *  RelationalOperator: '<S32>/Equal3'
   *  RelationalOperator: '<S32>/Equal4'
   *  RelationalOperator: '<S32>/Equal5'
   *  RelationalOperator: '<S32>/Equal6'
   *  RelationalOperator: '<S32>/Equal7'
   *  UnitDelay: '<S284>/Unit Delay2'
   *
   * Block description for '<S32>/Calibration1':
   *  [3300]
   *
   * Block description for '<S32>/Constant5':
   *  [3]
   *
   * Block description for '<S32>/Constant6':
   *  [7]
   *
   * Block description for '<S32>/Constant9':
   *  [0]
   *
   * Block description for '<S32>/hpp_tiRemHvBatPrecdngSet_C2':
   *  [20]
   */
  HvCoorn_bV2InEnaRawSet = (((HvCoorn_stHVP == ((uint8)89U)) || (HvCoorn_stHVP ==
    ((uint8)90U))) && rtb_TmpSignalConversionAtidi_bK &&
    (rtb_TmpSignalConversionAtPwrL_i >= HvCoorn_pwrBattV2InEnaLowLim_C) &&
    (rtb_TmpSignalConversionAticbms_ > HvCoorn_pctHvBatSocV2InActvThd_C) &&
    ((rtb_TmpSignalConversionAticob_c != ((uint8)3U)) &&
     (rtb_TmpSignalConversionAticob_c != ((uint8)7U))) &&
    (rtb_TmpSignalConversionAtico_my == ((uint8)0U)) &&
    ((rtb_TmpSignalConversionAticic_k == ((uint8)2U)) ||
     (rtb_TmpSignalConversionAtibsw_b && (!HvCoorn_ARID_DEF.UnitDelay2_DSTATE_fo))));

  /* Logic: '<S32>/Not1' incorporates:
   *  Logic: '<S283>/Logical Operator1'
   */
  tmp_0 = !rtb_TmpSignalConversionAtibsw_b;

  /* Switch: '<S287>/Switch' incorporates:
   *  Logic: '<S32>/AND2'
   *  Logic: '<S32>/Not1'
   *  UnitDelay: '<S32>/UnitDelay'
   */
  if (tmp_0 && HvCoorn_bV2InReq) {
    /* Sum: '<S287>/Subtract1' incorporates:
     *  Constant: '<S287>/single1'
     *  UnitDelay: '<S287>/Unit Delay'
     */
    if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ns < 0) && (1 < MIN_int32_T
         - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ns)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MIN_int32_T;
    } else if ((HvCoorn_ARID_DEF.UnitDelay_DSTATE_ns > 0) && (1 > MAX_int32_T
                - HvCoorn_ARID_DEF.UnitDelay_DSTATE_ns)) {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = MAX_int32_T;
    } else {
      /* DataTypeConversion: '<S287>/DataTypeConversion' */
      rtb_DataTypeConversion_jq = HvCoorn_ARID_DEF.UnitDelay_DSTATE_ns + 1;
    }

    /* End of Sum: '<S287>/Subtract1' */
  } else {
    /* DataTypeConversion: '<S287>/DataTypeConversion' incorporates:
     *  Constant: '<S287>/single2'
     */
    rtb_DataTypeConversion_jq = 0;
  }

  /* End of Switch: '<S287>/Switch' */

  /* Logic: '<S286>/Logical_Operator4' incorporates:
   *  Constant: '<S32>/uint10'
   *  Constant: '<S32>/uint11'
   *  Constant: '<S32>/uint9'
   *  Logic: '<S286>/Logical_Operator5'
   *  Logic: '<S32>/Not6'
   *  Logic: '<S32>/OR2'
   *  RelationalOperator: '<S32>/Equal11'
   *  RelationalOperator: '<S32>/Equal14'
   *  RelationalOperator: '<S32>/Equal15'
   *  UnitDelay: '<S286>/Unit Delay'
   */
  rtb_TmpSignalConversionAtDTC_bD = (rtb_TmpSignalConversionAtibsw_b &&
    ((rtb_TmpSignalConversionAtico_em == ((uint8)1U)) ||
     (rtb_TmpSignalConversionAtico_em == ((uint8)2U)) ||
     (rtb_TmpSignalConversionAtico_em == ((uint8)3U)) ||
     HvCoorn_ARID_DEF.UnitDelay_DSTATE_iqw));

  /* Product: '<S287>/Divide' incorporates:
   *  Constant: '<S32>/Calibration3'
   *
   * Block description for '<S32>/Calibration3':
   *  [3600]
   */
  tmpRead_i = HvCoorn_tiDiscnctDvceExThd_C / HvCoorn_ConstB.Max_o4;

  /* DataTypeConversion: '<S287>/DataTypeConversion' */
  tmpRead_h = fabsf(tmpRead_i);
  if (tmpRead_h < 8.388608E+6F) {
    if (tmpRead_h >= 0.5F) {
      tmpRead_i = floorf(tmpRead_i + 0.5F);
    } else {
      tmpRead_i = 0.0F;
    }
  }

  /* Logic: '<S32>/AND1' incorporates:
   *  Constant: '<S32>/Calibration2'
   *  Constant: '<S32>/Calibration4'
   *  Constant: '<S32>/Constant10'
   *  Constant: '<S32>/Constant4'
   *  Constant: '<S32>/hpp_tiRemHvBatPrecdngSet_C1'
   *  Constant: '<S32>/uint4'
   *  DataTypeConversion: '<S287>/DataTypeConversion'
   *  Logic: '<S282>/Logical Operator'
   *  Logic: '<S283>/Logical Operator'
   *  Logic: '<S32>/AND3'
   *  Logic: '<S32>/AND4'
   *  Logic: '<S32>/OR3'
   *  RelationalOperator: '<S287>/Relational Operator1'
   *  RelationalOperator: '<S32>/Equal10'
   *  RelationalOperator: '<S32>/Equal12'
   *  RelationalOperator: '<S32>/Equal13'
   *  RelationalOperator: '<S32>/Equal16'
   *  RelationalOperator: '<S32>/Equal9'
   *  Saturate: '<S287>/Saturation2'
   *  UnitDelay: '<S282>/Unit Delay2'
   *  UnitDelay: '<S283>/Unit Delay2'
   *  UnitDelay: '<S32>/UnitDelay'
   *
   * Block description for '<S32>/Calibration2':
   *  [3300]
   *
   * Block description for '<S32>/Calibration4':
   *  [1]
   *
   * Block description for '<S32>/Constant10':
   *  [1]
   *
   * Block description for '<S32>/Constant4':
   *  [7]
   *
   * Block description for '<S32>/hpp_tiRemHvBatPrecdngSet_C1':
   *  [20]
   */
  HvCoorn_bV2InEnaRawRst = ((rtb_TmpSignalConversionAticic_k == ((uint8)1U)) ||
    (tmp_0 && HvCoorn_ARID_DEF.UnitDelay2_DSTATE_ho && HvCoorn_bV2InReq) ||
    (rtb_DataTypeConversion_jq > (sint32)tmpRead_i) ||
    rtb_TmpSignalConversionAtved_bH || (rtb_TmpSignalConversionAticbms_ <
    HvCoorn_pctHvBatSocV2InExThd_C) || (rtb_TmpSignalConversionAticob_c ==
    ((uint8)7U)) || (rtb_TmpSignalConversionAtico_my == ((uint8)1U)) ||
    (rtb_RelationalOperator_f_tmp && HvCoorn_ARID_DEF.UnitDelay2_DSTATE_ay) ||
    (rtb_TmpSignalConversionAtPwrL_i < HvCoorn_pwrBattV2InExHighLim_C) ||
    (rtb_TmpSignalConversionAticic_a && HvCoorn_bOTAOnExV2InEna_C) ||
    rtb_TmpSignalConversionAtDTC_bD);

  /* Logic: '<S285>/Logical_Operator4' incorporates:
   *  Logic: '<S285>/Logical Operator1'
   *  Logic: '<S285>/Logical_Operator5'
   *  UnitDelay: '<S285>/Unit Delay'
   */
  HvCoorn_bV2InReq = ((!HvCoorn_bV2InEnaRawRst) && (HvCoorn_bV2InEnaRawSet ||
    HvCoorn_bV2InReq));

  /* Logic: '<S32>/OR7' incorporates:
   *  Constant: '<S32>/Constant2'
   *  Constant: '<S32>/Constant3'
   *  Logic: '<S32>/AND6'
   *  RelationalOperator: '<S32>/Equal17'
   *  RelationalOperator: '<S32>/Equal8'
   *
   * Block description for '<S32>/Constant2':
   *  [8]
   *
   * Block description for '<S32>/Constant3':
   *  [4]
   */
  HvCoorn_bV2InEna = (HvCoorn_bV2InReq && ((rtb_TmpSignalConversionAticob_c ==
    ((uint8)8U)) || (rtb_TmpSignalConversionAticob_c == ((uint8)9U))));

  /* Switch: '<S37>/Switch' incorporates:
   *  Constant: '<S37>/icbms_undefined1'
   *  Constant: '<S37>/icbms_undefined2'
   *  Logic: '<S37>/OR'
   *  RelationalOperator: '<S37>/Equal1'
   *  RelationalOperator: '<S37>/Equal2'
   *  Switch: '<S342>/Switch4'
   *
   * Block description for '<S37>/icbms_undefined1':
   *  [5]
   *
   * Block description for '<S37>/icbms_undefined2':
   *  [4]
   */
  if ((HvCoorn_stVoltMod == ((uint8)4U)) || (HvCoorn_stVoltMod == ((uint8)5U)))
  {
    /* Switch: '<S342>/Switch1' incorporates:
     *  Constant: '<S37>/sup_uIpuShutdown_C'
     *  RelationalOperator: '<S342>/Relational Operator5'
     *  UnitDelay: '<S342>/Unit Delay'
     *
     * Block description for '<S37>/sup_uIpuShutdown_C':
     *  [385]
     */
    if (HvCoorn_uVoltModISGReq_C > HvCoorn_uISGReq) {
      /* Sum: '<S342>/Add' */
      rtb_TmpSignalConversionAtVehSpd = HvCoorn_uVoltModISGReq_C -
        HvCoorn_uISGReq;

      /* Switch: '<S342>/Switch2' incorporates:
       *  Constant: '<S342>/Constant1'
       *  Constant: '<S37>/sup_uIpuShutdown_C1'
       *  DataTypeConversion: '<S342>/Data Type Conversion1'
       *  Logic: '<S342>/Logical Operator1'
       *  RelationalOperator: '<S342>/Relational Operator'
       *  RelationalOperator: '<S342>/Relational Operator2'
       *
       * Block description for '<S37>/sup_uIpuShutdown_C1':
       *  [2]
       */
      if ((rtb_TmpSignalConversionAtVehSpd > HvCoorn_duVoltModISGReqIncGrdt_C) &&
          (rtb_TmpSignalConversionAtVehSpd > ((uint8)0U))) {
        /* Switch: '<S342>/Switch4' incorporates:
         *  Sum: '<S342>/Add1'
         *  Switch: '<S342>/Switch1'
         *  Switch: '<S342>/Switch2'
         */
        HvCoorn_uISGReq = HvCoorn_duVoltModISGReqIncGrdt_C + HvCoorn_uISGReq;
      } else {
        /* Switch: '<S342>/Switch4' incorporates:
         *  Switch: '<S342>/Switch1'
         *  Switch: '<S342>/Switch2'
         */
        HvCoorn_uISGReq = HvCoorn_uVoltModISGReq_C;
      }

      /* End of Switch: '<S342>/Switch2' */
    } else {
      /* Sum: '<S342>/Add2' */
      rtb_TmpSignalConversionAtVehSpd = HvCoorn_uISGReq -
        HvCoorn_uVoltModISGReq_C;

      /* Switch: '<S342>/Switch3' incorporates:
       *  Constant: '<S342>/Constant2'
       *  Constant: '<S37>/sup_uIpuShutdown_C2'
       *  DataTypeConversion: '<S342>/Data Type Conversion2'
       *  Logic: '<S342>/Logical Operator2'
       *  RelationalOperator: '<S342>/Relational Operator3'
       *  RelationalOperator: '<S342>/Relational Operator4'
       *
       * Block description for '<S37>/sup_uIpuShutdown_C2':
       *  [2]
       */
      if ((rtb_TmpSignalConversionAtVehSpd > HvCoorn_duVoltModISGReqDecGrdt_C) &&
          (rtb_TmpSignalConversionAtVehSpd > ((uint8)0U))) {
        /* Switch: '<S342>/Switch4' incorporates:
         *  Sum: '<S342>/Add3'
         *  Switch: '<S342>/Switch1'
         *  Switch: '<S342>/Switch3'
         */
        HvCoorn_uISGReq = HvCoorn_uISGReq - HvCoorn_duVoltModISGReqDecGrdt_C;
      } else {
        /* Switch: '<S342>/Switch4' incorporates:
         *  Switch: '<S342>/Switch1'
         *  Switch: '<S342>/Switch3'
         */
        HvCoorn_uISGReq = HvCoorn_uVoltModISGReq_C;
      }

      /* End of Switch: '<S342>/Switch3' */
    }

    /* End of Switch: '<S342>/Switch1' */
  } else {
    /* Switch: '<S342>/Switch4' incorporates:
     *  MinMax: '<S37>/MinMax'
     */
    HvCoorn_uISGReq = fmaxf(tmpRead_4, rtb_TmpSignalConversionAticisg_);
  }

  /* Outport: '<Root>/HvCoorn_stHVP' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion'
   */
  (void)Rte_Write_HvCoorn_stHVP_Value(HvCoorn_stHVP);

  /* Outport: '<Root>/HvCoorn_stFMCUModeReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion1'
   */
  (void)Rte_Write_HvCoorn_stFMCUModeReq_Value(HvCoorn_stFMCUModeReq);

  /* Outport: '<Root>/HvCoorn_bHvOnFail' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion10'
   */
  (void)Rte_Write_HvCoorn_bHvOnFail_Value(HvCoorn_bHvOnFail);

  /* Outport: '<Root>/HvCoorn_bHvInitFail' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion11'
   */
  (void)Rte_Write_HvCoorn_bHvInitFail_Value(HvCoorn_bHvInitFail);

  /* Outport: '<Root>/HvCoorn_bHvReady' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion12'
   */
  (void)Rte_Write_HvCoorn_bHvReady_Value(HvCoorn_bHvReady);

  /* Outport: '<Root>/HvCoorn_bDrvRdy' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion13'
   */
  (void)Rte_Write_HvCoorn_bDrvRdy_Value(HvCoorn_bDrvRdy);

  /* Outport: '<Root>/HvCoorn_bACChrgLink' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion14'
   */
  (void)Rte_Write_HvCoorn_bACChrgLink_Value(HvCoorn_bACChrgLink);

  /* Outport: '<Root>/HvCoorn_bACChrgLinkOk' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion15'
   */
  (void)Rte_Write_HvCoorn_bACChrgLinkOk_Value(HvCoorn_bACChrgLinkOk);

  /* Outport: '<Root>/HvCoorn_stHvil' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion16'
   */
  (void)Rte_Write_HvCoorn_stHvil_Value(HvCoorn_stHvil);

  /* Outport: '<Root>/HvCoorn_bHvilHwErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion17'
   */
  (void)Rte_Write_HvCoorn_bHvilHwErr_Value(HvCoorn_bHvilHwErr);

  /* Outport: '<Root>/HvCoorn_bHvilStOk' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion18'
   */
  (void)Rte_Write_HvCoorn_bHvilStOk_Value(HvCoorn_bHvilStOk);

  /* Outport: '<Root>/HvCoorn_bACChrgPause' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion19'
   */
  (void)Rte_Write_HvCoorn_bACChrgPause_Value(HvCoorn_bACChrgPause);

  /* Outport: '<Root>/HvCoorn_stRMCUModeReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion2'
   */
  (void)Rte_Write_HvCoorn_stRMCUModeReq_Value(HvCoorn_stRMCUModeReq);

  /* Outport: '<Root>/HvCoorn_bStartUpReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion20'
   */
  (void)Rte_Write_HvCoorn_bStartUpReq_Value(HvCoorn_bStartUpReq);

  /* Outport: '<Root>/HvCoorn_bHvRlyClsAct' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion21'
   */
  (void)Rte_Write_HvCoorn_bHvRlyClsAct_Value(HvCoorn_bHvRlyClsAct);

  /* Outport: '<Root>/HvCoorn_bHvRlyOpenAct' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion22'
   */
  (void)Rte_Write_HvCoorn_bHvRlyOpenAct_Value(HvCoorn_bHvRlyOpenAct);

  /* Outport: '<Root>/HvCoorn_bHvRlyStuck' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion23'
   */
  (void)Rte_Write_HvCoorn_bHvRlyStuck_Value(HvCoorn_bHvRlyStuck);

  /* Outport: '<Root>/HvCoorn_bACLinkTempErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion24'
   */
  (void)Rte_Write_HvCoorn_bACLinkTempErr_Value(HvCoorn_bACLinkTempErr);

  /* Outport: '<Root>/HvCoorn_bParked4ChDchg' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion25'
   */
  (void)Rte_Write_HvCoorn_bParked4ChDchg_Value(HvCoorn_bParked4ChDchg);

  /* Outport: '<Root>/HvCoorn_stISGModeReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion26'
   */
  (void)Rte_Write_HvCoorn_stISGModeReq_Value(HvCoorn_stISGModeReq);

  /* Outport: '<Root>/HvCoorn_bV2LReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion27'
   */
  (void)Rte_Write_HvCoorn_bV2LReq_Value(HvCoorn_bV2LReq);

  /* Outport: '<Root>/HvCoorn_bBattWarmReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion28'
   */
  (void)Rte_Write_HvCoorn_bBattWarmReq_Value(HvCoorn_bBattWarmReq);

  /* Outport: '<Root>/HvCoorn_stWarmTimeCfgResp' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion29'
   */
  (void)Rte_Write_HvCoorn_stWarmTimeCfgResp_Value(HvCoorn_stWarmTimeCfgResp);

  /* Outport: '<Root>/HvCoorn_stDCDCModeReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion3'
   */
  (void)Rte_Write_HvCoorn_stDCDCModeReq_Value(HvCoorn_stDCDCModeReq);

  /* Outport: '<Root>/HvCoorn_bACChrgEna' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion30'
   */
  (void)Rte_Write_HvCoorn_bACChrgEna_Value(HvCoorn_bACChrgEna);

  /* Outport: '<Root>/HvCoorn_bRemLvBatMntnReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion31'
   */
  (void)Rte_Write_HvCoorn_bRemLvBatMntnReq_Value(HvCoorn_bRemLvBatMntnReq);

  /* Outport: '<Root>/HvCoorn_bDCChrgLink' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion32'
   */
  (void)Rte_Write_HvCoorn_bDCChrgLink_Value(HvCoorn_bDCChrgLink);

  /* Outport: '<Root>/HvCoorn_bChrgLink' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion33'
   */
  (void)Rte_Write_HvCoorn_bChrgLink_Value(HvCoorn_bChrgLink);

  /* Outport: '<Root>/HvCoorn_bDCLinkTempErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion34'
   */
  (void)Rte_Write_HvCoorn_bDCLinkTempErr_Value(HvCoorn_bDCLinkTempErr);

  /* Outport: '<Root>/HvCoorn_bDCChrgEna' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion35'
   */
  (void)Rte_Write_HvCoorn_bDCChrgEna_Value(HvCoorn_bDCChrgEna);

  /* Outport: '<Root>/HvCoorn_bRMCUPlsHeatgReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion36'
   */
  (void)Rte_Write_HvCoorn_bRMCUPlsHeatgReq_Value(HvCoorn_bRMCUPlsHeatgReq);

  /* Outport: '<Root>/HvCoorn_bRMCUStalHeatgReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion37'
   */
  (void)Rte_Write_HvCoorn_bRMCUStalHeatgReq_Value(HvCoorn_bRMCUStalHeatgReq);

  /* Outport: '<Root>/HvCoorn_bEccEna' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion38'
   */
  (void)Rte_Write_HvCoorn_bEccEna_Value(HvCoorn_bEccEna);

  /* Outport: '<Root>/HvCoorn_bHvRlyUnexpdDcnctErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion39'
   */
  (void)Rte_Write_HvCoorn_bHvRlyUnexpdDcnctErr_Value
    (HvCoorn_bHvRlyUnexpdDcnctErr);

  /* Outport: '<Root>/HvCoorn_bHvOnReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion4'
   */
  (void)Rte_Write_HvCoorn_bHvOnReq_Value(HvCoorn_bHvOnReq);

  /* Outport: '<Root>/HvCoorn_bBMSUnexpdDcnctErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion40'
   */
  (void)Rte_Write_HvCoorn_bBMSUnexpdDcnctErr_Value(HvCoorn_bBMSUnexpdDcnctErr);

  /* Outport: '<Root>/HvCoorn_bMainRlyFail2ClsErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion41'
   */
  (void)Rte_Write_HvCoorn_bMainRlyFail2ClsErr_Value(HvCoorn_bMainRlyFail2ClsErr);

  /* Outport: '<Root>/HvCoorn_bPrechrgOvtiErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion42'
   */
  (void)Rte_Write_HvCoorn_bPrechrgOvtiErr_Value(HvCoorn_bPrechrgOvtiErr);

  /* Outport: '<Root>/HvCoorn_bDchrgOvtiErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion43'
   */
  (void)Rte_Write_HvCoorn_bDchrgOvtiErr_Value(HvCoorn_bDchrgOvtiErr);

  /* Outport: '<Root>/HvCoorn_bBMSHvilErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion44'
   */
  (void)Rte_Write_HvCoorn_bBMSHvilErr_Value(HvCoorn_bBMSHvilErr);

  /* Outport: '<Root>/HvCoorn_pctSOCV2XLimSetEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion45'
   */
  (void)Rte_Write_HvCoorn_pctSOCV2XLimSetEEW_Value(HvCoorn_pctSOCV2XLimSetEEW);

  /* Outport: '<Root>/HvCoorn_bDCUnexpdDcnctErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion46'
   */
  (void)Rte_Write_HvCoorn_bDCUnexpdDcnctErr_Value(HvCoorn_bDCUnexpdDcnctErr);

  /* Outport: '<Root>/HvCoorn_bV2LActv' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion47'
   */
  (void)Rte_Write_HvCoorn_bV2LActv_Value(HvCoorn_bV2LActv);

  /* Outport: '<Root>/HvCoorn_bAllwShutNet' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion48'
   */
  (void)Rte_Write_HvCoorn_bAllwShutNet_Value(HvCoorn_bAllwShutNet);

  /* Outport: '<Root>/HvCoorn_bAllwSlep' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion49'
   */
  (void)Rte_Write_HvCoorn_bAllwSlep_Value(HvCoorn_bAllwSlep);

  /* Outport: '<Root>/HvCoorn_stBMSModeReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion5'
   */
  (void)Rte_Write_HvCoorn_stBMSModeReq_Value(HvCoorn_stBMSModeReq);

  /* Outport: '<Root>/HvCoorn_stRdy2RdyWait' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion50'
   */
  (void)Rte_Write_HvCoorn_stRdy2RdyWait_Value(HvCoorn_stRdy2RdyWait);

  /* Outport: '<Root>/HvCoorn_bAuthentPass' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion51'
   */
  (void)Rte_Write_HvCoorn_bAuthentPass_Value(HvCoorn_bAuthentPass);

  /* Outport: '<Root>/HvCoorn_bDCDCHvilErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion52'
   */
  (void)Rte_Write_HvCoorn_bDCDCHvilErr_Value(HvCoorn_bDCDCHvilErr);

  /* Outport: '<Root>/HvCoorn_bFMCUHvilErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion53'
   */
  (void)Rte_Write_HvCoorn_bFMCUHvilErr_Value(HvCoorn_bFMCUHvilErr);

  /* Outport: '<Root>/HvCoorn_bRMCUHvilErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion54'
   */
  (void)Rte_Write_HvCoorn_bRMCUHvilErr_Value(HvCoorn_bRMCUHvilErr);

  /* Outport: '<Root>/HvCoorn_bOBCHvilErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion55'
   */
  (void)Rte_Write_HvCoorn_bOBCHvilErr_Value(HvCoorn_bOBCHvilErr);

  /* Outport: '<Root>/HvCoorn_bHWHvilErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion56'
   */
  (void)Rte_Write_HvCoorn_bHWHvilErr_Value(HvCoorn_bHWHvilErr);

  /* Outport: '<Root>/HvCoorn_bWPTCHvilErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion57'
   */
  (void)Rte_Write_HvCoorn_bWPTCHvilErr_Value(HvCoorn_bWPTCHvilErr);

  /* Outport: '<Root>/HvCoorn_bEASHvilErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion58'
   */
  (void)Rte_Write_HvCoorn_bEASHvilErr_Value(HvCoorn_bEASHvilErr);

  /* Outport: '<Root>/HvCoorn_bMCUAuthentPass' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion59'
   */
  (void)Rte_Write_HvCoorn_bMCUAuthentPass_Value(HvCoorn_bMCUAuthentPass);

  /* Outport: '<Root>/HvCoorn_bHvilClsReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion6'
   */
  (void)Rte_Write_HvCoorn_bHvilClsReq_Value(HvCoorn_bHvilClsReq);

  /* Outport: '<Root>/HvCoorn_bV2InReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion60'
   */
  (void)Rte_Write_HvCoorn_bV2InReq_Value(HvCoorn_bV2InReq);

  /* Outport: '<Root>/HvCoorn_bV2InEna' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion61'
   */
  (void)Rte_Write_HvCoorn_bV2InEna_Value(HvCoorn_bV2InEna);

  /* Outport: '<Root>/HvCoorn_bBMSIsoErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion62'
   */
  (void)Rte_Write_HvCoorn_bBMSIsoErr_Value(HvCoorn_bBMSIsoErr);

  /* Outport: '<Root>/HvCoorn_bSocWkup' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion63'
   */
  (void)Rte_Write_HvCoorn_bSocWkup_Value(HvCoorn_bSocWkup);

  /* Outport: '<Root>/HvCoorn_ctSmtBatMntnFailEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion64'
   */
  (void)Rte_Write_HvCoorn_ctSmtBatMntnFailEEW_Value(HvCoorn_ctSmtBatMntnFailEEW);

  /* Outport: '<Root>/HvCoorn_bKeyOnPwrUp' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion65'
   */
  (void)Rte_Write_HvCoorn_bKeyOnPwrUp_Value(HvCoorn_bKeyOnPwrUp);

  /* Outport: '<Root>/HvCoorn_stRemLvBatMntnFailRsn' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion66'
   */
  (void)Rte_Write_HvCoorn_stRemLvBatMntnFailRsn_Value
    (HvCoorn_stRemLvBatMntnFailRsn);

  /* Outport: '<Root>/HvCoorn_ctSmtBatMntnSucsEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion67'
   */
  (void)Rte_Write_HvCoorn_ctSmtBatMntnSucsEEW_Value(HvCoorn_ctSmtBatMntnSucsEEW);

  /* Outport: '<Root>/HvCoorn_bTimerWkupReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion68'
   */
  (void)Rte_Write_HvCoorn_bTimerWkupReq_Value(HvCoorn_bTimerWkupReq);

  /* Outport: '<Root>/HvCoorn_bLbmsLvBatMntnReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion69'
   */
  (void)Rte_Write_HvCoorn_bLbmsLvBatMntnReq_Value(HvCoorn_bLbmsLvBatMntnReq);

  /* Outport: '<Root>/HvCoorn_bActvDischargeErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion7'
   */
  (void)Rte_Write_HvCoorn_bActvDischargeErr_Value(HvCoorn_bActvDischargeErr);

  /* Outport: '<Root>/HvCoorn_pctLbmsSocMntnThd' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion70'
   */
  (void)Rte_Write_HvCoorn_pctLbmsSocMntnThd_Value(HvCoorn_pctLbmsSocMntnThd);

  /* Outport: '<Root>/HvCoorn_bLbmsSocWkup' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion71'
   */
  (void)Rte_Write_HvCoorn_bLbmsSocWkup_Value(HvCoorn_bLbmsSocWkup);

  /* Outport: '<Root>/HvCoorn_bISGHvilErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion72'
   */
  (void)Rte_Write_HvCoorn_bISGHvilErr_Value(HvCoorn_bISGHvilErr);

  /* Outport: '<Root>/HvCoorn_bAntiTrig430' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion73'
   */
  (void)Rte_Write_HvCoorn_bAntiTrig430_Value(HvCoorn_bAntiTrig430);

  /* Outport: '<Root>/HvCoorn_bAntiTrig42C' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion74'
   */
  (void)Rte_Write_HvCoorn_bAntiTrig42C_Value(HvCoorn_bAntiTrig42C);

  /* Outport: '<Root>/VCU_E2_counterfaieldEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion75'
   */
  (void)Rte_Write_VCU_E2_counterfaieldEEW_Value(VCU_E2_counterfaieldEEW);

  /* Outport: '<Root>/HvCoorn_stAuthChkFailLvl' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion76'
   */
  (void)Rte_Write_HvCoorn_stAuthChkFailLvl_Value(HvCoorn_stAuthChkFailLvl);
  for (i = 0; i < 8; i++) {
    /* Outport: '<Root>/HvCoorn_noVcuAuthFb' incorporates:
     *  Assignment: '<S33>/Assignment6'
     *  SignalConversion: '<S1>/Signal Conversion77'
     */
    HvCoorn_ARID_DEF.HvCoorn_noVcuAuthFb_l[i] = HvCoorn_noVcuAuthFb[i];

    /* Outport: '<Root>/HvCoorn_noVcuAuthReq' incorporates:
     *  Assignment: '<S33>/Assignment13'
     *  SignalConversion: '<S1>/Signal Conversion78'
     */
    HvCoorn_ARID_DEF.HvCoorn_noVcuAuthReq_b[i] = HvCoorn_noVcuAuthReq[i];
  }

  /* Outport: '<Root>/HvCoorn_bAuthFailSpdLim' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion79'
   */
  (void)Rte_Write_HvCoorn_bAuthFailSpdLim_Value(HvCoorn_bAuthFailSpdLim);

  /* Outport: '<Root>/HvCoorn_bEmgcyShutDownReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion8'
   */
  (void)Rte_Write_HvCoorn_bEmgcyShutDownReq_Value(HvCoorn_bEmgcyShutDownReq);

  /* Outport: '<Root>/HvCoorn_bVehNetWkupEna' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion84'
   */
  (void)Rte_Write_HvCoorn_bVehNetWkupEna_Value(HvCoorn_bVehNetWkupEna);

  /* Outport: '<Root>/HvCoorn_stVoltMod' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion85'
   */
  (void)Rte_Write_HvCoorn_stVoltMod_Value(HvCoorn_stVoltMod);

  /* Outport: '<Root>/HvCoorn_bVoltModStbReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion86'
   */
  (void)Rte_Write_HvCoorn_bVoltModStbReq_Value(HvCoorn_bVoltModStbReq);

  /* Outport: '<Root>/HvCoorn_bVoltModHvDisbOvtiErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion87'
   */
  (void)Rte_Write_HvCoorn_bVoltModHvDisbOvtiErr_Value
    (HvCoorn_bVoltModHvDisbOvtiErr);

  /* Outport: '<Root>/HvCoorn_bVoltModHvDcnctOvtiErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion88'
   */
  (void)Rte_Write_HvCoorn_bVoltModHvDcnctOvtiErr_Value
    (HvCoorn_bVoltModHvDcnctOvtiErr);

  /* Outport: '<Root>/HvCoorn_bVoltModHvReqOvtiErr' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion89'
   */
  (void)Rte_Write_HvCoorn_bVoltModHvReqOvtiErr_Value
    (HvCoorn_bVoltModHvReqOvtiErr);

  /* Outport: '<Root>/HvCoorn_stStartUpReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion9'
   */
  (void)Rte_Write_HvCoorn_stStartUpReq_Value(HvCoorn_stStartUpReq);

  /* Outport: '<Root>/HvCoorn_uISGReq' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion90'
   */
  (void)Rte_Write_HvCoorn_uISGReq_Value(HvCoorn_uISGReq);

  /* Outport: '<Root>/HvCoorn_bRdyLamp' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion91'
   */
  (void)Rte_Write_HvCoorn_bRdyLamp_Value(HvCoorn_bRdyLamp);

  /* Outport: '<Root>/HvCoorn_bSocWkupEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion92'
   */
  (void)Rte_Write_HvCoorn_bSocWkupEEW_Value(HvCoorn_bSocWkupEEW);

  /* Outport: '<Root>/HvCoorn_bTimerWkupReqEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion93'
   */
  (void)Rte_Write_HvCoorn_bTimerWkupReqEEW_Value(HvCoorn_bTimerWkupReqEEW);

  /* Outport: '<Root>/HvCoorn_stRemLvBatMntnFailRsnEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion94'
   */
  (void)Rte_Write_HvCoorn_stRemLvBatMntnFailRsnEEW_Value
    (HvCoorn_stRemLvBatMntnFailRsnEEW);

  /* Outport: '<Root>/HvCoorn_pctHVBatSocEEW' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion96'
   */
  (void)Rte_Write_HvCoorn_pctHVBatSocEEW_Value(HvCoorn_pctHVBatSocEEW);

  /* Outport: '<Root>/HvCoorn_bDft2EngStrtRaw' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion97'
   */
  (void)Rte_Write_HvCoorn_bDft2EngStrtRaw_Value(HvCoorn_bDft2EngStrtRaw);

  /* Outport: '<Root>/HvCoorn_bShowModSocLo' incorporates:
   *  SignalConversion: '<S1>/Signal Conversion98'
   */
  (void)Rte_Write_HvCoorn_bShowModSocLo_Value(HvCoorn_bShowModSocLo);

  /* Constant: '<S1>/uint32' */
  HvCoorn_Version = 10020301U;

  /* Update for UnitDelay: '<S67>/Unit Delay' incorporates:
   *  Saturate: '<S67>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_g = rtb_Switch_e5;

  /* Update for UnitDelay: '<S71>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_bj = rtb_Logical_Operator4;

  /* Update for UnitDelay: '<S74>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_l0 = rtb_RelationalOperator;

  /* Update for UnitDelay: '<S43>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_c = rtb_switch1;

  /* Update for UnitDelay: '<S73>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ps = rtb_LogicalOperator2;

  /* Update for UnitDelay: '<S75>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_p = rtb_TmpSignalConversionAtian_tD;

  /* Update for UnitDelay: '<S84>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_en = rtb_RelationalOperator_ox;

  /* Update for UnitDelay: '<S95>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_ct = rtb_TmpSignalConversionAticob_p;

  /* Update for UnitDelay: '<S91>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_n = rtb_TmpSignalConversionAticic_a;

  /* Update for UnitDelay: '<S92>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_j = rtb_TmpSignalConversionAticbm_a;

  /* Update for UnitDelay: '<S93>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_m = rtb_OR2;

  /* Update for UnitDelay: '<S94>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_o = rtb_LowerOrEqual2;

  /* Update for UnitDelay: '<S97>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_iq = rtb_Logical_Operator4_b;

  /* Update for UnitDelay: '<S96>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_jc = rtb_Logical_Operator4_e;

  /* Update for UnitDelay: '<S104>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_fa = rtb_RelationalOperator_gi;

  /* Update for UnitDelay: '<S102>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_i1w = rtb_TmpSignalConversionAtChrg_b;

  /* Update for UnitDelay: '<S103>/Unit Delay' incorporates:
   *  Constant: '<S48>/uint8'
   *  Constant: '<S48>/uint9'
   *  Logic: '<S103>/Logical Operator1'
   *  Logic: '<S103>/Logical_Operator4'
   *  Logic: '<S48>/Logical Operator9'
   *  Logic: '<S48>/Not'
   *  RelationalOperator: '<S48>/Relational Operator4'
   *  RelationalOperator: '<S48>/Relational Operator5'
   *
   * Block description for '<S48>/uint8':
   *  Charge Finished
   *
   * Block description for '<S48>/uint9':
   *  Charge Req
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_e4 = ((rtb_TmpSignalConversionAticzcu_ !=
    ((uint8)2U)) && (rtb_TmpSignalConversionAticzcu_ != ((uint8)0U)) &&
    tmpRead_5 && rtb_TmpSignalConversionAtChr_ge);

  /* Update for UnitDelay: '<S108>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_l = HvCoorn_bKeyOnPwrUp;

  /* Update for UnitDelay: '<S157>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_bd = rtb_Logical_Operator4_hp;

  /* Update for UnitDelay: '<S122>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_p = rtb_TmpSignalConversionAtidi_bK;

  /* Update for UnitDelay: '<S119>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_cd = rtb_LogicalOperator2_m5;

  /* Update for UnitDelay: '<S137>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_nj = rtb_Logical_Operator4_en;

  /* Update for UnitDelay: '<S52>/UnitDelay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_gx = rtb_TmpSignalConversionAticbm_l;

  /* Update for Delay: '<S132>/Delay' */
  HvCoorn_ARID_DEF.icLoad = false;
  HvCoorn_ARID_DEF.Delay_DSTATE = rtb_Switch3_e3j;

  /* Update for UnitDelay: '<S63>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_b[0] = rtb_Switch1_bl_idx_0;

  /* Update for UnitDelay: '<S41>/Unit Delay3' */
  HvCoorn_ARID_DEF.UnitDelay3_DSTATE[0] = rtb_tLoadInitAcTemp_idx_0;

  /* Update for UnitDelay: '<S64>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_f[0] = rtb_Logical_Operator5_io_idx_0;

  /* Update for UnitDelay: '<S41>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE[0] = rtb_Sum3_idx_0;

  /* Update for UnitDelay: '<S120>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_f[0] = rtb_LogicalOperator2_bz_idx_0;

  /* Update for UnitDelay: '<S136>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_cx[0] = rtb_Logical_Operator4_mf_idx_0;

  /* Update for UnitDelay: '<S63>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_b[1] = rtb_Logical_Operator5_io_idx_1;

  /* Update for UnitDelay: '<S41>/Unit Delay3' */
  HvCoorn_ARID_DEF.UnitDelay3_DSTATE[1] = rtb_tLoadInitAcTemp_idx_1;

  /* Update for UnitDelay: '<S64>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_f[1] = rtb_RelationalOperator_p0;

  /* Update for UnitDelay: '<S41>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE[1] = rtb_Sum3_idx_1;

  /* Update for UnitDelay: '<S120>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_f[1] = rtb_LogicalOperator2_bz_idx_1;

  /* Update for UnitDelay: '<S136>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_cx[1] = rtb_Logical_Operator4_mf_idx_1;

  /* Update for UnitDelay: '<S118>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_fw = rtb_LogicalOperator2_go;

  /* Update for UnitDelay: '<S138>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_mw = rtb_Logical_Operator4_i5;

  /* Update for UnitDelay: '<S7>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_fn = HvCoorn_stStartUpReq;

  /* Update for UnitDelay: '<S165>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_h = rtb_LogicalOperator20_a;

  /* Update for UnitDelay: '<S5>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_gu = rtb_HvCoorn_stHVPOld;

  /* Update for UnitDelay: '<S5>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE = rtb_DataTypeConversion;

  /* Update for UnitDelay: '<S166>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_cu = rtb_Logical_Operator4_ee;

  /* Update for UnitDelay: '<S164>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_kl = HvCoorn_bHvInitFail;

  /* Update for UnitDelay: '<S128>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_i = rtb_AND20;

  /* Update for UnitDelay: '<S130>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_g = rtb_TmpSignalConversionAticem_e;

  /* Update for UnitDelay: '<S131>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_b = rtb_LogicalOperator_mf;

  /* Update for UnitDelay: '<S124>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_iz = rtb_Not1_eo;

  /* Update for Delay: '<S52>/Delay1' incorporates:
   *  Constant: '<S52>/TRUE1'
   *
   * Block description for '<S52>/TRUE1':
   *  TRUE
   */
  for (i = 0; i < 9; i++) {
    HvCoorn_ARID_DEF.Delay1_DSTATE[i] = HvCoorn_ARID_DEF.Delay1_DSTATE[i + 1];
  }

  HvCoorn_ARID_DEF.Delay1_DSTATE[9] = true;

  /* End of Update for Delay: '<S52>/Delay1' */

  /* Update for UnitDelay: '<S117>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_pk = rtb_Greater26;

  /* Update for Delay: '<S52>/Delay2' incorporates:
   *  Constant: '<S52>/TRUE3'
   *
   * Block description for '<S52>/TRUE3':
   *  TRUE
   */
  for (i = 0; i < 499; i++) {
    HvCoorn_ARID_DEF.Delay2_DSTATE[i] = HvCoorn_ARID_DEF.Delay2_DSTATE[i + 1];
  }

  HvCoorn_ARID_DEF.Delay2_DSTATE[499] = true;

  /* End of Update for Delay: '<S52>/Delay2' */

  /* Update for UnitDelay: '<S125>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_d = rtb_TmpSignalConversionAticbm_o;

  /* Update for Delay: '<S52>/Delay' */
  HvCoorn_ARID_DEF.icLoad_b = false;
  HvCoorn_ARID_DEF.Delay_DSTATE_i = HvCoorn_bSocWkup;

  /* Update for UnitDelay: '<S140>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_mif = rtb_AND1_al;

  /* Update for UnitDelay: '<S116>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_pz = rtb_UnitDelay_njy;

  /* Update for UnitDelay: '<S135>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_aj = rtb_Logical_Operator4_ix;

  /* Update for UnitDelay: '<S52>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_jm = rtb_TmpSignalConversionAticbm_l;

  /* Update for UnitDelay: '<S126>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_a = HvCoorn_bRemLvBatMntnFail;

  /* Update for UnitDelay: '<S121>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_kr = rtb_LogicalOperator2_kb;

  /* Update for UnitDelay: '<S123>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_kl = rtb_TmpSignalConversionAtiud_bE;

  /* Update for UnitDelay: '<S127>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_do = rtb_Equal3_lx;

  /* Update for UnitDelay: '<S129>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_lw = rtb_TmpSignalConversionAtiud_bE;

  /* Update for UnitDelay: '<S52>/UnitDelay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_k2 = rtb_TmpSignalConversionAtictcp_;

  /* Update for UnitDelay: '<S53>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ay = rtb_TmpSignalConversionAticlbms;

  /* Update for UnitDelay: '<S159>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_fs = rtb_Saturation2_ic;

  /* Update for UnitDelay: '<S154>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_a2 = rtb_TmpSignalConversionAtved__l;

  /* Update for UnitDelay: '<S153>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_pi = rtb_TmpSignalConversionAtiud_bE;

  /* Update for UnitDelay: '<S155>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_d3 = rtb_UnitDelay_jn;

  /* Update for UnitDelay: '<S191>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_gj = HvCoorn_bStartUpReq;

  /* Update for UnitDelay: '<S11>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_o = rtb_TmpSignalConversionAtidi__j;

  /* Update for UnitDelay: '<S11>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_me = rtb_Switch_ld;

  /* Update for UnitDelay: '<S193>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ky = rtb_TmpSignalConversionAtDrvMod;

  /* Update for UnitDelay: '<S192>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_kp = rtb_TmpSignalConversionAtidi__j;

  /* Update for UnitDelay: '<S320>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ao = rtb_Saturation2_ke;

  /* Update for UnitDelay: '<S25>/UnitDelay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_f15 = rtb_TmpSignalConversionAtBrkPed;

  /* Update for UnitDelay: '<S327>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_mh = rtb_OR_jg;

  /* Update for UnitDelay: '<S329>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_mj = rtb_TmpSignalConversionAtved_bI;

  /* Update for UnitDelay: '<S328>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_oc = HvCoorn_bDft2EngStrt;

  /* Update for UnitDelay: '<S335>/Unit Delay' incorporates:
   *  Saturate: '<S335>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[0] = rtb_Switch_k_idx_0;

  /* Update for UnitDelay: '<S330>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_hk[0] = rtb_AND8_k;

  /* Update for UnitDelay: '<S335>/Unit Delay' incorporates:
   *  Saturate: '<S335>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[1] = rtb_Switch_k_idx_1;

  /* Update for UnitDelay: '<S330>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_hk[1] = rtb_RelationalOperator_gn;

  /* Update for UnitDelay: '<S335>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ow[2] = HvCoorn_stTboxByte7Req_tmp;

  /* Update for UnitDelay: '<S330>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_hk[2] = rtb_AND2_e;

  /* Update for UnitDelay: '<S218>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_hv = rtb_TmpSignalConversionAtHybCoo;

  /* Update for UnitDelay: '<S222>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_h = HvCoorn_bRMCUPlsHeatgActvRaw;

  /* Update for UnitDelay: '<S223>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_iq = HvCoorn_bRMCUStalHeatgActvRaw;

  /* Update for UnitDelay: '<S224>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_a = rtb_TmpSignalConversionAticb_ke;

  /* Update for UnitDelay: '<S225>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_ae = rtb_Switch2_as;

  /* Update for UnitDelay: '<S231>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_be = HvCoorn_bStartUpReq;

  /* Update for UnitDelay: '<S234>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_hm = HvCoorn_bHvRlyUnexpdDcnctErr;

  /* Update for UnitDelay: '<S235>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_l = HvCoorn_bBMSUnexpdDcnctErr;

  /* Update for UnitDelay: '<S236>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_oc = HvCoorn_bMainRlyFail2ClsErr;

  /* Update for UnitDelay: '<S237>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_lu = HvCoorn_bPrechrgOvtiErr;

  /* Update for UnitDelay: '<S239>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_am = HvCoorn_bDchrgOvtiErr;

  /* Update for UnitDelay: '<S240>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_e = HvCoorn_bDCUnexpdDcnctErr;

  /* Update for UnitDelay: '<S241>/Unit Delay1' */
  HvCoorn_ARID_DEF.UnitDelay1_DSTATE_o1 = HvCoorn_bBMSIsoErr;
  for (i = 0; i < 9; i++) {
    /* Update for UnitDelay: '<S238>/Unit Delay1' */
    HvCoorn_ARID_DEF.UnitDelay1_DSTATE_pi[i] =
      HvCoorn_ARID_DEF.Logical_Operator4[i];

    /* Update for UnitDelay: '<S242>/Unit Delay' */
    HvCoorn_ARID_DEF.UnitDelay_DSTATE_jj[i] = tmpForInput[i];
  }

  /* Update for UnitDelay: '<S278>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_pj = rtb_TmpSignalConversionAticis_b;

  /* Update for UnitDelay: '<S280>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_lb = rtb_TmpSignalConversionAtEngS_k;

  /* Update for UnitDelay: '<S31>/Unit Delay' incorporates:
   *  Logic: '<S31>/AND1'
   *  Logic: '<S31>/Not1'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_pf = ((!rtb_AND7_j) &&
    rtb_TmpSignalConversionAticob_m);

  /* Update for UnitDelay: '<S284>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_fo = rtb_TmpSignalConversionAtibsw_b;

  /* Update for UnitDelay: '<S283>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_ho = rtb_TmpSignalConversionAtibsw_b;

  /* Update for UnitDelay: '<S287>/Unit Delay' incorporates:
   *  Saturate: '<S287>/Saturation2'
   */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_ns = rtb_DataTypeConversion_jq;

  /* Update for UnitDelay: '<S282>/Unit Delay2' */
  HvCoorn_ARID_DEF.UnitDelay2_DSTATE_ay = rtb_TmpSignalConversionAtidi_bK;

  /* Update for UnitDelay: '<S286>/Unit Delay' */
  HvCoorn_ARID_DEF.UnitDelay_DSTATE_iqw = rtb_TmpSignalConversionAtDTC_bD;

  /* End of Outputs for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */
  (void)Rte_Write_HvCoorn_noVcuAuthFb_Value
    (HvCoorn_ARID_DEF.HvCoorn_noVcuAuthFb_l);
  (void)Rte_Write_HvCoorn_noVcuAuthReq_Value
    (HvCoorn_ARID_DEF.HvCoorn_noVcuAuthReq_b);
fc_HvCoorn_PFC_End;
}

/* Model initialize function */
void HvCoorn_Init(void)
{
  {
    sint32 i;

    /* SystemInitialize for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' incorporates:
     *  SubSystem: '<Root>/HvCoorn'
     */
    /* Start for Constant: '<S53>/hpp_tiRemHvBatPrecdngSet_C2'
     *
     * Block description for '<S53>/hpp_tiRemHvBatPrecdngSet_C2':
     *  [50]
     */
    HvCoorn_pctLbmsSocMntnThd = HvCoorn_pctLbmsSocMntnThd_C;

    /* InitializeConditions for Delay: '<S132>/Delay' */
    HvCoorn_ARID_DEF.icLoad = true;

    /* InitializeConditions for Delay: '<S52>/Delay' */
    HvCoorn_ARID_DEF.icLoad_b = true;

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bHvInitFail' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion11'
     */
    (void)Rte_Write_HvCoorn_bHvInitFail_Value(HvCoorn_bHvInitFail);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bHvRlyUnexpdDcnctErr' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion39'
     */
    (void)Rte_Write_HvCoorn_bHvRlyUnexpdDcnctErr_Value
      (HvCoorn_bHvRlyUnexpdDcnctErr);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bBMSUnexpdDcnctErr' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion40'
     */
    (void)Rte_Write_HvCoorn_bBMSUnexpdDcnctErr_Value(HvCoorn_bBMSUnexpdDcnctErr);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bMainRlyFail2ClsErr' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion41'
     */
    (void)Rte_Write_HvCoorn_bMainRlyFail2ClsErr_Value
      (HvCoorn_bMainRlyFail2ClsErr);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bPrechrgOvtiErr' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion42'
     */
    (void)Rte_Write_HvCoorn_bPrechrgOvtiErr_Value(HvCoorn_bPrechrgOvtiErr);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bDchrgOvtiErr' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion43'
     */
    (void)Rte_Write_HvCoorn_bDchrgOvtiErr_Value(HvCoorn_bDchrgOvtiErr);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bDCUnexpdDcnctErr' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion46'
     */
    (void)Rte_Write_HvCoorn_bDCUnexpdDcnctErr_Value(HvCoorn_bDCUnexpdDcnctErr);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bBMSIsoErr' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion62'
     */
    (void)Rte_Write_HvCoorn_bBMSIsoErr_Value(HvCoorn_bBMSIsoErr);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_pctLbmsSocMntnThd' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion70'
     */
    (void)Rte_Write_HvCoorn_pctLbmsSocMntnThd_Value(HvCoorn_pctLbmsSocMntnThd);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bAntiTrig430' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion73'
     */
    (void)Rte_Write_HvCoorn_bAntiTrig430_Value(HvCoorn_bAntiTrig430);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bAntiTrig42C' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion74'
     */
    (void)Rte_Write_HvCoorn_bAntiTrig42C_Value(HvCoorn_bAntiTrig42C);

    /* SystemInitialize for Outport: '<Root>/VCU_E2_counterfaieldEEW' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion75'
     */
    (void)Rte_Write_VCU_E2_counterfaieldEEW_Value(VCU_E2_counterfaieldEEW);

    /* SystemInitialize for Outport: '<Root>/HvCoorn_stAuthChkFailLvl' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion76'
     */
    (void)Rte_Write_HvCoorn_stAuthChkFailLvl_Value(HvCoorn_stAuthChkFailLvl);
    for (i = 0; i < 8; i++) {
      /* SystemInitialize for Outport: '<Root>/HvCoorn_noVcuAuthFb' incorporates:
       *  Assignment: '<S33>/Assignment6'
       *  SignalConversion: '<S1>/Signal Conversion77'
       */
      HvCoorn_ARID_DEF.HvCoorn_noVcuAuthFb_l[i] = HvCoorn_noVcuAuthFb[i];

      /* SystemInitialize for Outport: '<Root>/HvCoorn_noVcuAuthReq' incorporates:
       *  Assignment: '<S33>/Assignment13'
       *  SignalConversion: '<S1>/Signal Conversion78'
       */
      HvCoorn_ARID_DEF.HvCoorn_noVcuAuthReq_b[i] = HvCoorn_noVcuAuthReq[i];
    }

    /* SystemInitialize for Outport: '<Root>/HvCoorn_bAuthFailSpdLim' incorporates:
     *  SignalConversion: '<S1>/Signal Conversion79'
     */
    (void)Rte_Write_HvCoorn_bAuthFailSpdLim_Value(HvCoorn_bAuthFailSpdLim);

    /* End of SystemInitialize for RootInportFunctionCallGenerator generated from: '<Root>/fc_HvCoorn' */
    (void)Rte_Write_HvCoorn_noVcuAuthFb_Value
      (HvCoorn_ARID_DEF.HvCoorn_noVcuAuthFb_l);
    (void)Rte_Write_HvCoorn_noVcuAuthReq_Value
      (HvCoorn_ARID_DEF.HvCoorn_noVcuAuthReq_b);
  }
}

/*
 * File trailer for generated code.
 *
 * [EOF]
 */
