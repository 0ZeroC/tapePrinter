import { useState, useRef, useCallback, useEffect, type ReactElement } from 'react'
import { Input, Button, InputNumber, Radio, Select, Space, Card, message, Divider, Empty, Typography, Checkbox } from 'antd'
import { SearchOutlined, PrinterOutlined } from '@ant-design/icons'
import ResizableTable from '../components/ResizableTable'
import { api, type Product } from '../utils/api'
import LabelSmall from '../components/LabelSmall'
import LabelLarge, { type CombinedLabelItem } from '../components/LabelLarge'
import '../styles/label-print.css'

const { Title } = Typography

type TemplateType = 'small' | 'large'
type PrintPageMode = 'normal' | 'packing'
type LabelExtraFontSize = 'mini' | 'small' | 'medium' | 'large'

const LABEL_FONT_SIZE_MAP: Record<LabelExtraFontSize, number> = {
  mini: 8,
  small: 10,
  medium: 12,
  large: 14
}

interface PrintPagePreset {
  productCode?: string
  orderNo?: string
  projectName?: string
  quantity?: number
  unit?: string
  combinedItems?: CombinedLabelItem[]
  boxNo?: number
}

interface PrintPageProps {
  preset?: PrintPagePreset | null
  mode?: PrintPageMode
}

function PrintPage({ preset, mode = 'normal' }: PrintPageProps): ReactElement {
  const isPackingMode = mode === 'packing'
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [unit, setUnit] = useState<string>('只')
  const [templateType, setTemplateType] = useState<TemplateType>('small')
  const [orderNo, setOrderNo] = useState<string>('')
  const [projectName, setProjectName] = useState<string>('')
  const [productCode, setProductCode] = useState<string>('')
  const [orderNoFontSize, setOrderNoFontSize] = useState<LabelExtraFontSize>('medium')
  const [projectNameFontSize, setProjectNameFontSize] = useState<LabelExtraFontSize>('medium')
  const [labelDescFontSize, setLabelDescFontSize] = useState<LabelExtraFontSize>('mini')
  const [skipInventory, setSkipInventory] = useState(true)
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [combinedItems, setCombinedItems] = useState<CombinedLabelItem[] | null>(null)
  const [boxNo, setBoxNo] = useState<number | undefined>(undefined)
  const searchInputRef = useRef<any>(null)
  const searchTextRef = useRef('')
  const scanRapidKeyCountRef = useRef(0)
  const scanLastKeyTsRef = useRef(0)
  const scanSearchTimerRef = useRef<number | null>(null)

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

  useEffect(() => {
    searchTextRef.current = searchText
  }, [searchText])

  useEffect(() => {
    return () => {
      if (scanSearchTimerRef.current !== null) {
        window.clearTimeout(scanSearchTimerRef.current)
      }
    }
  }, [])

  const scheduleScannerAutoSearch = useCallback(() => {
    if (scanSearchTimerRef.current !== null) {
      window.clearTimeout(scanSearchTimerRef.current)
    }
    scanSearchTimerRef.current = window.setTimeout(() => {
      const currentValue = searchTextRef.current.trim()
      if (currentValue) {
        void handleSearch(currentValue).finally(() => {
          searchInputRef.current?.focus?.({ cursor: 'all' })
        })
      }
      scanRapidKeyCountRef.current = 0
    }, 120)
  }, [handleSearch])

  const handleSearchInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        scanRapidKeyCountRef.current = 0
        return
      }

      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) {
        return
      }

      const now = Date.now()
      const elapsed = now - scanLastKeyTsRef.current
      scanRapidKeyCountRef.current = elapsed <= 50 ? scanRapidKeyCountRef.current + 1 : 1
      scanLastKeyTsRef.current = now

      if (scanRapidKeyCountRef.current >= 4) {
        scheduleScannerAutoSearch()
      }
    },
    [scheduleScannerAutoSearch]
  )

  useEffect(() => {
    if (!preset) return

    if (preset.combinedItems && preset.combinedItems.length > 0) {
      setCombinedItems(preset.combinedItems)
      setOrderNo(preset.orderNo ?? '')
      setProjectName(preset.projectName ?? '')
      setBoxNo(preset.boxNo)
      setTemplateType('large')
      setSkipInventory(true)
    } else {
      setCombinedItems(null)
      setBoxNo(undefined)
    }

    if (preset.productCode) {
      setSearchText(preset.productCode)
      setProductCode(preset.productCode)
      handleSearch(preset.productCode)
    }
    if (preset.orderNo) {
      setOrderNo(preset.orderNo)
    }
    if (preset.projectName) {
      setProjectName(preset.projectName)
    }
    if (typeof preset.quantity === 'number' && preset.quantity > 0) {
      setQuantity(preset.quantity)
    }
    if (!preset.combinedItems || preset.combinedItems.length === 0) {
      setSkipInventory(true)
      setTemplateType('large')
    }
  }, [preset, handleSearch])

  useEffect(() => {
    if (selectedProduct) {
      setProductCode(selectedProduct.code)
    } else {
      setProductCode('')
    }
  }, [selectedProduct])

  useEffect(() => {
    setLabelDescFontSize(templateType === 'small' ? 'mini' : 'medium')
  }, [templateType])

  const handlePrint = useCallback(async () => {
    if (!selectedProduct) {
      message.warning('请先选择要打印的物品')
      return
    }
    if (quantity < 1) {
      message.warning('请输入有效的数量')
      return
    }
    setPrinting(true)
    try {
      const deductResult = await api.printAndDeduct(
        selectedProduct.id,
        quantity,
        1,
        templateType,
        skipInventory
      )
      if (!deductResult.success) {
        message.error(deductResult.error || '记录打印失败')
        return
      }
      if (window.electronAPI?.printLabel) {
        await window.electronAPI.printLabel(templateType)
      } else {
        window.print()
      }
      const totalPieces = quantity
      const deductThousands = totalPieces / 1000
      message.success(
        skipInventory
          ? '打印任务已发送（未扣减库存）'
          : `打印任务已发送，库存已扣减 ${deductThousands}千（${totalPieces}只）`
      )
    } catch {
      message.error('打印出错')
    } finally {
      setPrinting(false)
    }
  }, [selectedProduct, quantity, templateType, skipInventory])

  const fetchProjectNameByOrderNo = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) {
        return
      }
      try {
        const result = await api.getPickingOrderItems(trimmed)
        if (!result.success) {
          message.error(result.error || '查询配货单失败')
          return
        }
        const data = result.data || []
        if (data.length === 0) {
          message.warning(`未找到单号「${trimmed}」的配货单`)
          return
        }
        const names = Array.from(
          new Set(
            data
              .map((item) => (item.project_name || '').trim())
              .filter((n) => n.length > 0)
          )
        )
        if (names.length > 0) {
          setProjectName(names[0])
        } else {
          message.info('该单号的配货单中未设置工程名称')
        }
      } catch {
        message.error('查询配货单出错')
      }
    },
    [setProjectName]
  )

  const columns = [
    { title: '物料编码', dataIndex: 'code', key: 'code', width: 140 },
    { title: '物料描述', dataIndex: 'description', key: 'description', width: 140 },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: Product) => (
        <Button
          type={selectedProduct?.id === record.id ? 'primary' : 'default'}
          size="small"
          onClick={() => setSelectedProduct(record)}
          style={
            selectedProduct?.id === record.id
              ? { fontWeight: 600 }
              : { background: '#f5f5f5' }
          }
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
            placeholder="多条件搜索，用空格分隔，如：5783 10*20"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={handleSearchInputKeyDown}
            onPressEnter={(e) =>
              void handleSearch((e.target as HTMLInputElement).value).finally(() => {
                searchInputRef.current?.focus?.({ cursor: 'all' })
              })
            }
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
        style={{
          marginBottom: selectedProduct ? 16 : 0,
          flex: selectedProduct ? 'none' : 1,
          minHeight: selectedProduct ? undefined : 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        styles={{ body: { padding: 0, flex: 1, overflow: 'hidden' } }}
      >
        <ResizableTable
          dataSource={searchResults}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: selectedProduct ? 200 : 'calc(100vh - 300px)' }}
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
                <span style={{ marginRight: 8, fontWeight: 500 }}>标签模板：</span>
                <Radio.Group
                  value={templateType}
                  onChange={(e) => setTemplateType(e.target.value)}
                >
                  <Radio.Button value="small">小标签(袋)</Radio.Button>
                  <Radio.Button value="large">大标签(箱)</Radio.Button>
                </Radio.Group>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ marginRight: 8, fontWeight: 500 }}>物料编码：</span>
                  <Input
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value)}
                    style={{ width: 260 }}
                    placeholder="自动填充，可编辑"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ marginRight: 8, fontWeight: 500 }}>订单号：</span>
                  <Input
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                    onBlur={() => fetchProjectNameByOrderNo(orderNo)}
                    onPressEnter={() => fetchProjectNameByOrderNo(orderNo)}
                    style={{ width: 260 }}
                    placeholder="可选，打印在大标签上"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ marginRight: 8, fontWeight: 500 }}>工程名称：</span>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    style={{ width: 260 }}
                    placeholder="可选，打印在大标签上"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: 8, fontWeight: 500 }}>订单号字号：</span>
                    <Select
                      value={orderNoFontSize}
                      onChange={setOrderNoFontSize}
                      style={{ width: 140 }}
                      options={[
                        { value: 'mini', label: '迷你（8pt）' },
                        { value: 'small', label: '小（10pt）' },
                        { value: 'medium', label: '中（12pt）' },
                        { value: 'large', label: '大（14pt）' }
                      ]}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: 8, fontWeight: 500 }}>工程名称字号：</span>
                    <Select
                      value={projectNameFontSize}
                      onChange={setProjectNameFontSize}
                      style={{ width: 140 }}
                      options={[
                        { value: 'mini', label: '迷你（8pt）' },
                        { value: 'small', label: '小（10pt）' },
                        { value: 'medium', label: '中（12pt）' },
                        { value: 'large', label: '大（14pt）' }
                      ]}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: 8, fontWeight: 500 }}>描述字号：</span>
                    <Select
                      value={labelDescFontSize}
                      onChange={setLabelDescFontSize}
                      style={{ width: 180 }}
                      options={[
                        { value: 'mini', label: '迷你（8pt）' },
                        { value: 'small', label: '小（10pt）' },
                        { value: 'medium', label: '中（12pt）' },
                        { value: 'large', label: '大（14pt）' }
                      ]}
                    />
                  </div>
                  <span style={{ marginLeft: 6, color: '#999', fontSize: 12 }}>
                    （描述字号用于物料描述内容）
                  </span>
                </div>
              </div>
              <div>
                <Checkbox
                  checked={skipInventory}
                  onChange={(e) => setSkipInventory(e.target.checked)}
                >
                  不计入库存（勾选后打印不扣减库存）
                </Checkbox>
              </div>
              {!skipInventory && <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>库存扣减：{quantity}只 = {quantity / 1000}千</div>}
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                size="large"
                onClick={handlePrint}
                loading={printing}
                block
              >
                {skipInventory
                  ? '打印标签（不扣减库存）'
                  : `打印标签并扣减库存 ${quantity / 1000}千`}
              </Button>
            </Space>
          </Card>

          <Card size="small" title="打印预览" style={{ flex: 1, overflow: 'auto' }}>
            <div className="print-area">
              <div className="label-preview-container">
                <div key="single-label" className="label-preview-item">
                  {templateType === 'small' ? (
                    <LabelSmall
                      product={selectedProduct}
                      productCode={productCode}
                      quantity={quantity}
                      unit={unit}
                      descFontSizePt={LABEL_FONT_SIZE_MAP[labelDescFontSize]}
                    />
                  ) : (
                    <LabelLarge
                      product={selectedProduct}
                      productCode={productCode}
                      quantity={combinedItems ? undefined : quantity}
                      unit={combinedItems ? undefined : unit}
                      orderNo={orderNo}
                      projectName={projectName}
                      orderNoFontSizePt={LABEL_FONT_SIZE_MAP[orderNoFontSize]}
                      projectNameFontSizePt={LABEL_FONT_SIZE_MAP[projectNameFontSize]}
                      descFontSizePt={LABEL_FONT_SIZE_MAP[labelDescFontSize]}
                      combinedItems={combinedItems || undefined}
                      boxNo={combinedItems ? boxNo : undefined}
                      hideOrderAndProject={isPackingMode && templateType === 'large'}
                    />
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default PrintPage
