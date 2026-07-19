# Local HTTP bridge for confirming the Windows print dialog from the Web app.
# Listens on 127.0.0.1 only and is not exposed to the LAN.
param([int]$Port = 39217)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

function Send-CorsHeaders([System.Net.HttpListenerResponse]$res) {
  $res.Headers.Add('Access-Control-Allow-Origin', '*')
  $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
}

function Write-JsonResponse([System.Net.HttpListenerResponse]$res, [int]$code, $obj) {
  Send-CorsHeaders $res
  $res.StatusCode = $code
  $res.ContentType = 'application/json; charset=utf-8'
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress))
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.Close()
}

function Invoke-ConfirmPrint([hashtable]$opts) {
  $delayMs = 600
  if ($opts.delayMs) { $delayMs = [int]$opts.delayMs }
  $useClick = ($opts.clickX -ge 0 -and $opts.clickY -ge 0)
  Start-Sleep -Milliseconds $delayMs
  if ($useClick) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
  public const int LEFTDOWN = 0x02; public const int LEFTUP = 0x04;
  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    mouse_event(LEFTDOWN, 0, 0, 0, 0); mouse_event(LEFTUP, 0, 0, 0, 0);
  }
}
"@
    [MouseOps]::Click([int]$opts.clickX, [int]$opts.clickY)
  } else {
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  }
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "tapePrinter local print helper started: $prefix"
Write-Host "Keep this window open. Press Ctrl+C to stop."

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  $path = $req.Url.LocalPath.TrimEnd('/')
  if ([string]::IsNullOrEmpty($path)) { $path = '/' }

  try {
    if ($req.HttpMethod -eq 'OPTIONS') {
      Send-CorsHeaders $res
      $res.StatusCode = 204
      $res.Close()
      continue
    }

    if ($path -eq '/health' -and $req.HttpMethod -eq 'GET') {
      Write-JsonResponse $res 200 @{ ok = $true; service = 'tapePrinter-print-bridge'; port = $Port }
      continue
    }

    if ($path -eq '/confirm' -and $req.HttpMethod -eq 'POST') {
      $body = '{}'
      if ($req.HasEntityBody) {
        $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
        $body = $reader.ReadToEnd()
        $reader.Close()
      }
      $opts = @{}
      if ($body) {
        $parsed = $body | ConvertFrom-Json
        if ($parsed.delayMs) { $opts.delayMs = $parsed.delayMs }
        if ($null -ne $parsed.clickX) { $opts.clickX = $parsed.clickX }
        if ($null -ne $parsed.clickY) { $opts.clickY = $parsed.clickY }
      }
      Invoke-ConfirmPrint $opts
      Write-JsonResponse $res 200 @{ ok = $true }
      continue
    }

    Write-JsonResponse $res 404 @{ ok = $false; error = 'not_found' }
  } catch {
    Write-JsonResponse $res 500 @{ ok = $false; error = $_.Exception.Message }
  }
}
