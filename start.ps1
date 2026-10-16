param(
    [ValidateRange(1, 65535)]
    [int]$Port
)

$ErrorActionPreference = 'Stop'
$projectPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $projectPython)) {
    Write-Error 'Set up first: python -m venv .venv, then .\.venv\Scripts\python.exe -m pip install -r requirements.txt'
}
$previousPort = $env:PORT
$previousMySQLConfig = $env:MYSQL_CONFIG
try {
    if ($PSBoundParameters.ContainsKey('Port')) {
        $env:PORT = $Port.ToString()
    }
    if (-not $env:MYSQL_CONFIG) {
        $windowsProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
        $savedConfig = Join-Path $windowsProfile 'AppData\Local\HotelCalifornia\mysql\hotel-client.json'
        if (Test-Path -LiteralPath $savedConfig -PathType Leaf) {
            $env:MYSQL_CONFIG = $savedConfig
        } else {
            Write-Error "MySQL connection file is missing at $savedConfig. Set MYSQL_CONFIG to the private hotel-client.json path, then retry."
        }
    }
    & $projectPython (Join-Path $PSScriptRoot 'app.py')
    $serverExitCode = $LASTEXITCODE
} finally {
    $env:PORT = $previousPort
    $env:MYSQL_CONFIG = $previousMySQLConfig
}
exit $serverExitCode
