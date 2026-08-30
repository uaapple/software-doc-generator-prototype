function probe_capability_precheck(rootDir, modelName, requestJsonPath, outputJsonPath)
%PROBE_CAPABILITY_PRECHECK Classify per-operator probe observability before
%running hundreds of probe candidates.
%
% Production case (task bbc72245): Stage 6 executed 1214 probe candidates
% against targets inside ITKLib reference blocks (DebCnt/DebounceEnable/*).
% Every such To Workspace probe was rejected by the library protection, the
% failures were swallowed as empty port names, and 640 of 2428 observations
% came back target_unavailable with empty error messages. This precheck runs
% the SAME trial mutation the execution probe will perform, per operator, so
% unobservable targets are known before any candidate is simulated.
%
% Four-step verdict per operator (expert-reviewed):
%   1. to_workspace_probe     — the trial probe (including the execution
%                               probe's link-deactivation retry) succeeded;
%                               execution will behave identically
%   2. noninvasive_signal_log — probe insertion is denied but model-side
%                               signal logging is accepted
%   3. compiled_signal_log    — reserved (v1 folds this into 2; the model is
%                               compiled during the trial anyway)
%   4. unprobeable            — none of the above; may ONLY be produced here,
%                               never by a runtime error
%
% All trials happen in memory: the model is loaded, mutated, and discarded
% with bdclose (never saved), so the model file itself is untouched. The
% request JSON lists the operators to classify; the reply JSON maps each
% operator id to {"strategy": ..., "reason": ...}.

STRATEGY_VERSION = 'v1';
request = jsondecode(fileread(requestJsonPath));
operators = normalize_struct_array(request.operators);

capabilities = struct();
close_foreign_loaded_model(modelName, rootDir);
load_system(fullfile(rootDir, [modelName '.slx']));
try
    for i = 1:numel(operators)
        operator = operators(i);
        operatorId = char(string(struct_text(operator, 'id')));
        blockPath = char(string(struct_text(operator, 'block_path')));
        [strategy, reason] = classify_capability(blockPath);
        capabilities.(matlab.lang.makeValidName(operatorId)) = ...
            struct('strategy', strategy, 'reason', reason);
    end
finally
    % Discard every in-memory mutation (trial probes, link deactivations,
    % logging flags). Never save the model during the precheck.
    close_foreign_loaded_model(modelName, rootDir);
end

report = struct();
report.schema = 'tcsd-probe-capability/v1';
report.model = modelName;
report.strategyVersion = STRATEGY_VERSION;
report.precheckAt = datestr(now, 'yyyy-mm-ddTHH:MM:SS');
report.capabilities = capabilities;
% Force row arrays so jsonencode emits JSON objects/arrays even for a single
% or zero operator entry.
report.capabilities = force_row_struct(report.capabilities);
write_json(outputJsonPath, report);
end

function [strategy, reason] = classify_capability(blockPath)
% Step 0: the block must exist in this model.
if getSimulinkBlockHandle(blockPath) == -1
    strategy = 'unprobeable';
    reason = 'block_not_found';
    return;
end
handles = get_param(blockPath, 'PortHandles');
% Step 1: trial the exact probe mutation the execution probe performs
% (To Workspace sink on the inbound line, with the link-deactivation retry).
for p = 1:numel(handles.Inport)
    line = get_param(handles.Inport(p), 'Line');
    if isequal(line, -1)
        continue;
    end
    trialVariable = matlab.lang.makeValidName(['precheck_' matlab.lang.makeValidName(blockPath)]);
    try
        add_to_workspace_probe_trial(blockPath, line, trialVariable);
        strategy = 'to_workspace_probe';
        reason = 'trial probe accepted (execution probe will behave identically)';
        return;
    catch ME
        if is_library_mutation_error(ME)
            % Step 2: model-side signal logging on the same line.
            try
                originalFlag = get_param(line, 'DataLogging');
                set_param(line, 'DataLogging', 'on');
                set_param(line, 'DataLogging', originalFlag);
                strategy = 'noninvasive_signal_log';
                reason = 'library-protected block; model-side signal logging accepted';
                return;
            catch ME2
                strategy = 'unprobeable';
                reason = sprintf('linked_library_mutation_denied: %s | %s', ...
                    shorten_text(ME.message), shorten_text(ME2.message));
                return;
            end
        end
        strategy = 'unprobeable';
        reason = sprintf('probe_trial_failed: %s', shorten_text(ME.message));
        return;
    end
end
strategy = 'unprobeable';
reason = 'no_connectable_input_line';
end

function add_to_workspace_probe_trial(targetBlock, line, variableName)
% Mirror of the execution probe insertion (probe_logical_mcdc_vectors.m
% add_to_workspace_probe), including the library-deactivation retry, so the
% precheck verdict matches execution behaviour exactly.
parentSystem = get_param(targetBlock, 'Parent');
srcPort = get_param(line, 'SrcPortHandle');
blockName = matlab.lang.makeValidName(['CodexPrecheck_' variableName]);
probeBlock = [parentSystem '/' blockName];
suffix = 1;
while getSimulinkBlockHandle(probeBlock) ~= -1
    blockName = matlab.lang.makeValidName(sprintf('CodexPrecheck_%s_%d', variableName, suffix));
    probeBlock = [parentSystem '/' blockName];
    suffix = suffix + 1;
end
try
    add_block('simulink/Sinks/To Workspace', probeBlock, ...
        'VariableName', variableName, ...
        'SaveFormat', 'Timeseries', ...
        'Position', [30 + 15 * suffix, 30 + 15 * suffix, 140 + 15 * suffix, 60 + 15 * suffix]);
catch ME
    if is_library_mutation_error(ME)
        deactivate_link_for_trial(parentSystem);
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

function deactivate_link_for_trial(systemPath)
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

function tf = is_library_mutation_error(ME)
tf = contains(ME.message, '链接库模块') ...
    || contains(lower(ME.message), 'library') ...
    || contains(lower(ME.message), 'locked') ...
    || contains(lower(ME.message), 'read-only') ...
    || contains(lower(ME.message), 'protected');
end

function text = shorten_text(value)
text = strrep(char(string(value)), newline, ' ');
if numel(text) > 160
    text = text(1:157);
end
end

function value = struct_text(item, fieldName)
value = '';
try
    value = char(string(item.(fieldName)));
catch
    value = fieldName;
end
end

function arr = normalize_struct_array(value)
if isempty(value)
    arr = struct();
    return;
end
if ~isstruct(value)
    arr = struct();
    return;
end
if numel(value) == 1 && all(structfun(@(field) ~isa(field, 'struct'), value))
    arr = value;
    return;
end
arr = value;
end

function out = force_row_struct(value)
% jsonencode collapses 1x1 struct arrays into JSON objects and empty ones into
% []; callers downstream expect an object-of-objects for capabilities, so an
% empty struct is replaced by a placeholder-free row struct.
if isempty(value)
    out = struct();
    return;
end
out = value;
end

function write_json(pathName, data)
fid = fopen(pathName, 'w');
if fid == -1
    error('PROBE_CAPABILITY_PRECHECK:WriteFailed', 'cannot write %s', pathName);
end
cleanup = onCleanup(@() fclose(fid));
fprintf(fid, '%s', jsonencode(data, 'PrettyPrint', true));
end
