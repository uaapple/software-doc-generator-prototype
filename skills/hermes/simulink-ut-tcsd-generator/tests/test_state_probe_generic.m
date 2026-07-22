function test_state_probe_generic()
%TEST_STATE_PROBE_GENERIC Verify trace v2 and explicit state-probe execution.
oldDir = pwd;
oldPath = path;
testRoot = tempname;
mkdir(testRoot);
mkdir(fullfile(testRoot, 'outputs'));
modelName = 'GenericStateProbeModel';
cleanupObj = onCleanup(@() cleanup_test(modelName, testRoot, oldDir, oldPath));
scriptsDir = fullfile(fileparts(fileparts(mfilename('fullpath'))), 'scripts');
addpath(scriptsDir);

create_model(testRoot, modelName);
trace_logical_mcdc(testRoot, {modelName}, '');
tracePath = fullfile(testRoot, 'outputs', [modelName '_logical_traces.json']);
assert(exist(tracePath, 'file') == 2, 'Logical trace was not written.');
trace = jsondecode(fileread(tracePath));
assert(strcmp(trace.schema, 'simulink-ut-logical-mcdc-trace/v2'));
assert(trace.operator_count == 1);
assert(strcmp(trace.operators(1).ports(1).trace.kind, 'relational'));
assert(strcmp(trace.operators(1).ports(1).trace.inputs(1).trace.kind, 'stateful'));

casePath = fullfile(testRoot, 'outputs', [modelName '_state_probe_plan.json']);
write_cases(casePath);
probePath = fullfile(testRoot, 'outputs', [modelName '_state_probe_results.json']);
probe_logical_mcdc_vectors(testRoot, {modelName}, '', ...
    'CaseJson', casePath, 'OutputJson', probePath);
assert(exist(probePath, 'file') == 2, 'Probe result was not written.');
payload = jsondecode(fileread(probePath));
report = payload.(matlab.lang.makeValidName(modelName));
assert(strcmp(report.schema, 'simulink-ut-logical-mcdc-probe/v2'));
assert(~isempty(report.observations));
assert(isfield(report.observations, 'stimulus'));
assert(~bdIsLoaded(modelName), 'Probe must close the model without saving it.');

clear cleanupObj;
cleanup_test(modelName, testRoot, oldDir, oldPath);
end

function create_model(testRoot, modelName)
new_system(modelName);
add_block('simulink/Sources/In1', [modelName '/Enable'], 'Port', '1');
add_block('simulink/Sources/In1', [modelName '/Request'], 'Port', '2');
add_block('simulink/Discrete/Unit Delay', [modelName '/PreviousEnable'], 'InitialCondition', '0');
add_block('simulink/Sources/Constant', [modelName '/Threshold'], 'Value', '0.5');
add_block('simulink/Logic and Bit Operations/Relational Operator', [modelName '/DelayedEnabled'], 'Operator', '>');
add_block('simulink/Logic and Bit Operations/Logical Operator', [modelName '/Decision'], 'Operator', 'AND', 'Inputs', '2');
add_block('simulink/Sinks/Out1', [modelName '/Result'], 'Port', '1');
add_line(modelName, 'Enable/1', 'PreviousEnable/1');
add_line(modelName, 'PreviousEnable/1', 'DelayedEnabled/1');
add_line(modelName, 'Threshold/1', 'DelayedEnabled/2');
add_line(modelName, 'DelayedEnabled/1', 'Decision/1');
add_line(modelName, 'Request/1', 'Decision/2');
add_line(modelName, 'Decision/1', 'Result/1');
set_param(modelName, 'SolverType', 'Fixed-step', 'Solver', 'FixedStepDiscrete', 'FixedStep', '0.01');
save_system(modelName, fullfile(testRoot, [modelName '.slx']));
close_system(modelName, 0);
end

function write_cases(casePath)
step1 = struct('index', 1, 'delay_s', 0.01, 'input_updates', struct('Enable', 1), 'param_updates', struct());
step2 = struct('index', 2, 'delay_s', 0.03, 'input_updates', struct(), 'param_updates', struct());
test = struct();
test.row = 1;
test.test_id = 'STATE_PROBE_0001';
test.init_values = struct('Enable', 0, 'Request', 1);
test.init_params = struct();
test.steps = [step1, step2];
test.target = struct('operator_id', 'GenericStateProbeModel:5', 'port_index', 1);
payload = struct('schema', 'simulink-ut-state-probe-plan/v1', 'model', 'GenericStateProbeModel', 'tests', test);
fid = fopen(casePath, 'w');
assert(fid >= 0, 'Unable to write state probe cases.');
fprintf(fid, '%s', jsonencode(payload, PrettyPrint=true));
fclose(fid);
end

function cleanup_test(modelName, testRoot, oldDir, oldPath)
try
    if bdIsLoaded(modelName)
        close_system(modelName, 0);
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
if exist(testRoot, 'dir')
    rmdir(testRoot, 's');
end
end
