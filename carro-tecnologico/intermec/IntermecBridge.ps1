param(
  [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'
$AppUrl = 'https://alertasapd.com.ar/carro-tecnologico/?intermec=1'
$FirewallName = 'Carro Tecnologico - Intermec USB'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Web
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CarroWin32 {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@

function Get-BrowserPath {
    $paths = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($p in $paths) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

function Get-CarroWindow {
    $all = @()
    $all += Get-Process chrome -ErrorAction SilentlyContinue
    $all += Get-Process msedge -ErrorAction SilentlyContinue
    return $all | Where-Object {
        $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like '*Carro Tecnol*'
    } | Select-Object -First 1
}

function Ensure-CarroWindow {
    $p = Get-CarroWindow
    if ($p) { return $p }

    $browser = Get-BrowserPath
    if (-not $browser) { return $null }

    Start-Process -FilePath $browser -ArgumentList "--app=`"$AppUrl`" --new-window"
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 250
        $p = Get-CarroWindow
        if ($p) { return $p }
    }
    return $null
}

function Send-ScanToCarro([string]$Code) {
    $Code = ($Code.Trim().ToUpper() -replace '\s+', '')
    if ($Code -notmatch '^[A-Z]{3}-[A-Z]-\d{2}$') {
        return @{ ok = $false; message = "Codigo no valido: $Code" }
    }

    $p = Ensure-CarroWindow
    if (-not $p) {
        return @{ ok = $false; message = 'No pude abrir/encontrar la ventana Carro Tecnologico en Chrome o Edge.' }
    }

    try {
        [CarroWin32]::ShowWindowAsync($p.MainWindowHandle, 9) | Out-Null
        $shell = New-Object -ComObject WScript.Shell
        $shell.AppActivate($p.Id) | Out-Null
        Start-Sleep -Milliseconds 120
        [CarroWin32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
        Start-Sleep -Milliseconds 120

        [System.Windows.Forms.SendKeys]::SendWait('{F9}')
        [System.Windows.Forms.SendKeys]::SendWait($Code)
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')

        return @{ ok = $true; message = "Enviado: $Code" }
    }
    catch {
        return @{ ok = $false; message = "Error enviando $Code : $($_.Exception.Message)" }
    }
}

function Escape-Html([string]$s) {
    if ($null -eq $s) { return '' }
    return [System.Web.HttpUtility]::HtmlEncode($s)
}

function Get-TerminalPage([string]$Message, [bool]$Ok) {
    $msg = Escape-Html $Message
    $cls = if ($Ok) { 'ok' } else { 'err' }

    $tpl = @'
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Intermec USB</title>
<style type="text/css">
body{margin:0;background:#e9edf2;font-family:Arial,sans-serif;color:#111}
.top{background:#172033;color:#fff;text-align:center;padding:10px;font-size:18px;font-weight:bold}
.box{background:#fff;border:1px solid #aaa;margin:8px;padding:10px}
.mode{text-align:center;font-size:22px;font-weight:bold;margin-bottom:8px}
input{width:94%;font-size:22px;padding:9px;text-align:center;text-transform:uppercase;border:3px solid #f2b705}
.ok{background:#dff5e8;border-left:6px solid #168557;padding:8px;margin-top:8px}
.err{background:#fde4e4;border-left:6px solid #b51f1f;padding:8px;margin-top:8px}
.note{font-size:12px;color:#444;line-height:1.35;margin-top:8px}
</style>
<script type="text/javascript">
var timer=null;
function norm(v){return String(v||'').replace(/^\s+|\s+$/g,'').toUpperCase().replace(/\s+/g,'');}
function keyDown(e){
  e=e||window.event;
  var k=e.keyCode||e.which;
  if(k==13){
    var c=norm(document.getElementById('code').value);
    if(c){document.getElementById('code').value=c;document.getElementById('frm').submit();}
    return false;
  }
  return true;
}
function keyUp(e){
  if(timer){clearTimeout(timer);}
  timer=setTimeout(function(){
    var c=norm(document.getElementById('code').value);
    if(/^ADM-[A-Z]-[0-9][0-9]$/.test(c)){
      document.getElementById('code').value=c;
      document.getElementById('frm').submit();
    }
  },220);
}
function init(){try{document.getElementById('code').focus();}catch(e){}}
</script>
</head>
<body onload="init()">
<div class="top">CARRO TECNOLOGICO - INTERMEC USB</div>
<div class="box">
<div class="mode">ESCANEAR QR</div>
<form id="frm" method="get" action="/scan">
<input id="code" name="code" type="text" value="" autocomplete="off" onkeydown="return keyDown(event)" onkeyup="keyUp(event)">
</form>
<div class="__CLS__">__MSG__</div>
<div class="note">Apunta al QR y apreta el gatillo. El codigo se envia al gestor abierto en la PC. Se usan los QR existentes (ej. ADM-A-01).</div>
</div>
</body>
</html>
'@
    return $tpl.Replace('__MSG__', $msg).Replace('__CLS__', $cls)
}

function Write-HttpResponse($Stream, [string]$Body, [int]$StatusCode = 200) {
    $statusText = if ($StatusCode -eq 200) { 'OK' } else { 'Bad Request' }
    $data = [System.Text.Encoding]::UTF8.GetBytes($Body)
    $header = "HTTP/1.1 $StatusCode $statusText`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($data.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $head = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($head, 0, $head.Length)
    $Stream.Write($data, 0, $data.Length)
    $Stream.Flush()
}

function Show-ConnectionUrls {
    Write-Host ''
    Write-Host '=== INTERMEC USB LISTO ===' -ForegroundColor Green
    Write-Host 'En el CK3X abri una de estas direcciones:' -ForegroundColor Cyan

    $shown = @{}
    try {
        $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
            $_.Status -eq 'Up' -and (
                $_.Name -match 'Mobile|RNDIS|Intermec|USB' -or
                $_.InterfaceDescription -match 'Mobile|RNDIS|Intermec|Remote'
            )
        }
        foreach ($a in $adapters) {
            $ips = Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.0.*' }
            foreach ($ip in $ips) {
                if (-not $shown.ContainsKey($ip.IPAddress)) {
                    Write-Host ("  http://{0}:{1}/" -f $ip.IPAddress, $Port) -ForegroundColor Yellow
                    $shown[$ip.IPAddress] = $true
                }
            }
        }

        if ($shown.Count -eq 0) {
            $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Where-Object { $_.IPAddress -notlike '127.*' }
            foreach ($ip in $ips) {
                if (-not $shown.ContainsKey($ip.IPAddress)) {
                    Write-Host ("  http://{0}:{1}/" -f $ip.IPAddress, $Port) -ForegroundColor Yellow
                    $shown[$ip.IPAddress] = $true
                }
            }
        }
    }
    catch {}

    if ($shown.Count -eq 0) {
        Write-Host "  No pude detectar una IPv4. Ejecuta ipconfig y usa la IPv4 del adaptador Windows Mobile/RNDIS con :$Port" -ForegroundColor Yellow
    }
    Write-Host ''
    Write-Host 'Deja esta ventana abierta mientras uses el Intermec.' -ForegroundColor Gray
    Write-Host 'El gestor se abre automaticamente en una ventana propia de Chrome/Edge.' -ForegroundColor Gray
    Write-Host ''
}

try {
    if (Get-Command Get-NetFirewallRule -ErrorAction SilentlyContinue) {
        $rule = Get-NetFirewallRule -DisplayName $FirewallName -ErrorAction SilentlyContinue
        if (-not $rule) {
            New-NetFirewallRule -DisplayName $FirewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any | Out-Null
        }
    }
}
catch {
    Write-Host 'No pude crear la regla de firewall automaticamente. Si el CK3X no abre la pagina, permiti PowerShell en Firewall de Windows.' -ForegroundColor Yellow
}

Ensure-CarroWindow | Out-Null

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$listener.Start()
Write-Host ("Servidor HTTP escuchando en 0.0.0.0:{0}" -f $Port) -ForegroundColor Green
Show-ConnectionUrls

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 2048, $true)
            $requestLine = $reader.ReadLine()
            if ($requestLine) { Write-Host ((Get-Date -Format 'HH:mm:ss') + '  ' + $requestLine) -ForegroundColor DarkGray }

            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                Write-HttpResponse $stream (Get-TerminalPage 'Esperando QR.' $true)
                continue
            }

            while ($true) {
                $line = $reader.ReadLine()
                if ($null -eq $line -or $line -eq '') { break }
            }

            $parts = $requestLine -split ' '
            $target = if ($parts.Length -ge 2) { $parts[1] } else { '/' }
            $uri = [System.Uri]::new("http://localhost$target")

            if ($uri.AbsolutePath -eq '/scan') {
                $q = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
                $code = [string]$q['code']
                $result = Send-ScanToCarro $code
                Write-Host ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $result.message)
                Write-HttpResponse $stream (Get-TerminalPage $result.message ([bool]$result.ok))
            }
            else {
                Write-HttpResponse $stream (Get-TerminalPage 'Puente conectado. Esperando QR.' $true)
            }
        }
        catch {
            try { Write-HttpResponse $stream (Get-TerminalPage $_.Exception.Message $false) 400 } catch {}
        }
        finally {
            try { $client.Close() } catch {}
        }
    }
}
finally {
    $listener.Stop()
}
