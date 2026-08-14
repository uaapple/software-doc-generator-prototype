function export_sldv_cases_to_tcsd(sldvFile, modelName, outputJson, idPrefix)
%EXPORT_SLDV_CASES_TO_TCSD Convert Design Verifier tests to extracted TCSD cases.
if nargin < 4 || strlength(string(idPrefix)) == 0
    idPrefix = 'SLDV';
end
loaded = load(sldvFile);
if ~isfield(loaded, 'sldvData')
    error('tcsd:DesignVerifierDataMissing', 'Design Verifier data does not contain sldvData.');
end
source = loaded.sldvData;
portInfo = source.AnalysisInformation.InputPortInfo;
tests = repmat(empty_test(), 1, numel(source.TestCases));
for testIndex = 1:numel(source.TestCases)
    sourceTest = source.TestCases(testIndex);
    test = empty_test();
    test.row = 5 + testIndex;
    test.test_id = sprintf('%s_%03d', char(string(idPrefix)), testIndex);
    test.name = 'Design Verifier coverage supplement';
    for portIndex = 1:numel(portInfo)
        name = matlab.lang.makeValidName(portInfo{portIndex}.PortName);
        values = sourceTest.dataValues{portIndex};
        test.init_values.(name) = json_scalar(values(1));
    end
    pointCount = numel(sourceTest.timeValues);
    stepCount = max(1, pointCount - 1);
    test.steps = repmat(empty_step(), 1, stepCount);
    for pointIndex = 2:pointCount
        step = empty_step();
        step.index = pointIndex - 1;
        step.delay_s = max(0.01, double(sourceTest.timeValues(pointIndex) - sourceTest.timeValues(pointIndex - 1)));
        for portIndex = 1:numel(portInfo)
            name = matlab.lang.makeValidName(portInfo{portIndex}.PortName);
            values = sourceTest.dataValues{portIndex};
            if ~isequaln(values(pointIndex), values(pointIndex - 1))
                step.input_updates.(name) = json_scalar(values(pointIndex));
            end
        end
        test.steps(pointIndex - 1) = step;
    end
    if pointCount == 1
        test.steps(1).index = 1;
        test.steps(1).delay_s = 0.01;
    end
    tests(testIndex) = test;
end
payload = struct('schema', 'tcsd-extracted-cases/v1', 'model', char(string(modelName)), ...
    'generated_by', 'Simulink Design Verifier', 'tests', tests);
write_json_file(outputJson, payload);
end

function test = empty_test()
test = struct('row', 0, 'test_id', '', 'name', '', 'init_values', struct(), ...
    'init_params', struct(), 'steps', repmat(empty_step(), 1, 0), 'target', struct());
end

function step = empty_step()
step = struct('marker', '', 'delay_s', 0.01, 'input_updates', struct(), ...
    'param_updates', struct(), 'index', 0);
end

function value = json_scalar(value)
if islogical(value)
    value = logical(value);
elseif isnumeric(value)
    value = double(value);
else
    error('tcsd:DesignVerifierUnsupportedValue', 'Design Verifier emitted a non-numeric input value.');
end
end

function write_json_file(pathName, value)
fid = fopen(pathName, 'w');
if fid < 0, error('tcsd:WriteFailed', 'Cannot write Design Verifier cases.'); end
cleanupObj = onCleanup(@() fclose(fid));
fprintf(fid, '%s', jsonencode(value, PrettyPrint=true));
end
