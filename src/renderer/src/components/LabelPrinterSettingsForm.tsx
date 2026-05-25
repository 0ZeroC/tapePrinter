import { Button, Select, Space, Typography } from 'antd'
import type { LabelPrinterMap, PrinterInfo } from '../utils/labelPrinter'

const { Text } = Typography

interface LabelPrinterSettingsFormProps {
  value: LabelPrinterMap
  onChange: (map: LabelPrinterMap) => void
  printerList: PrinterInfo[]
  loading?: boolean
  onRefresh?: () => void
  compact?: boolean
}

function printerOptions(printerList: PrinterInfo[]) {
  return printerList.map((p) => ({
    value: p.name,
    label: `${p.displayName}${p.isDefault ? '（系统默认）' : ''}`
  }))
}

function LabelPrinterSettingsForm({
  value,
  onChange,
  printerList,
  loading = false,
  onRefresh,
  compact = false
}: LabelPrinterSettingsFormProps): JSX.Element {
  return (
    <div>
      {!compact && (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          小标签、大标签可绑定不同物理打印机；配置后批量打印将静默入队，无需每条确认。
        </Text>
      )}
      <div style={{ marginBottom: compact ? 10 : 16 }}>
        <div style={{ marginBottom: 6, fontWeight: 500, fontSize: compact ? 12 : 14 }}>
          小标签打印机（50×40mm）
        </div>
        <Select
          style={{ width: '100%' }}
          allowClear
          placeholder="选择小标签机"
          loading={loading}
          value={value.small || undefined}
          onChange={(v) => onChange({ ...value, small: v })}
          options={printerOptions(printerList)}
        />
      </div>
      <div style={{ marginBottom: onRefresh ? 8 : 0 }}>
        <div style={{ marginBottom: 6, fontWeight: 500, fontSize: compact ? 12 : 14 }}>
          大标签打印机（90×70mm）
        </div>
        <Select
          style={{ width: '100%' }}
          allowClear
          placeholder="选择大标签机"
          loading={loading}
          value={value.large || undefined}
          onChange={(v) => onChange({ ...value, large: v })}
          options={printerOptions(printerList)}
        />
      </div>
      {onRefresh && (
        <Space style={{ marginTop: 8 }}>
          <Button size="small" onClick={onRefresh} loading={loading}>
            刷新打印机列表
          </Button>
        </Space>
      )}
    </div>
  )
}

export default LabelPrinterSettingsForm
