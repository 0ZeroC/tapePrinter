import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import ResizableTable from './ResizableTable'
import { api, type InventoryWithProduct, type PickingOrderItem } from '../utils/api'

export type OrderUsageRankRow = {
  rank: number
  product_code: string
  description: string
  total_quantity: number
  unit: string
  line_count: number
  order_count: number
  current_quantity: number | null
}

type StockOrderUsagePanelProps = {
  inventoryList: InventoryWithProduct[]
}

function aggregatePickingUsage(
  items: PickingOrderItem[],
  stockByCode: Map<string, number>
): OrderUsageRankRow[] {
  const acc = new Map<
    string,
    { total: number; description: string; unit: string; lines: number; orders: Set<string> }
  >()

  for (const row of items) {
    const code = (row.product_code || '').trim()
    if (!code) continue
    let cur = acc.get(code)
    if (!cur) {
      cur = { total: 0, description: '', unit: '', lines: 0, orders: new Set<string>() }
      acc.set(code, cur)
    }
    cur.total += Number(row.quantity) || 0
    if (!cur.description && row.description) cur.description = row.description
    if (!cur.unit && row.unit) cur.unit = row.unit
    cur.lines += 1
    cur.orders.add(row.order_no || '')
  }

  const sorted = [...acc.entries()]
    .map(([product_code, v]) => ({
      product_code,
      description: v.description,
      total_quantity: v.total,
      unit: v.unit,
      line_count: v.lines,
      order_count: v.orders.size
    }))
    .sort((a, b) => b.total_quantity - a.total_quantity)
    .slice(0, 50)

  return sorted.map((r, i) => ({
    rank: i + 1,
    ...r,
    current_quantity: stockByCode.has(r.product_code) ? stockByCode.get(r.product_code)! : null
  }))
}

export default function StockOrderUsagePanel(props: StockOrderUsagePanelProps): JSX.Element {
  const { inventoryList } = props
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<OrderUsageRankRow[]>([])
  const [sourceLineCount, setSourceLineCount] = useState(0)

  const stockByCode = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of inventoryList) {
      if (p.code) m.set(p.code.trim(), p.quantity)
    }
    return m
  }, [inventoryList])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getPickingOrderExportData()
      if (result.success && result.data) {
        setSourceLineCount(result.data.length)
        setRows(aggregatePickingUsage(result.data, stockByCode))
      } else {
        message.error(result.error || '加载配货单数据失败')
        setRows([])
        setSourceLineCount(0)
      }
    } catch {
      message.error('加载配货单数据出错')
      setRows([])
      setSourceLineCount(0)
    } finally {
      setLoading(false)
    }
  }, [stockByCode])

  useEffect(() => {
    void load()
  }, [load])

  const columns = useMemo(
    () => [
      { title: '排名', dataIndex: 'rank', key: 'rank', width: 64 },
      { title: '物料号', dataIndex: 'product_code', key: 'product_code', width: 120 },
      {
        title: '物料描述（配货单）',
        dataIndex: 'description',
        key: 'description',
        width: 280,
        render: (t: string) => t || '-'
      },
      {
        title: '订单用量合计',
        dataIndex: 'total_quantity',
        key: 'total_quantity',
        width: 120,
        sorter: (a: OrderUsageRankRow, b: OrderUsageRankRow) => a.total_quantity - b.total_quantity,
        render: (v: number) =>
          Number.isInteger(v) ? String(v) : v.toLocaleString('zh-CN', { maximumFractionDigits: 4 })
      },
      { title: '单位', dataIndex: 'unit', key: 'unit', width: 72, render: (t: string) => t || '-' },
      {
        title: '配货行数',
        dataIndex: 'line_count',
        key: 'line_count',
        width: 88,
        sorter: (a: OrderUsageRankRow, b: OrderUsageRankRow) => a.line_count - b.line_count
      },
      {
        title: '涉及订单数',
        dataIndex: 'order_count',
        key: 'order_count',
        width: 100,
        sorter: (a: OrderUsageRankRow, b: OrderUsageRankRow) => a.order_count - b.order_count
      },
      {
        title: '当前库存（千）',
        dataIndex: 'current_quantity',
        key: 'current_quantity',
        width: 120,
        render: (v: number | null) =>
          v === null ? <span style={{ color: '#999' }}>未建档</span> : v
      }
    ],
    []
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>
          统计已导入系统的全部配货单行，按物料号汇总需求量后取前 50 名；用量为各行「数量」字段之和。
          {sourceLineCount > 0 ? `（共 ${sourceLineCount} 行明细）` : ''}
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          重新统计
        </Button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResizableTable<OrderUsageRankRow>
          dataSource={rows}
          columns={columns}
          rowKey="product_code"
          size="small"
          pagination={false}
          loading={loading}
          locale={{ emptyText: <Empty description="暂无配货单数据，请先在配货单模块导入" /> }}
          scroll={{ x: 'max-content' }}
        />
      </div>
    </div>
  )
}
