function revTableBlockHandler(block,bhFunction)
% block handler for the revision table block

ud = get_param(block,'UserData');

switch bhFunction
    case 'addEntry'
        revTable = cell(1,5);
        revTable{1} =  get_param(gcbh,'revId');
        revTable{2} =  get_param(gcbh,'revVersion');
        revTable{3}   =  get_param(gcbh,'revAuthor');
        revTable{4}  =  get_param(gcbh,'revChanges');
        revTable{5} =  get_param(gcbh,'revDate');
            if(strcmp(revTable{5},'-1'))
                revTable{5}=datestr(datetime,'YYYY-mm-dd');
            end
        
        try
            histRev = ud.RevisionTable;
            ind =0;
            ind =(strcmp(histRev{end,1},revTable{1})||...
                strcmp(histRev{end,2},revTable{2}));
            %newEntryInd = setdiff(histRev(end,:),revTable);
            if(~ind)
                ud.RevisionTable= vertcat(ud.RevisionTable,revTable);
            else
                errordlg('Entry already added!');
            end
        catch
            header  = {'ID','Version','Author','Changes','Date'};
            ud.RevisionTable = vertcat(header,revTable);
        end
        set_param(block,'UserData',ud');
        set_param(block,'UserDataPersistent','on')
        
        
    case 'paste2Ws'
        try
            histRev = ud.RevisionTable;
            baseVarName = genvarname([get_param(block,'Name') '_RevTable']);
            assignin('base',baseVarName,histRev);
            evalString = sprintf('open(''%s'')',baseVarName);
            evalin('base',evalString);
        catch
            errordlg('Revision Table not available!');
        end
        
    case 'genRepTable'
         try
            histRev = ud.RevisionTable;
            assignin('base','report_revTab',histRev);
        catch
            %%do nothing
        end
end


end

