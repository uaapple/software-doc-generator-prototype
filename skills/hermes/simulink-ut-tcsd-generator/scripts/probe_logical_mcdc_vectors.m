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
    caseJson = resolve_case_json(rootDir, modelName, opts.CaseSuffix);
    spec = jsondecode(fileread(caseJson));
    observations = struct('row', {}, 'test_id', {}, 'step_index', {}, 'time_s', {}, 'inputs', {}, 'params', {}, 'vectors', {});
    tests = normalize_struct_array(spec.tests);
    for testIndex = 1:numel(tests)
        obs = run_test_probe(modelName, inputNames, inputTypes, inputDims, probes, tests(testIndex));
        for k = 1:numel(obs)
            obs(k).row = tests(testIndex).row;
            obs(k).test_id = tests(testIndex).test_id;
            observations(end + 1) = obs(k); %#ok<AGROW>
        end
    end
    report = struct();
    report.schema = 'simulink-ut-logical-mcdc-probe/v1';
    report.model = modelName;
    report.outputs = outputNames;
    report.case_json = caseJson;
    report.probes = probes;
    report.observations = observations;
    allReports.(matlab.lang.makeValidName(modelName)) = report;
    bdclose(modelName);
end
write_json(opts.OutputJson, allReports);
clear cleanupObj;
local_cleanup(modelNames, oldDir, oldPath);
end

function opts = parse_options(varargin)
opts = struct();
opts.InitScripts = {};
opts.CaseSuffix = '_cases_mcdc.json';
opts.OutputJson = '';
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
        case 'outputjson'
            opts.OutputJson = char(string(value));
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

function caseJson = resolve_case_json(rootDir, modelName, preferredSuffix)
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

function observations = run_test_probe(modelName, inputNames, inputTypes, inputDims, probes, test)
dt = 0.01;
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
out = sim(in);
observations = struct('step_index', {}, 'time_s', {}, 'inputs', {}, 'params', {}, 'vectors', {});
initParams = ensure_struct(test, 'init_params');
for k = 1:numel(steps)
    observations(k).step_index = steps(k).index;
    observations(k).time_s = eventTimes(k);
    observations(k).inputs = snapshotInputs(k).values;
    observations(k).params = initParams;
    observations(k).vectors = sample_vectors(out, probes, eventTimes(k));
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
    assignin('base', names{i}, loaded.(names{i}));
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
