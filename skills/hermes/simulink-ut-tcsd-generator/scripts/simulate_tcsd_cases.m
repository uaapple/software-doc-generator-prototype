function simulate_tcsd_cases(rootDir, modelName, matFile, caseJson, resultJson)
modelName = char(string(modelName));
matFile = char(string(matFile));
cleanupObj = onCleanup(@() cleanup_task_models({modelName, 'ITKLib'}));
setup_ut_support(rootDir);
cleanup_task_models({modelName, 'ITKLib'});
load_mat_to_base(fullfile(rootDir, matFile));
load_support_library(rootDir, 'ITKLib.slx');
load_system(fullfile(rootDir, [modelName '.slx']));
maybe_apply_mps_default_override(modelName);
configure_tcsd_sim_config(modelName, rootDir);

inputBlocks = find_system(modelName, 'SearchDepth', 1, 'BlockType', 'Inport');
[~, inputOrder] = sort(str2double(get_param(inputBlocks, 'Port')));
inputBlocks = inputBlocks(inputOrder);
inputNames = cellfun(@(p) get_param(p, 'Name'), inputBlocks, 'UniformOutput', false);

outputBlocks = find_system(modelName, 'SearchDepth', 1, 'BlockType', 'Outport');
[~, outputOrder] = sort(str2double(get_param(outputBlocks, 'Port')));
outputBlocks = outputBlocks(outputOrder);
outputNames = cellfun(@(p) get_param(p, 'Name'), outputBlocks, 'UniformOutput', false);

[inputTypes, inputDims] = compiled_input_metadata(modelName, inputBlocks, inputNames);

spec = jsondecode(fileread(caseJson));
results = struct('row', {}, 'test_id', {}, 'steps', {});
for testIndex = 1:numel(spec.tests)
    test = spec.tests(testIndex);
    currentValues = struct();
    for i = 1:numel(inputNames)
        currentValues.(inputNames{i}) = zeros(1, inputDims.(inputNames{i}));
    end
    initFields = fieldnames(test.init_values);
    for i = 1:numel(initFields)
        name = initFields{i};
        if isfield(inputDims, name)
            currentValues.(name) = normalize_input_value(test.init_values.(name), inputDims.(name));
        end
    end
    currentParams = test.init_params;

    segmentInitialValues = currentValues;
    segmentParams = currentParams;
    segmentSteps = [];
    caseSteps = struct('index', {}, 'time_s', {}, 'outputs', {}, 'stable', {});
    for stepIndex = 1:numel(test.steps)
        step = test.steps(stepIndex);
        paramFields = fieldnames(step.param_updates);
        if ~isempty(paramFields) && ~isempty(segmentSteps)
            stepResults = run_segment(modelName, matFile, rootDir, inputNames, inputTypes, inputDims, outputNames, segmentInitialValues, segmentParams, segmentSteps);
            caseSteps = [caseSteps, stepResults]; %#ok<AGROW>
            segmentSteps = [];
        end
        if ~isempty(paramFields)
            inputUpdateFields = fieldnames(step.input_updates);
            for i = 1:numel(inputUpdateFields)
                name = inputUpdateFields{i};
                if isfield(inputDims, name)
                    currentValues.(name) = normalize_input_value(step.input_updates.(name), inputDims.(name));
                end
            end
            for i = 1:numel(paramFields)
                currentParams.(paramFields{i}) = step.param_updates.(paramFields{i});
            end
            segmentInitialValues = currentValues;
            segmentParams = currentParams;
            syntheticStep = step;
            syntheticStep.delay_s = 0.01;
            syntheticStep.input_updates = struct();
            syntheticStep.param_updates = struct();
            segmentSteps = [segmentSteps, syntheticStep]; %#ok<AGROW>
        else
            segmentSteps = [segmentSteps, step]; %#ok<AGROW>
            inputUpdateFields = fieldnames(step.input_updates);
            for i = 1:numel(inputUpdateFields)
                name = inputUpdateFields{i};
                if isfield(inputDims, name)
                    currentValues.(name) = normalize_input_value(step.input_updates.(name), inputDims.(name));
                end
            end
        end
    end
    if ~isempty(segmentSteps)
        stepResults = run_segment(modelName, matFile, rootDir, inputNames, inputTypes, inputDims, outputNames, segmentInitialValues, segmentParams, segmentSteps);
        caseSteps = [caseSteps, stepResults]; %#ok<AGROW>
    end
    [~, order] = sort([caseSteps.index]);
    results(testIndex).row = test.row;
    results(testIndex).test_id = test.test_id;
    results(testIndex).steps = caseSteps(order);
end

payload = struct();
payload.tests = results;
fid = fopen(resultJson, 'w');
fprintf(fid, '%s', jsonencode(payload, PrettyPrint=true));
fclose(fid);
cleanup_task_models({modelName, 'ITKLib'});
end

function stepResults = run_segment(modelName, matFile, rootDir, inputNames, inputTypes, inputDims, outputNames, initialValues, paramOverrides, steps)
dt = 0.01;
totalTime = 0;
for k = 1:numel(steps)
    totalTime = totalTime + steps(k).delay_s;
end
stopTime = max(dt, ceil(totalTime / dt) * dt);
t = (0:dt:stopTime)';

load_mat_to_base(fullfile(rootDir, matFile));
paramFields = fieldnames(paramOverrides);
for k = 1:numel(paramFields)
    name = paramFields{k};
    value = paramOverrides.(name);
    try
        obj = evalin('base', name);
        if isprop(obj, 'Value')
            obj.Value = value;
            assignin('base', name, obj);
        else
            assignin('base', name, value);
        end
    catch
        assignin('base', name, value);
    end
end

seriesData = struct();
for k = 1:numel(inputNames)
    name = inputNames{k};
    value = zeros(1, inputDims.(name));
    if isfield(initialValues, name)
        value = normalize_input_value(initialValues.(name), inputDims.(name));
    end
    seriesData.(name) = repmat(value, numel(t), 1);
end

eventTimes = zeros(1, numel(steps));
currentTime = 0;
for k = 1:numel(steps)
    currentTime = currentTime + steps(k).delay_s;
    eventTimes(k) = currentTime;
    updates = steps(k).input_updates;
    fields = fieldnames(updates);
    sampleMask = t >= (currentTime - (dt / 100));
    for j = 1:numel(fields)
        name = fields{j};
        if isfield(seriesData, name)
            value = normalize_input_value(updates.(name), inputDims.(name));
            seriesData.(name)(sampleMask, :) = repmat(value, sum(sampleMask), 1);
        end
    end
end

ds = Simulink.SimulationData.Dataset;
for k = 1:numel(inputNames)
    name = inputNames{k};
    data = cast_input_for_simulink_ut(seriesData.(name), inputTypes.(name));
    if inputDims.(name) == 1
        data = data(:, 1);
    end
    ts = timeseries(data, t);
    ts.Name = name;
    try
        ts = setinterpmethod(ts, 'zoh');
    catch
    end
    ds{k} = ts;
end

in = Simulink.SimulationInput(modelName);
externalInputVar = 'tc_sd_external_input_ds';
in = in.setVariable(externalInputVar, ds);
in = in.setModelParameter('StopTime', num2str(stopTime), 'SolverType', 'Fixed-step', 'Solver', 'FixedStepDiscrete', 'FixedStep', num2str(dt), 'SaveOutput', 'on', 'ReturnWorkspaceOutputs', 'on', 'LoadExternalInput', 'on', 'ExternalInput', externalInputVar);
try
    out = sim(in);
catch ME
    if is_mps_selector_error(ME)
        diagText = mps_diagnostic_summary(modelName);
        error('simulate_tcsd_cases:InvalidMultiPortSwitchSelector', '%s\n\n%s', getReport(ME, 'basic', 'hyperlinks', 'off'), diagText);
    end
    rethrow(ME);
end

stepResults = struct('index', {}, 'time_s', {}, 'outputs', {}, 'stable', {});
for k = 1:numel(steps)
    outputs = struct();
    stable = struct();
    for j = 1:numel(outputNames)
        signalName = outputNames{j};
        vals = get_output_values(out, signalName, j);
        [~, sampleIndex] = min(abs(vals.Time - eventTimes(k)));
        data = vals.Data;
        sampleValue = sample_output_value(data, vals.Time, sampleIndex);
        if isscalar(sampleValue)
            outputs.(signalName) = double(sampleValue);
            if k < numel(steps)
                intervalMask = vals.Time >= (eventTimes(k) - (dt / 100)) & vals.Time < (eventTimes(k + 1) - (dt / 100));
            else
                intervalMask = abs(vals.Time - eventTimes(k)) <= (dt / 100);
            end
            intervalData = interval_output_data(data, vals.Time, intervalMask);
            if isempty(intervalData)
                stable.(signalName) = true;
            else
                intervalData = double(intervalData(:));
                stable.(signalName) = (max(intervalData) - min(intervalData)) <= stability_tolerance(signalName);
            end
        end
    end
    stepResults(k).index = steps(k).index;
    stepResults(k).time_s = eventTimes(k);
    stepResults(k).outputs = outputs;
    stepResults(k).stable = stable;
end
end

function [inputTypes, inputDims] = compiled_input_metadata(modelName, inputBlocks, inputNames)
inputTypes = struct();
inputDims = struct();
for i = 1:numel(inputNames)
    inputTypes.(inputNames{i}) = 'single';
    inputDims.(inputNames{i}) = 1;
end

compiled = false;
try
    feval(modelName, [], [], [], 'compile');
    compiled = true;
    cleanupObj = onCleanup(@() feval(modelName, [], [], [], 'term'));
    for i = 1:numel(inputNames)
        portHandles = get_param(inputBlocks{i}, 'PortHandles');
        dtype = get_param(portHandles.Outport, 'CompiledPortDataType');
        dims = get_param(portHandles.Outport, 'CompiledPortDimensions');
        inputTypes.(inputNames{i}) = char(string(dtype));
        inputDims.(inputNames{i}) = compiled_width(dims);
    end
catch
    for i = 1:numel(inputNames)
        [dtype, width] = workspace_input_metadata(inputNames{i});
        inputTypes.(inputNames{i}) = dtype;
        inputDims.(inputNames{i}) = width;
    end
end
if compiled
    clear cleanupObj;
end
end

function width = compiled_width(dims)
dims = double(dims);
if isempty(dims)
    width = 1;
elseif isscalar(dims)
    width = max(1, dims(1));
elseif numel(dims) >= 2
    width = max(1, prod(dims(2:end)));
else
    width = 1;
end
end

function [dtype, width] = workspace_input_metadata(inputName)
dtype = 'single';
width = 1;
try
    obj = evalin('base', inputName);
    if isprop(obj, 'DataType') && ~isempty(obj.DataType)
        dtype = char(string(obj.DataType));
    end
    if isprop(obj, 'Dimensions')
        dims = double(obj.Dimensions);
        if ~isempty(dims) && all(dims > 0)
            width = max(1, prod(dims));
        end
    end
catch
end
end

function vals = get_output_values(out, signalName, index)
try
    sig = out.yout.get(signalName);
    if ~isempty(sig)
        vals = sig.Values;
        return;
    end
catch
end
sig = out.yout{index};
vals = sig.Values;
end

function cleanup_task_models(modelNames)
for i = 1:numel(modelNames)
    modelName = modelNames{i};
    try
        if bdIsLoaded(modelName)
            close_system(modelName, 0);
        end
    catch
    end
end
end

function value = normalize_input_value(value, width)
value = double(value);
value = value(:)';
if numel(value) == width
    return;
end
if isscalar(value)
    value = repmat(value, 1, width);
else
    value = value(1:min(end, width));
    if numel(value) < width
        value(end + 1:width) = value(end);
    end
end
end

function value = sample_output_value(data, time, sampleIndex)
if isvector(data) && numel(data) == numel(time)
    value = data(sampleIndex);
elseif size(data, 1) == numel(time)
    value = data(sampleIndex, :);
elseif size(data, ndims(data)) == numel(time)
    index = repmat({':'}, 1, ndims(data));
    index{end} = sampleIndex;
    value = squeeze(data(index{:}));
else
    value = squeeze(data(sampleIndex));
end
value = value(:)';
end

function values = interval_output_data(data, time, intervalMask)
if isvector(data) && numel(data) == numel(time)
    values = data(intervalMask);
elseif size(data, 1) == numel(time)
    values = data(intervalMask, :);
elseif size(data, ndims(data)) == numel(time)
    index = repmat({':'}, 1, ndims(data));
    index{end} = intervalMask;
    values = data(index{:});
else
    values = data(intervalMask);
end
end

function tol = stability_tolerance(signalName)
if contains(signalName, 'eff', 'IgnoreCase', true) || contains(signalName, 'pct', 'IgnoreCase', true)
    tol = 1e-5;
else
    tol = 1e-4;
end
end

function maybe_apply_mps_default_override(modelName)
flag = getenv('TCSD_ALLOW_MPS_DEFAULT_OVERRIDE');
if ~any(strcmpi(flag, {'1', 'true', 'yes', 'on'}))
    return;
end
warning('simulate_tcsd_cases:MPSDefaultOverride', ...
    ['TCSD_ALLOW_MPS_DEFAULT_OVERRIDE is enabled. MultiPortSwitch default-case diagnostics ' ...
     'will be suppressed for this simulation only. Use this for diagnosis, not for trusted expected-output backfill.']);
mpsBlocks = find_system(modelName, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'BlockType', 'MultiPortSwitch');
for k = 1:numel(mpsBlocks)
    try
        set_param(mpsBlocks{k}, 'DiagnosticForDefault', 'None');
        set_param(mpsBlocks{k}, 'DataPortForDefault', 'Last data port');
    catch
    end
end
end

function tf = is_mps_selector_error(ME)
report = getReport(ME, 'basic', 'hyperlinks', 'off');
tf = (contains(report, 'Multiport Switch', 'IgnoreCase', true) || contains(report, 'MultiPortSwitch', 'IgnoreCase', true)) ...
    && (contains(report, 'control port', 'IgnoreCase', true) ...
        || contains(report, '控制端口') ...
        || contains(report, 'does not correspond', 'IgnoreCase', true) ...
        || contains(report, '不对应'));
end

function text = mps_diagnostic_summary(modelName)
mpsBlocks = find_system(modelName, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'BlockType', 'MultiPortSwitch');
lines = {
    'MPS diagnostic: a MultiPortSwitch selector reached a value that is not accepted by its data-port indexing.'
    'Default behavior is to fix the TCSD stimulus or calibration override, not to suppress the model diagnostic.'
    'If a temporary diagnostic run is needed, set TCSD_ALLOW_MPS_DEFAULT_OVERRIDE=1; do not treat that run as trusted expected-output backfill.'
    'MultiPortSwitch blocks in the loaded model:'
};
for k = 1:numel(mpsBlocks)
    block = mpsBlocks{k};
    lines{end + 1} = sprintf('- %s', block); %#ok<AGROW>
    lines{end + 1} = sprintf('  selector_source: %s', selector_source(block)); %#ok<AGROW>
    lines{end + 1} = sprintf('  Inputs=%s, DataPortOrder=%s, DataPortIndices=%s', ...
        safe_get_param(block, 'Inputs'), safe_get_param(block, 'DataPortOrder'), safe_get_param(block, 'DataPortIndices')); %#ok<AGROW>
    lines{end + 1} = sprintf('  DiagnosticForDefault=%s, DataPortForDefault=%s', ...
        safe_get_param(block, 'DiagnosticForDefault'), safe_get_param(block, 'DataPortForDefault')); %#ok<AGROW>
end
text = strjoin(lines, newline);
end

function source = selector_source(block)
source = '<unavailable>';
try
    handles = get_param(block, 'PortHandles');
    if isempty(handles.Inport)
        source = '<no inport handles>';
        return;
    end
    line = get_param(handles.Inport(1), 'Line');
    if line == -1
        source = '<unconnected control port>';
        return;
    end
    srcPort = get_param(line, 'SrcPortHandle');
    if srcPort == -1
        source = '<unavailable source port>';
        return;
    end
    srcBlock = get_param(srcPort, 'Parent');
    source = sprintf('%s.out%d', srcBlock, double(get_param(srcPort, 'PortNumber')));
catch
end
end

function value = safe_get_param(block, paramName)
try
    value = char(string(get_param(block, paramName)));
catch
    value = '<unavailable>';
end
end

function load_support_library(rootDir, libraryFile)
candidate = fullfile(rootDir, libraryFile);
if exist(candidate, 'file')
    load_system(candidate);
    return;
end
candidate = which(libraryFile);
if ~isempty(candidate)
    load_system(candidate);
end
end

function load_mat_to_base(matPath)
loaded = load(matPath);
names = fieldnames(loaded);
for i = 1:numel(names)
    assignin('base', names{i}, loaded.(names{i}));
end
end
