import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Collapse, Input, Space, Spin, Typography } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { api } from '../utils/api'

const { Text, Paragraph } = Typography

interface Turn {
  role: 'user' | 'assistant'
  content: string
  evidence?: {
    sql: string
    rowCount: number
    rows: Record<string, unknown>[]
    note?: string
  } | null
  error?: string
}

export default function AssistantPage(): JSX.Element {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void api.getAssistantStatus().then((r) => {
      if (r.success && r.data) setConfigured(r.data.configured)
      else setConfigured(false)
    })
  }, [])

  const send = useCallback(async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    const hist: Turn[] = [...turns, { role: 'user', content: q }]
    setTurns(hist)
    setLoading(true)
    const messages: { role: 'user' | 'assistant'; content: string }[] = []
    for (const t of hist) {
      if (t.role === 'user') {
        messages.push({ role: 'user', content: t.content })
      } else {
        const c = t.error ? `（上一答异常：${t.error}）` : t.content
        if (c) messages.push({ role: 'assistant', content: c })
      }
    }
    const r = await api.assistantChat(messages)
    setLoading(false)
    if (!r.success || !r.data) {
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', content: '', error: r.error || '请求失败' }
      ])
      return
    }
    const { answer, evidence, error } = r.data
    if (error) {
      setTurns((prev) => [...prev, { role: 'assistant', content: answer || '', evidence, error }])
      return
    }
    setTurns((prev) => [...prev, { role: 'assistant', content: answer, evidence }])
  }, [input, loading, turns])

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        AI 助手
      </Typography.Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        根据当前数据库中的物料、配货、库存等数据回答问题；回答依据来自自动生成的查询结果。若无「查看库存」权限，将无法查询库存与出入库流水表。
      </Paragraph>

      {configured === false && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="尚未完成 AI 配置"
          description="请使用管理员账号在侧栏「AI 设置」中配置 Ollama 或云端 API。"
        />
      )}

      <Card size="small" style={{ marginBottom: 16, minHeight: 280 }}>
        {turns.length === 0 && !loading && (
          <Text type="secondary">在下方输入问题，例如：当前库存最少的五个物料编码是什么？</Text>
        )}
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {turns.map((t, i) => (
            <div
              key={i}
              style={{
                alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '92%',
                background: t.role === 'user' ? '#e6f4ff' : '#fafafa',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #f0f0f0'
              }}
            >
              <Text strong>{t.role === 'user' ? '你' : '助手'}</Text>
              {t.error && (
                <div style={{ marginTop: 8 }}>
                  <Text type="danger">{t.error}</Text>
                </div>
              )}
              {t.content && (
                <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                  {t.content}
                </div>
              )}
              {t.evidence && (
                <Collapse
                  size="small"
                  style={{ marginTop: 10 }}
                  items={[
                    {
                      key: 'ev',
                      label: `查询依据（${t.evidence.rowCount} 行）`,
                      children: (
                        <div>
                          {t.evidence.note && (
                            <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                              {t.evidence.note}
                            </Paragraph>
                          )}
                          <pre
                            style={{
                              fontSize: 12,
                              overflow: 'auto',
                              maxHeight: 200,
                              background: '#fff',
                              padding: 8,
                              borderRadius: 4
                            }}
                          >
                            {t.evidence.sql}
                          </pre>
                          {t.evidence.rows.length > 0 && (
                            <pre
                              style={{
                                fontSize: 11,
                                overflow: 'auto',
                                maxHeight: 220,
                                marginTop: 8
                              }}
                            >
                              {JSON.stringify(t.evidence.rows, null, 2)}
                            </pre>
                          )}
                        </div>
                      )
                    }
                  ]}
                />
              )}
            </div>
          ))}
          {loading && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spin tip="正在查询与总结…" />
            </div>
          )}
        </Space>
      </Card>

      <Space.Compact style={{ width: '100%' }}>
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入问题，Enter 发送（Shift+Enter 换行）"
          autoSize={{ minRows: 1, maxRows: 4 }}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          disabled={loading}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => void send()}
          loading={loading}
          style={{ height: 'auto' }}
        >
          发送
        </Button>
      </Space.Compact>
    </div>
  )
}
