param(
  [string]$InstallDir = "C:\SoftwareDocWorker",
  [ValidateSet("Install", "Start", "Stop", "Restart", "Status")]
  [string]$Action = "Install",
  [switch]$RemoveLegacyTasks
)

$ErrorActionPreference = "Stop"

$workerServices = [ordered]@{
  SoftwareDocHermesAgent = @{
    Service = "hermes"
    Port = 3101
    Description = "Software document generator Hermes Agent worker"
  }
  SoftwareDocMatlabWorker = @{
    Service = "matlab"
    Port = 5100
    Description = "Software document generator MATLAB worker"
  }
}

function Quote-Arg {
  param([string]$Value)
  return '"' + ($Value -replace '"', '\"') + '"'
}

function Get-ServiceHostPath {
  $hostDir = Join-Path $InstallDir "runtime\service-host"
  New-Item -ItemType Directory -Force -Path $hostDir | Out-Null
  return Join-Path $hostDir "SoftwareDocWorkerServiceHost.exe"
}

function Ensure-ServiceHost {
  $hostExe = Get-ServiceHostPath
  $sourcePath = [IO.Path]::ChangeExtension($hostExe, ".cs")
  $source = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.ServiceProcess;
using System.Threading;

public sealed class SoftwareDocWorkerService : ServiceBase
{
    private readonly string _serviceName;
    private readonly string _workingDirectory;
    private readonly string _executable;
    private readonly string[] _arguments;
    private Process _process;
    private Thread _monitorThread;
    private bool _stopping;

    public SoftwareDocWorkerService(string serviceName, string workingDirectory, string executable, string[] arguments)
    {
        _serviceName = serviceName;
        _workingDirectory = workingDirectory;
        _executable = executable;
        _arguments = arguments;
        ServiceName = serviceName;
        CanStop = true;
        CanShutdown = true;
    }

    protected override void OnStart(string[] args)
    {
        _stopping = false;
        Directory.CreateDirectory(Path.Combine(_workingDirectory, "logs"));
        var startInfo = new ProcessStartInfo();
        startInfo.FileName = _executable;
        startInfo.Arguments = JoinArguments(_arguments);
        startInfo.WorkingDirectory = _workingDirectory;
        startInfo.UseShellExecute = false;
        startInfo.RedirectStandardOutput = true;
        startInfo.RedirectStandardError = true;
        startInfo.CreateNoWindow = true;

        _process = new Process();
        _process.StartInfo = startInfo;
        _process.EnableRaisingEvents = true;
        _process.OutputDataReceived += (sender, eventArgs) => WriteServiceLog(eventArgs.Data);
        _process.ErrorDataReceived += (sender, eventArgs) => WriteServiceLog(eventArgs.Data);
        _process.Start();
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();

        _monitorThread = new Thread(MonitorChild);
        _monitorThread.IsBackground = true;
        _monitorThread.Start();
    }

    protected override void OnStop()
    {
        _stopping = true;
        StopChildProcess();
    }

    protected override void OnShutdown()
    {
        _stopping = true;
        StopChildProcess();
    }

    private void MonitorChild()
    {
        try
        {
            if (_process == null)
            {
                return;
            }
            _process.WaitForExit();
            WriteServiceLog("Child process exited with code " + _process.ExitCode + ".");
            if (!_stopping)
            {
                Stop();
            }
        }
        catch (Exception ex)
        {
            WriteServiceLog("MonitorChild failed: " + ex);
            if (!_stopping)
            {
                Stop();
            }
        }
    }

    private void StopChildProcess()
    {
        try
        {
            if (_process == null || _process.HasExited)
            {
                return;
            }
            var taskkill = new ProcessStartInfo("taskkill.exe", "/PID " + _process.Id + " /T /F");
            taskkill.UseShellExecute = false;
            taskkill.CreateNoWindow = true;
            using (var killer = Process.Start(taskkill))
            {
                if (killer != null)
                {
                    killer.WaitForExit(15000);
                }
            }
        }
        catch (Exception ex)
        {
            WriteServiceLog("StopChildProcess failed: " + ex);
        }
    }

    private void WriteServiceLog(string line)
    {
        if (String.IsNullOrEmpty(line))
        {
            return;
        }
        try
        {
            var logPath = Path.Combine(_workingDirectory, "logs", _serviceName + "-service-host-" + DateTime.Now.ToString("yyyyMMdd") + ".log");
            File.AppendAllText(logPath, DateTime.Now.ToString("o") + " " + line + Environment.NewLine);
        }
        catch
        {
        }
    }

    private static string JoinArguments(string[] args)
    {
        return String.Join(" ", args.Select(Quote));
    }

    private static string Quote(string arg)
    {
        if (arg == null)
        {
            return "\"\"";
        }
        if (arg.Length > 0 && arg.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '"' }) < 0)
        {
            return arg;
        }
        return "\"" + arg.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }

    public static void Main(string[] args)
    {
        if (args.Length < 3)
        {
            Environment.Exit(2);
        }
        var serviceName = args[0];
        var workingDirectory = args[1];
        var executable = args[2];
        var processArgs = args.Skip(3).ToArray();
        var service = new SoftwareDocWorkerService(serviceName, workingDirectory, executable, processArgs);

        if (Environment.UserInteractive)
        {
            service.OnStart(new string[0]);
            Console.WriteLine(serviceName + " started in console mode. Press Enter to stop.");
            Console.ReadLine();
            service.OnStop();
            return;
        }

        ServiceBase.Run(service);
    }
}
'@

  if (Test-Path -LiteralPath $hostExe) {
    return $hostExe
  }

  Set-Content -LiteralPath $sourcePath -Value $source -Encoding UTF8
  Add-Type `
    -TypeDefinition $source `
    -ReferencedAssemblies @("System.ServiceProcess.dll") `
    -OutputAssembly $hostExe `
    -OutputType WindowsApplication
  return $hostExe
}

function Get-WorkerServiceBinaryPath {
  param(
    [string]$Name,
    [string]$WorkerService
  )
  $hostExe = Ensure-ServiceHost
  $runner = Join-Path $InstallDir "app\scripts\run-windows-worker-service.ps1"
  if (-not (Test-Path -LiteralPath $runner)) {
    throw "Worker runner not found: $runner"
  }
  $arguments = @(
    (Quote-Arg $hostExe),
    (Quote-Arg $Name),
    (Quote-Arg $InstallDir),
    "powershell.exe",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Quote-Arg $runner),
    "-Service",
    $WorkerService,
    "-InstallDir",
    (Quote-Arg $InstallDir)
  )
  return ($arguments -join " ")
}

function Stop-LegacyTask {
  param([string]$Name)
  $task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if (-not $task) {
    return
  }
  if ($task.State -eq "Running") {
    Write-Host "Stopping legacy scheduled task $Name..."
    Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  }
  if ($RemoveLegacyTasks) {
    Write-Host "Disabling legacy scheduled task $Name..."
    Disable-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue | Out-Null
  }
}

function Install-WorkerService {
  param(
    [string]$Name,
    [hashtable]$Definition
  )
  Stop-LegacyTask -Name $Name
  $binaryPath = Get-WorkerServiceBinaryPath -Name $Name -WorkerService $Definition.Service
  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if ($service) {
    Write-Host "Configuring Windows service $Name..."
    & sc.exe config $Name binPath= $binaryPath start= auto DisplayName= $Name | Out-Null
    & sc.exe description $Name $Definition.Description | Out-Null
  } else {
    Write-Host "Creating Windows service $Name..."
    New-Service `
      -Name $Name `
      -BinaryPathName $binaryPath `
      -DisplayName $Name `
      -Description $Definition.Description `
      -StartupType Automatic | Out-Null
  }
  & sc.exe failure $Name reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
  & sc.exe failureflag $Name 1 | Out-Null
}

function Stop-WorkerService {
  param([string]$Name)
  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $service) {
    Stop-LegacyTask -Name $Name
    return
  }
  if ($service.Status -ne "Stopped") {
    Write-Host "Stopping Windows service $Name..."
    Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
    $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
  }
}

function Start-WorkerService {
  param([string]$Name)
  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $service) {
    throw "Windows service not found: $Name"
  }
  if ($service.Status -ne "Running") {
    Write-Host "Starting Windows service $Name..."
    Start-Service -Name $Name
    $service.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
  }
}

foreach ($entry in $workerServices.GetEnumerator()) {
  $name = [string]$entry.Key
  $definition = [hashtable]$entry.Value
  switch ($Action) {
    "Install" {
      Stop-WorkerService -Name $name
      Install-WorkerService -Name $name -Definition $definition
      Start-WorkerService -Name $name
    }
    "Start" {
      Start-WorkerService -Name $name
    }
    "Stop" {
      Stop-WorkerService -Name $name
    }
    "Restart" {
      Stop-WorkerService -Name $name
      Start-WorkerService -Name $name
    }
    "Status" {
      Get-Service -Name $name -ErrorAction SilentlyContinue |
        Select-Object Name, Status, StartType, ServiceType
    }
  }
}
