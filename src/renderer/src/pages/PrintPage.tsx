import { useState, useRef, useCallback } from 'react'
import {
  Input,
  Table,
  Button,
  InputNumber,
  Radio,
  Select,
  Space,
  Card,
  message,
  Divider,
  Empty,
  Typography,
  Checkbox
} from 'antd'
import { SearchOutlined, PrinterOutlined } from '@ant-design/icons'
import { api, type Product } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import LabelSmall from '../components/LabelSmall'
import LabelLarge from '../components/LabelLarge'
import '../styles/label-print.css'

const { Title } = Typography

type TemplateType = 'small' | 'large'

function PrintPage(): JSX.Element {
  const { user } = useAuth()
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [unit, setUnit] = useState<string>('只')
  const [printCount, setPrintCount] = useState<number>(1)
  const [templateType, setTemplateType] = useState<TemplateType>('small')
  const [skipInventory, setSkipInventory] = useState(false)
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const searchInputRef = useRef<any>(null)

  const handleSearch = useCallback(async (value: string) => {
    if (!value.trim()) {
      setSearchResults([])
      return
    }
    setLoading(true)
    try {
      const searchQuery = value.trim()
      const result = await api.searchProducts(searchQuery)
      if (result.success && result.data) {
        setSearchResults(result.data)
        if (result.data.length === 1) {
          setSelectedProduct(result.data[0])
        }
      } else {
        message.error(result.error || '搜索失败')
      }
    } catch {
      message.error('搜索出错')
    } finally {
      setLoading(false)
    }
  }, [])

  const handlePrint = useCallback(async () => {
    if (!selectedProduct) {
      message.warning('请先选择要打印的物品')
      return
    }
    if (quantity < 1 || printCount < 1) {
      message.warning('请输入有效的数量')
      return
    }
    setPrinting(true)
    try {
      const deductResult = await api.printAndDeduct(
        selectedProduct.id,
        quantity,
        printCount,
        templateType,
        skipInventory
      )
      if (!deductResult.success) {
        message.error(deductResult.error || '记录打印失败')
        return
      }
      window.print()
      message.success(skipInventory ? '打印任务已发送（未扣减库存）' : '打印任务已发送，库存已扣减')
    } catch {
      message.error('打印出错')
    } finally {
      setPrinting(false)
    }
  }, [selectedProduct, quantity, printCount, templateType, skipInventory])

  const columns = [
    { title: '物料号', dataIndex: 'code', key: 'code', width: 120 },
    { title: '物品名称', dataIndex: 'name', key: 'name', width: 140 },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 120 },
    { title: '等级', dataIndex: 'grade', key: 'grade', width: 70 },
    { title: '表面处理', dataIndex: 'surface_treatment', key: 'surface_treatment', width: 100 },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: Product) => (
        <Button
          type="link"
          size="small"
          onClick={() => setSelectedProduct(record)}
          style={selectedProduct?.id === record.id ? { fontWeight: 'bold' } : {}}
        >
          {selectedProduct?.id === record.id ? '已选中' : '选择'}
        </Button>
      )
    }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            ref={searchInputRef}
            placeholder="输入物品编码、名称、规格或扫码搜索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={(e) => handleSearch((e.target as HTMLInputElement).value)}
            prefix={<SearchOutlined />}
            allowClear
            size="large"
            autoFocus
            style={{ fontSize: 16 }}
          />
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            onClick={() => handleSearch(searchText)}
            loading={loading}
          >
            搜索
          </Button>
        </Space.Compact>
        <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
          提示：将光标放在搜索框内，使用扫码枪扫描条码可自动搜索
        </div>
      </Card>

      <Card
        size="small"
        title={`搜索结果 ${searchResults.length > 0 ? `(${searchResults.length} 条)` : ''}`}
        style={{ marginBottom: 16, flex: 1, overflow: 'auto' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={searchResults}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: 200 }}
          loading={loading}
          locale={{ emptyText: <Empty description="暂无搜索结果" /> }}
          onRow={(record) => ({
            onClick: () => setSelectedProduct(record),
            style: {
              cursor: 'pointer',
              background: selectedProduct?.id === record.id ? '#e6f4ff' : undefined
            }
          })}
        />
      </Card>

      {selectedProduct && (
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
          <Card size="small" style={{ flex: 1, overflow: 'auto' }}>
            <Title level={5} style={{ marginTop: 0 }}>
              已选物品：{selectedProduct.name}（{selectedProduct.code}）
            </Title>
            <Space size="large" wrap style={{ marginBottom: 16 }}>
              <div>
                <span style={{ color: '#666' }}>规格：</span>
                {selectedProduct.spec || '-'}
              </div>
              <div>
                <span style={{ color: '#666' }}>等级：</span>
                {selectedProduct.grade || '-'}
              </div>
              <div>
                <span style={{ color: '#666' }}>表面处理：</span>
                {selectedProduct.surface_treatment || '-'}
              </div>
              {selectedProduct.material && (
                <div>
                  <span style={{ color: '#666' }}>材质：</span>
                  {selectedProduct.material}
                </div>
              )}
            </Space>
            <Divider style={{ margin: '12px 0' }} />
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: 8, fontWeight: 500 }}>物品数量：</span>
                <InputNumber
                  min={1}
                  max={999999}
                  value={quantity}
                  onChange={(v) => setQuantity(v || 1)}
                  style={{ width: 100 }}
                  placeholder="数量"
                />
                <Select
                  value={unit}
                  onChange={setUnit}
                  style={{ width: 70, marginLeft: 4 }}
                  options={[
                    { value: '只', label: '只' },
                    { value: '套', label: '套' }
                  ]}
                />
                <span style={{ marginLeft: 6, color: '#999', fontSize: 12 }}>（显示在标签上）</span>
              </div>
              <div>
                <span style={{ marginRight: 8, fontWeight: 500 }}>打印张数：</span>
                <InputNumber
                  min={1}
                  max={999}
                  value={printCount}
                  onChange={(v) => setPrintCount(v || 1)}
                  style={{ width: 120 }}
                  placeholder="打印几张标签"
                />
                <span style={{ marginLeft: 6, color: '#999', fontSize: 12 }}>（打印几张标签）</span>
              </div>
              <div>
                <span style={{ marginRight: 8, fontWeight: 500 }}>标签模板：</span>
                <Radio.Group
                  value={templateType}
                  onChange={(e) => setTemplateType(e.target.value)}
                >
                  <Radio.Button value="small">小标签(袋)</Radio.Button>
                  <Radio.Button value="large">大标签(箱)</Radio.Button>
                </Radio.Group>
              </div>
              <div>
                <Checkbox
                  checked={skipInventory}
                  onChange={(e) => setSkipInventory(e.target.checked)}
                >
                  不计入库存（勾选后打印不扣减库存）
                </Checkbox>
              </div>
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                size="large"
                onClick={handlePrint}
                loading={printing}
                block
              >
                {skipInventory
                  ? `打印标签 (${printCount} 张，不扣减库存)`
                  : `打印标签 (${printCount} 张) 并扣减库存`}
              </Button>
            </Space>
          </Card>

          <Card size="small" title="打印预览" style={{ flex: 1, overflow: 'auto' }}>
            <div className="print-area">
              <div className="label-preview-container">
                {Array.from({ length: printCount }, (_, i) => (
                  <div
                    key={i}
                    className={`label-preview-item ${i < printCount - 1 ? 'label-page-break' : ''}`}
                  >
                    {templateType === 'small' ? (
                      <LabelSmall product={selectedProduct} quantity={quantity} unit={unit} />
                    ) : (
                      <LabelLarge product={selectedProduct} quantity={quantity} unit={unit} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default PrintPage
