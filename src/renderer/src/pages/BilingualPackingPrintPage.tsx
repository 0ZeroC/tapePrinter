import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement
} from 'react'
import {
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  message,
  Select,
  Space,
  Typography
} from 'antd'
import {
  PrinterOutlined,
  SearchOutlined,
  SettingOutlined
} from '@ant-design/icons'
import ResizableTable from '../components/ResizableTable'
import LabelLargeBilingual, {
  type BilingualLabelItem
} from '../components/LabelLargeBilingual'
import LabelPrinterSettingsModal from '../components/LabelPrinterSettingsModal'
import { api, type Product } from '../utils/api'
import { printLabelByTemplate, resolveDeviceName } from '../utils/labelPrinter'
import type { PrintPagePreset } from './PrintPage'
import '../styles/label-print.css'

const { Title, Text } = Typography

type LabelExtraFontSize = 'mini' | 'small' | 'medium' | 'large'

const LABEL_FONT_SIZE_MAP: Record<LabelExtraFontSize, number> = {
  mini: 8,
  small: 10,
  medium: 12,
  large: 14
}

const FONT_SIZE_OPTIONS = [
  { value: 'mini', label: '迷你（8pt）' },
  { value: 'small', label: '小（10pt）' },
  { value: 'medium', label: '中（12pt）' },
  { value: 'large', label: '大（14pt）' }
]

function emptyItem(): BilingualLabelItem {
  return {
    productCode: '',
    descriptionZh: '',
    descriptionEn: '',
    quantity: 1,
    unit: '只'
  }
}

function normalizeItems(items?: BilingualLabelItem[]): BilingualLabelItem[] {
  return Array.from({ length: 3 }, (_, index) => ({
    ...emptyItem(),
    ...(items?.[index] ?? {})
  }))
}

interface BilingualPackingPrintPageProps {
  preset?: PrintPagePreset | null
}

function BilingualPackingPrintPage({
  preset
}: BilingualPackingPrintPageProps): ReactElement {
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [items, setItems] = useState<BilingualLabelItem[]>(() =>
    normalizeItems(preset?.bilingualCombinedItems)
  )
  const [firstProduct, setFirstProduct] = useState<Product | null>(null)
  const [slotLoading, setSlotLoading] = useState<boolean[]>([false, false, false])
  const [orderNo, setOrderNo] = useState(preset?.orderNo ?? '')
  const [projectName, setProjectName] = useState(preset?.projectName ?? '')
  const [boxNo, setBoxNo] = useState<number | undefined>(preset?.boxNo)
  const [orderNoFontSize, setOrderNoFontSize] =
    useState<LabelExtraFontSize>('medium')
  const [projectNameFontSize, setProjectNameFontSize] =
    useState<LabelExtraFontSize>('medium')
  const [labelDescFontSize, setLabelDescFontSize] =
    useState<LabelExtraFontSize>('medium')
  const [skipInventory, setSkipInventory] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [printerModalOpen, setPrinterModalOpen] = useState(false)
  const codeLookupTimersRef = useRef<Array<number | null>>([null, null, null])
  const codeLookupVersionRef = useRef([0, 0, 0])

  const updateItem = useCallback(
    (index: number, patch: Partial<BilingualLabelItem>) => {
      setItems((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item
        )
      )
    },
    []
  )

  const lookupProductCode = useCallback(
    async (index: number, rawCode: string, notifyMissing = false) => {
      const code = rawCode.trim()
      const version = ++codeLookupVersionRef.current[index]
      if (!code) {
        updateItem(index, { descriptionZh: '', descriptionEn: '' })
        if (index === 0) setFirstProduct(null)
        return
      }

      setSlotLoading((current) =>
        current.map((value, itemIndex) => (itemIndex === index ? true : value))
      )
      try {
        const result = await api.getProductByCode(code)
        if (version !== codeLookupVersionRef.current[index]) return
        if (!result.success || !result.data) {
          updateItem(index, { descriptionZh: '', descriptionEn: '' })
          if (index === 0) setFirstProduct(null)
          if (notifyMissing) message.warning(`未找到物料编码「${code}」`)
          return
        }
        const product = result.data
        setItems((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index && item.productCode.trim() === code
              ? {
                  ...item,
                  productCode: product.code,
                  descriptionZh: product.description || '',
                  descriptionEn: product.description_en || ''
                }
              : item
          )
        )
        if (index === 0) setFirstProduct(product)
      } catch {
        if (notifyMissing) message.error('读取物料信息失败')
      } finally {
        if (version === codeLookupVersionRef.current[index]) {
          setSlotLoading((current) =>
            current.map((value, itemIndex) =>
              itemIndex === index ? false : value
            )
          )
        }
      }
    },
    [updateItem]
  )

  const scheduleProductCodeLookup = useCallback(
    (index: number, code: string) => {
      const timer = codeLookupTimersRef.current[index]
      if (timer != null) window.clearTimeout(timer)
      if (!code.trim()) {
        void lookupProductCode(index, code)
        return
      }
      codeLookupTimersRef.current[index] = window.setTimeout(() => {
        void lookupProductCode(index, code)
      }, 400)
    },
    [lookupProductCode]
  )

  const handleCodeChange = useCallback(
    (index: number, code: string) => {
      updateItem(index, {
        productCode: code,
        descriptionZh: '',
        descriptionEn: ''
      })
      if (index === 0) setFirstProduct(null)
      scheduleProductCodeLookup(index, code)
    },
    [scheduleProductCodeLookup, updateItem]
  )

  const assignProduct = useCallback((index: number, product: Product) => {
    codeLookupVersionRef.current[index] += 1
    const timer = codeLookupTimersRef.current[index]
    if (timer != null) window.clearTimeout(timer)
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              productCode: product.code,
              descriptionZh: product.description || '',
              descriptionEn: product.description_en || ''
            }
          : item
      )
    )
    if (index === 0) setFirstProduct(product)
    message.success(`已填入第 ${index + 1} 项`)
  }, [])

  useEffect(() => {
    const nextItems = normalizeItems(preset?.bilingualCombinedItems)
    setItems(nextItems)
    setOrderNo(preset?.orderNo ?? '')
    setProjectName(preset?.projectName ?? '')
    setBoxNo(preset?.boxNo)
    setFirstProduct(null)
    nextItems.forEach((item, index) => {
      const code = item.productCode.trim()
      if (code) void lookupProductCode(index, code)
    })
  }, [preset, lookupProductCode])

  useEffect(
    () => () => {
      codeLookupTimersRef.current.forEach((timer) => {
        if (timer != null) window.clearTimeout(timer)
      })
    },
    []
  )

  const handleSearch = useCallback(async () => {
    const query = searchText.trim()
    if (!query) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const result = await api.searchProducts(query)
      if (result.success && result.data) {
        setSearchResults(result.data)
      } else {
        message.error(result.error || '搜索失败')
      }
    } catch {
      message.error('搜索出错')
    } finally {
      setSearching(false)
    }
  }, [searchText])

  const fetchProjectNameByOrderNo = useCallback(async () => {
    const value = orderNo.trim()
    if (!value) return
    try {
      const result = await api.getPickingOrderItems(value)
      if (!result.success) return
      const name = (result.data ?? [])
        .map((item) => (item.project_name || '').trim())
        .find(Boolean)
      if (name) setProjectName(name)
    } catch {
      // 保留用户手工填写的工程名称
    }
  }, [orderNo])

  const activeItems = useMemo(
    () => items.filter((item) => item.productCode.trim()),
    [items]
  )
  const hasRequiredItems = Boolean(
    items[0].productCode.trim() && items[1].productCode.trim()
  )

  const previewProduct = useMemo<Product>(
    () =>
      firstProduct ?? {
        id: 0,
        code: activeItems[0]?.productCode || '-',
        description: activeItems[0]?.descriptionZh || '',
        description_en: activeItems[0]?.descriptionEn || '',
        name: '双语拼箱',
        spec: '',
        grade: '',
        surface_treatment: '',
        material: '',
        special_note: '',
        drawings_count: 0,
        created_at: '',
        updated_at: ''
      },
    [activeItems, firstProduct]
  )

  const handlePrint = useCallback(async () => {
    if (!items[0].productCode.trim() || !items[1].productCode.trim()) {
      message.warning('请至少填写第一项和第二项物料')
      return
    }
    if (activeItems.length < 2 || activeItems.length > 3) {
      message.warning('双语拼箱仅支持 2～3 项物料')
      return
    }
    if (
      activeItems.some(
        (item) =>
          !item.descriptionZh.trim() ||
          !item.descriptionEn.trim() ||
          item.quantity <= 0
      )
    ) {
      message.warning('请确认每项物料均已匹配中英文描述，并填写有效数量')
      return
    }
    if (!firstProduct) {
      message.warning('第一项物料编码未在物料库中匹配成功')
      return
    }

    setPrinting(true)
    try {
      const quantity = activeItems[0].quantity
      const result = await api.printAndDeduct(
        firstProduct.id,
        quantity,
        1,
        'large',
        skipInventory
      )
      if (!result.success) {
        message.error(result.error || '记录打印失败')
        return
      }
      const mapped = await resolveDeviceName('large')
      if (window.electronAPI?.printLabel && !mapped) {
        message.warning('未配置大标签打印机，将弹出系统打印对话框')
      }
      await printLabelByTemplate('large')
      message.success(
        skipInventory
          ? '打印任务已发送（未扣减库存）'
          : `打印任务已发送，库存已扣减 ${quantity / 1000}千（${quantity}只）`
      )
    } catch {
      message.error('打印出错')
    } finally {
      setPrinting(false)
    }
  }, [activeItems, firstProduct, items, skipInventory])

  const columns = [
    { title: '物料编码', dataIndex: 'code', key: 'code', width: 150 },
    { title: '物料描述', dataIndex: 'description', key: 'description', width: 220 },
    {
      title: '英文描述',
      dataIndex: 'description_en',
      key: 'description_en',
      width: 260,
      render: (value: string) => value || '-'
    },
    {
      title: '填入标签',
      key: 'actions',
      width: 230,
      render: (_: unknown, record: Product) => (
        <Space size={4}>
          {[0, 1, 2].map((index) => (
            <Button
              key={index}
              size="small"
              type={
                items[index].productCode.trim() === record.code ? 'primary' : 'default'
              }
              onClick={() => assignProduct(index, record)}
            >
              第{index + 1}项
            </Button>
          ))}
        </Space>
      )
    }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Card size="small" style={{ marginBottom: 12 }}>
        {window.electronAPI?.getPrinters && (
          <div style={{ marginBottom: 8, textAlign: 'right' }}>
            <Button
              size="small"
              icon={<SettingOutlined />}
              onClick={() => setPrinterModalOpen(true)}
            >
              打印机设置
            </Button>
          </div>
        )}
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="按原有方式模糊搜索，如：5783 10*20"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onPressEnter={() => void handleSearch()}
            prefix={<SearchOutlined />}
            allowClear
            size="large"
            autoFocus
          />
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            onClick={() => void handleSearch()}
            loading={searching}
          >
            搜索
          </Button>
        </Space.Compact>
        <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
          搜索后点击“第1项 / 第2项 / 第3项”即可填入；也可直接在下方输入物料编码，系统会自动匹配中英文描述。
        </div>
      </Card>

      <Card
        size="small"
        title={`搜索结果${searchResults.length ? `（${searchResults.length} 条）` : ''}`}
        style={{ marginBottom: 12 }}
        styles={{ body: { padding: 0 } }}
      >
        <ResizableTable
          dataSource={searchResults}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: 180 }}
          loading={searching}
          locale={{ emptyText: <Empty description="暂无搜索结果" /> }}
        />
      </Card>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        <Card size="small" style={{ flex: 1, overflow: 'auto' }}>
          <Title level={5} style={{ marginTop: 0 }}>
            双语拼箱标签
          </Title>
          <Text type="secondary">
            第一、第二项为必填；第三项不填写时不会显示在标签上。
          </Text>

          <Space
            direction="vertical"
            size="small"
            style={{ width: '100%', marginTop: 12 }}
          >
            {items.map((item, index) => (
              <Card
                key={index}
                size="small"
                title={`第 ${index + 1} 项${index < 2 ? '（必填）' : '（选填）'}`}
                extra={slotLoading[index] ? <Text type="secondary">匹配中…</Text> : null}
              >
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Input
                    addonBefore="物料编码"
                    value={item.productCode}
                    onChange={(event) => handleCodeChange(index, event.target.value)}
                    onBlur={() =>
                      void lookupProductCode(index, item.productCode, Boolean(item.productCode.trim()))
                    }
                    onPressEnter={() =>
                      void lookupProductCode(index, item.productCode, true)
                    }
                    placeholder={index === 2 ? '选填，不填则标签不显示第三项' : '输入编码后自动匹配'}
                  />
                  <div>
                    <div style={{ marginBottom: 4, color: '#666' }}>中文描述</div>
                    <Input.TextArea
                      value={item.descriptionZh}
                      onChange={(event) =>
                        updateItem(index, { descriptionZh: event.target.value })
                      }
                      autoSize={{ minRows: 1, maxRows: 3 }}
                      placeholder="匹配物料编码后自动显示"
                    />
                  </div>
                  <div>
                    <div style={{ marginBottom: 4, color: '#666' }}>英文描述</div>
                    <Input.TextArea
                      value={item.descriptionEn}
                      onChange={(event) =>
                        updateItem(index, { descriptionEn: event.target.value })
                      }
                      autoSize={{ minRows: 1, maxRows: 3 }}
                      placeholder="匹配物料编码后自动显示"
                    />
                  </div>
                  <Space wrap>
                    <span>数量：</span>
                    <InputNumber
                      min={1}
                      max={999999}
                      value={item.quantity}
                      onChange={(value) =>
                        updateItem(index, { quantity: value || 1 })
                      }
                      style={{ width: 120 }}
                    />
                    <Select
                      value={item.unit || '只'}
                      onChange={(value) => updateItem(index, { unit: value })}
                      style={{ width: 80 }}
                      options={[
                        { value: '只', label: '只' },
                        { value: '套', label: '套' }
                      ]}
                    />
                  </Space>
                </Space>
              </Card>
            ))}

            <Space wrap>
              <span>订单号：</span>
              <Input
                value={orderNo}
                onChange={(event) => setOrderNo(event.target.value)}
                onBlur={() => void fetchProjectNameByOrderNo()}
                onPressEnter={() => void fetchProjectNameByOrderNo()}
                placeholder="选填"
                style={{ width: 220 }}
              />
              <span>工程名称：</span>
              <Input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="选填"
                style={{ width: 220 }}
              />
              <span>箱号：</span>
              <InputNumber
                min={1}
                value={boxNo}
                onChange={(value) => setBoxNo(value ?? undefined)}
                placeholder="选填"
                style={{ width: 100 }}
              />
            </Space>

            <Space wrap>
              <span>订单号字号：</span>
              <Select
                value={orderNoFontSize}
                onChange={setOrderNoFontSize}
                style={{ width: 140 }}
                options={FONT_SIZE_OPTIONS}
              />
              <span>工程名称字号：</span>
              <Select
                value={projectNameFontSize}
                onChange={setProjectNameFontSize}
                style={{ width: 140 }}
                options={FONT_SIZE_OPTIONS}
              />
              <span>描述字号：</span>
              <Select
                value={labelDescFontSize}
                onChange={setLabelDescFontSize}
                style={{ width: 140 }}
                options={FONT_SIZE_OPTIONS}
              />
            </Space>

            <Checkbox
              checked={skipInventory}
              onChange={(event) => setSkipInventory(event.target.checked)}
            >
              不计入库存（勾选后打印不扣减库存）
            </Checkbox>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              size="large"
              onClick={() => void handlePrint()}
              loading={printing}
              block
            >
              {skipInventory
                ? '打印双语拼箱标签（不扣减库存）'
                : `打印并扣减第一项库存 ${activeItems[0]?.quantity ?? 0}只`}
            </Button>
          </Space>
        </Card>

        <Card size="small" title="打印预览" style={{ flex: 1, overflow: 'auto' }}>
          {hasRequiredItems ? (
            <div className="print-area">
              <div className="label-preview-container">
                <div className="label-preview-item">
                  <LabelLargeBilingual
                    product={previewProduct}
                    productCode={activeItems[0].productCode}
                    orderNo={orderNo}
                    projectName={projectName}
                    orderNoFontSizePt={LABEL_FONT_SIZE_MAP[orderNoFontSize]}
                    projectNameFontSizePt={LABEL_FONT_SIZE_MAP[projectNameFontSize]}
                    descFontSizePt={LABEL_FONT_SIZE_MAP[labelDescFontSize]}
                    combinedItems={activeItems}
                    boxNo={boxNo}
                  />
                </div>
              </div>
            </div>
          ) : (
            <Empty description="填写第一项和第二项后显示标签预览" />
          )}
        </Card>
      </div>

      <LabelPrinterSettingsModal
        open={printerModalOpen}
        onClose={() => setPrinterModalOpen(false)}
      />
    </div>
  )
}

export default BilingualPackingPrintPage
