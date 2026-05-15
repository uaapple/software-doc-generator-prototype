function analyze_slx(filePath, outputFormat)
%ANALYZE_SLX  Parse a Simulink SLX model and output a ModelFactBundle as JSON.
%
%   analyze_slx(filePath) loads the SLX model at filePath, extracts
%   structured facts (interfaces, subsystems, states, parameters,
%   derivedSignals, logicRules, timing, diagnostics, traceRefs), and prints a JSON
%   ModelFactBundle to the command window.
%
%   analyze_slx(filePath, outputFormat) optionally specifies the output
%   format string.  Currently only "model_fact_bundle" is recognized.

    if nargin < 1 || isempty(filePath)
        error('analyze_slx:missingPath', 'SLX file path is required.');
    end
    if nargin < 2 || isempty(outputFormat)
        outputFormat = 'model_fact_bundle';
    end

    % --- Load model (headless) ------------------------------------------
    filePath = char(filePath);
    sourceFilePath = filePath;
    [~, modelName, ext] = fileparts(filePath);
    if isempty(ext)
        filePath = [filePath, '.slx'];
        sourceFilePath = filePath;
        [~, modelName, ext] = fileparts(filePath);
    end

    loadFilePath = filePath;
    tempLoadFilePath = '';
    if ~isvarname(modelName)
        validModelName = regexprep(modelName, '^\d+[-_]+', '');
        validModelName = matlab.lang.makeValidName(validModelName);
        if isempty(validModelName)
            validModelName = ['model_', char(java.util.UUID.randomUUID())];
            validModelName = strrep(validModelName, '-', '_');
        end
        tempLoadFilePath = fullfile(tempdir, [validModelName, ext]);
        copyfile(filePath, tempLoadFilePath);
        loadFilePath = tempLoadFilePath;
        modelName = validModelName;
    end

    loadedModel = false;
    try
        load_system(loadFilePath);
        loadedModel = true;
    catch me
        bundle = createEmptyBundle(sourceFilePath, '', '');
        bundle.diagnostics = {struct( ...
            'name',      'load_error', ...
            'severity',  'critical', ...
            'description', ['Failed to load SLX: ', me.message], ...
            'location',  sourceFilePath)};
        printJson(bundle);
        cleanupTempFile(tempLoadFilePath);
        return;
    end

    % --- Gather source metadata -----------------------------------------
    try
        modelVersion = get_param(modelName, 'ModelVersion');
    catch
        modelVersion = '';
    end

    bundle = createEmptyBundle(sourceFilePath, modelName, modelVersion);

    % --- Extract interfaces (Inport / Outport) --------------------------
    bundle.interfaces = extractInterfaces(modelName);

    % --- Extract subsystems ---------------------------------------------
    bundle.subsystems = extractSubsystems(modelName);

    % --- Extract parameters (tunable block parameters) ------------------
    bundle.parameters = extractParameters(modelName);

    % --- Extract logic rules (Switch / If / Math / Logic blocks) --------
    bundle.logicRules = extractLogicRules(modelName, sourceFilePath);

    % --- Extract timing (sample-time info) ------------------------------
    bundle.timing = extractTiming(modelName);

    % --- Extract diagnostics (Assertion / Check blocks) -----------------
    bundle.diagnostics = extractDiagnostics(modelName);

    % --- Extract states (Stateflow charts) ------------------------------
    bundle.states = extractStates(modelName);

    % --- Extract derived signal definitions -----------------------------
    bundle.derivedSignals = extractDerivedSignals(modelName, bundle.logicRules);

    % --- Extract trace references (From/Goto, DataStore) ----------------
    bundle.traceRefs = extractTraceRefs(modelName);

    % --- Cleanup --------------------------------------------------------
    try
        close_system(modelName, 0);
    catch
        % ignore close errors
    end
    cleanupTempFile(tempLoadFilePath);

    % --- Output ---------------------------------------------------------
    printJson(bundle);
end

% ========================================================================
%  Helper: remove temporary load copy
% ========================================================================
function cleanupTempFile(filePath)
    if nargin < 1 || isempty(filePath)
        return;
    end
    try
        if isfile(filePath)
            delete(filePath);
        end
    catch
        % ignore cleanup errors
    end
end

% ========================================================================
%  Helper: create empty bundle
% ========================================================================
function bundle = createEmptyBundle(fileName, modelName, modelVersion)
    bundle = struct();
    bundle.source = struct('fileName', fileName, 'modelName', modelName, 'modelVersion', modelVersion);
    % Force cell arrays so jsonencode emits arrays even when empty.
    bundle.interfaces  = {};
    bundle.subsystems  = {};
    bundle.states      = {};
    bundle.parameters  = {};
    bundle.derivedSignals = {};
    bundle.logicRules  = {};
    bundle.timing      = {};
    bundle.diagnostics = {};
    bundle.traceRefs   = {};
end

% ========================================================================
%  Helper: print JSON
% ========================================================================
function printJson(bundle)
    % Use MATLAB's built-in jsonencode; fall back to manual for older ver.
    try
        txt = jsonencode(bundle, 'PrettyPrint', true);
    catch
        txt = jsonencode(bundle);
    end
    fprintf('%s\n', txt);
end

% ========================================================================
%  Interfaces  (Inport / Outport / Trigger / Enable)
% ========================================================================
function items = extractInterfaces(modelName)
    items = {};
    blockTypes = {'Inport', 'Outport', 'TriggerPort', 'EnablePort'};
    allBlocks = findBlocksByTypes(modelName, blockTypes);
    for k = 1:numel(allBlocks)
        blk = allBlocks{k};
        try
            bt  = get_param(blk, 'BlockType');
            nm  = get_param(blk, 'Name');
            if isNoiseName(nm)
                continue;
            end
            dir = '';
            switch bt
                case 'Inport'
                    dir = 'input';
                case 'Outport'
                    dir = 'output';
                case 'TriggerPort'
                    dir = 'trigger';
                case 'EnablePort'
                    dir = 'enable';
            end
            dt = getParamOrEmpty(blk, 'OutDataTypeStr');
            port = getParamOrEmpty(blk, 'Port');
            sampleTime = getParamOrEmpty(blk, 'SampleTime');
            dimensions = getParamOrEmpty(blk, 'PortDimensions');
            descParts = {};
            descParts{end+1} = sprintf('%s port %s', dir, nm);
            if ~isempty(port), descParts{end+1} = ['port=', port]; end
            if ~isempty(dt), descParts{end+1} = ['dataType=', dt]; end
            if ~isempty(dimensions), descParts{end+1} = ['dimensions=', dimensions]; end
            if ~isempty(sampleTime), descParts{end+1} = ['sampleTime=', sampleTime]; end
            items{end+1} = struct( ...
                'name',        nm, ...
                'direction',   dir, ...
                'dataType',    dt, ...
                'description', strjoin(descParts, '; '), ...
                'location',    blk);
        catch
            % skip unreadable blocks
        end
    end

    % Also pick top-level model ports via get_param on the root
    try
        portNames = get_param(modelName, 'PortNames');
        portTypes = get_param(modelName, 'PortBlockTypes');
        for p = 1:numel(portNames)
            nm  = portNames{p};
            dir = 'input';
            if p <= numel(portTypes) && strcmp(portTypes{p}, 'Outport')
                dir = 'output';
            end
            items{end+1} = struct( ...
                'name',        nm, ...
                'direction',   dir, ...
                'dataType',    '', ...
                'description', sprintf('Root %s port %s', dir, nm), ...
                'location',    [modelName, '/', nm]);
        end
    catch
        % not all models expose PortNames
    end
end

% ========================================================================
%  Subsystems
% ========================================================================
function items = extractSubsystems(modelName)
    items = {};
    subs = find_system(modelName, 'LookUnderMasks', 'all', 'BlockType', 'SubSystem');
    for k = 1:numel(subs)
        blk = subs{k};
        try
            nm = get_param(blk, 'Name');
            if isNoiseName(nm)
                continue;
            end
            bt = get_param(blk, 'BlockType');
            desc = '';
            try desc = get_param(blk, 'Description'); catch, end
            items{end+1} = struct( ...
                'name',        nm, ...
                'blockType',   bt, ...
                'description', desc, ...
                'location',    blk);
        catch
        end
    end
end

% ========================================================================
%  Parameters  (tunable: Constant, Gain, LookupTable, etc.)
% ========================================================================
function items = extractParameters(modelName)
    items = {};
    paramBlocks = findBlocksByTypes(modelName, { ...
        'Constant', 'Gain', 'Bias', 'Saturate', ...
        'Lookup_n-D', 'LookupNDDirect', 'PreLookup', 'Interpolation_n-D', ...
        'Lookup', 'Lookup2D'});
    for k = 1:numel(paramBlocks)
        blk = paramBlocks{k};
        try
            nm   = get_param(blk, 'Name');
            if isNoiseName(nm)
                continue;
            end
            bt = get_param(blk, 'BlockType');
            val  = '';
            unit = '';
            [val, paramDesc] = getParameterSummary(blk, bt);
            try unit = get_param(blk, 'Unit'); catch, end
            desc = paramDesc;
            try desc = get_param(blk, 'Description'); catch, end
            if isempty(desc)
                desc = paramDesc;
            elseif ~isempty(paramDesc)
                desc = [desc, '; ', paramDesc];
            end
            items{end+1} = struct( ...
                'name',        nm, ...
                'blockType',   bt, ...
                'value',       val, ...
                'unit',        unit, ...
                'description', desc, ...
                'location',    blk);
        catch
        end
    end
end

% ========================================================================
%  Logic Rules  (Switch, If, IfAction, Logic, RelationalOperator, …)
% ========================================================================
function items = extractLogicRules(modelName, sourceFilePath)
    if nargin < 2
        sourceFilePath = '';
    end
    items = {};
    logicBlocks = findBlocksByTypes(modelName, { ...
        'Switch', 'If', 'IfAction', 'Logic', 'RelationalOperator', ...
        'CompareToConstant', 'CompareToZero', 'MultiPortSwitch'});
    for k = 1:numel(logicBlocks)
        blk = logicBlocks{k};
        try
            nm   = get_param(blk, 'Name');
            if isNoiseName(nm)
                continue;
            end
            cond = '';
            act  = '';
            bt = get_param(blk, 'BlockType');
            try
                switch bt
                    case 'Switch'
                        thresh = getParamOrEmpty(blk, 'Threshold');
                        criteria = getParamOrEmpty(blk, 'Criteria');
                        if isempty(criteria)
                            criteria = 'u2 >= Threshold';
                        end
                        cond = strrep(criteria, 'Threshold', thresh);
                        act  = 'pass u1 if true, u3 if false';
                    case 'If'
                        cond = getParamOrEmpty(blk, 'IfExpression');
                        elseIfs = getParamOrEmpty(blk, 'ElseIfExpressions');
                        if ~isempty(elseIfs)
                            cond = [cond, '; elseif ', elseIfs];
                        end
                        act = 'activate matching If Action Subsystem';
                    case 'RelationalOperator'
                        cond = getParamOrEmpty(blk, 'Operator');
                        act  = sprintf('Compare inputs with %s', cond);
                    case 'Logic'
                        cond = getParamOrEmpty(blk, 'Operator');
                        act  = sprintf('Boolean %s operation', cond);
                    case 'CompareToConstant'
                        operator = getParamOrEmpty(blk, 'relop');
                        constant = getParamOrEmpty(blk, 'const');
                        if isempty(operator), operator = getParamOrEmpty(blk, 'Operator'); end
                        if isempty(constant), constant = getParamOrEmpty(blk, 'Constant'); end
                        cond = strtrim([operator, ' ', constant]);
                        act  = 'compare input to constant';
                    case 'CompareToZero'
                        operator = getParamOrEmpty(blk, 'relop');
                        if isempty(operator), operator = getParamOrEmpty(blk, 'Operator'); end
                        cond = strtrim([operator, ' 0']);
                        act  = 'compare input to zero';
                    case 'MultiPortSwitch'
                        cond = 'select output by control input';
                        act = getParameterList(blk, {'DataPortOrder', 'Inputs', 'DataPortForDefault', 'DiagnosticForDefault'});
                end
            catch
            end
            desc = '';
            try desc = get_param(blk, 'Description'); catch, end
            if isempty(desc)
                desc = getParameterList(blk, {'Inputs', 'Operator', 'Criteria', 'Threshold', 'IfExpression', 'ElseIfExpressions'});
            end
            items{end+1} = struct( ...
                'name',        nm, ...
                'blockType',   bt, ...
                'condition',   cond, ...
                'action',      act, ...
                'description', desc, ...
                'location',    blk);
        catch
        end
    end
    transitionItems = extractStateflowTransitions(modelName, sourceFilePath);
    for k = 1:numel(transitionItems)
        items{end+1} = transitionItems{k};
    end
end

% ========================================================================
%  Derived Signals  (reverse trace guard/output signals through 1-3 blocks)
% ========================================================================
function items = extractDerivedSignals(modelName, logicRules)
    items = {};
    targetNames = collectDerivedTargetNames(modelName, logicRules);
    producerBlocks = findDerivedProducerBlocks(modelName, targetNames);
    seen = containers.Map('KeyType', 'char', 'ValueType', 'logical');
    maxItems = 300;

    for k = 1:numel(producerBlocks)
        if numel(items) >= maxItems
            break;
        end
        blk = producerBlocks{k};
        try
            names = getBlockDerivedSignalNames(blk);
            for n = 1:numel(names)
                targetName = names{n};
                if isempty(targetName) || isNoiseName(targetName)
                    continue;
                end
                if ~isTrackedDerivedName(targetName, targetNames)
                    continue;
                end
                key = [targetName, '|', blk];
                if isKey(seen, key)
                    continue;
                end
                seen(key) = true;

                [expr, inputs, thresholds, sourceBlocks, coverage] = traceBlockExpression(blk, 3, {});
                if isempty(strtrim(expr))
                    continue;
                end
                bt = getParamOrEmpty(blk, 'BlockType');
                descParts = {};
                descParts{end+1} = ['derived signal ', targetName, ' = ', expr];
                if ~isempty(inputs), descParts{end+1} = ['inputs=', strjoin(inputs, ', ')]; end
                if ~isempty(thresholds), descParts{end+1} = ['thresholds=', strjoin(thresholds, ', ')]; end
                if ~isempty(sourceBlocks), descParts{end+1} = ['trace=', strjoin(sourceBlocks, ' <- ')]; end
                items{end+1} = struct( ...
                    'name',        targetName, ...
                    'blockType',   bt, ...
                    'expression',  expr, ...
                    'inputs',      {inputs}, ...
                    'thresholds',  {thresholds}, ...
                    'sourceBlocks',{sourceBlocks}, ...
                    'coverage',    coverage, ...
                    'description', strjoin(descParts, '; '), ...
                    'location',    blk);
            end
        catch
            % skip unreadable producer
        end
    end
end

function names = collectDerivedTargetNames(modelName, logicRules)
    names = {};
    try
        for k = 1:numel(logicRules)
            fact = logicRules{k};
            if isfield(fact, 'blockType') && strcmp(char(fact.blockType), 'StateflowTransition')
                if isfield(fact, 'condition')
                    names = appendUniqueCells(names, extractConditionIdentifiers(fact.condition));
                end
                if isfield(fact, 'action')
                    names = appendUniqueCells(names, extractConditionIdentifiers(fact.action));
                end
            end
        end
    catch
    end

    try
        blocks = findBlocksByTypes(modelName, {'Outport', 'Goto', 'DataStoreWrite'});
        for k = 1:numel(blocks)
            localNames = getBlockDerivedSignalNames(blocks{k});
            for n = 1:numel(localNames)
                if isBehaviorSignalName(localNames{n})
                    names = appendUniqueCells(names, {localNames{n}});
                end
            end
        end
    catch
    end

    names = appendUniqueCells({}, names);
end

function blocks = findDerivedProducerBlocks(modelName, targetNames)
    blocks = {};
    try
        allBlocks = find_system(modelName, 'LookUnderMasks', 'all', 'FollowLinks', 'on');
    catch
        try
            allBlocks = find_system(modelName, 'LookUnderMasks', 'all');
        catch
            allBlocks = {};
        end
    end
    if ischar(allBlocks)
        allBlocks = {allBlocks};
    end
    for k = 1:numel(allBlocks)
        blk = allBlocks{k};
        try
            bt = get_param(blk, 'BlockType');
            if any(strcmp(bt, {'SubSystem', 'Mux', 'Demux', 'BusCreator', 'BusSelector', 'Inport', 'From', 'DataStoreRead'}))
                continue;
            end
            localNames = getBlockDerivedSignalNames(blk);
            shouldKeep = false;
            for n = 1:numel(localNames)
                if isTrackedDerivedName(localNames{n}, targetNames)
                    shouldKeep = true;
                    break;
                end
            end
            if shouldKeep
                blocks{end+1} = blk;
            end
        catch
        end
    end
    try
        blocks = unique(blocks, 'stable');
    catch
        blocks = unique(blocks);
    end
end

function names = getBlockDerivedSignalNames(block)
    names = {};
    try
        nm = get_param(block, 'Name');
        if ~isempty(nm), names = appendUniqueCells(names, {nm}); end
    catch
    end
    try
        bt = get_param(block, 'BlockType');
        switch bt
            case {'Goto', 'From'}
                tag = getParamOrEmpty(block, 'GotoTag');
                if ~isempty(tag), names = appendUniqueCells(names, {tag}); end
            case {'DataStoreWrite', 'DataStoreRead'}
                ds = getParamOrEmpty(block, 'DataStoreName');
                if ~isempty(ds), names = appendUniqueCells(names, {ds}); end
        end
    catch
    end
    try
        ph = get_param(block, 'PortHandles');
        outports = ph.Outport;
        for p = 1:numel(outports)
            line = get_param(outports(p), 'Line');
            lineName = getLineName(line);
            if ~isempty(lineName)
                names = appendUniqueCells(names, {lineName});
            end
        end
    catch
    end
end

function tf = isTrackedDerivedName(name, targetNames)
    tf = false;
    nm = strtrim(char(name));
    if isempty(nm)
        return;
    end
    for i = 1:numel(targetNames)
        if strcmp(nm, targetNames{i})
            tf = true;
            return;
        end
    end
    if isempty(targetNames)
        tf = isBehaviorSignalName(nm);
    end
end

function tf = isBehaviorSignalName(name)
    nm = char(name);
    if numel(strtrim(nm)) < 3
        tf = false;
        return;
    end
    tf = ~isempty(regexp(nm, '(HvCoorn_|VCCM_|KL15|SOC|BMS|EBS|BATT|Wake|Sleep|Shut|Pwr|NetMan|StartUp|AftRun|Init|Err|Fail|Cnt|Count|timer|DisCh|Ena|Enable|Req)', 'once'));
end

function ids = extractConditionIdentifiers(text)
    ids = {};
    try
        tokens = regexp(char(text), '[A-Za-z_][A-Za-z0-9_]*', 'match');
    catch
        tokens = {};
    end
    stopWords = {'after', 'before', 'tick', 'sec', 'msec', 'true', 'false', ...
        'and', 'or', 'not', 'if', 'else', 'elseif', 'en', 'du', 'entry', 'during', 'exit'};
    for i = 1:numel(tokens)
        token = tokens{i};
        if any(strcmpi(token, stopWords))
            continue;
        end
        if numel(token) < 3
            continue;
        end
        ids = appendUniqueCells(ids, {token});
    end
end

function [expr, inputs, thresholds, sourceBlocks, coverage] = traceBlockExpression(block, depth, visited)
    expr = '';
    inputs = {};
    thresholds = {};
    sourceBlocks = {};
    coverage = 'partial';
    try
        blkPath = getfullname(block);
    catch
        try blkPath = char(block); catch, blkPath = ''; end
    end
    if isempty(blkPath)
        return;
    end
    sourceBlocks = appendUniqueCells(sourceBlocks, {blkPath});
    if any(strcmp(visited, blkPath))
        expr = shortBlockName(blkPath);
        coverage = 'cycle';
        return;
    end
    visited{end+1} = blkPath;

    try bt = get_param(block, 'BlockType'); catch, bt = ''; end
    nm = shortBlockName(blkPath);
    [inputExprs, inputSignals, inputThresholds, inputBlocks] = getInputExpressions(block, depth - 1, visited);
    inputs = appendUniqueCells(inputs, inputSignals);
    thresholds = appendUniqueCells(thresholds, inputThresholds);
    sourceBlocks = appendUniqueCells(sourceBlocks, inputBlocks);

    try
        switch bt
            case 'Inport'
                expr = nm;
                inputs = appendUniqueCells(inputs, {nm});
                coverage = 'exact';
            case 'Constant'
                value = getParamOrEmpty(block, 'Value');
                expr = value;
                thresholds = appendUniqueCells(thresholds, {value});
                coverage = 'exact';
            case 'Gain'
                gain = getParamOrEmpty(block, 'Gain');
                expr = ['(', firstOrName(inputExprs, nm), ' * ', gain, ')'];
                thresholds = appendUniqueCells(thresholds, {gain});
                coverage = 'partial';
            case 'Bias'
                bias = getParamOrEmpty(block, 'Bias');
                expr = ['(', firstOrName(inputExprs, nm), ' + ', bias, ')'];
                thresholds = appendUniqueCells(thresholds, {bias});
                coverage = 'partial';
            case 'Saturate'
                upper = getParamOrEmpty(block, 'UpperLimit');
                lower = getParamOrEmpty(block, 'LowerLimit');
                expr = ['saturate(', firstOrName(inputExprs, nm), ', ', lower, '..', upper, ')'];
                thresholds = appendUniqueCells(thresholds, {lower, upper});
                coverage = 'partial';
            case 'RelationalOperator'
                op = getParamOrEmpty(block, 'Operator');
                expr = ['(', inputAt(inputExprs, 1, 'u1'), ' ', op, ' ', inputAt(inputExprs, 2, 'u2'), ')'];
                coverage = 'exact';
            case 'CompareToConstant'
                op = getParamOrEmpty(block, 'relop');
                if isempty(op), op = getParamOrEmpty(block, 'Operator'); end
                constant = getParamOrEmpty(block, 'const');
                if isempty(constant), constant = getParamOrEmpty(block, 'Constant'); end
                expr = ['(', firstOrName(inputExprs, 'u1'), ' ', op, ' ', constant, ')'];
                thresholds = appendUniqueCells(thresholds, {constant});
                coverage = 'exact';
            case 'CompareToZero'
                op = getParamOrEmpty(block, 'relop');
                if isempty(op), op = getParamOrEmpty(block, 'Operator'); end
                expr = ['(', firstOrName(inputExprs, 'u1'), ' ', op, ' 0)'];
                thresholds = appendUniqueCells(thresholds, {'0'});
                coverage = 'exact';
            case 'Logic'
                op = upper(getParamOrEmpty(block, 'Operator'));
                if strcmp(op, 'NOT')
                    expr = ['not(', firstOrName(inputExprs, 'u1'), ')'];
                else
                    expr = ['(', strjoin(inputExprsOrFallback(inputExprs, nm), [' ', lower(op), ' ']), ')'];
                end
                coverage = 'exact';
            case 'Switch'
                criteria = getParamOrEmpty(block, 'Criteria');
                thresh = getParamOrEmpty(block, 'Threshold');
                if isempty(criteria), criteria = 'u2 >= Threshold'; end
                cond = strrep(criteria, 'u2', inputAt(inputExprs, 2, 'u2'));
                cond = strrep(cond, 'Threshold', thresh);
                expr = ['if ', cond, ' then ', inputAt(inputExprs, 1, 'u1'), ' else ', inputAt(inputExprs, 3, 'u3')];
                thresholds = appendUniqueCells(thresholds, {thresh});
                coverage = 'partial';
            case 'MultiPortSwitch'
                expr = ['select(', strjoin(inputExprsOrFallback(inputExprs, nm), ', '), ')'];
                coverage = 'partial';
            case {'UnitDelay', 'Delay', 'Memory'}
                expr = ['previous(', firstOrName(inputExprs, nm), ')'];
                coverage = 'partial';
            case {'Outport', 'Goto', 'DataStoreWrite'}
                expr = firstOrName(inputExprs, nm);
                coverage = 'partial';
            case 'From'
                tag = getParamOrEmpty(block, 'GotoTag');
                expr = tag;
                inputs = appendUniqueCells(inputs, {tag});
                coverage = 'partial';
            case 'DataStoreRead'
                ds = getParamOrEmpty(block, 'DataStoreName');
                expr = ds;
                inputs = appendUniqueCells(inputs, {ds});
                coverage = 'partial';
            case {'Sum', 'Add'}
                inputsText = getParamOrEmpty(block, 'Inputs');
                op = '+';
                if contains(inputsText, '-'), op = '+/-'; end
                expr = ['(', strjoin(inputExprsOrFallback(inputExprs, nm), [' ', op, ' ']), ')'];
                coverage = 'partial';
            case 'Product'
                expr = ['(', strjoin(inputExprsOrFallback(inputExprs, nm), ' * '), ')'];
                coverage = 'partial';
            case 'MinMax'
                fn = lower(getParamOrEmpty(block, 'Function'));
                if isempty(fn), fn = 'minmax'; end
                expr = [fn, '(', strjoin(inputExprsOrFallback(inputExprs, nm), ', '), ')'];
                coverage = 'partial';
            otherwise
                if isempty(inputExprs)
                    expr = nm;
                else
                    expr = [nm, '(', strjoin(inputExprs, ', '), ')'];
                end
                coverage = 'partial';
        end
    catch
        expr = nm;
        coverage = 'partial';
    end

    if isempty(strtrim(expr))
        expr = nm;
    end
end

function [inputExprs, inputs, thresholds, sourceBlocks] = getInputExpressions(block, depth, visited)
    inputExprs = {};
    inputs = {};
    thresholds = {};
    sourceBlocks = {};
    if depth < 0
        return;
    end
    try
        ph = get_param(block, 'PortHandles');
        inports = ph.Inport;
        for p = 1:numel(inports)
            line = get_param(inports(p), 'Line');
            lineName = getLineName(line);
            srcHandle = -1;
            try srcHandle = get_param(line, 'SrcBlockHandle'); catch, end
            if isnumeric(srcHandle) && srcHandle ~= -1
                [srcExpr, srcInputs, srcThresholds, srcBlocks] = traceBlockExpression(srcHandle, depth, visited);
                if isempty(srcExpr)
                    srcExpr = lineName;
                end
                inputExprs = appendUniqueCells(inputExprs, {srcExpr});
                inputs = appendUniqueCells(inputs, srcInputs);
                thresholds = appendUniqueCells(thresholds, srcThresholds);
                sourceBlocks = appendUniqueCells(sourceBlocks, srcBlocks);
            elseif ~isempty(lineName)
                inputExprs = appendUniqueCells(inputExprs, {lineName});
                inputs = appendUniqueCells(inputs, {lineName});
            else
                label = ['u', num2str(p)];
                inputExprs = appendUniqueCells(inputExprs, {label});
                inputs = appendUniqueCells(inputs, {label});
            end
        end
    catch
    end
end

function name = getLineName(line)
    name = '';
    try
        if isnumeric(line) && line == -1
            return;
        end
        name = strtrim(get_param(line, 'Name'));
    catch
        name = '';
    end
end

function value = firstOrName(values, fallback)
    if nargin < 2
        fallback = '';
    end
    if ~isempty(values)
        value = values{1};
    else
        value = fallback;
    end
end

function value = inputAt(values, index, fallback)
    if numel(values) >= index && ~isempty(values{index})
        value = values{index};
    else
        value = fallback;
    end
end

function values = inputExprsOrFallback(values, fallback)
    if isempty(values)
        values = {fallback};
    end
end

% ========================================================================
%  Timing  (blocks with explicit sample time)
% ========================================================================
function items = extractTiming(modelName)
    items = {};
    % Find blocks that have explicit (non-inherited) sample times
    try
        allBlocks = find_system(modelName, 'LookUnderMasks', 'all');
        for k = 1:numel(allBlocks)
            blk = allBlocks{k};
            try
                st = get_param(blk, 'SampleTime');
                stNum = parsePositiveSampleTime(st);
                if isnan(stNum) || stNum <= 0
                    continue;  % inherited (-1) or triggered (-2)
                end
                nm = get_param(blk, 'Name');
                if isNoiseName(nm)
                    continue;
                end
                desc = '';
                try desc = get_param(blk, 'Description'); catch, end
                if isempty(desc)
                    desc = sprintf('Explicit sample time %s', num2str(stNum));
                end
                items{end+1} = struct( ...
                    'name',        nm, ...
                    'sampleTime',  num2str(stNum), ...
                    'period',      num2str(stNum), ...
                    'description', desc, ...
                    'location',    blk);
            catch
            end
        end
    catch
    end
end

% ========================================================================
%  Diagnostics  (Assertion, Check blocks)
% ========================================================================
function items = extractDiagnostics(modelName)
    items = {};
    diagBlocks = findBlocksByTypes(modelName, { ...
        'Assertion', 'CheckStaticRange', 'CheckStaticGap', ...
        'CheckDynamicRange', 'CheckDynamicGap', ...
        'CheckDiscreteGradient', 'CheckSignalRange'});
    for k = 1:numel(diagBlocks)
        blk = diagBlocks{k};
        try
            nm   = get_param(blk, 'Name');
            if isNoiseName(nm)
                continue;
            end
            sev  = 'warning';
            try
                enabled = get_param(blk, 'Enabled');
                if strcmp(enabled, 'off')
                    sev = 'disabled';
                else
                    try
                        callback = get_param(blk, 'Callback');
                        if contains(callback, 'error')
                            sev = 'error';
                        end
                    catch
                    end
                end
            catch
            end
            desc = '';
            try desc = get_param(blk, 'Description'); catch, end
            items{end+1} = struct( ...
                'name',        nm, ...
                'severity',    sev, ...
                'description', desc, ...
                'location',    blk);
        catch
        end
    end
end

% ========================================================================
%  States  (Stateflow charts and states)
% ========================================================================
function items = extractStates(modelName)
    items = {};
    % Try Stateflow API
    try
        rt = sfroot;
        charts = rt.find('-isa', 'Stateflow.Chart');
        try
            emCharts = rt.find('-isa', 'Stateflow.EMChart');
            charts = [charts; emCharts];
        catch
        end
        for c = 1:numel(charts)
            ch = charts(c);
            try
                chPath = ch.Path;
                if ~startsWith(chPath, modelName)
                    continue;
                end
                states = ch.find('-isa', 'Stateflow.State');
                for s = 1:numel(states)
                    st = states(s);
                    try
                        [nm, entryAction, stateDesc] = parseStateLabel(st);
                        if isNoiseName(nm)
                            continue;
                        end
                        parent = '';
                        try
                            p = st.getParent();
                            if ~isempty(p)
                                parent = p.Name;
                            end
                        catch
                        end
                        items{end+1} = struct( ...
                            'name',        nm, ...
                            'parent',      parent, ...
                            'entryAction', entryAction, ...
                            'description', stateDesc, ...
                            'location',    stPath(st));
                    catch
                    end
                end
            catch
            end
        end
    catch
        % Stateflow not available; try to find chart blocks anyway
        chartBlocks = find_system(modelName, 'LookUnderMasks', 'all', ...
            'BlockType', 'Chart');
        for k = 1:numel(chartBlocks)
            blk = chartBlocks{k};
            try
                nm = get_param(blk, 'Name');
                items{end+1} = struct( ...
                    'name',        nm, ...
                    'parent',      modelName, ...
                    'entryAction', '', ...
                    'description', 'Stateflow chart (detail extraction requires Stateflow license)', ...
                    'location',    blk);
            catch
            end
        end
    end
end

% ========================================================================
%  Trace References  (From/Goto, DataStore Read/Write)
% ========================================================================
function items = extractTraceRefs(modelName)
    items = {};
    refBlocks = findBlocksByTypes(modelName, { ...
        'From', 'Goto', 'DataStoreRead', 'DataStoreWrite', ...
        'GotoTagVisibility'});
    for k = 1:numel(refBlocks)
        blk = refBlocks{k};
        try
            nm = get_param(blk, 'Name');
            if isNoiseName(nm)
                continue;
            end
            target = '';
            bt = '';
            try
                bt = get_param(blk, 'BlockType');
                switch bt
                    case 'From'
                        target = get_param(blk, 'GotoTag');
                    case 'Goto'
                        target = get_param(blk, 'GotoTag');
                    case 'DataStoreRead'
                        target = get_param(blk, 'DataStoreName');
                    case 'DataStoreWrite'
                        target = get_param(blk, 'DataStoreName');
                end
            catch
            end
            desc = '';
            try desc = get_param(blk, 'Description'); catch, end
            items{end+1} = struct( ...
                'name',        nm, ...
                'blockType',   bt, ...
                'targetBlock', target, ...
                'description', desc, ...
                'location',    blk);
        catch
        end
    end
end

% ========================================================================
%  Stateflow transitions as logic rules
% ========================================================================
function items = extractStateflowTransitions(modelName, slxFilePath)
    if nargin < 2
        slxFilePath = '';
    end
    items = {};
    try
        rt = sfroot;
        charts = rt.find('-isa', 'Stateflow.Chart');
        try
            emCharts = rt.find('-isa', 'Stateflow.EMChart');
            charts = [charts; emCharts];
        catch
        end
        for c = 1:numel(charts)
            ch = charts(c);
            try
                chPath = ch.Path;
                if ~startsWith(chPath, modelName)
                    continue;
                end
                transitions = ch.find('-isa', 'Stateflow.Transition');
                for t = 1:numel(transitions)
                    tr = transitions(t);
                    try
                        label = '';
                        try label = char(tr.LabelString); catch, end
                        if isempty(strtrim(label))
                            continue;
                        end
                        [condition, action] = parseTransitionLabel(label);
                        sourceName = getStateflowEndpointName(tr, 'Source', 'initial');
                        destinationName = getStateflowEndpointName(tr, 'Destination', 'unknown');
                        transitionName = [sourceName, ' -> ', destinationName];
                        desc = strtrim(label);
                        if isempty(condition) && isempty(action)
                            condition = desc;
                        end
                        items{end+1} = struct( ...
                            'name',        transitionName, ...
                            'blockType',   'StateflowTransition', ...
                            'condition',   condition, ...
                            'action',      action, ...
                            'description', desc, ...
                            'source',      sourceName, ...
                            'destination', destinationName, ...
                            'location',    [chPath, '/transition/', transitionName]);
                    catch
                    end
                end
            catch
            end
        end
    catch
        % no Stateflow license/API
    end

    if isempty(items) && ~isempty(slxFilePath)
        xmlItems = extractStateflowTransitionsFromSlxXml(slxFilePath, modelName);
        for k = 1:numel(xmlItems)
            items{end+1} = xmlItems{k};
        end
    end
end

function items = extractStateflowTransitionsFromSlxXml(slxFilePath, modelName)
    items = {};
    tmpDir = tempname;
    try
        mkdir(tmpDir);
        cleanupObj = onCleanup(@() cleanupTempDir(tmpDir));
        unzip(slxFilePath, tmpDir);
        chartDir = fullfile(tmpDir, 'simulink', 'stateflow');
        chartFiles = dir(fullfile(chartDir, 'chart_*.xml'));
        for f = 1:numel(chartFiles)
            xmlPath = fullfile(chartFiles(f).folder, chartFiles(f).name);
            try
                doc = xmlread(xmlPath);
                chartNode = doc.getDocumentElement();
                chartName = xmlDirectPValue(chartNode, 'name');
                if isempty(chartName)
                    chartName = ['chart_', char(chartNode.getAttribute('id'))];
                end
                chartPath = [modelName, '/', chartName];

                stateNames = containers.Map('KeyType', 'char', 'ValueType', 'char');
                stateNodes = chartNode.getElementsByTagName('state');
                for s = 0:stateNodes.getLength()-1
                    stateNode = stateNodes.item(s);
                    ssid = char(stateNode.getAttribute('SSID'));
                    if isempty(ssid)
                        continue;
                    end
                    label = xmlDirectPValue(stateNode, 'labelString');
                    stateNames(ssid) = firstLabelLine(label, ssid);
                end

                transitionNodes = chartNode.getElementsByTagName('transition');
                for t = 0:transitionNodes.getLength()-1
                    transitionNode = transitionNodes.item(t);
                    label = strtrim(xmlDirectPValue(transitionNode, 'labelString'));
                    if isempty(label)
                        continue;
                    end
                    [condition, action] = parseTransitionLabel(label);
                    sourceSsid = xmlEndpointSsid(transitionNode, 'src');
                    destSsid = xmlEndpointSsid(transitionNode, 'dst');
                    sourceName = stateNameBySsid(stateNames, sourceSsid, 'initial');
                    destName = stateNameBySsid(stateNames, destSsid, 'unknown');
                    transitionName = [sourceName, ' -> ', destName];
                    transitionId = char(transitionNode.getAttribute('SSID'));
                    items{end+1} = struct( ...
                        'name',        transitionName, ...
                        'blockType',   'StateflowTransition', ...
                        'condition',   condition, ...
                        'action',      action, ...
                        'description', label, ...
                        'source',      sourceName, ...
                        'destination', destName, ...
                        'location',    [chartPath, '/transition/', transitionId]);
                end
            catch
                % skip malformed chart XML
            end
        end
        clear cleanupObj;
        cleanupTempDir(tmpDir);
    catch
        cleanupTempDir(tmpDir);
    end
end

function cleanupTempDir(dirPath)
    try
        if isfolder(dirPath)
            rmdir(dirPath, 's');
        end
    catch
        % ignore cleanup errors
    end
end

function value = xmlDirectPValue(node, name)
    value = '';
    try
        children = node.getChildNodes();
        for i = 0:children.getLength()-1
            child = children.item(i);
            if child.getNodeType() ~= 1
                continue;
            end
            if ~strcmp(char(child.getNodeName()), 'P')
                continue;
            end
            if strcmp(char(child.getAttribute('Name')), name)
                value = strtrim(char(child.getTextContent()));
                return;
            end
        end
    catch
        value = '';
    end
end

function ssid = xmlEndpointSsid(transitionNode, endpointName)
    ssid = '';
    try
        children = transitionNode.getChildNodes();
        for i = 0:children.getLength()-1
            child = children.item(i);
            if child.getNodeType() ~= 1
                continue;
            end
            if strcmp(char(child.getNodeName()), endpointName)
                ssid = xmlDirectPValue(child, 'SSID');
                return;
            end
        end
    catch
        ssid = '';
    end
end

function name = firstLabelLine(labelText, fallback)
    name = '';
    try
        lines = regexp(char(labelText), '\r\n|\n|\r', 'split');
        if ~isempty(lines)
            name = strtrim(lines{1});
        end
    catch
        name = '';
    end
    if isempty(name)
        name = fallback;
    end
end

function name = stateNameBySsid(stateNames, ssid, fallback)
    name = fallback;
    try
        if ~isempty(ssid) && isKey(stateNames, ssid)
            name = stateNames(ssid);
        end
    catch
        name = fallback;
    end
end

% ========================================================================
%  Shared helpers
% ========================================================================
function blocks = findBlocksByTypes(modelName, blockTypes)
    blocks = {};
    for i = 1:numel(blockTypes)
        bt = blockTypes{i};
        try
            found = find_system(modelName, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'BlockType', bt);
        catch
            try
                found = find_system(modelName, 'LookUnderMasks', 'all', 'BlockType', bt);
            catch
                found = {};
            end
        end
        if ischar(found)
            found = {found};
        end
        blocks = [blocks; found(:)];
    end
    try
        blocks = unique(blocks, 'stable');
    catch
        blocks = unique(blocks);
    end
end

function out = appendUniqueCells(out, values)
    if nargin < 1 || isempty(out)
        out = {};
    end
    if nargin < 2 || isempty(values)
        return;
    end
    if ischar(values) || isstring(values)
        values = {char(values)};
    end
    for i = 1:numel(values)
        try
            value = strtrim(char(values{i}));
        catch
            value = '';
        end
        if isempty(value)
            continue;
        end
        if ~any(strcmp(out, value))
            out{end+1} = value;
        end
    end
end

function name = shortBlockName(blockPath)
    name = '';
    try
        name = get_param(blockPath, 'Name');
    catch
        try
            parts = regexp(char(blockPath), '/', 'split');
            if ~isempty(parts)
                name = parts{end};
            end
        catch
            name = '';
        end
    end
    if isempty(name)
        name = char(blockPath);
    end
end

function tf = isNoiseName(name)
    nm = lower(strtrim(char(name)));
    noiseNames = {'copyright', 'unit detailed design'};
    tf = any(strcmp(nm, noiseNames));
end

function value = getParamOrEmpty(block, paramName)
    value = '';
    try
        value = stringifyValue(get_param(block, paramName));
    catch
        value = '';
    end
end

function text = stringifyValue(value)
    try
        if ischar(value)
            text = strtrim(value);
        elseif isstring(value)
            text = strtrim(char(value));
        elseif isnumeric(value) || islogical(value)
            text = mat2str(value);
        elseif iscell(value)
            parts = {};
            for i = 1:numel(value)
                parts{end+1} = stringifyValue(value{i});
            end
            text = strjoin(parts, ', ');
        else
            text = char(string(value));
        end
    catch
        text = '';
    end
end

function [value, description] = getParameterSummary(block, blockType)
    names = {};
    switch blockType
        case 'Constant'
            names = {'Value', 'OutDataTypeStr', 'SampleTime'};
        case 'Gain'
            names = {'Gain', 'Multiplication', 'OutDataTypeStr', 'SampleTime'};
        case 'Bias'
            names = {'Bias', 'OutDataTypeStr', 'SampleTime'};
        case 'Saturate'
            names = {'UpperLimit', 'LowerLimit', 'LinearizeAsGain', 'OutDataTypeStr'};
        case {'Lookup_n-D', 'LookupNDDirect', 'Lookup', 'Lookup2D'}
            names = {'NumberOfTableDimensions', 'BreakpointsForDimension1', 'BreakpointsForDimension2', ...
                     'Table', 'TableData', 'LookupTableObject', 'OutDataTypeStr'};
        case 'PreLookup'
            names = {'BreakpointsData', 'BreakpointObject', 'IndexSearchMethod', 'ExtrapMethod'};
        case 'Interpolation_n-D'
            names = {'Table', 'TableData', 'LookupTableObject', 'NumberOfTableDimensions', 'InterpMethod', 'ExtrapMethod'};
        otherwise
            names = {'Value', 'Gain', 'UpperLimit', 'LowerLimit'};
    end
    description = getParameterList(block, names);
    value = description;
end

function text = getParameterList(block, names)
    parts = {};
    for i = 1:numel(names)
        value = getParamOrEmpty(block, names{i});
        if ~isempty(value) && ~strcmp(value, '[]')
            parts{end+1} = [names{i}, '=', value];
        end
    end
    text = strjoin(parts, '; ');
end

function stNum = parsePositiveSampleTime(sampleTimeText)
    stNum = NaN;
    try
        stText = stringifyValue(sampleTimeText);
        token = regexp(stText, '^\s*\[?\s*([0-9]+(?:\.[0-9]+)?(?:[eE][+-]?\d+)?)', 'tokens', 'once');
        if ~isempty(token)
            stNum = str2double(token{1});
        end
    catch
        stNum = NaN;
    end
end

function [stateName, entryAction, description] = parseStateLabel(stateObj)
    stateName = '';
    entryAction = '';
    description = '';
    labelText = '';
    try labelText = char(stateObj.LabelString); catch, end
    if isempty(strtrim(labelText))
        try labelText = char(stateObj.Name); catch, end
    end
    lines = regexp(labelText, '\r\n|\n|\r', 'split');
    if ~isempty(lines)
        stateName = strtrim(lines{1});
    end
    if isempty(stateName)
        try stateName = char(stateObj.Name); catch, end
    end
    labelFlat = regexprep(labelText, '\s+', ' ');
    entryAction = extractAction(labelFlat, {'entry', 'en'});
    duringAction = extractAction(labelFlat, {'during', 'du'});
    exitAction = extractAction(labelFlat, {'exit', 'ex'});
    descParts = {};
    if ~isempty(duringAction), descParts{end+1} = ['during:', duringAction]; end
    if ~isempty(exitAction), descParts{end+1} = ['exit:', exitAction]; end
    description = strjoin(descParts, '; ');
end

function action = extractAction(text, keys)
    action = '';
    for i = 1:numel(keys)
        pattern = ['(^|\s)', keys{i}, '\s*:'];
        [~, matchEnd] = regexp(text, pattern, 'once');
        if ~isempty(matchEnd)
            suffix = strtrim(text(matchEnd + 1:end));
            nextStarts = [];
            stopKeys = {'entry', 'en', 'during', 'du', 'exit', 'ex'};
            for j = 1:numel(stopKeys)
                if strcmp(stopKeys{j}, keys{i})
                    continue;
                end
                nextStart = regexp(suffix, ['(^|\s)', stopKeys{j}, '\s*:'], 'start', 'once');
                if ~isempty(nextStart)
                    nextStarts(end+1) = nextStart;
                end
            end
            if ~isempty(nextStarts)
                suffix = strtrim(suffix(1:min(nextStarts)-1));
            end
            action = strtrim(suffix);
            return;
        end
    end
end

function [condition, action] = parseTransitionLabel(labelText)
    condition = '';
    action = '';
    text = strtrim(regexprep(labelText, '\s+', ' '));
    condMatch = regexp(text, '\[([^\]]+)\]', 'tokens', 'once');
    if ~isempty(condMatch)
        condition = strtrim(condMatch{1});
    else
        slashIndex = strfind(text, '/');
        if ~isempty(slashIndex)
            condition = strtrim(text(1:slashIndex(1)-1));
        else
            condition = text;
        end
    end
    actionMatch = regexp(text, '/\s*(.*)$', 'tokens', 'once');
    if ~isempty(actionMatch)
        action = strtrim(actionMatch{1});
    end
end

function name = getStateflowEndpointName(transition, propName, fallback)
    name = fallback;
    try
        endpoint = transition.(propName);
        if isempty(endpoint)
            return;
        end
        try
            name = char(endpoint.Name);
        catch
            try
                label = char(endpoint.LabelString);
                lines = regexp(label, '\r\n|\n|\r', 'split');
                name = strtrim(lines{1});
            catch
            end
        end
        if isempty(strtrim(name))
            name = fallback;
        end
    catch
        name = fallback;
    end
end

% ========================================================================
%  Helper: build Stateflow state path
% ========================================================================
function p = stPath(st)
    try
        parts = {};
        node = st;
        while ~isempty(node)
            try
                nm = node.Name;
                if isempty(nm)
                    nm = node.LabelString;
                end
                parts{end+1} = nm;
            catch
                break;
            end
            try
                node = node.getParent();
            catch
                break;
            end
        end
        p = strjoin(fliplr(parts), '/');
    catch
        p = '';
    end
end
