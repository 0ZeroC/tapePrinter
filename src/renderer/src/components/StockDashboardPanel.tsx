import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, message, Spin, Typography } from 'antd'
import { api, type WeeklyInventoryStats } from '../utils/api'

const { Text } = Typography

function HorizontalRankBars(props: {
  title: string
  rows: { label: string; value: number }[]
  barColor: string
  valueSuffix?: string
}): JSX.Element {
  const { title, rows, barColor, valueSuffix = '' } = props
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <Card
      size="small"
      title={title}
      styles={{
        body: { paddingTop: 16, paddingBottom: 20 }
      }}
      style={{ minHeight: 320 }}
    >
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'stretch',
                gap: 14
              }}
            >
              <div
                style={{
                  flex: '0 1 46%',
                  minWidth: 200,
                  maxWidth: '52%',
                  fontSize: 13,
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  whiteSpace: 'normal',
                  color: 'rgba(0,0,0,0.88)'
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 120,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 28,
                    background: '#f5f5f5',
                    borderRadius: 4
                  }}
                >
                  <div
                    style={{
                      width: `${(row.value / max) * 100}%`,
                      height: '100%',
                      background: barColor,
                      borderRadius: 4,
                      minWidth: row.value > 0 ? 4 : 0,
                      transition: 'width 0.2s ease'
                    }}
                  />
                </div>
                <span
                  style={{
                    width: 64,
                    textAlign: 'right',
                    fontSize: 13,
                    flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {row.value}
                  {valueSuffix}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function StockDashboardPanel(): JSX.Element {
  const [stats, setStats] = useState<WeeklyInventoryStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const result = await api.getWeeklyInventoryStats()
      if (result.success && result.data) {
        setStats(result.data)
      } else {
        setStats(null)
        message.error(result.error || '加载看板统计失败')
      }
    } catch {
      setStats(null)
      message.error('加载看板统计失败')
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const outboundRows = useMemo(() => {
    const list = stats?.topOutbound ?? []
    return list.map((r) => ({ label: r.description || '-', value: r.quantity }))
  }, [stats])

  const inboundRows = useMemo(() => {
    const list = stats?.topInbound ?? []
    return list.map((r) => ({ label: r.description || '-', value: r.quantity }))
  }, [stats])

  const remarkRows = useMemo(() => {
    const list = stats?.topInboundRemarks ?? []
    return list.map((r) => ({ label: r.remark || '-', value: r.count }))
  }, [stats])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">统计最近 7 天（本地时间）出入库流水</Text>
        <Button size="small" onClick={loadStats} loading={statsLoading}>
          刷新看板
        </Button>
      </div>

      <Spin spinning={statsLoading}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20
          }}
        >
          <HorizontalRankBars
            title="出库量 TOP8（物料描述）"
            rows={outboundRows}
            barColor="#ff7875"
            valueSuffix="千"
          />
          <HorizontalRankBars
            title="入库量 TOP8（物料描述）"
            rows={inboundRows}
            barColor="#52c41a"
            valueSuffix="千"
          />
          <HorizontalRankBars
            title="入库备注频次 TOP8"
            rows={remarkRows}
            barColor="#1890ff"
            valueSuffix="次"
          />
        </div>
      </Spin>
    </div>
  )
}
