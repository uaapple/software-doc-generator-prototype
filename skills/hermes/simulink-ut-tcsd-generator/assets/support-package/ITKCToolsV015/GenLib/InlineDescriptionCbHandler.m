function [] = InlineDescriptionCbHandler(Callback)
% This function enables the functionality of the InlineDescription block for
% ReportGenerator
% The function expects the name of the Callback function, which is calling.
% e.g.: in CopyFcn: InlineDescriptionCbHandler('CopyFcn')

% get the initial Descriptions
GcsDescription=get_param(gcs,'Description');
GcbDescription=get_param(gcb,'Description');


%Just required if the function shall display DocChangeHint-warnings to the user
% try 
%  StdDescription = get_param('BaicReportLib/InlineDescription','Description');
% catch error
%     %in some cases an error during the get_param resutls in an error -> use
%     %standard text
%  StdDescription = 'Refer to Detailed Function Description for detailed information';
% end

% is the block not in library?
InModel=~strcmp(bdroot,'BaicReportLib');

switch Callback
    
    case 'CopyFcn'
 
        if isempty(GcsDescription)
            %write description of the block in the parent description.
            set_param(gcs,'Description',GcbDescription);
        else
            %write description of parent in the block description.
            set_param(gcb,'Description',GcsDescription);
        end

%         %Warning if a block with user defined description is copied
%         if InModel==1
%             %Notify the user, only if the Description text is changed
%             if ~strcmp(GcbDescription,StdDescription)
%                 %Warning
%                 DocChangeHint();
%             end
%   
%         end
 
    
    case 'DeleteFcn'       
     
%         %Warning if a block with user defined description is deleted
%         if InModel==1
%             %Notify the user, only if the Description text is changed
%             if ~strcmp(GcbDescription,StdDescription)
%                 %Warning
%                 DocChangeHint();
%             end
%             
%         end

    case 'NameChangeFcn'
%         %Warning if the BlockName of a user defined block is changed
%         if InModel==1
%             %Notify the user, only if the Description text is changed
%             if ~strcmp(GcbDescription,StdDescription)
%                 %Warning
%                 DocChangeHint();
%             end
%         end
        
    case 'OpenFcn'
        %A double click opens an input description dialog.
        %This discription is written into the block description and the 
        %parent subsystem description.
        
        %Get Data from input dialog / Store gcb/gcs in case of focus switch during Dialog
		CallingGcb = gcb;
		CallingGcs = gcs;
        InputedTxt = inputdlg('Enter your Description:','Description', [1 80], {GcsDescription});

        %Check if invalid input
        if isempty(InputedTxt)
            %If dialog is canceled, then the previous text is entered.
            InputedTxt=GcsDescription;
        else
            %Converts the input to a string.
            InputedTxt=InputedTxt{1};               
        end
        
        %Is the block in a model?
      %  if InModel==1
            %Set descriptions
            set_param(CallingGcb,'Description',InputedTxt);
            set_param(CallingGcs,'Description',InputedTxt);

            %This refreshes the mask of the block
            set_param(CallingGcb,'RefreshPar','1');
            set_param(CallingGcb,'RefreshPar','0');
      %  else
            %Don't write in library
      %  end

    case 'PreSaveFcn'
        %Syncing description before saving
        if InModel==1
            if isempty(GcsDescription)
                %write description of the block in the parent description.
                set_param(gcs,'Description',GcbDescription);
            else
                %write description of parent in the block description.
                set_param(gcb,'Description',GcsDescription);
            end
        end
        
    otherwise
        %Do nothing
end



%end of function
end