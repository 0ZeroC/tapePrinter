import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface AutoConfirmPrintOptions {
  /** 弹出打印框后等待多久再确认（毫秒） */
  delayMs?: number
  /** 优先用 Enter；为 false 时必须提供 clickX/clickY */
  useEnter?: boolean
  clickX?: number
  clickY?: number
  /** 尝试将焦点切到含此文字的窗口（如「打印」「Print」） */
  windowTitleContains?: string
}

const DEFAULT_DELAY_MS = 600
const DEFAULT_TITLE_HINT = '打印'

async function runPowerShell(script: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('当前平台不支持 PowerShell 键鼠模拟')
  }
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 15000 }
  )
}

async function focusWindowByTitle(titleContains: string): Promise<void> {
  const escaped = titleContains.replace(/'/g, "''")
  if (process.platform === 'win32') {
    const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Focus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  public static void FocusByTitle(string part) {
    EnumWindows((hWnd, lParam) => {
      var sb = new StringBuilder(512);
      GetWindowText(hWnd, sb, 512);
      var t = sb.ToString();
      if (t.IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0) {
        SetForegroundWindow(hWnd);
      }
      return true;
    }, IntPtr.Zero);
  }
}
"@
[Win32Focus]::FocusByTitle('${escaped}')
`
    await runPowerShell(ps)
    return
  }
  if (process.platform === 'darwin') {
    const escapedApple = titleContains.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await execFileAsync('osascript', [
      '-e',
      `tell application "System Events"
  repeat with p in (every process whose background only is false)
    try
      repeat with w in (every window of p)
        if (name of w as text) contains "${escapedApple}" then
          set frontmost of p to true
          perform action "AXRaise" of w
          exit repeat
        end if
      end repeat
    end try
  end repeat
end tell`
    ])
  }
}

async function pressEnter(): Promise<void> {
  if (process.platform === 'win32') {
    await runPowerShell(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
`)
    return
  }
  if (process.platform === 'darwin') {
    await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to key code 36'
    ])
  }
}

async function mouseClick(x: number, y: number): Promise<void> {
  if (process.platform === 'win32') {
    await runPowerShell(`
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
[MouseOps]::Click(${x}, ${y})
`)
    return
  }
  if (process.platform === 'darwin') {
    await execFileAsync('osascript', [
      '-e',
      `tell application "System Events" to click at {${x}, ${y}}`
    ])
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 在系统打印对话框弹出后自动点「打印/确定」（勿在打印过程中操作鼠标） */
export async function autoConfirmPrintDialog(
  options: AutoConfirmPrintOptions = {}
): Promise<{ ok: boolean; message?: string }> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return { ok: false, message: '仅支持 Windows 与 macOS' }
  }

  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS
  const useEnter = options.useEnter !== false
  const titleHint = options.windowTitleContains?.trim() || DEFAULT_TITLE_HINT

  await delay(delayMs)

  try {
    await focusWindowByTitle(titleHint)
    await delay(120)
  } catch {
    // 聚焦失败仍尝试按键，部分浏览器对话框已是前台
  }

  try {
    if (useEnter) {
      await pressEnter()
    } else if (
      typeof options.clickX === 'number' &&
      typeof options.clickY === 'number' &&
      !Number.isNaN(options.clickX) &&
      !Number.isNaN(options.clickY)
    ) {
      await mouseClick(Math.round(options.clickX), Math.round(options.clickY))
    } else {
      return { ok: false, message: '未配置 Enter 或点击坐标' }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}
