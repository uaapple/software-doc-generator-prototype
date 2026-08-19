function test_setup_ut_support()
oldDir = pwd;
oldPath = path;
oldEnv = getenv('TCSD_PROJECT_INIT_SCRIPTS');
testRoot = tempname;
mkdir(testRoot);
cleanupObj = onCleanup(@() cleanup_test(testRoot, oldDir, oldPath, oldEnv));

write_script(fullfile(testRoot, 'Global_HMATC.m'), 'global');
write_script(fullfile(testRoot, 'TMS_dd.m'), 'model');
setenv('TCSD_PROJECT_INIT_SCRIPTS', 'Global_HMATC.m;TMS_dd.m');

repoRoot = fileparts(fileparts(fileparts(mfilename('fullpath'))));
scriptsDir = fullfile(repoRoot, 'skills', 'hermes', 'tcsd-runtime', 'scripts');
addpath(scriptsDir);
evalin('base', 'clear TCSD_INIT_ORDER');
setup_ut_support(testRoot, {'TMS_dd.m'});

order = evalin('base', 'TCSD_INIT_ORDER');
assert(isequal(order, {'global', 'model'}), ...
    'Expected auto-discovered Global_*.m before model init, with duplicates removed.');

clear cleanupObj;
cleanup_test(testRoot, oldDir, oldPath, oldEnv);
end

function write_script(filePath, label)
fid = fopen(filePath, 'w');
assert(fid >= 0, 'Unable to create test init script: %s', filePath);
fprintf(fid, 'if ~exist(''TCSD_INIT_ORDER'', ''var''), TCSD_INIT_ORDER = {}; end\n');
fprintf(fid, 'TCSD_INIT_ORDER{end + 1} = ''%s'';\n', label);
fclose(fid);
end

function cleanup_test(testRoot, oldDir, oldPath, oldEnv)
evalin('base', 'clear TCSD_INIT_ORDER');
setenv('TCSD_PROJECT_INIT_SCRIPTS', oldEnv);
cd(oldDir);
path(oldPath);
if exist(testRoot, 'dir')
    rmdir(testRoot, 's');
end
end
