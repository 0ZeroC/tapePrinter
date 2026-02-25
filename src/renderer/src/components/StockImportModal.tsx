import { useState, useRef } from 'react'
import { Modal, Button, Table, Alert, Space, message, Steps, Typography, Tag } from 'antd'
import { UploadOutlined, FileExcelOutlined, CheckCircleOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { api, type ImportResult } from '../utils/api'

const { Text } = Typography

interface StockImportModalProps {
  visible: boolean
  type: 'in' | 'out'
  onSuccess: () => void
  onCancel: () => void
}

interface PreviewRow {
  _rowIndex: number
  _valid: boolean
  _error?: string
  code: string
  quantity: number
  remark: string
}

function StockImportModal({ visible, type, onSuccess, onCancel }: StockImportModalProps): JSX.Element {
  const label = type === 'in' ? '入库' : '出库'
  const [currentStep, setCurrentStep] = useState(0)
  const [fileName, setFileName] = useState('')
  const [previewData, setPreviewData] = useState<PreviewRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = (): void => {
    setCurrentStep(0)
    setFileName('')
    setPreviewData([])
    setImporting(false)
    setImportResult(null)
  }

  const parseExcelBuffer = (buffer: ArrayBuffer, name: string): void => {
    try {
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet)

      if (jsonData.length === 0) {
        message.warning('文件中没有数据')
        return
      }

      const mappedData: PreviewRow[] = jsonData.map((row, index) => {
        const code = String(row['物料号'] ?? row['编码'] ?? row['code'] ?? '').trim()
        const rawQty = Number(row['数量'] ?? row['数量(千)'] ?? row['quantity'] ?? 0)
        const remark = String(row['备注'] ?? row['remark'] ?? '').trim()

        let valid = true
        let error: string | undefined
        if (!code) {
          valid = false
          error = '物料号为空'
        } else if (isNaN(rawQty) || rawQty <= 0) {
          valid = false
          error = '数量无效（需大于0）'
        }

        return {
          _rowIndex: index + 2,
          _valid: valid,
          _error: error,
          code,
          quantity: rawQty,
          remark
        }
      })

      setFileName(name)
      setPreviewData(mappedData)
      setCurrentStep(1)
    } catch (err) {
      message.error('解析文件失败：' + (err as Error).message)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      if (evt.target?.result) {
        parseExcelBuffer(evt.target.result as ArrayBuffer, file.name)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleSelectFile = (): void => {
    fileInputRef.current?.click()
  }

  const handleImport = async (): Promise<void> => {
    const validData = previewData.filter((row) => row._valid)
    if (validData.length === 0) {
      message.warning('没有有效的数据可导入')
      return
    }

    setImporting(true)
    try {
      const items = validData.map(({ code, quantity, remark }) => ({ code, quantity, remark }))
      const result = type === 'in' ? await api.batchStockIn(items) : await api.batchStockOut(items)

      if (result.success && result.data) {
        setImportResult(result.data)
        setCurrentStep(2)
        if (result.data.success > 0) {
          message.success(`成功${label} ${result.data.success} 条数据`)
        }
      } else {
        message.error(result.error || '导入失败')
      }
    } catch {
      message.error('导入出错')
    } finally {
      setImporting(false)
    }
  }

  const handleClose = (): void => {
    if (importResult && importResult.success > 0) {
      onSuccess()
    } else {
      onCancel()
    }
    resetState()
  }

  const previewColumns = [
    { title: '行号', dataIndex: '_rowIndex', key: '_rowIndex', width: 60 },
    {
      title: '状态',
      dataIndex: '_valid',
      key: '_valid',
      width: 100,
      render: (valid: boolean, record: PreviewRow) =>
        valid ? (
          <Tag color="success">有效</Tag>
        ) : (
          <Tag color="error">{record._error || '无效'}</Tag>
        )
    },
    { title: '物料号', dataIndex: 'code', key: 'code', width: 150 },
    {
      title: '数量(千)',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      render: (val: number) =>
        isNaN(val) || val <= 0 ? (
          <Text type="danger">{String(val)}</Text>
        ) : (
          <Tag color={type === 'in' ? 'green' : 'red'}>
            {type === 'in' ? '+' : '-'}{val}
          </Tag>
        )
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true }
  ]

  const validCount = previewData.filter((r) => r._valid).length
  const invalidCount = previewData.filter((r) => !r._valid).length

  return (
    <Modal
      title={`Excel 批量${label}`}
      open={visible}
      onCancel={handleClose}
      width={750}
      footer={
        currentStep === 0
          ? [
              <Button key="cancel" onClick={handleClose}>
                取消
              </Button>,
              <Button key="select" type="primary" icon={<UploadOutlined />} onClick={handleSelectFile}>
                选择文件
              </Button>
            ]
          : currentStep === 1
            ? [
                <Button key="back" onClick={() => setCurrentStep(0)}>
                  重新选择
                </Button>,
                <Button
                  key="import"
                  type="primary"
                  onClick={handleImport}
                  loading={importing}
                  disabled={validCount === 0}
                >
                  确认{label} ({validCount} 条)
                </Button>
              ]
            : [
                <Button key="done" type="primary" onClick={handleClose}>
                  完成
                </Button>
              ]
      }
      destroyOnClose
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 24 }}
        items={[{ title: '选择文件' }, { title: '预览数据' }, { title: `${label}完成` }]}
      />

      {currentStep === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <FileExcelOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <div style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16 }}>请选择要批量{label}的 Excel 文件</Text>
          </div>
          <Alert
            type="info"
            showIcon
            message="Excel 文件格式要求"
            description={
              <div>
                <p>第一行为表头，支持以下列名（顺序不限）：</p>
                <p>
                  <Tag>物料号</Tag> / <Tag>编码</Tag> / <Tag>code</Tag> （必填，需与系统中物料号一致）
                </p>
                <p>
                  <Tag>数量</Tag> / <Tag>数量(千)</Tag> / <Tag>quantity</Tag> （必填，单位：千，需大于0）
                </p>
                <p>
                  <Tag>备注</Tag> / <Tag>remark</Tag> （选填）
                </p>
              </div>
            }
            style={{ textAlign: 'left', maxWidth: 500, margin: '0 auto' }}
          />
        </div>
      )}

      {currentStep === 1 && (
        <div>
          <Space style={{ marginBottom: 12 }}>
            <Text>文件：{fileName}</Text>
            <Tag color="processing">共 {previewData.length} 行</Tag>
            <Tag color="success">有效 {validCount} 行</Tag>
            {invalidCount > 0 && <Tag color="error">无效 {invalidCount} 行</Tag>}
          </Space>
          <Table
            dataSource={previewData}
            columns={previewColumns}
            rowKey="_rowIndex"
            size="small"
            pagination={false}
            scroll={{ y: 350 }}
          />
        </div>
      )}

      {currentStep === 2 && importResult && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <div style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16 }}>{label}完成</Text>
          </div>
          <Space direction="vertical" size="small">
            <Text>
              成功：
              <Text strong style={{ color: '#52c41a' }}>
                {importResult.success}
              </Text>{' '}
              条
            </Text>
            {importResult.failed > 0 && (
              <Text>
                失败：
                <Text strong style={{ color: '#ff4d4f' }}>
                  {importResult.failed}
                </Text>{' '}
                条
              </Text>
            )}
          </Space>
          {importResult.errors.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`部分${label}数据导入失败`}
              description={
                <div style={{ maxHeight: 200, overflow: 'auto' }}>
                  {importResult.errors.map((err, i) => (
                    <div key={i} style={{ fontSize: 12 }}>
                      {err}
                    </div>
                  ))}
                </div>
              }
              style={{ marginTop: 16, textAlign: 'left' }}
            />
          )}
        </div>
      )}
    </Modal>
  )
}

export default StockImportModal
