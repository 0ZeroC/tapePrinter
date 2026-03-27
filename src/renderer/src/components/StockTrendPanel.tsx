import { useCallback, useEffect, useMemo, useState } from 'react'
import { Empty, Select, Spin } from 'antd'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { api, type InventoryTrendPoint, type InventoryWithProduct } from '../utils/api'

function parseLocalTime(s: string): number {
  const normalized = s.includes('T') ? s : s.replace(' ', 'T')
  return new Date(normalized).getTime()
}

function filterTrendPoints(points: InventoryTrendPoint[], days: number): InventoryTrendPoint[] {
  if (points.length === 0) return []
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const filtered = points.filter((p) => parseLocalTime(p.time) >= cutoff)
  return filtered.length > 0 ? filtered : points
}

type StockTrendPanelProps = {
  inventoryList: InventoryWithProduct[]
}

export default function StockTrendPanel(props: StockTrendPanelProps): JSX.Element {
  const { inventoryList } = props
  const [trendProductId, setTrendProductId] = useState<number | null>(null)
  const [trendPoints, setTrendPoints] = useState<InventoryTrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendDays, setTrendDays] = useState(30)

  const loadTrend = useCallback(async (productId: number) => {
    setTrendLoading(true)
    try {
      const result = await api.getInventoryTrend(productId)
      if (result.success && result.data) {
        setTrendPoints(result.data)
      } else {
        setTrendPoints([])
      }
    } catch {
      setTrendPoints([])
    } finally {
      setTrendLoading(false)
    }
  }, [])

  useEffect(() => {
    if (trendProductId != null) {
      loadTrend(trendProductId)
    } else {
      setTrendPoints([])
    }
  }, [trendProductId, loadTrend])

  const chartData = useMemo(() => {
    const pts = filterTrendPoints(trendPoints, trendDays)
    return pts.map((p) => ({
      time: p.time,
      balance: p.balance
    }))
  }, [trendPoints, trendDays])

  const selectOptions = useMemo(
    () =>
      inventoryList.map((p) => ({
        value: p.product_id,
        label: `${p.code} ${p.description || p.name}`.trim()
      })),
    [inventoryList]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, height: '100%' }}>
      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>单位：千（库存流水重算后的结存）</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Select
          showSearch
          allowClear
          placeholder="选择物料（物料号 + 描述）"
          style={{ minWidth: 320, flex: 1 }}
          options={selectOptions}
          optionFilterProp="label"
          value={trendProductId ?? undefined}
          onChange={(v) => setTrendProductId(typeof v === 'number' ? v : null)}
        />
        <Select
          style={{ width: 140 }}
          value={trendDays}
          onChange={setTrendDays}
          options={[
            { value: 7, label: '近7天' },
            { value: 30, label: '近30天' },
            { value: 90, label: '近90天' },
            { value: 365, label: '近一年' },
            { value: 99999, label: '全部' }
          ]}
        />
      </div>
      <div style={{ flex: 1, minHeight: 400, width: '100%' }}>
        {trendProductId == null ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择物料查看库存变动走势" />
        ) : trendLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spin />
          </div>
        ) : chartData.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无流水数据" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                tickFormatter={(t: string) => (t && t.length >= 16 ? t.slice(5, 16) : t)}
              />
              <YAxis tick={{ fontSize: 11 }} width={44} />
              <Tooltip
                formatter={(v: number) => [`${v} 千`, '库存']}
                labelFormatter={(label) => String(label)}
              />
              <Line type="stepAfter" dataKey="balance" stroke="#1677ff" dot={chartData.length < 40} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
