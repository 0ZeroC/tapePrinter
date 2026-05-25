import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { BrowserWindow } from 'electron'
import {
  buildMacroVariables,
  substituteMacroText,
  type MacroAction,
  type MacroBatchItem,
  type MacroBatchResult,
  type MacroScript,
  type MacroVariableKey
} from '../common/macroTypes'

const execFileAsync = promisify(execFile)

let abortRequested = false

export function requestMacroAbort(): void {
  abortRequested = true
}

export function resetMacroAbort(): void {
  abortRequested = false
}

function scaleCoord(value: number | undefined, scale: number): number {
  if (value === undefined || Number.isNaN(value)) return 0
  return Math.round(value * scale)
}

async function runPowerShell(script: string): Promise<void> {
  if (process.platform === 'win32') {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 30000 }
    )
    return
  }
  throw new Error('当前平台不支持宏键鼠模拟（仅 Windows 完整支持）')
}

async function focusWindow(titleContains: string): Promise<void> {
  const escaped = titleContains.replace(/'/g, "''")
  if (process.platform === 'win32') {
    const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  public static void FocusByTitle(string part) {
    EnumWindows((hWnd, lParam) => {
      var sb = new System.Text.StringBuilder(512);
      GetWindowText(hWnd, sb, 512);
      if (sb.ToString().IndexOf(part, StringComparison.OrdinalIgnoreCase) >= 0) {
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
      `tell application "System Events" to set frontmost of first process whose name contains "${escapedApple}" to true`
    ])
  }
}

async function mouseClick(x: number, y: number, double = false): Promise<void> {
  if (process.platform === 'win32') {
    const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
  public const int LEFTDOWN = 0x02; public const int LEFTUP = 0x04;
  public static void Click(int x, int y, bool dbl) {
    SetCursorPos(x, y);
    mouse_event(LEFTDOWN, 0, 0, 0, 0); mouse_event(LEFTUP, 0, 0, 0, 0);
    if (dbl) { System.Threading.Thread.Sleep(80); mouse_event(LEFTDOWN, 0, 0, 0, 0); mouse_event(LEFTUP, 0, 0, 0, 0); }
  }
}
"@
[MouseOps]::Click(${x}, ${y}, ${double ? '$true' : '$false'})
`
    await runPowerShell(ps)
    return
  }
  if (process.platform === 'darwin') {
    await execFileAsync('osascript', [
      '-e',
      `tell application "System Events" to click at {${x}, ${y}}`
    ])
    if (double) {
      await delay(80)
      await execFileAsync('osascript', ['-e', `tell application "System Events" to click at {${x}, ${y}}`])
    }
  }
}

function escapeSendKeys(text: string): string {
  return text.replace(/[+^%~()[\]{}]/g, (ch) => `{${ch}}`)
}

async function typeText(text: string): Promise<void> {
  if (process.platform === 'win32') {
    const escaped = escapeSendKeys(text).replace(/'/g, "''")
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escaped}')
`
    await runPowerShell(ps)
    return
  }
  if (process.platform === 'darwin') {
    await execFileAsync('osascript', ['-e', `tell application "System Events" to keystroke "${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`])
  }
}

async function sendHotkey(keys: string[]): Promise<void> {
  const normalized = keys.map((k) => k.toLowerCase())
  if (process.platform === 'win32') {
    const parts: string[] = []
    if (normalized.includes('ctrl') || normalized.includes('control')) parts.push('^')
    if (normalized.includes('alt')) parts.push('%')
    if (normalized.includes('shift')) parts.push('+')
    const main = normalized.find((k) => !['ctrl', 'control', 'alt', 'shift'].includes(k)) ?? 'a'
    await typeText(`${parts.join('')}${main}`)
    return
  }
  if (process.platform === 'darwin') {
    const key = normalized.find((k) => !['ctrl', 'control', 'alt', 'shift', 'cmd', 'command'].includes(k)) ?? 'a'
    const useCmd = normalized.includes('cmd') || normalized.includes('command') || normalized.includes('ctrl')
    await execFileAsync('osascript', [
      '-e',
      `tell application "System Events" to keystroke "${key}" using {${useCmd ? 'command down' : ''}}`
    ])
  }
}

async function sendKey(key: string): Promise<void> {
  const k = key.toLowerCase()
  if (k === 'enter' || k === 'return') {
    if (process.platform === 'win32') {
      await typeText('{ENTER}')
    } else if (process.platform === 'darwin') {
      await execFileAsync('osascript', ['-e', 'tell application "System Events" to key code 36'])
    }
    return
  }
  await typeText(key)
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function executeAction(
  action: MacroAction,
  vars: Record<MacroVariableKey, string>,
  scale: number
): Promise<void> {
  if (abortRequested) throw new Error('宏已中止')

  switch (action.type) {
    case 'focusWindow':
      if (action.titleContains) await focusWindow(action.titleContains)
      break
    case 'click':
      await mouseClick(scaleCoord(action.x, scale), scaleCoord(action.y, scale), false)
      break
    case 'doubleClick':
      await mouseClick(scaleCoord(action.x, scale), scaleCoord(action.y, scale), true)
      break
    case 'type':
      await typeText(substituteMacroText(action.text ?? '', vars))
      break
    case 'hotkey':
      await sendHotkey(action.keys ?? [])
      break
    case 'key':
      await sendKey(action.key ?? 'Enter')
      break
    case 'delay':
      await delay(action.ms ?? 200)
      break
    default:
      break
  }
}

async function runActions(
  actions: MacroAction[] | undefined,
  vars: Record<MacroVariableKey, string>,
  scale: number
): Promise<void> {
  if (!actions?.length) return
  for (const action of actions) {
    await executeAction(action, vars, scale)
  }
}

export async function loadMacroScript(scriptPath: string): Promise<MacroScript> {
  const raw = await readFile(scriptPath, 'utf-8')
  const parsed = JSON.parse(raw) as MacroScript
  if (!parsed.perItem || !Array.isArray(parsed.perItem)) {
    throw new Error('宏脚本缺少 perItem 段')
  }
  return parsed
}

export async function runMacroBatch(
  script: MacroScript,
  items: MacroBatchItem[],
  onProgress?: (current: number, total: number) => void
): Promise<MacroBatchResult> {
  resetMacroAbort()
  const scale = script.scaleFactor && script.scaleFactor > 0 ? script.scaleFactor : 1
  const failed: MacroBatchResult['failed'] = []
  let success = 0

  try {
    await runActions(script.prelude, buildMacroVariables(items[0] ?? {
      productCode: '',
      orderNo: '',
      projectName: '',
      quantity: 0,
      unit: '只'
    }), scale)

    for (let i = 0; i < items.length; i++) {
      if (abortRequested) {
        return { success, failed, aborted: true }
      }
      const item = items[i]
      const vars = buildMacroVariables(item)
      onProgress?.(i + 1, items.length)
      try {
        await runActions(script.perItem, vars, scale)
        await runActions(script.postlude, vars, scale)
        success++
      } catch (err) {
        failed.push({
          productCode: item.productCode,
          reason: err instanceof Error ? err.message : String(err)
        })
      }
      await delay(200)
    }
  } catch (err) {
    if (abortRequested) {
      return { success, failed, aborted: true }
    }
    throw err
  }

  return { success, failed, aborted: abortRequested }
}

export function focusMainAppWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
  }
}
