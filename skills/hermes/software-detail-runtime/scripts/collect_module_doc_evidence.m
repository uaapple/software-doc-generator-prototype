function evidence = collect_module_doc_evidence(rootDir, modelFile, matFile, initScripts, outFile, options)
%COLLECT_MODULE_DOC_EVIDENCE Batch Simulink evidence for module descriptions.
%
% This helper is intended for an already-open task MATLAB session. Prefer
% direct MCP/SATK reads and call this helper only when a compact evidence
% snapshot is useful. Do not use it as a reason to repeatedly spawn separate
% matlab -batch collector processes.

if nargin < 1 || isempty(rootDir)
    rootDir = pwd;
end
if nargin < 2 || isempty(modelFile)
    modelFile = getenv('MODULE_DOC_MODEL_FILE');
end
if nargin < 3
    matFile = getenv('MODULE_DOC_MAT_FILE');
end
if nargin < 4
    initScripts = split_list(getenv('MODULE_DOC_PROJECT_INIT_SCRIPTS'));
end
if nargin < 5 || isempty(outFile)
    outFile = fullfile(rootDir, 'module_doc_evidence.json');
end
if nargin < 6 || isempty(options)
    options = struct();
end

rootDir = char(rootDir);
modelFile = char(modelFile);
matFile = char(matFile);
outFile = char(outFile);
options = with_defaults(options);
initScripts = normalize_list(initScripts);

if isempty(modelFile)
    modelFile = discover_model_file(rootDir);
end
if isempty(modelFile)
    error('collect_module_doc_evidence:ModelMissing', 'No model file was provided or discovered.');
end

originalDir = pwd;
cleanup = onCleanup(@() cd(originalDir)); %#ok<NASGU>
cd(rootDir);

scriptDir = fileparts(mfilename('fullpath'));
addpath(scriptDir);
if options.RunSetup && exist('setup_module_doc_support', 'file') == 2
    setup_module_doc_support(rootDir, initScripts, false);
end

if ~isempty(matFile) && exist(resolve_path(rootDir, matFile), 'file')
    load(resolve_path(rootDir, matFile));
end

load_system(resolve_path(rootDir, modelFile));
[~, modelName] = fileparts(modelFile);

evidence = struct();
evidence.schemaVersion = 'module-doc-evidence/v1';
evidence.generatedAt = datestr(now, 30);
evidence.rootDir = rootDir;
evidence.modelFile = modelFile;
evidence.matFile = matFile;
evidence.modelName = modelName;
evidence.topInports = describe_blocks(find_blocks(modelName, 1, 'Inport'), options);
evidence.topOutports = describe_blocks(find_blocks(modelName, 1, 'Outport'), options);
evidence.topAnnotations = get_annotations(modelName);
evidence.topSubsystems = describe_subsystems(find_blocks(modelName, 1, 'SubSystem'), options, modelName);
evidence.candidateModules = describe_subsystems(candidate_module_paths(modelName, options), options, modelName);
evidence.notes = notes(options);

write_json(outFile, evidence);

if options.CloseModel
    close_system(modelName, 0);
end
end

function options = with_defaults(options)
options = set_default(options, 'RunSetup', true);
options = set_default(options, 'CloseModel', false);
options = set_default(options, 'MaxModules', 80);
options = set_default(options, 'MaxSampleBlocksPerModule', 140);
options = set_default(options, 'MaxNamedLinesPerModule', 180);
options = set_default(options, 'MaxOutputConeDepth', 5);
options = set_default(options, 'MaxOutputConeNodes', 80);
options = set_default(options, 'MaxSubsystemDepth', 3);
options = set_default(options, 'ModuleScanDepth', 2);
options = set_default(options, 'NamedLineSearchDepth', 2);
options = set_default(options, 'FollowLinks', 'off');
options = set_default(options, 'IncludeBlockTypeCounts', false);
options = set_default(options, 'IncludeSampleBlocks', false);
options = set_default(options, 'IncludeNamedLines', false);
options = set_default(options, 'IncludePortConnectivity', false);
options = set_default(options, 'IncludeOutputCones', false);
options = set_default(options, 'IncludeDocBlocks', false);
options = set_default(options, 'IncludeDocBlockBodies', false);
options = set_default(options, 'IncludeRiskCandidates', false);
options = set_default(options, 'SelectedSubsystems', {});
end

function options = set_default(options, name, value)
if ~isfield(options, name) || isempty(options.(name))
    options.(name) = value;
end
end

function value = resolve_path(rootDir, value)
value = char(value);
if isempty(value) || is_absolute_path(value)
    return;
end
value = fullfile(rootDir, value);
end

function tf = is_absolute_path(value)
if ispc
    tf = ~isempty(regexp(value, '^[A-Za-z]:[\\/]', 'once')) || startsWith(value, '\\');
else
    tf = startsWith(value, filesep);
end
end

function modelFile = discover_model_file(rootDir)
hits = dir(fullfile(rootDir, '*.slx'));
if isempty(hits)
    hits = dir(fullfile(rootDir, '*.mdl'));
end
if isempty(hits)
    modelFile = '';
else
    modelFile = hits(1).name;
end
end

function rows = describe_subsystems(blocks, options, modelName)
template = struct( ...
    'name', '', 'path', '', 'relativePath', '', 'depth', 0, ...
    'description', '', 'annotations', {{}}, 'inports', [], 'outports', [], ...
    'blockTypeCounts', [], 'sampleBlocks', [], 'namedLines', [], ...
    'outputCones', [], 'docBlocks', [], 'riskFlags', []);
rows = repmat(template, 0, 1);
for i = 1:numel(blocks)
    path = char(blocks{i});
    if should_skip_subsystem(path)
        continue;
    end
    rows(end + 1) = template; %#ok<AGROW>
    rows(end).name = safe_get(path, 'Name');
    rows(end).path = path;
    rows(end).relativePath = relative_model_path(path, modelName);
    rows(end).depth = model_depth(path, modelName);
    rows(end).description = safe_get(path, 'Description');
    rows(end).annotations = get_annotations(path);
    rows(end).inports = describe_blocks(find_blocks(path, 1, 'Inport'), options);
    rows(end).outports = describe_blocks(find_blocks(path, 1, 'Outport'), options);
    if options.IncludeBlockTypeCounts
        rows(end).blockTypeCounts = block_type_counts(path, options);
    else
        rows(end).blockTypeCounts = empty_count_rows();
    end
    if options.IncludeSampleBlocks
        rows(end).sampleBlocks = sample_blocks(path, options);
    else
        rows(end).sampleBlocks = empty_block_rows();
    end
    if options.IncludeNamedLines
        rows(end).namedLines = named_lines(path, options);
    else
        rows(end).namedLines = empty_named_lines();
    end
    if options.IncludeOutputCones
        rows(end).outputCones = output_cones(path, options);
    else
        rows(end).outputCones = empty_output_cones();
    end
    if options.IncludeDocBlocks
        rows(end).docBlocks = docblocks(path, options);
    else
        rows(end).docBlocks = empty_docblocks();
    end
    rows(end).riskFlags = risk_flags(rows(end));
    if numel(rows) >= options.MaxModules
        break;
    end
end
end

function blocks = candidate_module_paths(modelName, options)
selected = normalize_selected_subsystems(modelName, options.SelectedSubsystems);
if ~isempty(selected)
    blocks = selected;
    return;
end
all = find_system(modelName, 'SearchDepth', options.MaxSubsystemDepth, ...
    'LookUnderMasks', 'all', 'FollowLinks', char(options.FollowLinks), ...
    'BlockType', 'SubSystem');
blocks = {};
for i = 1:numel(all)
    path = char(all{i});
    if strcmp(path, modelName)
        continue;
    end
    if model_depth(path, modelName) > options.MaxSubsystemDepth
        continue;
    end
    if should_skip_subsystem(path)
        continue;
    end
    if has_functional_boundary(path) || (options.IncludeRiskCandidates && has_risk_blocks(path))
        blocks{end + 1} = path; %#ok<AGROW>
        if numel(blocks) >= options.MaxModules
            break;
        end
    end
end

function paths = normalize_selected_subsystems(modelName, selected)
items = normalize_list(selected);
paths = {};
for i = 1:numel(items)
    item = char(strtrim(items{i}));
    if isempty(item)
        continue;
    end
    if strcmp(item, modelName) || startsWith(item, [modelName '/'])
        candidate = item;
    else
        candidate = [modelName '/' item];
    end
    if exist_block(candidate)
        paths{end + 1} = candidate; %#ok<AGROW>
    end
end
end

function tf = exist_block(path)
try
    get_param(path, 'Handle');
    tf = true;
catch
    tf = false;
end
end
end

function tf = should_skip_subsystem(path)
name = lower(safe_get(path, 'Name'));
ref = lower(safe_get(path, 'ReferenceBlock'));
maskType = lower(safe_get(path, 'MaskType'));
skipNames = {'mdl_info', 'mdlinfo', 'fctdefinition', 'function definition', ...
    'unit detailed design', 'function description', 'empty subsystem'};
tf = contains_any(name, skipNames) || contains(ref, 'docblock') || contains(maskType, 'docblock');
end

function tf = has_functional_boundary(path)
tf = ~isempty(find_blocks(path, 1, 'Outport')) || ~isempty(find_blocks(path, 1, 'Inport'));
end

function tf = has_risk_blocks(path)
riskTypes = {'Switch', 'MultiPortSwitch', 'UnitDelay', 'Memory', 'Delay', ...
    'RelationalOperator', 'Logic', 'Lookup_n-D', 'PreLookup', 'Interpolation_n-D'};
tf = false;
for i = 1:numel(riskTypes)
    if ~isempty(find_blocks(path, 2, riskTypes{i}))
        tf = true;
        return;
    end
end
end

function blocks = find_blocks(path, depth, blockType)
try
    followLinks = 'off';
    if isinf(depth)
        blocks = find_system(path, 'LookUnderMasks', 'all', ...
            'FollowLinks', followLinks, 'BlockType', blockType);
    else
        blocks = find_system(path, 'SearchDepth', depth, 'LookUnderMasks', 'all', ...
            'FollowLinks', followLinks, 'BlockType', blockType);
    end
catch
    blocks = {};
end
end

function rows = describe_blocks(blocks, options)
if nargin < 2
    options = struct();
end
template = struct('name', '', 'path', '', 'type', '', 'port', '', ...
    'description', '', 'parameters', [], 'source', [], 'destinations', []);
rows = repmat(template, 0, 1);
for i = 1:numel(blocks)
    path = char(blocks{i});
    rows(end + 1) = template; %#ok<AGROW>
    rows(end).name = safe_get(path, 'Name');
    rows(end).path = path;
    rows(end).type = safe_get(path, 'BlockType');
    rows(end).port = safe_get(path, 'Port');
    rows(end).description = safe_get(path, 'Description');
    rows(end).parameters = selected_params(path, rows(end).type);
    if isfield(options, 'IncludePortConnectivity') && options.IncludePortConnectivity
        rows(end).source = direct_source(path);
        rows(end).destinations = direct_destinations(path);
    else
        rows(end).source = empty_endpoint();
        rows(end).destinations = empty_endpoint_rows();
    end
end
end

function rows = empty_block_rows()
template = struct('name', '', 'path', '', 'type', '', 'port', '', ...
    'description', '', 'parameters', [], 'source', [], 'destinations', []);
rows = repmat(template, 0, 1);
end

function rows = sample_blocks(path, options)
keepTypes = {'Lookup_n-D', 'PreLookup', 'Interpolation_n-D', 'Switch', ...
    'MultiPortSwitch', 'UnitDelay', 'Memory', 'Delay', 'MinMax', 'Saturate', ...
    'RelationalOperator', 'Logic', 'Constant', 'Gain', 'Sum', 'Product', ...
    'SubSystem', 'DataStoreRead', 'DataStoreWrite', 'Goto', 'From', 'BusSelector', ...
    'BusCreator', 'Merge', 'RateTransition'};
blocks = {};
for i = 1:numel(keepTypes)
    nextBlocks = find_blocks(path, options.ModuleScanDepth, keepTypes{i});
    blocks = [blocks(:); nextBlocks(:)]; %#ok<AGROW>
end
blocks = unique(blocks);
rows = describe_blocks(blocks(1:min(numel(blocks), options.MaxSampleBlocksPerModule)), options);
end

function counts = block_type_counts(path, options)
blocks = find_system(path, 'SearchDepth', options.ModuleScanDepth, ...
    'LookUnderMasks', 'all', 'FollowLinks', char(options.FollowLinks), 'Type', 'Block');
types = strings(0, 1);
for i = 1:numel(blocks)
    types(end + 1, 1) = string(safe_get(blocks{i}, 'BlockType')); %#ok<AGROW>
end
u = unique(types);
template = struct('type', '', 'count', 0);
counts = repmat(template, 0, 1);
for i = 1:numel(u)
    if strlength(u(i)) == 0
        continue;
    end
    counts(end + 1) = template; %#ok<AGROW>
    counts(end).type = char(u(i));
    counts(end).count = sum(types == u(i));
end
end

function counts = empty_count_rows()
counts = repmat(struct('type', '', 'count', 0), 0, 1);
end

function params = selected_params(block, blockType)
names = {'Value', 'Gain', 'Operator', 'Inputs', 'Criteria', 'Threshold', ...
    'Table', 'BreakpointsForDimension1', 'BreakpointsForDimension2', ...
    'BreakpointsForDimension3', 'InitialCondition', 'DelayLength', ...
    'SampleTime', 'OutMin', 'OutMax', 'GotoTag', 'DataStoreName', ...
    'InputSignals', 'OutputSignals', 'ReferenceBlock', 'MaskType'};
template = struct('name', '', 'value', '');
params = repmat(template, 0, 1);
for i = 1:numel(names)
    value = safe_get(block, names{i});
    if ~isempty(value)
        params(end + 1) = template; %#ok<AGROW>
        params(end).name = names{i};
        params(end).value = value;
    end
end
if strcmp(blockType, 'Constant') || strcmp(blockType, 'Lookup_n-D') || strcmp(blockType, 'PreLookup')
    value = safe_get(block, 'OutDataTypeStr');
    if ~isempty(value)
        params(end + 1) = template; %#ok<AGROW>
        params(end).name = 'OutDataTypeStr';
        params(end).value = value;
    end
end
end

function src = direct_source(block)
src = empty_endpoint();
try
    ph = get_param(block, 'PortHandles');
    if ~isfield(ph, 'Inport') || isempty(ph.Inport)
        return;
    end
    line = get_param(ph.Inport(1), 'Line');
    src = source_from_line(line);
catch
end
end

function rows = direct_destinations(block)
template = empty_endpoint();
rows = repmat(template, 0, 1);
try
    ph = get_param(block, 'PortHandles');
    if ~isfield(ph, 'Outport') || isempty(ph.Outport)
        return;
    end
    for i = 1:numel(ph.Outport)
        line = get_param(ph.Outport(i), 'Line');
        if line == -1
            continue;
        end
        dst = get_param(line, 'DstBlockHandle');
        if isempty(dst) || all(dst == -1)
            continue;
        end
        for j = 1:numel(dst)
            rows(end + 1) = endpoint_from_block(dst(j), safe_get(line, 'Name')); %#ok<AGROW>
        end
    end
catch
end
end

function src = source_from_line(line)
src = empty_endpoint();
if isempty(line) || line == -1
    return;
end
try
    sourceBlock = get_param(line, 'SrcBlockHandle');
    if sourceBlock == -1
        return;
    end
    src = endpoint_from_block(sourceBlock, safe_get(line, 'Name'));
catch
end
end

function endpoint = endpoint_from_block(blockHandle, signalName)
endpoint = empty_endpoint();
try
    endpoint.signal = char(signalName);
    endpoint.block = getfullname(blockHandle);
    endpoint.name = safe_get(blockHandle, 'Name');
    endpoint.type = safe_get(blockHandle, 'BlockType');
    endpoint.parameters = selected_params(blockHandle, endpoint.type);
catch
end
end

function endpoint = empty_endpoint()
endpoint = struct('signal', '', 'block', '', 'name', '', 'type', '', 'parameters', []);
end

function rows = empty_endpoint_rows()
rows = repmat(empty_endpoint(), 0, 1);
end

function rows = named_lines(path, options)
lines = find_lines(path, options.NamedLineSearchDepth);
template = struct('name', '', 'source', [], 'destinations', [], 'roleHint', '');
rows = repmat(template, 0, 1);
for i = 1:numel(lines)
    line = lines(i);
    name = safe_get(line, 'Name');
    if isempty(strtrim(name))
        continue;
    end
    rows(end + 1) = template; %#ok<AGROW>
    rows(end).name = name;
    rows(end).source = source_from_line(line);
    rows(end).destinations = line_destinations(line);
    rows(end).roleHint = role_hint(name, rows(end).source, rows(end).destinations);
    if numel(rows) >= options.MaxNamedLinesPerModule
        break;
    end
end
end

function rows = empty_named_lines()
template = struct('name', '', 'source', [], 'destinations', [], 'roleHint', '');
rows = repmat(template, 0, 1);
end

function rows = line_destinations(line)
template = empty_endpoint();
rows = repmat(template, 0, 1);
try
    dst = get_param(line, 'DstBlockHandle');
    if isempty(dst) || all(dst == -1)
        return;
    end
    name = safe_get(line, 'Name');
    for i = 1:numel(dst)
        rows(end + 1) = endpoint_from_block(dst(i), name); %#ok<AGROW>
    end
catch
end
end

function cones = output_cones(path, options)
outports = find_blocks(path, 1, 'Outport');
template = output_cone_template();
cones = repmat(template, 0, 1);
for i = 1:numel(outports)
    out = char(outports{i});
    cones(end + 1) = template; %#ok<AGROW>
    cones(end).output = safe_get(out, 'Name');
    cones(end).path = out;
    source = direct_source(out);
    cones(end).sourceSignal = source.signal;
    visited = containers.Map('KeyType', 'char', 'ValueType', 'logical');
    [nodes, names] = trace_source_cone(out, options.MaxOutputConeDepth, options.MaxOutputConeNodes, visited);
    cones(end).nodes = nodes;
    cones(end).namedStateSignals = names;
end
end

function cones = empty_output_cones()
cones = repmat(output_cone_template(), 0, 1);
end

function template = output_cone_template()
template = struct('output', '', 'path', '', 'sourceSignal', '', 'nodes', [], 'namedStateSignals', {{}});
end

function [nodes, names] = trace_source_cone(block, depth, maxNodes, visited)
template = struct('block', '', 'name', '', 'type', '', 'incomingSignal', '', 'parameters', []);
nodes = repmat(template, 0, 1);
names = {};
if depth <= 0 || numel(nodes) >= maxNodes
    return;
end
try
    ph = get_param(block, 'PortHandles');
    if ~isfield(ph, 'Inport')
        return;
    end
    for i = 1:numel(ph.Inport)
        line = get_param(ph.Inport(i), 'Line');
        if line == -1
            continue;
        end
        lineName = safe_get(line, 'Name');
        if is_state_like_name(lineName)
            names = add_unique(names, lineName);
        end
        srcHandle = get_param(line, 'SrcBlockHandle');
        if srcHandle == -1
            continue;
        end
        srcPath = getfullname(srcHandle);
        if isKey(visited, srcPath)
            continue;
        end
        visited(srcPath) = true;
        node = template;
        node.block = srcPath;
        node.name = safe_get(srcHandle, 'Name');
        node.type = safe_get(srcHandle, 'BlockType');
        node.incomingSignal = lineName;
        node.parameters = selected_params(srcHandle, node.type);
        nodes(end + 1) = node; %#ok<AGROW>
        if numel(nodes) >= maxNodes
            return;
        end
        if ~strcmp(node.type, 'Inport')
            [childNodes, childNames] = trace_source_cone(srcHandle, depth - 1, maxNodes - numel(nodes), visited);
            nodes = [nodes; childNodes]; %#ok<AGROW>
            for j = 1:numel(childNames)
                names = add_unique(names, childNames{j});
            end
        end
    end
catch
end
end

function rows = docblocks(path, options)
template = struct('name', '', 'path', '', 'description', '', 'body', '');
rows = repmat(template, 0, 1);
blocks = find_system(path, 'SearchDepth', 1, 'LookUnderMasks', 'all', 'FollowLinks', char(options.FollowLinks), ...
    'BlockType', 'SubSystem');
for i = 1:numel(blocks)
    ref = lower(safe_get(blocks{i}, 'ReferenceBlock'));
    if ~contains(ref, 'docblock')
        continue;
    end
    rows(end + 1) = template; %#ok<AGROW>
    rows(end).name = safe_get(blocks{i}, 'Name');
    rows(end).path = char(blocks{i});
    rows(end).description = safe_get(blocks{i}, 'Description');
    if options.IncludeDocBlockBodies
        rows(end).body = safe_get(blocks{i}, 'UserData');
    end
end
end

function rows = empty_docblocks()
template = struct('name', '', 'path', '', 'description', '', 'body', '');
rows = repmat(template, 0, 1);
end

function flags = risk_flags(moduleRow)
types = {moduleRow.blockTypeCounts.type};
counts = [moduleRow.blockTypeCounts.count];
flags = struct();
flags.hasSwitch = count_types(types, counts, {'Switch', 'MultiPortSwitch'}) > 0;
flags.hasMemory = count_types(types, counts, {'UnitDelay', 'Memory', 'Delay'}) > 0;
flags.hasLogic = count_types(types, counts, {'Logic', 'RelationalOperator'}) > 0;
flags.hasLookup = count_types(types, counts, {'Lookup_n-D', 'PreLookup', 'Interpolation_n-D'}) > 0;
flags.hasNamedStateSignal = any_state_like_lines(moduleRow.namedLines);
flags.needsOutputConeReview = flags.hasSwitch || flags.hasMemory || flags.hasNamedStateSignal;
end

function n = count_types(types, counts, names)
n = 0;
for i = 1:numel(names)
    idx = strcmp(types, names{i});
    if any(idx)
        n = n + sum(counts(idx));
    end
end
end

function tf = any_state_like_lines(lines)
tf = false;
for i = 1:numel(lines)
    if is_state_like_name(lines(i).name)
        tf = true;
        return;
    end
end
end

function hint = role_hint(name, source, destinations)
hint = '';
if is_state_like_name(name)
    hint = 'state_or_restore_signal';
elseif any_destination_type(destinations, {'Outport'})
    hint = 'output_signal';
elseif any_destination_type(destinations, {'Switch', 'MultiPortSwitch'})
    hint = 'selection_control_or_candidate';
elseif any_destination_type(destinations, {'UnitDelay', 'Memory', 'Delay'})
    hint = 'state_feedback';
elseif strcmp(source.type, 'Goto') || any_destination_type(destinations, {'From', 'Goto'})
    hint = 'goto_from_named_signal';
end
end

function tf = any_destination_type(destinations, types)
tf = false;
for i = 1:numel(destinations)
    if any(strcmp(destinations(i).type, types))
        tf = true;
        return;
    end
end
end

function tf = is_state_like_name(name)
tokens = {'Rem', 'Rstr', 'Restore', 'Old', 'Pre', 'Last', 'Mem', 'Save', 'Saved', 'EEW'};
tf = contains_any(char(name), tokens);
end

function tf = contains_any(value, tokens)
tf = false;
for i = 1:numel(tokens)
    if contains(value, tokens{i}, 'IgnoreCase', true)
        tf = true;
        return;
    end
end
end

function value = safe_get(block, paramName)
try
    value = get_param(block, paramName);
    if isnumeric(value) || islogical(value)
        value = mat2str(value);
    elseif isstring(value)
        value = char(value);
    elseif iscell(value)
        value = strjoin(cellfun(@char, value, 'UniformOutput', false), ';');
    elseif ~ischar(value)
        value = '';
    end
catch
    value = '';
end
end

function lines = find_lines(path, depth)
try
    lines = find_system(path, 'SearchDepth', depth, 'FindAll', 'on', 'LookUnderMasks', 'all', ...
        'FollowLinks', 'off', 'Type', 'Line');
catch
    lines = [];
end
end

function annotations = get_annotations(path)
annotations = {};
try
    anns = find_system(path, 'SearchDepth', 1, 'FindAll', 'on', 'Type', 'annotation');
    for i = 1:numel(anns)
        value = safe_get(anns(i), 'PlainText');
        if ~isempty(strtrim(value))
            annotations{end + 1} = value; %#ok<AGROW>
        end
    end
catch
end
end

function depth = model_depth(path, modelName)
relative = relative_model_path(path, modelName);
if isempty(relative)
    depth = 0;
else
    depth = numel(strsplit(relative, '/'));
end
end

function relative = relative_model_path(path, modelName)
prefix = [modelName '/'];
if strcmp(path, modelName)
    relative = '';
elseif startsWith(path, prefix)
    relative = path(numel(prefix) + 1:end);
else
    relative = path;
end
end

function list = normalize_list(value)
if isempty(value)
    list = {};
elseif ischar(value)
    list = split_list(value);
elseif isstring(value)
    list = cellstr(value);
elseif iscell(value)
    list = value;
else
    list = {};
end
end

function parts = split_list(value)
if isempty(value)
    parts = {};
    return;
end
raw = regexp(char(value), '[;,]', 'split');
parts = {};
for i = 1:numel(raw)
    item = strtrim(raw{i});
    if ~isempty(item)
        parts{end + 1} = item; %#ok<AGROW>
    end
end
end

function list = add_unique(list, value)
if isempty(value)
    return;
end
if ~any(strcmp(list, value))
    list{end + 1} = value; %#ok<AGROW>
end
end

function write_json(outFile, evidence)
outDir = fileparts(outFile);
if ~isempty(outDir) && ~exist(outDir, 'dir')
    mkdir(outDir);
end
try
    jsonText = jsonencode(evidence, 'PrettyPrint', true);
catch
    jsonText = jsonencode(evidence);
end
fid = fopen(outFile, 'w', 'n', 'UTF-8');
if fid < 0
    error('collect_module_doc_evidence:WriteFailed', 'Could not write %s.', outFile);
end
cleanup = onCleanup(@() fclose(fid)); %#ok<NASGU>
fprintf(fid, '%s', jsonText);
end

function value = notes(options)
value = struct();
value.fastPath = 'Evidence collected inside the task MATLAB session. Use targeted MCP/SATK reads only for modules whose riskFlags.needsOutputConeReview remain unresolved.';
value.includeDocBlockBodies = options.IncludeDocBlockBodies;
value.includeOutputCones = options.IncludeOutputCones;
value.includeBlockTypeCounts = options.IncludeBlockTypeCounts;
value.includeSampleBlocks = options.IncludeSampleBlocks;
value.includeNamedLines = options.IncludeNamedLines;
value.includePortConnectivity = options.IncludePortConnectivity;
value.includeDocBlocks = options.IncludeDocBlocks;
value.includeRiskCandidates = options.IncludeRiskCandidates;
value.selectedSubsystems = normalize_list(options.SelectedSubsystems);
if ~options.IncludeNamedLines || ~options.IncludeBlockTypeCounts || ~options.IncludeSampleBlocks
    value.indexMode = 'Lightweight by default. Use targeted MCP/SATK reads in the same task session for selected troubleshooting passes.';
end
if ~options.IncludeOutputCones
    value.outputCones = 'Deferred by default for speed. Use targeted MCP/SATK output-cone reads in the same task session when riskFlags.needsOutputConeReview is true.';
end
end
