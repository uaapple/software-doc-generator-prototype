function report = configure_tcsd_sim_config(modelName, rootDir)
% Attach an in-memory config that can use addon-provided custom-code headers.
if nargin < 2 || isempty(rootDir)
    rootDir = pwd;
end
modelName = char(string(modelName));
rootDir = char(string(rootDir));

report = struct();
report.configName = 'CodexSimOnlyCfg';
report.mode = 'simulation-only-no-custom-code';
report.headers = {};
report.includeDirs = {};
report.missingHeaders = {};

originalConfig = getActiveConfigSet(modelName);
headers = custom_code_headers(originalConfig);
includeDirs = discover_custom_code_include_dirs(rootDir, headers);
missingHeaders = missing_headers(headers, includeDirs);

report.headers = headers;
report.includeDirs = includeDirs;
report.missingHeaders = missingHeaders;

try
    if any(strcmp(getConfigSets(modelName), report.configName))
        detachConfigSet(modelName, report.configName);
    end
catch
end

if ~isempty(headers) && isempty(missingHeaders)
    cs = copy_resolved_config_set(originalConfig);
    report.mode = 'custom-code-headers-from-workspace';
else
    cs = Simulink.ConfigSet;
end

set_param(cs, 'Name', report.configName);
if ~isempty(includeDirs)
    append_include_dirs(cs, includeDirs);
end
if strcmp(report.mode, 'simulation-only-no-custom-code')
    disable_custom_code_parse(cs);
end

attachConfigSet(modelName, cs, true);
setActiveConfigSet(modelName, report.configName);
print_report(report);
end

function cs = copy_resolved_config_set(configSet)
try
    if isa(configSet, 'Simulink.ConfigSetRef')
        cs = copy(getRefConfigSet(configSet));
    else
        cs = copy(configSet);
    end
catch
    cs = Simulink.ConfigSet;
end
end

function headers = custom_code_headers(configSet)
headers = {};
try
    code = char(string(get_param(configSet, 'SimCustomHeaderCode')));
catch
    code = '';
end
matches = regexp(code, '#include\s+[<"]([^>"]+)[>"]', 'tokens');
for i = 1:numel(matches)
    header = strtrim(matches{i}{1});
    if ~isempty(header) && ~any(strcmp(headers, header))
        headers{end + 1} = header; %#ok<AGROW>
    end
end
end

function dirs = discover_custom_code_include_dirs(rootDir, headers)
dirs = {};
searchRoots = custom_code_search_roots(rootDir);
for r = 1:numel(searchRoots)
    searchRoot = searchRoots{r};
    for i = 1:numel(headers)
        hits = dir(fullfile(searchRoot, '**', headers{i}));
        for j = 1:numel(hits)
            if ~hits(j).isdir
                dirs = add_unique_dir(dirs, hits(j).folder);
            end
        end
    end

    interfaceDirs = [
        dir(fullfile(searchRoot, '**', 'VC600M_Interface*'));
        dir(fullfile(searchRoot, '**', '*Interface*'))
    ];
    for i = 1:numel(interfaceDirs)
        interfaceDir = fullfile(interfaceDirs(i).folder, interfaceDirs(i).name);
        if interfaceDirs(i).isdir && dir_contains_any_header(interfaceDir, headers)
            dirs = add_unique_dir(dirs, interfaceDir);
        end
    end
end
end

function tf = dir_contains_any_header(candidateDir, headers)
tf = isempty(headers);
for i = 1:numel(headers)
    if exist(fullfile(candidateDir, headers{i}), 'file')
        tf = true;
        return;
    end
end
end

function roots = custom_code_search_roots(rootDir)
roots = {};
roots = add_unique_dir(roots, rootDir);
end

function missing = missing_headers(headers, includeDirs)
missing = {};
for i = 1:numel(headers)
    found = false;
    for j = 1:numel(includeDirs)
        if exist(fullfile(includeDirs{j}, headers{i}), 'file')
            found = true;
            break;
        end
    end
    if ~found
        missing{end + 1} = headers{i}; %#ok<AGROW>
    end
end
end

function dirs = add_unique_dir(dirs, value)
value = char(string(value));
if isempty(value) || ~exist(value, 'dir')
    return;
end
if ~any(strcmp(dirs, value))
    dirs{end + 1} = value;
end
end

function append_include_dirs(configSet, includeDirs)
existing = {};
try
    existing = split_include_dirs(get_param(configSet, 'SimUserIncludeDirs'));
catch
end
allDirs = existing;
for i = 1:numel(includeDirs)
    if ~any(strcmp(allDirs, includeDirs{i}))
        allDirs{end + 1} = includeDirs{i}; %#ok<AGROW>
    end
end
try
    set_param(configSet, 'SimUserIncludeDirs', strjoin(allDirs, newline));
catch
end
end

function dirs = split_include_dirs(value)
dirs = {};
if isempty(value)
    return;
end
raw = regexp(char(string(value)), '[\r\n;]+', 'split');
for i = 1:numel(raw)
    item = strtrim(strrep(raw{i}, '"', ''));
    if ~isempty(item)
        dirs{end + 1} = item; %#ok<AGROW>
    end
end
end

function disable_custom_code_parse(configSet)
params = {
    'SimCustomHeaderCode', ''
    'SimUserIncludeDirs', ''
    'SimParseCustomCode', 'off'
    'SimUseLocalCustomCode', 'off'
    'RTWUseLocalCustomCode', 'off'
};
for i = 1:size(params, 1)
    try
        set_param(configSet, params{i, 1}, params{i, 2});
    catch
    end
end
end

function print_report(report)
fprintf('TCSD_CONFIG_MODE=%s\n', report.mode);
if ~isempty(report.headers)
    fprintf('TCSD_CUSTOM_CODE_HEADERS=%s\n', strjoin(report.headers, ';'));
end
if ~isempty(report.includeDirs)
    fprintf('TCSD_CUSTOM_CODE_INCLUDE_DIRS=%s\n', strjoin(report.includeDirs, ';'));
end
if ~isempty(report.missingHeaders)
    fprintf('TCSD_CUSTOM_CODE_MISSING_HEADERS=%s\n', strjoin(report.missingHeaders, ';'));
end
end
