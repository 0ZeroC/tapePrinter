param(
  [switch]$Watch,
  [int]$DelayMs = 600,
  [string]$TitleHint = "",
  [int]$ClickX = -1,
  [int]$ClickY = -1,
  [int]$PollMs = 250
)

$UseClick = ($ClickX -ge 0 -and $ClickY -ge 0)

Add-Type -AssemblyName System.Windows.Forms

function Test-PrintDialogOpen([string]$hint) {
  $found = $false
  Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Enum {
  public static bool ExistsTitle(string part) {
    bool hit = false;
    EnumWindows((hWnd, lParam) => {
      var sb = new StringBuilder(512);
      GetWindowText(hWnd, sb, 512);
      var t = sb.ToString();
      if (!string.IsNullOrEmpty(t) && t.IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0) {
        if (t.IndexOf("\u6253\u5370", StringComparison.OrdinalIgnoreCase) >= 0
            || t.IndexOf("Print", StringComparison.OrdinalIgnoreCase) >= 0
            || t.IndexOf("Microsoft", StringComparison.OrdinalIgnoreCase) >= 0) {
          hit = true;
          return false;
        }
      }
      return true;
    }, IntPtr.Zero);
    return hit;
  }
  [DllImport("user32.dll")] public static extern int EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
  return [Win32Enum]::ExistsTitle($hint)
}

function Confirm-PrintDialog {
  Start-Sleep -Milliseconds $DelayMs
  if ($UseClick) {
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
    [MouseOps]::Click($ClickX, $ClickY)
  } else {
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  }
}

if ($Watch) {
  Write-Host "Print helper started in Watch mode. Press Ctrl+C to stop."
  $armed = $false
  while ($true) {
    if (Test-PrintDialogOpen $TitleHint) {
      if (-not $armed) {
        $armed = $true
        Confirm-PrintDialog
        Start-Sleep -Milliseconds 800
        $armed = $false
      }
    }
    Start-Sleep -Milliseconds $PollMs
  }
} else {
  Write-Host "Single mode: confirming after ${DelayMs}ms..."
  Start-Sleep -Milliseconds $DelayMs
  Confirm-PrintDialog
  Write-Host "Done."
}
