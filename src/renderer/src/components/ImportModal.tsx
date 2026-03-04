import { useState, useRef } from 'react'
import { Modal, Button, Alert, Space, message, Steps, Typography, Tag, Upload } from 'antd'
import { UploadOutlined, FileExcelOutlined, CheckCircleOutlined, InboxOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { api, type ProductData } from '../utils/api'

const { Text } = Typography

interface ImportModalProps {
  visible: boolean
  onSuccess: () => void
  onCancel: () => void
}

interface PreviewRow extends ProductData {
  _rowIndex: number
  _valid: boolean
  _error?: string
}

function ImportModal({ visible, onSuccess, onCancel }: ImportModalProps): JSX.Element {
  const [currentStep, setCurrentStep] = useState(0)
  const [fileName, setFileName] = useState('')
  const [previewData, setPreviewData] = useState<PreviewRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    success: number
    failed: number
    errors: string[]
  } | null>(null)
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
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(firstSheet)

      if (jsonData.length === 0) {
        message.warning('文件中没有数据')
        return
      }

      const mappedData: PreviewRow[] = jsonData.map((row, index) => {
        const code =
          row['物料号'] || row['物品编码'] || row['编码'] || row['code'] || row['Code'] || ''
        const description =
          row['物料描述'] || row['描述'] || row['description'] || row['Description'] || ''
        const name =
          row['物品名称'] || row['名称'] || row['name'] || row['Name'] || ''
        const spec =
          row['规格'] || row['物品规格'] || row['spec'] || row['Spec'] || ''
        const grade =
          row['等级'] || row['grade'] || row['Grade'] || ''
        const surface_treatment =
          row['表面处理'] || row['surface_treatment'] || row['Surface Treatment'] || ''
        const material =
          row['材质'] || row['material'] || row['Material'] || ''
        const special_note =
          row['特殊备注'] || row['备注'] || row['special_note'] || row['Special Note'] || ''

        const valid = !!code && !!name
        return {
          _rowIndex: index + 2,
          _valid: valid,
          _error: !valid ? '物料号或名称为空' : undefined,
          code: String(code).trim(),
          description: String(description).trim(),
          name: String(name).trim(),
          spec: String(spec).trim(),
          grade: String(grade).trim(),
          surface_treatment: String(surface_treatment).trim(),
          material: String(material).trim(),
          special_note: String(special_note).trim()
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
      const products: ProductData[] = validData.map(
        ({ code, description, name, spec, grade, surface_treatment, material, special_note }) => ({
          code,
          description,
          name,
          spec,
          grade,
          surface_treatment,
          material,
          special_note
        })
      )

      const result = await api.importProducts(products)
      if (result.success && result.data) {
        setImportResult(result.data)
        setCurrentStep(2)
        if (result.data.success > 0) {
          message.success(`成功导入 ${result.data.success} 条数据`)
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
      width: 80,
      render: (valid: boolean, record: PreviewRow) =>
        valid ? (
          <Tag color="success">有效</Tag>
        ) : (
          <Tag color="error">{record._error || '无效'}</Tag>
        )
    },
    { title: '物料号', dataIndex: 'code', key: 'code', width: 120 },
    {
      title: '物料描述',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      ellipsis: true
    },
    { title: '物品名称', dataIndex: 'name', key: 'name', width: 130 },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 110 },
    { title: '等级', dataIndex: 'grade', key: 'grade', width: 60 },
    { title: '表面处理', dataIndex: 'surface_treatment', key: 'surface_treatment', width: 90 },
    { title: '材质', dataIndex: 'material', key: 'material', width: 80 },
    {
      title: '特殊备注',
      dataIndex: 'special_note',
      key: 'special_note',
      width: 120,
      ellipsis: true
    }
  ]

  const validCount = previewData.filter((r) => r._valid).length
  const invalidCount = previewData.filter((r) => !r._valid).length

  return (
    <Modal
      title="导入 Excel 数据"
      open={visible}
      onCancel={handleClose}
      width={900}
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
                  确认导入 ({validCount} 条)
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
        items={[{ title: '选择文件' }, { title: '预览数据' }, { title: '导入完成' }]}
      />

      {currentStep === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <FileExcelOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <div style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 16 }}>请选择要导入的 Excel 文件</Text>
          </div>
          <Alert
            type="info"
            showIcon
            message="Excel 文件格式要求"
            description={
              <div>
                <p>第一行为表头，支持以下列名（顺序不限）：</p>
                <p>
                  <Tag>物料号</Tag> / <Tag>物品编码</Tag> / <Tag>code</Tag> （必填）
                </p>
                <p>
                  <Tag>物料描述</Tag> / <Tag>描述</Tag> （选填）
                </p>
                <p>
                  <Tag>物品名称</Tag> / <Tag>名称</Tag> / <Tag>name</Tag> （必填）
                </p>
                <p>
                  <Tag>规格</Tag> / <Tag>spec</Tag> （选填）
                </p>
                <p>
                  <Tag>等级</Tag> / <Tag>grade</Tag> （选填）
                </p>
                <p>
                  <Tag>表面处理</Tag> （选填）
                </p>
                <p>
                  <Tag>材质</Tag> （选填）
                </p>
                <p>
                  <Tag>特殊备注</Tag> / <Tag>备注</Tag> （选填）
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
          <ResizableTable
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
            <Text style={{ fontSize: 16 }}>导入完成</Text>
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
              message="部分数据导入失败"
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

export default ImportModal
