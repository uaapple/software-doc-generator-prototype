function setup_ut_support(rootDir)
cd(rootDir);
warning('off', 'all');
restoredefaultpath;
rehash toolboxcache;
scriptDir = fileparts(mfilename('fullpath'));
restore_matlab_mcp_core_path();
restore_satk_tools_path();
addpath(fullfile(rootDir, 'ITKCToolsV015', 'ModelingTools', '01_Csc'));
addpath(fullfile(rootDir, 'ITKCToolsV015', 'ModelingTools'));
addpath(fullfile(rootDir, 'ITKCToolsV015', 'GenLib'));
addpath(rootDir);
addpath(scriptDir);
if exist(fullfile(rootDir, 'init_Global.m'), 'file')
    evalin('base', sprintf('run(''%s'');', fullfile(rootDir, 'init_Global.m')));
end
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
