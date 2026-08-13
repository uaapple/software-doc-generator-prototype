function probes = configure_tcsd_coverage_observation_model(modelName)
%CONFIGURE_TCSD_COVERAGE_OBSERVATION_MODEL Prepare one shared coverage model.
%
% Stage 9/11 logical-vector probes and Stage 10 candidate-suite coverage
% must instrument the loaded model identically. The source model is never
% saved; linked library blocks are made inactive in memory only when a
% temporary To Workspace observation block must be attached.

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
