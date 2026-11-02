# APDocentePBA — respaldo privado previo a la migracion de historico diario.
# NO aplica migraciones, NO envia datos a GitHub, NO habilita capturas.
# Supabase CLI + Docker requeridos solo para exportacion real.
[CmdletBinding(DefaultParameterSetName='Backup')]
param(
    [Parameter(ParameterSetName='Backup')]
    [ValidatePattern('^[a-z0-9]{20}$')]
    [string]$ProjectRef = 'vvgkinkvojqwfuqaxijh',

    [Parameter(ParameterSetName='Backup')]
    [string]$DestinationRoot = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'APDocentePBA\Respaldos'),

    [Parameter(ParameterSetName='Backup')]
    [switch]$CheckOnly,

    [Parameter(Mandatory=$true, ParameterSetName='Verify')]
    [string]$VerifyPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Command([string]$Name) {
    if (-not (Get-Command -Name $Name -ErrorAction SilentlyContinue)) {
        throw "Falta '$Name'. Es necesario instalarlo desde su fuente oficial."
    }
}
function Assert-Exit([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo '$Step' (codigo $LASTEXITCODE). El respaldo NO es valido."
    }
}
function Get-BackupFiles([string]$Folder) {
    $result = @()
    foreach ($file in @('roles.sql', 'schema.sql', 'data.sql')) {
        $path = Join-Path $Folder $file
        $item = Get-Item -LiteralPath $path -ErrorAction Stop
        if (-not $item -or $item.PSIsContainer -or $item.Length -le 0) {
            throw "Archivo ausente o vacio: $file"
        }
        $hash = Get-FileHash -LiteralPath $path -Algorithm SHA256 -ErrorAction Stop
        $result += [pscustomobject]@{
            file = $file
            bytes = [long]$item.Length
            sha256 = $hash.Hash.ToLowerInvariant()
        }
    }
    return $result
}
function Verify-Backup([string]$Folder) {
    $folderAbs = (Resolve-Path -LiteralPath $Folder -ErrorAction Stop).Path
    $manifestPath = Join-Path $folderAbs 'manifest.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json
    if ($manifest.status -ne 'export_created_unrestored') {
        throw 'Manifest sin estado de exportacion terminada; NO es un respaldo valido.'
    }
    if ($manifest.project_ref -ne 'vvgkinkvojqwfuqaxijh') {
        throw 'El proyecto del manifiesto NO es APDocentePBA.'
    }
    $actual = @(Get-BackupFiles -Folder $folderAbs)
    foreach ($entry in $actual) {
        $expected = @($manifest.files | Where-Object { $_.file -eq $entry.file })
        if ($expected.Count -ne 1 -or
            [long]$expected[0].bytes -ne $entry.bytes -or
            [string]$expected[0].sha256 -ne $entry.sha256) {
            throw "Integridad incorrecta para $($entry.file). NO utilizar."
        }
    }
    if (@($manifest.files).Count -ne 3) {
        throw 'Manifest incompleto o archivos inesperados.'
    }
    Write-Host 'INTEGRIDAD DE EXPORTACION OK: 3/3 archivos y SHA-256 correctos.' -ForegroundColor Green
    Write-Warning 'No se probo restauracion; este chequeo NO declara respaldo recuperable.'
}

if ($PSCmdlet.ParameterSetName -eq 'Verify') {
    try { Verify-Backup -Folder $VerifyPath; exit 0 }
    catch { Write-Host "VERIFICACION FALLIDA: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
}

$dest = $null
try {
    Require-Command 'supabase'
    Require-Command 'docker'
    & supabase --version | Out-Null
    Assert-Exit 'Supabase CLI disponible'
    & docker info --format '{{.ServerVersion}}' | Out-Null
    Assert-Exit 'Docker activo'

    if ($CheckOnly) {
        Write-Host 'REQUISITOS OK. No se exportaron datos ni se modifico produccion.' -ForegroundColor Green
        exit 0
    }

    if ($ProjectRef -ne 'vvgkinkvojqwfuqaxijh') {
        throw 'Proyecto inesperado: solo se permite APDocentePBA.'
    }
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd_HHmmss')
    $dest = Join-Path $DestinationRoot "APD_pre_historico_$stamp"
    if (Test-Path -LiteralPath $dest) {
        throw 'Ya existe un respaldo con este identificador. No sobrescribir.'
    }
    $work = Join-Path $dest 'workspace_temporal_cli'
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $dest 'EXPORTACION_INCOMPLETA.txt') -Value 'No utilizar como respaldo hasta generar y verificar manifest.json.' -Encoding UTF8
    $roles = Join-Path $dest 'roles.sql'
    $schema = Join-Path $dest 'schema.sql'
    $data = Join-Path $dest 'data.sql'

    Write-Warning 'Los datos se exportan en SQL SIN CIFRAR. Guardalos de forma privada/cifrada y nunca los subas al chat o GitHub.'
    Write-Host "Proyecto fijo: $ProjectRef. Carpeta local: $dest"

    Push-Location $work
    try {
        & supabase init
        Assert-Exit 'supabase init'
        & supabase link --project-ref $ProjectRef
        Assert-Exit 'supabase link'
        & supabase db dump --file $roles --role-only
        Assert-Exit 'exportacion de roles'
        & supabase db dump --file $schema
        Assert-Exit 'exportacion de esquema'
        & supabase db dump --file $data --data-only --use-copy
        Assert-Exit 'exportacion de datos'
    } finally {
        Pop-Location
        # Eliminar el proyecto temporal vinculado; los dumps quedan fuera de el.
        if (Test-Path -LiteralPath $work) {
            Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    $files = @(Get-BackupFiles -Folder $dest)
    $manifest = [pscustomobject]@{
        project_ref = $ProjectRef
        generated_utc = (Get-Date).ToUniversalTime().ToString('o')
        files = $files
        status = 'export_created_unrestored'
        backup_restoration_verified = $false
        warning = 'Contiene datos privados. No subir a terceros. Falta restauracion de prueba antes de migrar.'
    }
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $dest 'manifest.json') -Encoding UTF8
    Verify-Backup -Folder $dest
    Remove-Item -LiteralPath (Join-Path $dest 'EXPORTACION_INCOMPLETA.txt') -ErrorAction Stop
    Write-Host "EXPORTACION COMPLETADA EN: $dest" -ForegroundColor Green
    Write-Warning 'Proximo paso: restaurar en una base aislada y comprobar integridad. No migrar todavia.'
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($dest) {
        Write-Warning "Si existe la carpeta $dest, puede contener datos privados y/o archivos incompletos. No considerarla respaldo valido."
    }
    exit 1
}
