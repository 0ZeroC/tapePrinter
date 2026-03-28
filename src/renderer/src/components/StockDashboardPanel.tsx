import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Empty, message, Spin, Typography } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/zh-cn'
import { api, type WeeklyInventoryStats } from '../utils/api'

dayjs.extend(isoWeek)
dayjs.locale('zh-cn')

const { RangePicker } = DatePicker

const { Text } = Typography

function initialDateRange(): [Dayjs, Dayjs] {
  return [dayjs().startOf('month'), dayjs()]
}

function buildRangePresets(): { label: string; value: [Dayjs, Dayjs] }[] {
  const today = dayjs()
  return [
    { label: '本周', value: [today.startOf('isoWeek'), today] },
    { label: '本月', value: [today.startOf('month'), today] },
    { label: '本年', value: [today.startOf('year'), today] },
    { label: '近7天', value: [today.subtract(6, 'day'), today] },
    { label: '近30天', value: [today.subtract(29, 'day'), today] }
  ]
}

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
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(initialDateRange)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const start = dateRange[0].format('YYYY-MM-DD')
    const end = dateRange[1].format('YYYY-MM-DD')
    try {
      const result = await api.getInventoryRankingStats({ start, end })
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
  }, [dateRange])

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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <RangePicker
          value={dateRange}
          onChange={(dates) => {
            if (dates?.[0] && dates[1]) {
              setDateRange([dates[0], dates[1]])
            }
          }}
          presets={buildRangePresets()}
          allowClear={false}
          format="YYYY-MM-DD"
          style={{ minWidth: 280 }}
        />
        <Button size="small" onClick={loadStats} loading={statsLoading}>
          刷新看板
        </Button>
      </div>
      <Text type="secondary" style={{ display: 'block' }}>
        统计 {dateRange[0].format('YYYY-MM-DD')} 至 {dateRange[1].format('YYYY-MM-DD')}
        （按本地日历日，含起止日全天）；快捷选项在日历面板左侧
      </Text>

      <Spin spinning={statsLoading}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20
          }}
        >
          <HorizontalRankBars
            title="出库量 TOP50（物料描述）"
            rows={outboundRows}
            barColor="#ff7875"
            valueSuffix="千"
          />
          <HorizontalRankBars
            title="入库量 TOP50（物料描述）"
            rows={inboundRows}
            barColor="#52c41a"
            valueSuffix="千"
          />
          <HorizontalRankBars
            title="入库备注频次 TOP50"
            rows={remarkRows}
            barColor="#1890ff"
            valueSuffix="次"
          />
        </div>
      </Spin>
    </div>
  )
}
