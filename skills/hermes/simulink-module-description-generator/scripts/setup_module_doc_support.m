function setup_module_doc_support(rootDir, initScripts, resetPath)
%SETUP_MODULE_DOC_SUPPORT Prepare MATLAB paths and project init for model docs.
if nargin < 1 || isempty(rootDir)
    rootDir = pwd;
end
if nargin < 2
    initScripts = {};
end
if nargin < 3 || isempty(resetPath)
    resetPath = is_truthy(getenv('MODULE_DOC_RESET_PATH'));
end

rootDir = char(rootDir);
originalDir = pwd;
cleanup = onCleanup(@() cd(originalDir)); %#ok<NASGU>
cd(rootDir);

if resetPath
    restoredefaultpath;
    rehash toolboxcache;
end

scriptDir = fileparts(mfilename('fullpath'));
restore_matlab_mcp_core_path();
restore_satk_tools_path();
add_workspace_support_paths(rootDir, scriptDir);
open_workspace_projects(rootDir);
run_project_init_scripts(rootDir, initScripts);
fprintf('MODULE_DOC_SUPPORT_READY=%s\n', rootDir);
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
excludedNames = {'.git', '.svn', 'outputs', 'output', 'slprj', '__pycache__', ...
    'node_modules', '.venv', 'venv'};
for i = 1:numel(parts)
    if any(strcmpi(parts{i}, excludedNames))
        skip = true;
        return;
    end
end
end

function open_workspace_projects(rootDir)
projectFiles = dir(fullfile(rootDir, '**', '*.prj'));
for i = 1:numel(projectFiles)
    if projectFiles(i).isdir
        continue;
    end
    projectPath = fullfile(projectFiles(i).folder, projectFiles(i).name);
    if should_skip_project_path(projectFiles(i).folder, rootDir)
        continue;
    end
    try
        if exist('openProject', 'file') == 2 || exist('openProject', 'builtin') == 5
            openProject(projectPath);
        end
    catch ME
        warning('setup_module_doc_support:ProjectOpenFailed', ...
            'Could not open project %s: %s', projectPath, ME.message);
    end
end
end

function run_project_init_scripts(rootDir, initScripts)
scripts = normalize_init_scripts(initScripts);
if isempty(scripts)
    scripts = split_init_script_list(getenv('MODULE_DOC_PROJECT_INIT_SCRIPTS'));
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
        runnable = sanitize_init_script_clear(candidate, rootDir);
        fprintf('MODULE_DOC_PROJECT_INIT=%s\n', runnable);
        evalin('base', sprintf('run(''%s'');', escape_matlab_string(runnable)));
    else
        warning('setup_module_doc_support:ProjectInitMissing', ...
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
    '*_dd.m'
    '*_DD.m'
};
for i = 1:numel(patterns)
    scripts = add_discovered_init_scripts(scripts, rootDir, patterns{i});
end

if ~isempty(scripts)
    fprintf('MODULE_DOC_PROJECT_INIT_SCRIPTS_AUTO=%s\n', strjoin(scripts, ';'));
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
    'setup_module_doc_support.m'
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
    scripts{end + 1} = scriptPath; %#ok<AGROW>
end
end

function runnable = sanitize_init_script_clear(candidate, rootDir)
runnable = candidate;
[~, ~, ext] = fileparts(candidate);
if ~strcmpi(ext, '.m')
    return;
end

try
    originalText = fileread(candidate);
catch ME
    warning('setup_module_doc_support:InitReadFailed', ...
        'Could not read init script %s before sanitizing clear commands: %s', ...
        candidate, ME.message);
    return;
end

[cleanText, removedCount] = remove_clear_command_lines(originalText);
if removedCount == 0
    return;
end

try
    if is_under_root(candidate, rootDir)
        write_text_file(candidate, cleanText);
        fprintf('MODULE_DOC_PROJECT_INIT_CLEAR_REMOVED=%s count=%d\n', candidate, removedCount);
    else
        runnable = write_sanitized_temp_copy(candidate, cleanText);
        fprintf('MODULE_DOC_PROJECT_INIT_CLEAR_REMOVED=%s sanitized=%s count=%d\n', ...
            candidate, runnable, removedCount);
    end
catch ME
    warning('setup_module_doc_support:InitSanitizeFailed', ...
        'Could not sanitize clear commands in init script %s: %s', ...
        candidate, ME.message);
    runnable = candidate;
end
end

function [cleanText, removedCount] = remove_clear_command_lines(originalText)
parts = regexp(originalText, '\r\n|\n|\r', 'split');
tokens = regexp(originalText, '\r\n|\n|\r', 'match');
cleanParts = {};
removedCount = 0;
for i = 1:numel(parts)
    line = parts{i};
    if is_clear_command_line(line)
        removedCount = removedCount + 1;
        continue;
    end
    cleanParts{end + 1} = line; %#ok<AGROW>
end

if isempty(cleanParts)
    cleanText = '';
    return;
end

newlineText = newline;
cleanText = cleanParts{1};
for i = 2:numel(cleanParts)
    tokenIdx = min(i - 1, numel(tokens));
    if tokenIdx >= 1
        newlineText = tokens{tokenIdx};
    end
    cleanText = [cleanText newlineText cleanParts{i}]; %#ok<AGROW>
end
if ~isempty(tokens) && numel(tokens) >= numel(parts)
    cleanText = [cleanText tokens{end}];
end
end

function tf = is_clear_command_line(line)
trimmed = strtrim(line);
tf = false;
if isempty(trimmed) || startsWith(trimmed, '%')
    return;
end
tf = ~isempty(regexp(trimmed, '^clear(vars)?(\s|;|,|$|\().*$', 'once'));
end

function tf = is_under_root(filePath, rootDir)
rootDir = char(rootDir);
filePath = char(filePath);
rootWithSep = [rootDir filesep];
if ispc
    tf = strcmpi(filePath, rootDir) || strncmpi(filePath, rootWithSep, length(rootWithSep));
else
    tf = strcmp(filePath, rootDir) || strncmp(filePath, rootWithSep, length(rootWithSep));
end
end

function runnable = write_sanitized_temp_copy(candidate, cleanText)
sanitizedDir = fullfile(tempdir, 'module_doc_sanitized_init');
if exist(sanitizedDir, 'dir') ~= 7
    mkdir(sanitizedDir);
end
[~, name, ext] = fileparts(candidate);
runnable = fullfile(sanitizedDir, [name '_module_doc_sanitized' ext]);
write_text_file(runnable, cleanText);
end

function write_text_file(filePath, text)
fid = fopen(filePath, 'w', 'n', 'UTF-8');
if fid < 0
    error('setup_module_doc_support:WriteFailed', 'Could not write %s.', filePath);
end
cleanup = onCleanup(@() fclose(fid)); %#ok<NASGU>
fprintf(fid, '%s', text);
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

function tf = is_truthy(value)
tf = any(strcmpi(strtrim(char(value)), {'1', 'true', 'yes', 'on'}));
end

function restore_matlab_mcp_core_path()
homeDir = getenv('HOME');
if isempty(homeDir)
    homeDir = getenv('USERPROFILE');
end

candidates = {};
explicitRoot = getenv('MATLAB_MCP_CORE_ROOT');
if ~isempty(explicitRoot)
    candidates{end + 1} = explicitRoot; %#ok<AGROW>
end
if ~isempty(homeDir)
    candidates{end + 1} = fullfile(homeDir, 'Library', 'Application Support', 'MathWorks', ...
        'MATLAB Add-Ons', 'Toolboxes', 'MATLAB MCP Core Server Toolbox'); %#ok<AGROW>
    candidates{end + 1} = fullfile(homeDir, 'Documents', 'MATLAB', 'Add-Ons', ...
        'Toolboxes', 'MATLAB MCP Core Server Toolbox'); %#ok<AGROW>
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
    candidates{end + 1} = explicitRoot; %#ok<AGROW>
end

extensionFile = getenv('SATK_MCP_EXTENSION');
if ~isempty(extensionFile)
    toolsDir = fileparts(extensionFile);
    if ~isempty(toolsDir)
        candidates{end + 1} = fileparts(toolsDir); %#ok<AGROW>
    end
end

homeDir = getenv('HOME');
if isempty(homeDir)
    homeDir = getenv('USERPROFILE');
end
if ~isempty(homeDir)
    candidates{end + 1} = fullfile(homeDir, '.matlab', 'agentic-toolkits', 'simulink'); %#ok<AGROW>
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

warning('setup_module_doc_support:SATKPathMissing', ...
    ['Simulink Agentic Toolkit tools were not found. ', ...
     'Direct MCP calls such as model_read/model_overview may fail until the SATK tools folder is added to the MATLAB path.']);
end
