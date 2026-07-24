function collect_mcdc_coverage_feedback(rootDir, modelName, matFile, caseJson, feedbackJson, varargin)
%COLLECT_MCDC_COVERAGE_FEEDBACK Run TCSD cases with Simulink Coverage.
%
% The script is intentionally conservative: it records real Simulink Coverage
% results when available and writes a machine-readable error payload when the
% coverage run cannot be trusted.

p = inputParser;
addParameter(p, 'ReportHtml', '', @(x) ischar(x) || isstring(x));
addParameter(p, 'InitScripts', {}, @(x) iscell(x) || isstring(x));
addParameter(p, 'AddonDir', '', @(x) ischar(x) || isstring(x));
parse(p, varargin{:});

modelName = char(string(modelName));
matFile = char(string(matFile));
caseJson = char(string(caseJson));
feedbackJson = char(string(feedbackJson));
reportHtml = char(string(p.Results.ReportHtml));
initScripts = cellstr(p.Results.InitScripts);
addonDir = char(string(p.Results.AddonDir));

payload = struct();
payload.model = modelName;
payload.status = "failed";
payload.mcdc = empty_metric();
payload.decision = empty_metric();
payload.condition = empty_metric();
payload.items = {};
payload.warnings = strings(0, 1);

try
    setup_ut_support(rootDir, initScripts);
    prioritize_addon_dir(addonDir);
    cleanup_task_models({modelName, 'ITKLib'});
    cleanupObj = onCleanup(@() cleanup_task_models({modelName, 'ITKLib'}));
    load_mat_to_base(resolve_workspace_file(rootDir, matFile));
    load_support_library(rootDir, 'ITKLib.slx');
    load_system(fullfile(rootDir, [modelName '.slx']));
    configure_tcsd_sim_config(modelName, rootDir);

    if ~function_available('cvtest') || ~function_available('cvsim') || ~function_available('mcdcinfo')
        error('collect_mcdc_coverage_feedback:MissingCoverageToolbox', ...
            'Simulink Coverage functions cvtest/cvsim/mcdcinfo are not available on the MATLAB path.');
    end

    spec = jsondecode(fileread(caseJson));
    cvd = [];
    for testIndex = 1:numel(spec.tests)
        test = spec.tests(testIndex);
        simIn = simulation_input_from_tcsd_case(rootDir, modelName, matFile, test);
        thisCvd = run_coverage_sim(modelName, simIn);
        if isempty(cvd)
            cvd = thisCvd;
        else
            cvd = cvd + thisCvd;
        end
    end

    payload.status = "ok";
    payload.mcdc = metric_summary(@mcdcinfo, cvd, modelName);
    payload.decision = metric_summary(@decisioninfo, cvd, modelName);
    payload.condition = metric_summary(@conditioninfo, cvd, modelName);
    payload.items = struct_array_to_cell(collect_uncovered_mcdc_items(cvd, modelName));

    if strlength(string(reportHtml)) > 0
        try
            cvhtml(reportHtml, cvd);
            payload.report_html = string(reportHtml);
        catch ME
            payload.warnings(end + 1, 1) = "cvhtml failed: " + string(ME.message);
        end
    end
catch ME
    payload.status = "failed";
    payload.error_id = string(ME.identifier);
    payload.error_message = string(ME.message);
    payload.error_stack = matlab_stack_to_struct(ME.stack);
end

write_json(feedbackJson, payload);
end

function frames = matlab_stack_to_struct(stack)
frames = struct('file', {}, 'name', {}, 'line', {});
for i = 1:numel(stack)
    frame = struct();
    frame.file = string(stack(i).file);
    frame.name = string(stack(i).name);
    frame.line = stack(i).line;
    frames(end + 1) = frame; %#ok<AGROW>
end
end

function simIn = simulation_input_from_tcsd_case(rootDir, modelName, matFile, test)
% Mirror simulate_tcsd_cases.m closely enough for coverage feedback.
load_mat_to_base(resolve_workspace_file(rootDir, matFile));

inputBlocks = find_system(modelName, 'SearchDepth', 1, 'BlockType', 'Inport');
[~, inputOrder] = sort(str2double(get_param(inputBlocks, 'Port')));
inputBlocks = inputBlocks(inputOrder);
inputNames = cellfun(@(p) get_param(p, 'Name'), inputBlocks, 'UniformOutput', false);
[inputTypes, inputDims] = local_compiled_input_metadata(modelName, inputBlocks, inputNames);

dt = 0.01;
totalTime = 0;
for k = 1:numel(test.steps)
    totalTime = totalTime + test.steps(k).delay_s;
end
stopTime = max(dt, ceil(totalTime / dt) * dt);
t = (0:dt:stopTime)';

currentValues = struct();
for k = 1:numel(inputNames)
    currentValues.(inputNames{k}) = zeros(1, inputDims.(inputNames{k}));
end
initFields = fieldnames(test.init_values);
for k = 1:numel(initFields)
    name = initFields{k};
    if isfield(inputDims, name)
        currentValues.(name) = local_normalize_input_value(test.init_values.(name), inputDims.(name));
    end
end
apply_param_overrides(test.init_params);

seriesData = struct();
for k = 1:numel(inputNames)
    name = inputNames{k};
    value = currentValues.(name);
    seriesData.(name) = repmat(value, numel(t), 1);
end

currentTime = 0;
for k = 1:numel(test.steps)
    step = test.steps(k);
    currentTime = currentTime + step.delay_s;
    if ~isempty(fieldnames(step.param_updates))
        error('collect_mcdc_coverage_feedback:ActionParameterUpdateUnsupported', ...
            ['Coverage-driving parameter changes in Action would collapse to the final base-workspace value ' ...
             'before simulation. Split parameter states into separate Tests and place p Param=value in Initialization.']);
    end
    fields = fieldnames(step.input_updates);
    sampleMask = t >= (currentTime - (dt / 100));
    for j = 1:numel(fields)
        name = fields{j};
        if isfield(seriesData, name)
            value = local_normalize_input_value(step.input_updates.(name), inputDims.(name));
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

externalInputVar = 'tc_sd_external_input_ds';
simIn = Simulink.SimulationInput(modelName);
simIn = simIn.setVariable(externalInputVar, ds);
simIn = simIn.setModelParameter( ...
    'StopTime', num2str(stopTime), ...
    'SolverType', 'Fixed-step', ...
    'Solver', 'FixedStepDiscrete', ...
    'FixedStep', num2str(dt), ...
    'SaveOutput', 'on', ...
    'ReturnWorkspaceOutputs', 'on', ...
    'LoadExternalInput', 'on', ...
    'ExternalInput', externalInputVar);
end

function cvd = run_coverage_sim(modelName, simIn)
testObj = cvtest(modelName);
try
    testObj.settings.decision = 1;
    testObj.settings.condition = 1;
    testObj.settings.mcdc = 1;
catch
end
try
    cvd = cvsim(testObj, simIn);
catch
    set_param(modelName, 'CovEnable', 'on');
    set_param(modelName, 'CovMetricSettings', 'dcme');
    set_param(modelName, 'CovSaveSingleToWorkspaceVar', 'on');
    set_param(modelName, 'CovSaveName', 'cvd');
    simOut = sim(simIn); %#ok<NASGU>
    cvd = evalin('base', 'cvd');
end
end

function metric = metric_summary(fun, cvd, modelName)
metric = empty_metric();
try
    values = fun(cvd, modelName);
    metric.covered = safe_numeric(values, 1);
    metric.total = safe_numeric(values, 2);
    metric.max_total = safe_numeric(values, 3);
    metric.percent = percentage(metric.covered, metric.total);
catch ME
    metric.error = string(ME.message);
end
end

function items = collect_uncovered_mcdc_items(cvd, modelName)
items = empty_mcdc_items();
blocks = find_system(modelName, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'Type', 'Block');
for k = 1:numel(blocks)
    blockPath = blocks{k};
    try
        [cov, desc] = mcdcinfo(cvd, blockPath, true);
    catch
        continue
    end
    if isempty(cov) || numel(cov) < 2 || cov(2) == 0 || cov(1) >= cov(2)
        continue
    end
    item = struct();
    item.block_path = string(blockPath);
    item.covered = safe_numeric(cov, 1);
    item.total = safe_numeric(cov, 2);
    item.percent = percentage(item.covered, item.total);
    item.description = normalize_description(desc);
    items(end + 1) = item; %#ok<AGROW>
end
end

function items = empty_mcdc_items()
items = struct('block_path', {}, 'covered', {}, 'total', {}, 'percent', {}, 'description', {});
end

function cells = struct_array_to_cell(items)
cells = cell(1, numel(items));
for i = 1:numel(items)
    cells{i} = items(i);
end
end

function out = normalize_description(desc)
try
    out = string(jsonencode(desc));
catch
    out = string(evalc('disp(desc)'));
end
end

function apply_param_overrides(params)
fields = fieldnames(params);
for k = 1:numel(fields)
    name = fields{k};
    value = params.(name);
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
end

function [inputTypes, inputDims] = local_compiled_input_metadata(modelName, inputBlocks, inputNames)
inputTypes = struct();
inputDims = struct();
for i = 1:numel(inputNames)
    inputTypes.(inputNames{i}) = 'single';
    inputDims.(inputNames{i}) = 1;
end
try
    feval(modelName, [], [], [], 'compile');
    cleanupObj = onCleanup(@() feval(modelName, [], [], [], 'term')); %#ok<NASGU>
    for i = 1:numel(inputNames)
        portHandles = get_param(inputBlocks{i}, 'PortHandles');
        dtype = get_param(portHandles.Outport, 'CompiledPortDataType');
        dims = get_param(portHandles.Outport, 'CompiledPortDimensions');
        inputTypes.(inputNames{i}) = char(string(dtype));
        inputDims.(inputNames{i}) = local_compiled_width(dims);
    end
catch
end
end

function width = local_compiled_width(dims)
if isnumeric(dims)
    values = double(dims(:)');
else
    values = str2double(regexp(char(string(dims)), '\d+', 'match'));
end
values = values(~isnan(values) & values > 0);
if isempty(values)
    width = 1;
else
    width = max(1, prod(values));
end
end

function value = local_normalize_input_value(raw, width)
if isstruct(raw)
    names = fieldnames(raw);
    value = zeros(1, width);
    for k = 1:numel(names)
        idx = str2double(regexprep(names{k}, '^[^\d]*', ''));
        if ~isnan(idx) && idx >= 1 && idx <= width
            value(idx) = double(raw.(names{k}));
        end
    end
elseif isnumeric(raw) || islogical(raw)
    value = double(raw(:)');
else
    value = str2double(string(raw));
end
if numel(value) == 1 && width > 1
    value = repmat(value, 1, width);
elseif numel(value) < width
    value = [value, zeros(1, width - numel(value))];
elseif numel(value) > width
    value = value(1:width);
end
end

function metric = empty_metric()
metric = struct('covered', 0, 'total', 0, 'max_total', 0, 'percent', 100);
end

function value = safe_numeric(values, index)
if numel(values) >= index
    value = double(values(index));
else
    value = 0;
end
end

function pct = percentage(covered, total)
if total <= 0
    pct = 100;
else
    pct = 100 * covered / total;
end
end

function write_json(path, payload)
fid = fopen(path, 'w');
if fid < 0
    error('collect_mcdc_coverage_feedback:WriteFailed', 'Cannot write %s.', path);
end
cleanupObj = onCleanup(@() fclose(fid)); %#ok<NASGU>
fprintf(fid, '%s', jsonencode(payload, PrettyPrint=true));
end

function tf = function_available(name)
tf = exist(name, 'file') > 0 || exist(name, 'class') > 0 || exist(name, 'builtin') > 0;
end

function prioritize_addon_dir(addonDir)
if strlength(string(addonDir)) == 0 || exist(addonDir, 'dir') ~= 7
    return;
end
addpath(genpath(addonDir), '-begin');
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

function filePath = resolve_workspace_file(rootDir, fileName)
filePath = char(string(fileName));
if ~isfile(filePath)
    filePath = fullfile(rootDir, filePath);
end
end
