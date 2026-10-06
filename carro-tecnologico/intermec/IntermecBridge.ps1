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
    $bg = if ($Ok) { '#dff5e8' } else { '#fde4e4' }

    $tpl = @'
<html>
<head>
<title>Intermec USB</title>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta http-equiv="IBrowse_Scanner" content="AutoEnter">
</head>
<body bgcolor="#e9edf2" onload="try{document.getElementById('code').focus();}catch(e){}">
<center>
<table width="95%" border="1" cellpadding="8" cellspacing="0" bgcolor="#ffffff">
<tr><td bgcolor="#172033"><font color="#ffffff" size="4"><b>CARRO TECNOLOGICO - INTERMEC USB</b></font></td></tr>
<tr><td>
<center><font size="5"><b>ESCANEAR QR</b></font></center>
<form method="get" action="/scan">
<input id="code" name="code" type="text" size="24" style="font-size:22px">
<input type="submit" value="ENVIAR">
</form>
<table width="100%" border="0" cellpadding="6" cellspacing="0"><tr><td bgcolor="__BG__">__MSG__</td></tr></table>
<p><font size="2">Apunta al QR y apreta el gatillo. Si el lector agrega Enter al final, se envia solo. Si no, toca ENVIAR.</font></p>
</td></tr>
</table>
</center>
</body>
</html>
'@
    return $tpl.Replace('__MSG__', $msg).Replace('__BG__', $bg)
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
