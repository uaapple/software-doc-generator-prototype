function probe_logical_mcdc_vectors(rootDir, modelNames, matFileName, varargin)
%PROBE_LOGICAL_MCDC_VECTORS Observe AND/OR input truth vectors from TCSD cases.
%
% The probe adds temporary To Workspace sinks to Logical Operator input lines,
% runs extracted TCSD cases, and writes outputs/logic_probe_results.json. It
% never saves the source model. Linked library blocks are temporarily made
% inactive in memory only when needed to attach a probe.

opts = parse_options(varargin{:});
rootDir = char(string(rootDir));
modelNames = normalize_cellstr(modelNames);
oldDir = pwd;
oldPath = path;
cleanupObj = onCleanup(@() local_cleanup(modelNames, oldDir, oldPath));
cd(rootDir);
addpath(fileparts(mfilename('fullpath')));
setup_ut_support(rootDir, opts.InitScripts);
if nargin >= 3 && ~isempty(matFileName)
    load_mat_to_base(fullfile(rootDir, char(string(matFileName))));
end
load_workspace_libraries(rootDir, modelNames);
allReports = struct();
coverageReports = struct();
for m = 1:numel(modelNames)
    modelName = modelNames{m};
    close_foreign_loaded_model(modelName, rootDir);
    load_system(fullfile(rootDir, [modelName '.slx']));
    if exist('configure_tcsd_sim_config', 'file') == 2
        configure_tcsd_sim_config(modelName, rootDir);
    end
    [inputNames, inputBlocks, outputNames] = root_ports(modelName);
    [inputTypes, inputDims] = compiled_input_metadata(modelName, inputBlocks, inputNames);
    probes = configure_logic_probes(modelName);
    caseJson = resolve_case_json(rootDir, modelName, opts.CaseSuffix, opts.CaseJson);
    spec = jsondecode(fileread(caseJson));
    observations = struct('row', {}, 'test_id', {}, 'step_index', {}, 'time_s', {}, 'inputs', {}, 'params', {}, 'vectors', {}, 'stimulus', {}, 'target', {}, 'prediction_status', {});
    aggregateCoverage = [];
    tests = normalize_struct_array(spec.tests);
    for testIndex = 1:numel(tests)
        [obs, testCoverage] = run_test_probe(modelName, inputNames, inputTypes, inputDims, probes, tests(testIndex), rootDir, matFileName, ~isempty(opts.CoverageJson));
        if ~isempty(testCoverage)
            if isempty(aggregateCoverage)
                aggregateCoverage = testCoverage;
            else
                aggregateCoverage = aggregateCoverage + testCoverage;
            end
        end
        for k = 1:numel(obs)
            obs(k).row = tests(testIndex).row;
            obs(k).test_id = tests(testIndex).test_id;
            observations(end + 1) = obs(k); %#ok<AGROW>
        end
    end
    report = struct();
    report.schema = 'simulink-ut-logical-mcdc-probe/v2';
    report.model = modelName;
    report.outputs = outputNames;
    report.case_json = caseJson;
    report.probes = probes;
    report.observations = observations;
    allReports.(matlab.lang.makeValidName(modelName)) = report;
    if ~isempty(aggregateCoverage)
        coverageReports.(matlab.lang.makeValidName(modelName)) = coverage_summary(aggregateCoverage, modelName, numel(tests), opts.CoverageThreshold);
        if ~isempty(opts.CoverageDataFile)
            save_coverage_data(opts.CoverageDataFile, aggregateCoverage);
        end
        if ~isempty(opts.CoverageHtml)
            cvhtml(opts.CoverageHtml, aggregateCoverage);
        end
    end
    bdclose(modelName);
end
write_json(opts.OutputJson, allReports);
if ~isempty(opts.CoverageJson)
    write_json(opts.CoverageJson, coverageReports);
end
clear cleanupObj;
local_cleanup(modelNames, oldDir, oldPath);
end

function opts = parse_options(varargin)
opts = struct();
opts.InitScripts = {};
opts.CaseSuffix = '_cases_mcdc.json';
opts.CaseJson = '';
opts.OutputJson = '';
opts.CoverageJson = '';
opts.CoverageDataFile = '';
opts.CoverageHtml = '';
opts.CoverageThreshold = 80;
idx = 1;
while idx <= numel(varargin)
    key = char(string(varargin{idx}));
    if idx + 1 > numel(varargin)
        break;
    end
    value = varargin{idx + 1};
    switch lower(key)
        case 'initscripts'
            opts.InitScripts = normalize_cellstr(value);
        case 'casesuffix'
            opts.CaseSuffix = char(string(value));
        case 'casejson'
            opts.CaseJson = char(string(value));
        case 'outputjson'
            opts.OutputJson = char(string(value));
        case 'coveragejson'
            opts.CoverageJson = char(string(value));
        case 'coveragedatafile'
            opts.CoverageDataFile = char(string(value));
        case 'coveragehtml'
            opts.CoverageHtml = char(string(value));
        case 'coveragethreshold'
            opts.CoverageThreshold = double(value);
    end
    idx = idx + 2;
end
if isempty(opts.OutputJson)
    opts.OutputJson = fullfile(pwd, 'outputs', 'logic_probe_results.json');
end
end

function names = normalize_cellstr(value)
if nargin == 0 || isempty(value)
    names = {};
elseif ischar(value) || isstring(value)
    names = cellstr(string(value));
elseif iscell(value)
    names = cellfun(@(x) char(string(x)), value, 'UniformOutput', false);
else
    names = {};
end
end

function arr = normalize_struct_array(value)
if isstruct(value)
    arr = value;
elseif iscell(value)
    arr = [value{:}];
else
    arr = struct([]);
end
end

function caseJson = resolve_case_json(rootDir, modelName, preferredSuffix, explicitPath)
if ~isempty(explicitPath)
    caseJson = char(string(explicitPath));
    if exist(caseJson, 'file')
        return;
    end
    error('probe_logical_mcdc_vectors:MissingExplicitCases', 'Explicit CaseJson was not found: %s.', caseJson);
end
candidates = {
    fullfile(rootDir, 'outputs', [modelName preferredSuffix]), ...
    fullfile(rootDir, 'outputs', [modelName '_cases_mcdc.json']), ...
    fullfile(rootDir, 'outputs', [modelName '_cases.json'])
};
for i = 1:numel(candidates)
    if exist(candidates{i}, 'file')
        caseJson = candidates{i};
        return;
    end
end
error('probe_logical_mcdc_vectors:MissingCases', 'No extracted cases JSON found for %s.', modelName);
end

function [inputNames, inputBlocks, outputNames] = root_ports(modelName)
inputBlocks = find_system(modelName, 'SearchDepth', 1, 'BlockType', 'Inport');
[~, inputOrder] = sort(str2double(get_param(inputBlocks, 'Port')));
inputBlocks = inputBlocks(inputOrder);
inputNames = cellfun(@(p) get_param(p, 'Name'), inputBlocks, 'UniformOutput', false);
outputBlocks = find_system(modelName, 'SearchDepth', 1, 'BlockType', 'Outport');
[~, outputOrder] = sort(str2double(get_param(outputBlocks, 'Port')));
outputBlocks = outputBlocks(outputOrder);
outputNames = cellfun(@(p) get_param(p, 'Name'), outputBlocks, 'UniformOutput', false);
end

function probes = configure_logic_probes(modelName)
logicBlocks = find_system(modelName, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'BlockType', 'Logic');
probes = struct('id', {}, 'block_path', {}, 'sid', {}, 'operator', {}, 'port_names', {});
for i = 1:numel(logicBlocks)
    operator = upper(char(string(get_param(logicBlocks{i}, 'Operator'))));
    if ~ismember(operator, {'AND', 'OR'})
        continue;
    end
    handles = get_param(logicBlocks{i}, 'PortHandles');
    portNames = {};
    idx = numel(probes) + 1;
    for p = 1:numel(handles.Inport)
        line = get_param(handles.Inport(p), 'Line');
        if isequal(line, -1)
            portNames{p} = ''; %#ok<AGROW>
            continue;
        end
        probeName = matlab.lang.makeValidName(sprintf('probe_%s_%03d_u%d', modelName, idx, p));
        try
            add_to_workspace_probe(logicBlocks{i}, line, probeName);
            portNames{p} = probeName; %#ok<AGROW>
        catch ME
            fprintf('PROBE_ADD_FAILED %s port %d: %s\n', logicBlocks{i}, p, ME.message);
            portNames{p} = ''; %#ok<AGROW>
        end
    end
    probes(idx).id = logic_id(logicBlocks{i});
    probes(idx).block_path = logicBlocks{i};
    probes(idx).sid = probes(idx).id;
    probes(idx).operator = operator;
    probes(idx).port_names = portNames;
end
end

function add_to_workspace_probe(targetBlock, line, variableName)
parentSystem = get_param(targetBlock, 'Parent');
srcPort = get_param(line, 'SrcPortHandle');
blockName = matlab.lang.makeValidName(['CodexProbe_' variableName]);
probeBlock = [parentSystem '/' blockName];
suffix = 1;
while getSimulinkBlockHandle(probeBlock) ~= -1
    blockName = matlab.lang.makeValidName(sprintf('CodexProbe_%s_%d', variableName, suffix));
    probeBlock = [parentSystem '/' blockName];
    suffix = suffix + 1;
end
try
    add_block('simulink/Sinks/To Workspace', probeBlock, ...
        'VariableName', variableName, ...
        'SaveFormat', 'Timeseries', ...
        'Position', [30 + 15 * suffix, 30 + 15 * suffix, 140 + 15 * suffix, 60 + 15 * suffix]);
catch ME
    if contains(ME.message, '链接库模块') || contains(lower(ME.message), 'library') || contains(lower(ME.message), 'locked')
        deactivate_link(parentSystem);
        add_block('simulink/Sinks/To Workspace', probeBlock, ...
            'VariableName', variableName, ...
            'SaveFormat', 'Timeseries', ...
            'Position', [30 + 15 * suffix, 30 + 15 * suffix, 140 + 15 * suffix, 60 + 15 * suffix]);
    else
        rethrow(ME);
    end
end
dstHandles = get_param(probeBlock, 'PortHandles');
add_line(parentSystem, srcPort, dstHandles.Inport(1), 'autorouting', 'on');
end

function deactivate_link(systemPath)
current = systemPath;
while ~isempty(current)
    try
        status = get_param(current, 'LinkStatus');
        if ~strcmpi(status, 'none')
            set_param(current, 'LinkStatus', 'inactive');
            return;
        end
    catch
    end
    parent = get_param(current, 'Parent');
    if isempty(parent) || strcmp(parent, current)
        return;
    end
    current = parent;
end
end

function id = logic_id(blockPath)
try
    id = Simulink.ID.getSID(blockPath);
catch
    id = blockPath;
end
end

function [observations, coverageData] = run_test_probe(modelName, inputNames, inputTypes, inputDims, probes, test, rootDir, matFileName, collectCoverage)
dt = 0.01;
coverageData = [];
if nargin >= 8 && ~isempty(matFileName)
    load_mat_to_base(fullfile(rootDir, char(string(matFileName))));
end
initParams = ensure_struct(test, 'init_params');
apply_parameter_overrides(initParams);
currentValues = struct();
for i = 1:numel(inputNames)
    currentValues.(inputNames{i}) = zeros(1, inputDims.(inputNames{i}));
end
initValues = ensure_struct(test, 'init_values');
initFields = fieldnames(initValues);
for i = 1:numel(initFields)
    name = initFields{i};
    if isfield(inputDims, name)
        currentValues.(name) = normalize_input_value(initValues.(name), inputDims.(name));
    end
end
steps = normalize_struct_array(test.steps);
for k = 1:numel(steps)
    if ~isempty(fieldnames(ensure_struct(steps(k), 'param_updates')))
        error('probe_logical_mcdc_vectors:ActionParameterUpdateUnsupported', ...
            ['Coverage-driving parameter changes in Action cannot be represented as time-varying ' ...
             'base-workspace values by this probe. Split parameter states into separate Tests and ' ...
             'put p Param=value in each Test Initialization.']);
    end
end
totalTime = 0;
for k = 1:numel(steps)
    totalTime = totalTime + double(steps(k).delay_s);
end
stopTime = max(dt, ceil(totalTime / dt) * dt);
t = (0:dt:stopTime)';
seriesData = struct();
for k = 1:numel(inputNames)
    name = inputNames{k};
    value = currentValues.(name);
    seriesData.(name) = repmat(value, numel(t), 1);
end
eventTimes = zeros(1, numel(steps));
snapshotInputs = struct('values', {});
currentTime = 0;
for k = 1:numel(steps)
    currentTime = currentTime + double(steps(k).delay_s);
    eventTimes(k) = currentTime;
    updates = ensure_struct(steps(k), 'input_updates');
    fields = fieldnames(updates);
    sampleMask = t >= (currentTime - (dt / 100));
    for j = 1:numel(fields)
        name = fields{j};
        if isfield(seriesData, name)
            value = normalize_input_value(updates.(name), inputDims.(name));
            seriesData.(name)(sampleMask, :) = repmat(value, sum(sampleMask), 1);
            currentValues.(name) = value;
        end
    end
    snapshotInputs(k).values = currentValues; %#ok<AGROW>
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
in = Simulink.SimulationInput(modelName);
in = in.setVariable(externalInputVar, ds);
in = in.setModelParameter('StopTime', num2str(stopTime), 'SolverType', 'Fixed-step', 'Solver', 'FixedStepDiscrete', 'FixedStep', num2str(dt), 'SaveOutput', 'on', 'ReturnWorkspaceOutputs', 'on', 'LoadExternalInput', 'on', 'ExternalInput', externalInputVar);
if collectCoverage
    in = in.setModelParameter('CovEnable', 'on', 'CovMetricSettings', 'dcme', ...
        'CovSaveSingleToWorkspaceVar', 'on', 'CovSaveName', 'tc_sd_covdata');
end
out = sim(in);
if collectCoverage
    try
        coverageData = out.get('tc_sd_covdata');
    catch ME
        error('probe_logical_mcdc_vectors:CoverageDataMissing', ...
            'Coverage was enabled but tc_sd_covdata was not returned: %s', ME.message);
    end
end
observations = struct('step_index', {}, 'time_s', {}, 'inputs', {}, 'params', {}, 'vectors', {}, 'stimulus', {}, 'target', {}, 'prediction_status', {});
for k = 1:numel(steps)
    observations(k).step_index = steps(k).index;
    observations(k).time_s = eventTimes(k);
    observations(k).inputs = snapshotInputs(k).values;
    observations(k).params = initParams;
    observations(k).vectors = sample_vectors(out, probes, eventTimes(k));
    observations(k).stimulus = stimulus_prefix(test, k);
    observations(k).target = ensure_struct(test, 'target');
    observations(k).prediction_status = prediction_status(observations(k).target, observations(k).vectors);
end
end

function stimulus = stimulus_prefix(test, stepIndex)
stimulus = struct();
stimulus.initial_inputs = ensure_struct(test, 'init_values');
stimulus.initial_params = ensure_struct(test, 'init_params');
allSteps = normalize_struct_array(test.steps);
if isempty(allSteps)
    stimulus.steps = struct([]);
else
    stimulus.steps = allSteps(1:min(stepIndex, numel(allSteps)));
end
stimulus.evidence_step = stepIndex;
end

function status = prediction_status(target, vectors)
status = 'not_predicted';
if isempty(fieldnames(target)) || ~isfield(target, 'operator_id') || ~isfield(target, 'port_index')
    return;
end
fields = fieldnames(vectors);
for i = 1:numel(fields)
    vector = vectors.(fields{i});
    if ~strcmp(char(string(vector.id)), char(string(target.operator_id))) || ~vector.ok
        continue;
    end
    portIndex = double(target.port_index);
    if portIndex < 1 || portIndex > numel(vector.values)
        status = 'target_unavailable';
        return;
    end
    if ~isfield(target, 'expected_port_value') || isempty(target.expected_port_value)
        status = 'observed';
        return;
    end
    actual = logical(vector.values(portIndex));
    expected = logical(target.expected_port_value);
    if actual == expected
        status = 'matched_prediction';
    else
        status = 'simulation_mismatch';
    end
    return;
end
status = 'target_unavailable';
end

function summary = coverage_summary(cvd, modelName, testCount, threshold)
summary = struct();
summary.model = modelName;
summary.test_count = testCount;
summary.threshold = threshold;
summary.condition = metric_result(conditioninfo(cvd, modelName), threshold);
summary.decision = metric_result(decisioninfo(cvd, modelName), threshold);
summary.mcdc = metric_result(mcdcinfo(cvd, modelName), threshold);
summary.passed = summary.condition.passed && summary.decision.passed && summary.mcdc.passed;
end

function result = metric_result(info, threshold)
values = double(info(:)');
if numel(values) >= 2
    covered = values(1);
    total = values(2);
elseif isempty(values)
    covered = 0;
    total = 0;
else
    covered = values(1);
    total = values(1);
end
if total > 0
    percent = 100 * covered / total;
else
    percent = 100;
end
result = struct('covered', covered, 'total', total, 'percent', percent, 'passed', percent >= threshold);
end

function save_coverage_data(pathName, cvd)
[folder, name] = fileparts(char(string(pathName)));
if isempty(folder)
    folder = pwd;
end
if ~exist(folder, 'dir')
    mkdir(folder);
end
oldDir = pwd;
cleanupObj = onCleanup(@() cd(oldDir));
cd(folder);
cvsave(name, cvd);
clear cleanupObj;
cd(oldDir);
end

function apply_parameter_overrides(overrides)
names = fieldnames(overrides);
for i = 1:numel(names)
    name = names{i};
    value = overrides.(name);
    try
        obj = evalin('base', name);
        if isprop(obj, 'Value')
            currentValue = obj.Value;
            dataType = '';
            if isprop(obj, 'DataType')
                dataType = obj.DataType;
            end
            value = cast_parameter_override_for_simulink_ut(name, value, currentValue, dataType);
            obj.Value = value;
            assignin('base', name, obj);
        else
            value = cast_parameter_override_for_simulink_ut(name, value, obj, '');
            assignin('base', name, value);
        end
    catch
        assignin('base', name, value);
    end
end
end

function value = ensure_struct(parent, fieldName)
if isfield(parent, fieldName) && isstruct(parent.(fieldName))
    value = parent.(fieldName);
else
    value = struct();
end
end

function vectors = sample_vectors(out, probes, sampleTime)
vectors = struct();
for i = 1:numel(probes)
    values = [];
    ok = true;
    for p = 1:numel(probes(i).port_names)
        probeName = probes(i).port_names{p};
        if isempty(probeName)
            ok = false;
            values(p) = NaN; %#ok<AGROW>
            continue;
        end
        try
            ts = out.get(probeName);
            value = sample_timeseries(ts, sampleTime);
            values(p) = double(value ~= 0); %#ok<AGROW>
        catch
            ok = false;
            values(p) = NaN; %#ok<AGROW>
        end
    end
    key = matlab.lang.makeValidName(probes(i).id);
    vectors.(key).id = probes(i).id;
    vectors.(key).operator = probes(i).operator;
    vectors.(key).block_path = probes(i).block_path;
    vectors.(key).ok = ok;
    vectors.(key).values = values;
    vectors.(key).label = vector_label(values);
end
end

function label = vector_label(values)
parts = strings(1, numel(values));
for i = 1:numel(values)
    if isnan(values(i))
        parts(i) = "X";
    elseif values(i) ~= 0
        parts(i) = "T";
    else
        parts(i) = "F";
    end
end
label = char(join(parts, ''));
end

function value = sample_timeseries(ts, sampleTime)
time = ts.Time;
data = ts.Data;
[~, idx] = min(abs(time - sampleTime));
if isvector(data) && numel(data) == numel(time)
    value = data(idx);
elseif size(data, 1) == numel(time)
    value = data(idx, :);
else
    value = data(idx);
end
value = value(1);
end

function [inputTypes, inputDims] = compiled_input_metadata(modelName, inputBlocks, inputNames)
inputTypes = struct();
inputDims = struct();
for i = 1:numel(inputNames)
    inputTypes.(inputNames{i}) = 'single';
    inputDims.(inputNames{i}) = 1;
end
feval(modelName, [], [], [], 'compile');
cleanupObj = onCleanup(@() feval(modelName, [], [], [], 'term'));
for i = 1:numel(inputNames)
    portHandles = get_param(inputBlocks{i}, 'PortHandles');
    dtype = get_param(portHandles.Outport, 'CompiledPortDataType');
    dims = get_param(portHandles.Outport, 'CompiledPortDimensions');
    inputTypes.(inputNames{i}) = char(string(dtype));
    inputDims.(inputNames{i}) = compiled_width(dims);
end
clear cleanupObj;
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

function load_workspace_libraries(rootDir, modelNames)
entries = dir(fullfile(rootDir, '*.slx'));
for i = 1:numel(entries)
    [~, name] = fileparts(entries(i).name);
    if any(strcmp(modelNames, name))
        continue;
    end
    try
        load_system(fullfile(rootDir, entries(i).name));
    catch
    end
end
end

function load_mat_to_base(matPath)
if ~exist(matPath, 'file')
    return;
end
loaded = load(matPath);
names = fieldnames(loaded);
for i = 1:numel(names)
    value = restore_degraded_workspace_value_for_simulink_ut(names{i}, loaded.(names{i}));
    assignin('base', names{i}, value);
end
end

function close_foreign_loaded_model(modelName, rootDir)
if ~bdIsLoaded(modelName)
    return;
end
try
    loadedPath = get_param(modelName, 'FileName');
    if ~startsWith(string(loadedPath), string(rootDir))
        bdclose(modelName);
    end
catch
    bdclose(modelName);
end
end

function write_json(pathName, data)
out = char(string(pathName));
folder = fileparts(out);
if ~exist(folder, 'dir')
    mkdir(folder);
end
fid = fopen(out, 'w');
fprintf(fid, '%s', jsonencode(data, PrettyPrint=true));
fclose(fid);
fprintf('Wrote %s\n', out);
end

function local_cleanup(models, oldDir, oldPath)
try
    for i = 1:numel(models)
        if bdIsLoaded(models{i})
            close_system(models{i}, 0);
        end
    end
catch
end
try
    cd(oldDir);
catch
end
try
    path(oldPath);
catch
end
end
