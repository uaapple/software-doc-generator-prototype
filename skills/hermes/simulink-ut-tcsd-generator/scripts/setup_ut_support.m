function setup_ut_support(rootDir, initScripts)
if nargin < 2
    initScripts = {};
end
cd(rootDir);
warning('off', 'all');
restoredefaultpath;
rehash toolboxcache;
scriptDir = fileparts(mfilename('fullpath'));
restore_matlab_mcp_core_path();
restore_satk_tools_path();
add_workspace_support_paths(rootDir, scriptDir);
run_project_init_scripts(rootDir, initScripts);
end

function add_workspace_support_paths(rootDir, scriptDir)
addpath(rootDir);
addpath(scriptDir);

allPaths = strsplit(genpath(rootDir), pathsep);
for i = 1:numel(allPaths)
    candidate = allPaths{i};
    if isempty(candidate) || ~exist(candidate, 'dir')
        continue;
    end
    if should_skip_project_path(candidate, rootDir)
        continue;
    end
    addpath(candidate);
end
end

function skip = should_skip_project_path(candidate, rootDir)
skip = false;
if strcmp(candidate, rootDir)
    return;
end
rootPrefix = [rootDir filesep];
if strncmp(candidate, rootPrefix, length(rootPrefix))
    relativePath = candidate(length(rootPrefix) + 1:end);
else
    relativePath = candidate;
end
parts = strsplit(strrep(relativePath, '/', filesep), filesep);
excludedNames = {'.git', '.svn', 'outputs', 'output', 'slprj', '__pycache__'};
for i = 1:numel(parts)
    if any(strcmpi(parts{i}, excludedNames))
        skip = true;
        return;
    end
end
end

function run_project_init_scripts(rootDir, initScripts)
scripts = normalize_init_scripts(initScripts);
if isempty(scripts)
    scripts = split_init_script_list(getenv('TCSD_PROJECT_INIT_SCRIPTS'));
end
if isempty(scripts)
    scripts = discover_project_init_scripts(rootDir);
end

for i = 1:numel(scripts)
    scriptPath = strtrim(char(scripts{i}));
    if isempty(scriptPath)
        continue;
    end
    if is_absolute_path(scriptPath)
        candidate = scriptPath;
    else
        candidate = fullfile(rootDir, scriptPath);
    end
    if exist(candidate, 'file')
        evalin('base', sprintf('run(''%s'');', escape_matlab_string(candidate)));
    else
        warning('setup_ut_support:ProjectInitMissing', ...
            'Project init script was requested but does not exist: %s', scriptPath);
    end
end
end

function scripts = discover_project_init_scripts(rootDir)
scripts = {};
preferredNames = {
    'init_Global.m'
    'init_global.m'
    'init.m'
    'startup.m'
    'setup.m'
    'initialize.m'
};
for i = 1:numel(preferredNames)
    scripts = add_discovered_init_scripts(scripts, rootDir, preferredNames{i});
end

patterns = {
    'init_*.m'
    '*_init.m'
    '*_init_*.m'
    'setup_*.m'
    '*_setup.m'
    'initialize_*.m'
    '*_initialize.m'
};
for i = 1:numel(patterns)
    scripts = add_discovered_init_scripts(scripts, rootDir, patterns{i});
end

if ~isempty(scripts)
    fprintf('TCSD_PROJECT_INIT_SCRIPTS_AUTO=%s\n', strjoin(scripts, ';'));
end
end

function scripts = add_discovered_init_scripts(scripts, rootDir, pattern)
hits = dir(fullfile(rootDir, '**', pattern));
for i = 1:numel(hits)
    if hits(i).isdir
        continue;
    end
    scriptPath = fullfile(hits(i).folder, hits(i).name);
    if should_skip_init_script(scriptPath, rootDir)
        continue;
    end
    scripts = add_unique_script(scripts, relative_to_root(scriptPath, rootDir));
end
end

function skip = should_skip_init_script(scriptPath, rootDir)
skip = false;
scriptDir = fileparts(scriptPath);
if should_skip_project_path(scriptDir, rootDir)
    skip = true;
    return;
end
[~, name, ext] = fileparts(scriptPath);
excludedNames = {
    'setup_ut_support.m'
    'simulate_tcsd_cases.m'
    'configure_tcsd_sim_config.m'
    'cast_input_for_simulink_ut.m'
};
if any(strcmpi([name ext], excludedNames))
    skip = true;
end
end

function relPath = relative_to_root(filePath, rootDir)
rootPrefix = [rootDir filesep];
if strncmp(filePath, rootPrefix, length(rootPrefix))
    relPath = filePath(length(rootPrefix) + 1:end);
else
    relPath = filePath;
end
end

function scripts = add_unique_script(scripts, scriptPath)
if isempty(scriptPath)
    return;
end
if ~any(strcmpi(scripts, scriptPath))
    scripts{end + 1} = scriptPath;
end
end

function scripts = normalize_init_scripts(initScripts)
if ischar(initScripts)
    scripts = split_init_script_list(initScripts);
elseif isstring(initScripts)
    scripts = cellstr(initScripts);
elseif iscell(initScripts)
    scripts = initScripts;
else
    scripts = {};
end
end

function scripts = split_init_script_list(value)
if isempty(value)
    scripts = {};
    return;
end
rawParts = regexp(char(value), '[;,]', 'split');
scripts = {};
for i = 1:numel(rawParts)
    item = strtrim(rawParts{i});
    if ~isempty(item)
        scripts{end + 1} = item; %#ok<AGROW>
    end
end
end

function tf = is_absolute_path(filePath)
tf = strncmp(filePath, filesep, 1) || ...
    strncmp(filePath, '\\', 2) || ...
    ~isempty(regexp(filePath, '^[A-Za-z]:[\\/]', 'once'));
end

function escaped = escape_matlab_string(value)
escaped = strrep(value, '''', '''''');
end

function restore_matlab_mcp_core_path()
homeDir = getenv('HOME');
if isempty(homeDir)
    homeDir = getenv('USERPROFILE');
end

candidates = {};
explicitRoot = getenv('MATLAB_MCP_CORE_ROOT');
if ~isempty(explicitRoot)
    candidates{end + 1} = explicitRoot;
end
if ~isempty(homeDir)
    candidates{end + 1} = fullfile(homeDir, 'Library', 'Application Support', 'MathWorks', ...
        'MATLAB Add-Ons', 'Toolboxes', 'MATLAB MCP Core Server Toolbox');
    candidates{end + 1} = fullfile(homeDir, 'Documents', 'MATLAB', 'Add-Ons', ...
        'Toolboxes', 'MATLAB MCP Core Server Toolbox');
end

for i = 1:numel(candidates)
    coreRoot = candidates{i};
    if exist(fullfile(coreRoot, '+matlab_mcp'), 'dir')
        addpath(coreRoot);
        return;
    end
end
end

function restore_satk_tools_path()
candidates = {};

explicitRoot = getenv('SATK_SIMULINK_ROOT');
if ~isempty(explicitRoot)
    candidates{end + 1} = explicitRoot;
end

extensionFile = getenv('SATK_MCP_EXTENSION');
if ~isempty(extensionFile)
    toolsDir = fileparts(extensionFile);
    if ~isempty(toolsDir)
        candidates{end + 1} = fileparts(toolsDir);
    end
end

homeDir = getenv('HOME');
if isempty(homeDir)
    homeDir = getenv('USERPROFILE');
end
if ~isempty(homeDir)
    candidates{end + 1} = fullfile(homeDir, '.matlab', 'agentic-toolkits', 'simulink');
end

for i = 1:numel(candidates)
    satkRoot = candidates{i};
    toolsDir = fullfile(satkRoot, 'tools');
    if exist(toolsDir, 'dir')
        addpath(satkRoot);
        addpath(genpath(toolsDir));
        if exist('model_read', 'file') && exist('model_overview', 'file')
            return;
        end
    end
end

warning('setup_ut_support:SATKPathMissing', ...
    ['Simulink Agentic Toolkit tools were not found after restoredefaultpath. ', ...
     'Direct MCP calls such as model_read/model_overview may fail until the SATK tools folder is added to the MATLAB path.']);
end
