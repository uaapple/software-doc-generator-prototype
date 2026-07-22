function trace_logical_mcdc(rootDir, modelNames, matFileName, varargin)
%TRACE_LOGICAL_MCDC Trace AND/OR Logical Operator input sources for TCSD MC/DC.
%
% trace_logical_mcdc(rootDir, {'ModelA'}, 'data.mat', 'InitScripts', {'init.m'})
% writes outputs/<model>_logical_traces.json and a combined
% outputs/logical_mcdc_traces.json. The trace is structural evidence; use
% build_logical_mcdc_obligations.py or probe_logical_mcdc_vectors.m to turn
% executable mappings into workbook obligations.

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
    rootNames = root_input_names(modelName);
    logicBlocks = find_system(modelName, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'BlockType', 'Logic');
    items = struct('id', {}, 'block_path', {}, 'sid', {}, 'operator', {}, 'ports', {});
    for i = 1:numel(logicBlocks)
        operator = upper(char(string(safe_param(logicBlocks{i}, 'Operator'))));
        if ~ismember(operator, {'AND', 'OR'})
            continue;
        end
        idx = numel(items) + 1;
        items(idx).id = logic_id(logicBlocks{i});
        items(idx).block_path = logicBlocks{i};
        items(idx).sid = items(idx).id;
        items(idx).operator = operator;
        items(idx).ports = trace_block_inputs(logicBlocks{i}, rootNames, 0, containers.Map('KeyType', 'char', 'ValueType', 'logical'));
    end
    report = struct();
    report.schema = 'simulink-ut-logical-mcdc-trace/v1';
    report.model = modelName;
    report.operator_count = numel(items);
    report.operators = items;
    allReports.(matlab.lang.makeValidName(modelName)) = report;
    write_json(fullfile(rootDir, 'outputs', [modelName '_logical_traces.json']), report);
    bdclose(modelName);
end
write_json(fullfile(rootDir, 'outputs', 'logical_mcdc_traces.json'), allReports);
clear cleanupObj;
local_cleanup(modelNames, oldDir, oldPath);
end

function opts = parse_options(varargin)
opts = struct();
opts.InitScripts = {};
idx = 1;
while idx <= numel(varargin)
    key = char(string(varargin{idx}));
    if idx + 1 > numel(varargin)
        break;
    end
    switch lower(key)
        case 'initscripts'
            opts.InitScripts = normalize_cellstr(varargin{idx + 1});
    end
    idx = idx + 2;
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

function names = root_input_names(modelName)
blocks = find_system(modelName, 'SearchDepth', 1, 'BlockType', 'Inport');
[~, order] = sort(str2double(get_param(blocks, 'Port')));
blocks = blocks(order);
names = cellfun(@(p) get_param(p, 'Name'), blocks, 'UniformOutput', false);
end

function inputs = trace_block_inputs(blockPath, rootNames, depth, seen)
handles = get_param(blockPath, 'PortHandles');
inputHandles = handles.Inport;
inputs = struct('index', {}, 'trace', {});
for i = 1:numel(inputHandles)
    inputs(i).index = i;
    inputs(i).trace = trace_port(inputHandles(i), rootNames, depth + 1, seen);
end
end

function node = trace_port(portHandle, rootNames, depth, seen)
node = struct();
if depth > 24
    node.kind = 'depth_limit';
    return;
end
try
    line = get_param(portHandle, 'Line');
catch
    node.kind = 'no_line';
    return;
end
if isequal(line, -1)
    node.kind = 'unconnected';
    return;
end
try
    srcPort = get_param(line, 'SrcPortHandle');
    srcBlock = get_param(srcPort, 'Parent');
    srcPortNumber = get_param(srcPort, 'PortNumber');
catch
    node.kind = 'unknown_source';
    return;
end
node = trace_block_output(srcBlock, srcPortNumber, rootNames, depth, seen);
end

function node = trace_block_output(blockPath, srcPortNumber, rootNames, depth, seen)
key = sprintf('%s#%d', blockPath, double(srcPortNumber));
if isKey(seen, key)
    node = struct('kind', 'cycle', 'path', blockPath, 'port', double(srcPortNumber));
    return;
end
seen(key) = true;
node = base_node(blockPath, srcPortNumber);
switch node.blockType
    case 'Inport'
        parentSystem = get_param(blockPath, 'Parent');
        rootModel = bdroot(blockPath);
        node.signal = get_param(blockPath, 'Name');
        node.isRootInput = any(strcmp(rootNames, node.signal)) && strcmp(parentSystem, rootModel);
        if node.isRootInput
            node.kind = 'root_inport';
        else
            node.kind = 'subsystem_inport';
            node.parent = parentSystem;
            node.port = str2double(get_param(blockPath, 'Port'));
            try
                parentHandles = get_param(parentSystem, 'PortHandles');
                node.source = trace_port(parentHandles.Inport(node.port), rootNames, depth + 1, seen);
            catch
                node.source = struct('kind', 'unresolved_subsystem_inport');
            end
        end
    case 'Outport'
        node.kind = 'subsystem_outport';
        node.port = str2double(get_param(blockPath, 'Port'));
        node.inputs = trace_block_inputs(blockPath, rootNames, depth + 1, seen);
    case 'SubSystem'
        node.kind = 'subsystem';
        node.source = trace_subsystem_outport(blockPath, srcPortNumber, rootNames, depth, seen);
    case 'From'
        node.kind = 'from';
        node.gotoTag = safe_param(blockPath, 'GotoTag');
        node.source = trace_goto_source(blockPath, rootNames, depth + 1, seen);
    case 'Goto'
        node.kind = 'goto';
        node.gotoTag = safe_param(blockPath, 'GotoTag');
        node.inputs = trace_block_inputs(blockPath, rootNames, depth + 1, seen);
    case 'Constant'
        node.kind = 'constant';
        node.value = safe_param(blockPath, 'Value');
    case 'RelationalOperator'
        node.kind = 'relational';
        node.operator = safe_param(blockPath, 'Operator');
        node.inputs = trace_block_inputs(blockPath, rootNames, depth + 1, seen);
    case 'Logic'
        node.kind = 'logic';
        node.operator = safe_param(blockPath, 'Operator');
        node.inputs = trace_block_inputs(blockPath, rootNames, depth + 1, seen);
    case 'Switch'
        node.kind = 'switch';
        node.criteria = safe_param(blockPath, 'Criteria');
        node.threshold = safe_param(blockPath, 'Threshold');
        node.inputs = trace_block_inputs(blockPath, rootNames, depth + 1, seen);
    case {'UnitDelay', 'Delay', 'Memory'}
        node.kind = 'stateful';
        node.initialCondition = safe_param(blockPath, 'InitialCondition');
        node.inputs = trace_block_inputs(blockPath, rootNames, depth + 1, seen);
    case 'MinMax'
        node.kind = 'minmax';
        node.function = safe_param(blockPath, 'Function');
        node.inputs = trace_block_inputs(blockPath, rootNames, depth + 1, seen);
    case 'Abs'
        node.kind = 'abs';
        node.inputs = trace_block_inputs(blockPath, rootNames, depth + 1, seen);
    otherwise
        node.kind = 'block';
        node.params = common_params(blockPath, node.blockType);
        node.inputs = trace_block_inputs(blockPath, rootNames, depth + 1, seen);
end
remove(seen, key);
end

function node = base_node(blockPath, srcPortNumber)
node = struct();
node.path = blockPath;
node.sid = logic_id(blockPath);
node.blockType = safe_param(blockPath, 'BlockType');
node.name = safe_param(blockPath, 'Name');
node.outport = double(srcPortNumber);
end

function source = trace_subsystem_outport(blockPath, srcPortNumber, rootNames, depth, seen)
source = struct('kind', 'unresolved_subsystem_outport');
outports = find_system(blockPath, 'SearchDepth', 1, 'BlockType', 'Outport');
for k = 1:numel(outports)
    try
        if str2double(get_param(outports{k}, 'Port')) == double(srcPortNumber)
            source = trace_block_output(outports{k}, 1, rootNames, depth + 1, seen);
            return;
        end
    catch
    end
end
end

function source = trace_goto_source(fromBlock, rootNames, depth, seen)
source = struct('kind', 'unresolved_from');
tag = safe_param(fromBlock, 'GotoTag');
if isempty(tag)
    return;
end
rootModel = bdroot(fromBlock);
gotos = find_system(rootModel, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'BlockType', 'Goto', 'GotoTag', tag);
if isempty(gotos)
    return;
end
fromParent = get_param(fromBlock, 'Parent');
best = gotos{1};
bestScore = -1;
for i = 1:numel(gotos)
    score = common_prefix_score(fromParent, get_param(gotos{i}, 'Parent'));
    if score > bestScore
        best = gotos{i};
        bestScore = score;
    end
end
source = trace_block_output(best, 1, rootNames, depth + 1, seen);
end

function score = common_prefix_score(a, b)
aParts = strsplit(char(a), '/');
bParts = strsplit(char(b), '/');
score = 0;
for i = 1:min(numel(aParts), numel(bParts))
    if strcmp(aParts{i}, bParts{i})
        score = score + 1;
    else
        break;
    end
end
end

function value = safe_param(blockPath, paramName)
try
    value = char(string(get_param(blockPath, paramName)));
catch
    value = '';
end
end

function params = common_params(blockPath, blockType)
params = struct();
names = {};
switch blockType
    case 'Gain'
        names = {'Gain'};
    case {'Sum', 'Product'}
        names = {'Inputs'};
    case 'DataTypeConversion'
        names = {'OutDataTypeStr'};
    case 'Saturate'
        names = {'UpperLimit', 'LowerLimit'};
    case 'Lookup_n-D'
        names = {'Table', 'BreakpointsForDimension1'};
end
for i = 1:numel(names)
    params.(names{i}) = safe_param(blockPath, names{i});
end
end

function id = logic_id(blockPath)
try
    id = Simulink.ID.getSID(blockPath);
catch
    id = blockPath;
end
end

function load_mat_to_base(matPath)
if ~exist(matPath, 'file')
    return;
end
payload = load(matPath);
names = fieldnames(payload);
for i = 1:numel(names)
    assignin('base', names{i}, payload.(names{i}));
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
            bdclose(models{i});
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
