import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Radio, Space, Typography, message } from 'antd'
import { api } from '../utils/api'

export default function AssistantSettingsPage(): JSX.Element {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    void api.getAssistantSettings().then((r) => {
      setLoading(false)
      if (!r.success || !r.data) {
        message.error(r.error || '加载失败')
        return
      }
      const d = r.data
      const prov = d.provider || 'ollama'
      form.setFieldsValue({
        provider: prov,
        openai_base_url: d.openai_base_url || 'https://api.openai.com/v1',
        model: d.model || (prov === 'openai_compatible' ? 'gpt-4o-mini' : 'llama3.2'),
        ollama_host: d.ollama_host || 'http://127.0.0.1:11434',
        openai_api_key: ''
      })
    })
  }, [form])

  const onSave = async (): Promise<void> => {
    try {
      const v = await form.validateFields()
      setSaving(true)
      const payload: {
        provider?: 'openai_compatible' | 'ollama'
        openai_base_url?: string
        openai_api_key?: string
        model?: string
        ollama_host?: string
      } = {
        provider: v.provider,
        openai_base_url: v.openai_base_url?.trim(),
        model: v.model?.trim(),
        ollama_host: v.ollama_host?.trim()
      }
      if (v.openai_api_key && String(v.openai_api_key).trim()) {
        payload.openai_api_key = String(v.openai_api_key).trim()
      }
      const r = await api.updateAssistantSettings(payload)
      setSaving(false)
      if (!r.success || !r.data) {
        message.error(r.error || '保存失败')
        return
      }
      message.success('已保存')
      form.setFieldValue('openai_api_key', '')
      if (r.data.api_key_hint) {
        message.info(`API Key：${r.data.api_key_hint}`)
      }
    } catch {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        AI 设置
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="仅管理员可修改。API Key 保存在本机数据库中，请妥善保管备份介质。"
      />
      <Card loading={loading}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            provider: 'ollama',
            openai_base_url: 'https://api.openai.com/v1',
            ollama_host: 'http://127.0.0.1:11434',
            model: 'llama3.2'
          }}
        >
          <Form.Item label="提供方" name="provider" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="ollama">本机 Ollama</Radio>
              <Radio value="openai_compatible">OpenAI 兼容 API</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(p, c) => p.provider !== c.provider}>
            {() =>
              form.getFieldValue('provider') === 'ollama' ? (
                <>
                  <Form.Item
                    label="Ollama 地址"
                    name="ollama_host"
                    rules={[{ required: true, message: '填写服务地址' }]}
                    extra="默认 http://127.0.0.1:11434；局域网模型填 http://IP:11434"
                  >
                    <Input placeholder="http://127.0.0.1:11434" />
                  </Form.Item>
                  <Form.Item
                    label="模型名"
                    name="model"
                    rules={[{ required: true, message: '填写模型名' }]}
                    extra="例如 llama3.2，需已在 Ollama 中拉取"
                  >
                    <Input placeholder="llama3.2" />
                  </Form.Item>
                </>
              ) : (
                <>
                  <Form.Item
                    label="API Base URL"
                    name="openai_base_url"
                    rules={[{ required: true, message: '填写 Base URL' }]}
                    extra="需含 /v1 前缀，如 https://api.openai.com/v1"
                  >
                    <Input placeholder="https://api.openai.com/v1" />
                  </Form.Item>
                  <Form.Item
                    label="API Key"
                    name="openai_api_key"
                    extra="留空则不修改已保存的 Key"
                  >
                    <Input.Password placeholder="sk-…" autoComplete="new-password" />
                  </Form.Item>
                  <Form.Item
                    label="模型名"
                    name="model"
                    rules={[{ required: true, message: '填写模型名' }]}
                  >
                    <Input placeholder="gpt-4o-mini" />
                  </Form.Item>
                </>
              )
            }
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" onClick={() => void onSave()} loading={saving}>
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
