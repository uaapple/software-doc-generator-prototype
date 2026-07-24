%% ------------------------------------------------------------------------------
%   Simulink scrip for custom model style shortcut menus and model advisor check functions.
%   MATLAB version: R2021a
%   Mao Chongchong    2023/6/15
%   Version: 0.1
%   Instructions: Type the 'sl_refresh_customizations' in matlab command 
%                 window with all the model closed. 
%------------------------------------------------------------------------------


function sl_customization(cm)
  %% register custom model style shortcut menu functions
  cm.LibraryBrowserCustomizer.applyOrder({'ITKC_Lib',-2});
  cm.addCustomMenuFcn('Simulink:ContextMenu',@custom_items);
  
%   %% register custom checks - register custom model advisor check functions
%   cm.addModelAdvisorCheckFcn(@MCC_Chk_IntegerRoundMode);
%   cm.addModelAdvisorCheckFcn(@MCC_Chk_SwitchCriteriaUnequalZero);
%   cm.addModelAdvisorCheckFcn(@MCC_Chk_HideBolckName);
%   
%   %% register custom checks - register custom model advisor check functions
%   cm.addModelAdvisorTaskAdvisorFcn(@MCC_Chk_IntegerRoundMode);
%   cm.addModelAdvisorTaskAdvisorFcn(@MCC_Chk_SwitchCriteriaUnequalZero);
%   cm.addModelAdvisorTaskAdvisorFcn(@MCC_Chk_HideBolckName);
  
end
