function merge_tcsd_coverage_many(rootDir, modelName, coverageFiles, outputDataFile, outputJson, varargin)
%MERGE_TCSD_COVERAGE_MANY Merge one or more batch cvdata files and summarize them.
p = inputParser;
addParameter(p, 'InitScripts', {}, @(x) iscell(x) || isstring(x));
addParameter(p, 'MatFile', '', @(x) ischar(x) || isstring(x));
addParameter(p, 'McdcMode', 'Masking', @(x) ischar(x) || isstring(x));
addParameter(p, 'Threshold', 80, @isnumeric);
parse(p, varargin{:});
if ~iscell(coverageFiles) || isempty(coverageFiles)
    error('tcsd:CoverageBatchMissing', 'At least one coverage data file is required.');
end
executedInitScripts = setup_ut_support(rootDir, p.Results.InitScripts);
cleanupObj = onCleanup(@() cleanup_task_models({modelName, 'ITKLib'}));
if strlength(string(p.Results.MatFile)) > 0
    load_mat_to_base(resolve_workspace_file(rootDir, p.Results.MatFile));
end
load_support_library(rootDir, 'ITKLib.slx');
load_system(fullfile(rootDir, [char(string(modelName)) '.slx']));
configure_tcsd_sim_config(modelName, rootDir);
set_param(modelName, 'CovMcdcMode', char(string(p.Results.McdcMode)));
merged = [];
for index = 1:numel(coverageFiles)
    [~, loaded] = cvload(char(string(coverageFiles{index})), 1);
    if isempty(merged)
        merged = loaded{1};
    else
        merged = merged + loaded{1};
    end
end
save_coverage_data(outputDataFile, merged);
payload = struct();
payload.(matlab.lang.makeValidName(modelName)) = coverage_summary( ...
    merged, modelName, p.Results.Threshold, p.Results.McdcMode);
payload.(matlab.lang.makeValidName(modelName)).initialization_scripts = executedInitScripts;
write_json_file(outputJson, payload);
end

function summary = coverage_summary(cvd, modelName, threshold, mcdcMode)
summary = struct('model', char(string(modelName)), 'mcdc_mode', char(string(mcdcMode)), ...
    'model_checksum', jsonencode(Simulink.BlockDiagram.getChecksum(modelName)), ...
    'support_library_path', support_library_path());
summary.condition = metric(conditioninfo(cvd, modelName), threshold);
summary.decision = metric(decisioninfo(cvd, modelName), threshold);
summary.mcdc = metric(mcdcinfo(cvd, modelName), threshold);
summary.items = collect_coverage_items(cvd, modelName);
summary.passed = summary.condition.passed && summary.decision.passed && summary.mcdc.passed;
end

function result = metric(info, threshold)
values = double(info(:)');
if numel(values) >= 2
    covered = values(1); total = values(2);
elseif isempty(values)
    covered = 0; total = 0;
else
    covered = values(1); total = values(1);
end
result = struct('covered', covered, 'total', total);
if result.total > 0, result.percent = 100 * result.covered / result.total; else, result.percent = 100; end
result.passed = result.percent >= threshold;
end

function items = collect_coverage_items(cvd, modelName)
items = {};
blocks = find_system(modelName, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'Type', 'Block');
metricNames = {'Condition', 'Decision', 'MCDC'};
metricFunctions = {@conditioninfo, @decisioninfo, @mcdcinfo};
for blockIndex = 1:numel(blocks)
    blockPath = blocks{blockIndex};
    for metricIndex = 1:numel(metricNames)
        try
            [info, description] = metricFunctions{metricIndex}(cvd, blockPath, true);
        catch
            continue;
        end
        result = metric(info, 0);
        if result.total <= 0, continue; end
        item = struct('coverage_class', metricNames{metricIndex}, ...
            'block_path', blockPath, 'sid', '', 'covered', result.covered, ...
            'total', result.total, 'percent', result.percent, ...
            'description', jsonencode(description));
        try
            item.sid = char(string(get_param(blockPath, 'SID')));
        catch
        end
        items{end + 1} = item; %#ok<AGROW>
    end
end
end

function value = support_library_path()
value = '';
try
    value = char(string(get_param('ITKLib', 'FileName')));
catch
end
end

function save_coverage_data(pathName, cvd)
[folder, name] = fileparts(char(string(pathName)));
if isempty(folder), folder = pwd; end
if ~exist(folder, 'dir'), mkdir(folder); end
oldDir = pwd; cleanupObj = onCleanup(@() cd(oldDir)); cd(folder); cvsave(name, cvd);
end

function write_json_file(pathName, value)
fid = fopen(pathName, 'w');
if fid < 0, error('tcsd:WriteFailed', 'Cannot write merged coverage.'); end
cleanupObj = onCleanup(@() fclose(fid)); fprintf(fid, '%s', jsonencode(value, PrettyPrint=true));
end

function cleanup_task_models(modelNames)
for index = 1:numel(modelNames)
    try
        if bdIsLoaded(modelNames{index}), close_system(modelNames{index}, 0); end
    catch
    end
end
end

function load_support_library(rootDir, libraryFile)
candidate = fullfile(rootDir, libraryFile);
if isfile(candidate), load_system(candidate); return; end
candidate = which(libraryFile);
if ~isempty(candidate), load_system(candidate); end
end

function load_mat_to_base(matPath)
loaded = load(matPath);
names = fieldnames(loaded);
for index = 1:numel(names)
    value = restore_degraded_workspace_value_for_simulink_ut(names{index}, loaded.(names{index}));
    assignin('base', names{index}, value);
end
end

function filePath = resolve_workspace_file(rootDir, fileName)
filePath = char(string(fileName));
if ~isfile(filePath), filePath = fullfile(rootDir, filePath); end
end
