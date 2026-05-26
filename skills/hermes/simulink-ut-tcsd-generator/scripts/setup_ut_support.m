function setup_ut_support(rootDir)
cd(rootDir);
warning('off', 'all');
restoredefaultpath;
rehash toolboxcache;
scriptDir = fileparts(mfilename('fullpath'));
addpath(fullfile(rootDir, 'ITKCToolsV015', 'ModelingTools', '01_Csc'));
addpath(fullfile(rootDir, 'ITKCToolsV015', 'ModelingTools'));
addpath(fullfile(rootDir, 'ITKCToolsV015', 'GenLib'));
addpath(rootDir);
addpath(scriptDir);
if exist(fullfile(rootDir, 'init_Global.m'), 'file')
    evalin('base', sprintf('run(''%s'');', fullfile(rootDir, 'init_Global.m')));
end
end
