function test_setup_ut_support()
oldDir = pwd;
oldPath = path;
oldEnv = getenv('TCSD_PROJECT_INIT_SCRIPTS');
oldMcpSessionDir = getenv('MW_MCP_SESSION_DIR');
testRoot = tempname;
mkdir(testRoot);
sessionRoot = tempname;
mkdir(fullfile(sessionRoot, '+matlab_mcp'));
cleanupObj = onCleanup(@() cleanup_test( ...
    testRoot, sessionRoot, oldDir, oldPath, oldEnv, oldMcpSessionDir));

write_script(fullfile(testRoot, 'init_Global.m'), 'formal');
setenv('MW_MCP_SESSION_DIR', sessionRoot);
backupScripts = {
    'init_Global_backup_20260601_155532.m'
    'init_Global.backup-20260601-155532.m'
    'init_Global.bak.m'
    'init_Global.copy.m'
    'init_Global.old.m'
    'init_Global.orig.m'
    'init_Global.tmp.m'
    'init_Global.temp.m'
    'init_Global.autosave.m'
    'init_Global.备份.m'
    'init_Global.副本.m'
    'init_Global.~draft.m'
};
for i = 1:numel(backupScripts)
    write_script(fullfile(testRoot, backupScripts{i}), ['excluded_' num2str(i)]);
end
write_script(fullfile(testRoot, 'TMS_dd.m'), 'model');
setenv('TCSD_PROJECT_INIT_SCRIPTS', 'TMS_dd.m');

repoRoot = fileparts(fileparts(fileparts(mfilename('fullpath'))));
scriptsDir = fullfile(repoRoot, 'skills', 'hermes', 'tcsd-runtime', 'scripts');
addpath(scriptsDir);
evalin('base', 'clear TCSD_INIT_ORDER');
setup_ut_support(testRoot, {});

order = evalin('base', 'TCSD_INIT_ORDER');
assert(isequal(order, {'formal', 'model'}), ...
    'Expected formal init_Global.m and no automatically discovered backup scripts.');
assert(any(strcmp(strsplit(path, pathsep), sessionRoot)), ...
    'Expected MW_MCP_SESSION_DIR to be restored after restoredefaultpath.');
assert(exist(fullfile(sessionRoot, '+matlab_mcp'), 'dir') == 7, ...
    'Expected the restored MCP session path to contain +matlab_mcp.');

evalin('base', 'clear TCSD_INIT_ORDER');
setup_ut_support(testRoot, backupScripts(1));
order = evalin('base', 'TCSD_INIT_ORDER');
assert(isequal(order, {'formal', 'model', 'excluded_1'}), ...
    'Expected an explicitly requested backup script to override auto-discovery filtering.');

clear cleanupObj;
cleanup_test(testRoot, sessionRoot, oldDir, oldPath, oldEnv, oldMcpSessionDir);
end

function write_script(filePath, label)
fid = fopen(filePath, 'w');
assert(fid >= 0, 'Unable to create test init script: %s', filePath);
fprintf(fid, 'if ~exist(''TCSD_INIT_ORDER'', ''var''), TCSD_INIT_ORDER = {}; end\n');
fprintf(fid, 'TCSD_INIT_ORDER{end + 1} = ''%s'';\n', label);
fclose(fid);
end

function cleanup_test(testRoot, sessionRoot, oldDir, oldPath, oldEnv, oldMcpSessionDir)
evalin('base', 'clear TCSD_INIT_ORDER');
setenv('TCSD_PROJECT_INIT_SCRIPTS', oldEnv);
setenv('MW_MCP_SESSION_DIR', oldMcpSessionDir);
cd(oldDir);
path(oldPath);
if exist(testRoot, 'dir')
    rmdir(testRoot, 's');
end
if exist(sessionRoot, 'dir')
    rmdir(sessionRoot, 's');
end
end
