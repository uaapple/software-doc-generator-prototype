function run_design_verifier_gapfill(rootDir, modelName, matFile, baselineCoverageFile, outputDir, casesJson, evidenceJson, varargin)
%RUN_DESIGN_VERIFIER_GAPFILL Run one bounded coverage-extension pass.
p = inputParser;
addParameter(p, 'InitScripts', {}, @(x) iscell(x) || isstring(x));
addParameter(p, 'McdcMode', 'Masking', @(x) ischar(x) || isstring(x));
addParameter(p, 'MaxProcessTime', 600, @isnumeric);
addParameter(p, 'MaxTestCaseSteps', 4000, @isnumeric);
parse(p, varargin{:});
payload = struct('schema', 'tcsd-design-verifier-gapfill/v1', 'status', 'failed', ...
    'model', char(string(modelName)), 'generatedCandidateCount', 0, 'resultCode', 0, ...
    'mcdcMode', char(string(p.Results.McdcMode)));
try
    required = {'sldvoptions', 'sldvgencov', 'cvload'};
    for index = 1:numel(required)
        if exist(required{index}, 'file') == 0
            payload.status = 'unavailable';
            payload.reason = 'design_verifier_function_unavailable';
            write_json_file(evidenceJson, payload);
            return;
        end
    end
    setup_ut_support(rootDir, p.Results.InitScripts);
    cleanupObj = onCleanup(@() cleanup_task_models({modelName, 'ITKLib'}));
    load_mat_to_base(resolve_workspace_file(rootDir, matFile));
    load_support_library(rootDir, 'ITKLib.slx');
    load_system(fullfile(rootDir, [char(string(modelName)) '.slx']));
    configure_tcsd_sim_config(modelName, rootDir);
    set_param(modelName, 'SolverType', 'Fixed-step', 'Solver', 'FixedStepDiscrete', ...
        'FixedStep', '0.01', 'CovMcdcMode', char(string(p.Results.McdcMode)));
    beforeChecksum = jsonencode(Simulink.BlockDiagram.getChecksum(modelName));
    [~, baseline] = cvload(baselineCoverageFile, 1);
    options = sldvoptions;
    options.Mode = 'TestGeneration';
    options.ModelCoverageObjectives = 'MCDC';
    options.MaxProcessTime = double(p.Results.MaxProcessTime);
    options.MaxTestCaseSteps = double(p.Results.MaxTestCaseSteps);
    options.SaveReport = 'off';
    options.DisplayReport = 'off';
    options.SaveHarnessModel = 'off';
    options.MakeOutputFilesUnique = 'off';
    if ~exist(outputDir, 'dir')
        mkdir(outputDir);
    end
    options.OutputDir = outputDir;
    options.DataFileName = 'tcsd_sldv_gapfill';
    [resultCode, ~, ~] = sldvgencov(modelName, options, false, baseline{1});
    generatedFiles = dir(fullfile(outputDir, 'tcsd_sldv_gapfill.mat'));
    if isempty(generatedFiles)
        generatedFiles = dir(fullfile(outputDir, '*sldvdata.mat'));
    end
    if isempty(generatedFiles)
        payload.status = 'no_candidates';
        payload.resultCode = double(resultCode);
        payload.reason = 'design_verifier_data_not_generated';
        write_json_file(evidenceJson, payload);
        return;
    end
    [~, newestIndex] = max([generatedFiles.datenum]);
    dataFile = fullfile(generatedFiles(newestIndex).folder, generatedFiles(newestIndex).name);
    export_sldv_cases_to_tcsd(dataFile, modelName, casesJson, 'SLDV');
    generated = jsondecode(fileread(casesJson));
    afterChecksum = jsonencode(Simulink.BlockDiagram.getChecksum(modelName));
    if ~strcmp(beforeChecksum, afterChecksum)
        error('tcsd:DesignVerifierModelChanged', 'Design Verifier changed the loaded model checksum.');
    end
    payload.status = 'completed';
    payload.resultCode = double(resultCode);
    payload.generatedCandidateCount = numel(generated.tests);
    payload.modelChecksum = afterChecksum;
    write_json_file(evidenceJson, payload);
catch ME
    payload.status = 'failed';
    payload.errorCode = char(string(ME.identifier));
    payload.errorMessage = char(string(ME.message));
    write_json_file(evidenceJson, payload);
    rethrow(ME);
end
end

function write_json_file(pathName, value)
fid = fopen(pathName, 'w');
if fid < 0, error('tcsd:WriteFailed', 'Cannot write Design Verifier evidence.'); end
cleanupObj = onCleanup(@() fclose(fid));
fprintf(fid, '%s', jsonencode(value, PrettyPrint=true));
end

function cleanup_task_models(modelNames)
for index = 1:numel(modelNames)
    try
        if bdIsLoaded(modelNames{index})
            close_system(modelNames{index}, 0);
        end
    catch
    end
end
end

function load_support_library(rootDir, libraryFile)
candidate = fullfile(rootDir, libraryFile);
if isfile(candidate)
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
for index = 1:numel(names)
    value = restore_degraded_workspace_value_for_simulink_ut(names{index}, loaded.(names{index}));
    assignin('base', names{index}, value);
end
end

function filePath = resolve_workspace_file(rootDir, fileName)
filePath = char(string(fileName));
if ~isfile(filePath)
    filePath = fullfile(rootDir, filePath);
end
end
