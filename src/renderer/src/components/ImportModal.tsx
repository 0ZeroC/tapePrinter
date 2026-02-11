import { useState } from 'react'
import { Modal, Button, Table, Alert, Space, message, Steps, Typography, Tag } from 'antd'
import { UploadOutlined, FileExcelOutlined, CheckCircleOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import type { ProductData } from '../../../preload/index.d'

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

  // 重置状态
  const resetState = (): void => {
    setCurrentStep(0)
    setFileName('')
    setPreviewData([])
    setImporting(false)
    setImportResult(null)
  }

  // 选择文件
  const handleSelectFile = async (): Promise<void> => {
    try {
      const result = await window.api.openFileDialog()
      if (!result.success || !result.data) return

      const filePath = result.data
      setFileName(filePath.split('/').pop() || filePath.split('\\').pop() || filePath)

      // 读取文件
      const fileResult = await window.api.readFile(filePath)
      if (!fileResult.success || !fileResult.data) {
        message.error('读取文件失败')
        return
      }

      // 解析 Excel
      const workbook = XLSX.read(fileResult.data, { type: 'buffer' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(firstSheet)

      if (jsonData.length === 0) {
        message.warning('文件中没有数据')
        return
      }

      // 映射字段名
      const mappedData: PreviewRow[] = jsonData.map((row, index) => {
        const code =
          row['物品编码'] || row['编码'] || row['code'] || row['Code'] || row['CODE'] || ''
        const name =
          row['物品名称'] || row['名称'] || row['name'] || row['Name'] || row['NAME'] || ''
        const spec =
          row['规格'] || row['物品规格'] || row['spec'] || row['Spec'] || row['SPEC'] || ''
        const surface_treatment =
          row['表面处理'] ||
          row['surface_treatment'] ||
          row['Surface Treatment'] ||
          row['SURFACE_TREATMENT'] ||
          ''
        const grade =
          row['等级'] ||
          row['grade'] ||
          row['Grade'] ||
          row['GRADE'] ||
          ''

        const valid = !!code && !!name
        return {
          _rowIndex: index + 2, // Excel 行号（第1行是表头）
          _valid: valid,
          _error: !valid ? '编码或名称为空' : undefined,
          code: String(code).trim(),
          name: String(name).trim(),
          spec: String(spec).trim(),
          surface_treatment: String(surface_treatment).trim(),
          grade: String(grade).trim()
        }
      })

      setPreviewData(mappedData)
      setCurrentStep(1)
    } catch (err) {
      message.error('解析文件失败：' + (err as Error).message)
    }
  }

  // 执行导入
  const handleImport = async (): Promise<void> => {
    const validData = previewData.filter((row) => row._valid)
    if (validData.length === 0) {
      message.warning('没有有效的数据可导入')
      return
    }

    setImporting(true)
    try {
      const products: ProductData[] = validData.map(({ code, name, spec, surface_treatment, grade }) => ({
        code,
        name,
        spec,
        surface_treatment,
        grade
      }))

      const result = await window.api.importProducts(products)
      if (result.success && result.data) {
        setImportResult(result.data)
        setCurrentStep(2)
        if (result.data.success > 0) {
          message.success(`成功导入 ${result.data.success} 条数据`)
        }
      } else {
        message.error(result.error || '导入失败')
      }
    } catch (err) {
      message.error('导入出错')
    } finally {
      setImporting(false)
    }
  }

  // 关闭弹窗
  const handleClose = (): void => {
    if (importResult && importResult.success > 0) {
      onSuccess()
    } else {
      onCancel()
    }
    resetState()
  }

  // 预览表格列定义
  const previewColumns = [
    {
      title: '行号',
      dataIndex: '_rowIndex',
      key: '_rowIndex',
      width: 60
    },
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
    { title: '物品编码', dataIndex: 'code', key: 'code', width: 120 },
    { title: '物品名称', dataIndex: 'name', key: 'name', width: 150 },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 130 },
    { title: '表面处理', dataIndex: 'surface_treatment', key: 'surface_treatment', width: 110 },
    { title: '等级', dataIndex: 'grade', key: 'grade', width: 80 }
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
              <Button
                key="select"
                type="primary"
                icon={<UploadOutlined />}
                onClick={handleSelectFile}
              >
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
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 24 }}
        items={[
          { title: '选择文件' },
          { title: '预览数据' },
          { title: '导入完成' }
        ]}
      />

      {/* 步骤 1：选择文件 */}
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
                  <Tag>物品编码</Tag> / <Tag>编码</Tag> / <Tag>code</Tag> &nbsp;（必填）
                </p>
                <p>
                  <Tag>物品名称</Tag> / <Tag>名称</Tag> / <Tag>name</Tag> &nbsp;（必填）
                </p>
                <p>
                  <Tag>规格</Tag> / <Tag>spec</Tag> &nbsp;（选填）
                </p>
                <p>
                  <Tag>表面处理</Tag> / <Tag>surface_treatment</Tag> &nbsp;（选填）
                </p>
                <p>
                  <Tag>等级</Tag> / <Tag>grade</Tag> &nbsp;（选填）
                </p>
              </div>
            }
            style={{ textAlign: 'left', maxWidth: 500, margin: '0 auto' }}
          />
        </div>
      )}

      {/* 步骤 2：预览数据 */}
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

      {/* 步骤 3：导入结果 */}
      {currentStep === 2 && importResult && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
          <div style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16 }}>导入完成</Text>
          </div>
          <Space direction="vertical" size="small">
            <Text>
              成功：<Text strong style={{ color: '#52c41a' }}>{importResult.success}</Text> 条
            </Text>
            {importResult.failed > 0 && (
              <Text>
                失败：<Text strong style={{ color: '#ff4d4f' }}>{importResult.failed}</Text> 条
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
