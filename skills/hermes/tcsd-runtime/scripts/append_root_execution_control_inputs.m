function [dataset, controls] = append_root_execution_control_inputs(dataset, modelName, time)
% Add root execution controls without exposing them as TCSD business inputs.

controls = struct('name', {}, 'type', {}, 'default_policy', {});
enableBlocks = find_system(modelName, 'SearchDepth', 1, 'BlockType', 'EnablePort');
enableBlocks = stable_root_control_order(enableBlocks);
for index = 1:numel(enableBlocks)
    name = char(string(get_param(enableBlocks{index}, 'Name')));
    % Root EnablePort external-input typing is double in Simulink's root
    % execution interface, even when its enable semantics are Boolean.
    signal = timeseries(ones(numel(time), 1), time);
    signal.Name = name;
    try
        signal = setinterpmethod(signal, 'zoh');
    catch
    end
    dataset{end + 1} = signal;
    controls(end + 1) = struct( ... %#ok<AGROW>
        'name', name, 'type', 'enable', 'default_policy', 'enabled');
end

triggerBlocks = find_system(modelName, 'SearchDepth', 1, 'BlockType', 'TriggerPort');
if ~isempty(triggerBlocks)
    names = cellfun(@(block) char(string(get_param(block, 'Name'))), ...
        triggerBlocks, 'UniformOutput', false);
    error('tcsd:UnsupportedRootTriggerPort', ...
        ['Root TriggerPort execution semantics require an evidenced edge or function-call ' ...
         'sequence and cannot be inferred automatically: %s'], strjoin(names, ', '));
end
end

function blocks = stable_root_control_order(blocks)
if numel(blocks) < 2
    return;
end
keys = zeros(1, numel(blocks));
for index = 1:numel(blocks)
    try
        keys(index) = str2double(get_param(blocks{index}, 'Port'));
    catch
        keys(index) = index;
    end
    if ~isfinite(keys(index))
        keys(index) = index;
    end
end
[~, order] = sort(keys);
blocks = blocks(order);
end
