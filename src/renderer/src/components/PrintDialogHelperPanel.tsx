import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Alert, Button, Checkbox, InputNumber, Space, Typography } from 'antd'
import { LinkOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  DEFAULT_LOCAL_BRIDGE_URL,
  getPrintDialogHelperConfig,
  isPrintDialogHelperElectronAvailable,
  pingLocalPrintBridge,
  setPrintDialogHelperConfig,
  type PrintDialogHelperConfig
} from '../utils/printDialogHelper'

const { Text } = Typography

interface PrintDialogHelperPanelProps {
  compact?: boolean
}

export default function PrintDialogHelperPanel({
  compact = false
}: PrintDialogHelperPanelProps): ReactElement {
  const [config, setConfig] = useState<PrintDialogHelperConfig>(() => getPrintDialogHelperConfig())
  const electronAvailable = isPrintDialogHelperElectronAvailable()
  const [bridgeOnline, setBridgeOnline] = useState(false)
  const [checking, setChecking] = useState(false)

  const refreshBridge = useCallback(async () => {
    if (electronAvailable) {
      setBridgeOnline(true)
      return
    }
    setChecking(true)
    try {
      setBridgeOnline(await pingLocalPrintBridge())
    } finally {
      setChecking(false)
    }
  }, [electronAvailable])

  useEffect(() => {
    setPrintDialogHelperConfig(config)
  }, [config])

  useEffect(() => {
    void refreshBridge()
    const timer = window.setInterval(() => void refreshBridge(), 5000)
    return () => window.clearInterval(timer)
  }, [refreshBridge])

  const patch = (partial: Partial<PrintDialogHelperConfig>): void => {
    setConfig((prev) => ({ ...prev, ...partial }))
  }

  const canEnable = electronAvailable || bridgeOnline

  if (!electronAvailable && !bridgeOnline) {
    return (
      <Alert
        type="warning"
        showIcon
        message="打印助手（嵌入 Web）"
        description={
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>
              网页本身<strong>不能</strong>直接点 Windows 打印框；需在<strong>本机</strong>先启动一次桥接（仅
              Windows 配货电脑，与你的 Mac 开发机无关）：
            </p>
            <p style={{ margin: '0 0 8px' }}>
              双击运行：<Text code>tools\print-dialog-helper\启动打印助手.bat</Text>
              <br />
              或 PowerShell：<Text code>.\local-bridge.ps1</Text>（窗口保持打开）
            </p>
            <p style={{ margin: 0 }}>
              启动后点下方「检测连接」，状态变为已连接即可在本页勾选「自动点确定」，与一键打印配合使用。
            </p>
          </div>
        }
        action={
          <Button size="small" icon={<ReloadOutlined />} loading={checking} onClick={() => void refreshBridge()}>
            检测连接
          </Button>
        }
        style={{ marginTop: compact ? 8 : 12 }}
      />
    )
  }

  return (
    <div
      style={{
        marginTop: compact ? 12 : 16,
        padding: compact ? 10 : 12,
        background: '#f6ffed',
        borderRadius: 8,
        border: '1px solid #b7eb8f'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Checkbox
          checked={config.enabled}
          disabled={!canEnable}
          onChange={(e) => patch({ enabled: e.target.checked })}
        >
          <span style={{ fontWeight: 500 }}>打印助手（自动点「打印/确定」）</span>
        </Checkbox>
        {!electronAvailable && (
          <span style={{ fontSize: 12, color: '#389e0d' }}>
            <LinkOutlined /> 本机桥接已连接 ({DEFAULT_LOCAL_BRIDGE_URL})
          </span>
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
        {electronAvailable
          ? `弹出系统打印框后约 ${config.delayMs}ms 自动确认；批量打印时请勿操作鼠标。`
          : `Web 模式：每次发起打印后，网页会通知本机桥接（${config.delayMs}ms 后${
              config.useEnter ? '按 Enter' : '点击固定坐标'
            }）。批量打印时请勿操作鼠标。`}
      </div>
      {config.enabled && (
        <>
          <Space style={{ marginTop: 8 }} wrap>
            <span style={{ fontSize: 12 }}>延迟(ms)</span>
            <InputNumber
              min={200}
              max={3000}
              step={100}
              size="small"
              value={config.delayMs}
              onChange={(v) => patch({ delayMs: typeof v === 'number' ? v : 600 })}
            />
            {!electronAvailable && (
              <Button size="small" icon={<ReloadOutlined />} loading={checking} onClick={() => void refreshBridge()}>
                检测连接
              </Button>
            )}
          </Space>
          <div style={{ marginTop: 8 }}>
            <Checkbox
              checked={!config.useEnter}
              onChange={(e) => patch({ useEnter: !e.target.checked })}
            >
              <span style={{ fontSize: 12 }}>Enter 无效时，改为点击“打印”按钮的固定屏幕坐标</span>
            </Checkbox>
          </div>
          {!config.useEnter && (
            <div style={{ marginTop: 8 }}>
              <Space wrap>
                <span style={{ fontSize: 12 }}>X</span>
                <InputNumber
                  min={0}
                  step={1}
                  size="small"
                  placeholder="横坐标"
                  value={config.clickX}
                  onChange={(v) => patch({ clickX: typeof v === 'number' ? v : undefined })}
                />
                <span style={{ fontSize: 12 }}>Y</span>
                <InputNumber
                  min={0}
                  step={1}
                  size="small"
                  placeholder="纵坐标"
                  value={config.clickY}
                  onChange={(v) => patch({ clickY: typeof v === 'number' ? v : undefined })}
                />
              </Space>
              <div style={{ marginTop: 6, fontSize: 11, color: '#888' }}>
                坐标以主屏幕左上角为原点；请先运行助手目录中的
                capture-print-button-position.bat 获取按钮中心坐标。
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
