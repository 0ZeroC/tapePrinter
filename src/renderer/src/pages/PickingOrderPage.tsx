import { useState, useRef, useCallback, useEffect, type JSX, type ChangeEvent } from 'react'
import {
  Input,
  Button,
  Tag,
  Space,
  Card,
  message,
  Modal,
  Form,
  InputNumber,
  Popconfirm,
  Alert,
  Steps,
  Typography,
  Tooltip,
  Drawer,
  Checkbox,
  Radio
} from 'antd'
import {
  SearchOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  FileExcelOutlined,
  ReloadOutlined,
  UnorderedListOutlined,
  ExportOutlined,
  ClearOutlined
} from '@ant-design/icons'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import JsBarcode from 'jsbarcode'
import fallbackLogoUrl from '../assets/logo.png'
import ResizableTable from '../components/ResizableTable'
import { api, type PickingOrderItem, type Product, type PickingSplitRow, type PickingOrderSummary } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import type { PrintPagePreset } from './PrintPage'
import type { SubBoltRule } from '../../../common/subBoltRules'
import {
  parseCsvLine,
  parseSubBoltRulesCsv,
  getBuiltinSubBoltRulesCsv,
  convertSpreadsheetMatrixToSubBoltRulesCsv
} from '../../../common/subBoltRules'

async function readFirstSheetAsStringMatrix(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: false
  }) as unknown[][]
  return data.map((row) =>
    (row ?? []).map((cell) => {
      if (cell == null || cell === '') return ''
      return String(cell).trim()
    })
  )
}

const { Text } = Typography
const DELIVERY_NOTE_TITLE = '扬州硕瑞机电有限公司 送货单'
const DELIVERY_LOGO_URL = 'file:///C:/Users/Administrator/.cursor/projects/e-gitProjects-tapePrinter/assets/e__gitProjects_tapePrinter_____logo_transparent.png'


interface SplitRow {
  id: string
  product: Product
  quantity: number
}

interface CombinedLabelItem {
  code: string
  description: string
  quantity: number
  unit?: string
}

interface PickingOrderPageProps {
  onOpenPrintLabel?: (payload: {
    productCode: string
    orderNo: string
    projectName: string
    quantity: number
    unit: string
    combinedItems?: CombinedLabelItem[]
    boxNo?: number
  }) => void
  onOpenBilingualLabel?: (payload: PrintPagePreset) => void
  initialOrderNo?: string
  onOrderLoaded?: (orderNo: string) => void
}

const loadImageAsDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`加载图片失败：${response.status}`)
  }
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

const loadFirstAvailableImageDataUrl = async (urls: string[]): Promise<string> => {
  for (const url of urls) {
    if (!url) continue
    try {
      return await loadImageAsDataUrl(url)
    } catch {
      // 尝试下一个候选地址
    }
  }
  return ''
}

const buildBarcodeDataUrl = (value: string): string => {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, value, {
    format: 'CODE128',
    width: 2,
    height: 52,
    displayValue: true,
    fontSize: 12,
    margin: 4
  })
  return canvas.toDataURL('image/png')
}

function PickingOrderPage({
  onOpenPrintLabel,
  onOpenBilingualLabel,
  initialOrderNo,
  onOrderLoaded
}: PickingOrderPageProps): JSX.Element {
  const { user } = useAuth()
  // 只有具有“查看库存”权限的用户，才允许在配货单中进行新增、编辑、删除等管理操作
  const canManage = user?.canViewInventory ?? false
  /** 与 canManage 同源；单独命名用于「副转只拆分规则」配置区，仅库存可见权限用户可见 */
  const canViewInventory = user?.canViewInventory ?? false
  // 只有具有“配货出库权限”的用户，才允许在配货单中执行出库相关操作
  const canOutbound = user?.canManagePickingOrders ?? false

  const [orderNoInput, setOrderNoInput] = useState('')
  const [currentOrderNo, setCurrentOrderNo] = useState('')
  const [orderItems, setOrderItems] = useState<PickingOrderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  // Split modal
  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [splitTargetItem, setSplitTargetItem] = useState<PickingOrderItem | null>(null)
  const [splitSearchText, setSplitSearchText] = useState('')
  const [splitSearchResults, setSplitSearchResults] = useState<Product[]>([])
  const [splitSearchLoading, setSplitSearchLoading] = useState(false)
  const [splitRows, setSplitRows] = useState<SplitRow[]>([])
  const [splitRemark, setSplitRemark] = useState('')
  const [splitSubmitting, setSplitSubmitting] = useState(false)

  // Add/Edit modal
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PickingOrderItem | null>(null)
  const [itemForm] = Form.useForm()
  const [itemSubmitting, setItemSubmitting] = useState(false)

  // Excel import
  const [importStep, setImportStep] = useState(0)
  const [importVisible, setImportVisible] = useState(false)
  const [importFileName, setImportFileName] = useState('')
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importing, setImporting] = useState(false)
  const [importOverwriteMode, setImportOverwriteMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<any>(null)

  // Order management drawer
  const [orderListVisible, setOrderListVisible] = useState(false)
  const [orderList, setOrderList] = useState<PickingOrderSummary[]>([])
  const [orderListLoading, setOrderListLoading] = useState(false)
  const [selectedOrderNos, setSelectedOrderNos] = useState<string[]>([])
  const [orderListDeleting, setOrderListDeleting] = useState(false)

  // Combine label modal
  const [combineModalOpen, setCombineModalOpen] = useState(false)
  const [combineModalForBilingual, setCombineModalForBilingual] = useState(false)
  const [combineItems, setCombineItems] = useState<PickingOrderItem[]>([])
  const [combineCodeMap, setCombineCodeMap] = useState<Record<number, string>>({})
  const [combineQtyMap, setCombineQtyMap] = useState<Record<number, number>>({})
  const [combineUnitMap, setCombineUnitMap] = useState<Record<number, '只' | '套'>>({})
  const [combineBoxNo, setCombineBoxNo] = useState<number | undefined>(undefined)

  // 出库选择 modal：拆 / 不拆
  const [outboundChoiceOpen, setOutboundChoiceOpen] = useState(false)
  const [outboundTargetItem, setOutboundTargetItem] = useState<PickingOrderItem | null>(null)

  // 不拆 modal：实际出库数量
  const [noSplitModalOpen, setNoSplitModalOpen] = useState(false)
  const [noSplitTargetItem, setNoSplitTargetItem] = useState<PickingOrderItem | null>(null)
  const [noSplitActualQty, setNoSplitActualQty] = useState<number>(0)
  const [noSplitRemark, setNoSplitRemark] = useState('')
  const [noSplitSubmitting, setNoSplitSubmitting] = useState(false)

  // 副转只：平垫编码选择（当 97/95 同时存在时）
  const [flatPadChoiceOpen, setFlatPadChoiceOpen] = useState(false)
  const [flatPadChoiceItem, setFlatPadChoiceItem] = useState<PickingOrderItem | null>(null)
  const [flatPadChoiceRule, setFlatPadChoiceRule] = useState<SubBoltRule | null>(null)
  const [flatPadChoiceCode, setFlatPadChoiceCode] = useState<string>('')
  const [batchFlatPadChoiceOpen, setBatchFlatPadChoiceOpen] = useState(false)
  const [batchFlatPadChoice, setBatchFlatPadChoice] = useState<'97' | '95'>('97')
  const [batchPendingItems, setBatchPendingItems] = useState<PickingOrderItem[]>([])

  /** 副转只拆分规则：由服务端存储的 CSV 与内置默认合并加载 */
  const [subBoltRuleMap, setSubBoltRuleMap] = useState<Record<string, SubBoltRule>>({})
  const [subBoltRulesSource, setSubBoltRulesSource] = useState<'custom' | 'builtin'>('builtin')
  const [subBoltRulesRowCount, setSubBoltRulesRowCount] = useState(0)
  const [subBoltRulesUploading, setSubBoltRulesUploading] = useState(false)
  const subBoltCsvInputRef = useRef<HTMLInputElement>(null)

  const loadSubBoltRules = useCallback(async () => {
    const res = await api.getSubBoltRules()
    const fallbackBuiltin = () => {
      const builtin = getBuiltinSubBoltRulesCsv()
      const p = parseSubBoltRulesCsv(builtin)
      setSubBoltRuleMap(p.map)
      setSubBoltRulesSource('builtin')
      setSubBoltRulesRowCount(p.rowCount)
    }
    if (!res.success || !res.data) {
      fallbackBuiltin()
      return
    }
    const { map, errors, rowCount } = parseSubBoltRulesCsv(res.data.csv)
    if (errors.length > 0) {
      message.warning(`副转只规则 CSV 解析异常：${errors[0]}`)
      fallbackBuiltin()
      return
    }
    setSubBoltRuleMap(map)
    setSubBoltRulesSource(res.data.source)
    setSubBoltRulesRowCount(rowCount)
  }, [])

  const getSubBoltRule = useCallback(
    (code?: string | null): SubBoltRule | undefined => {
      if (!code) return undefined
      return subBoltRuleMap[code.trim()]
    },
    [subBoltRuleMap]
  )

  const handleDownloadCurrentSubBoltRulesXlsx = useCallback(async () => {
    const res = await api.getSubBoltRules()
    if (!res.success || !res.data) {
      message.error(res.error || '无法获取当前规则')
      return
    }
    const text = res.data.csv.replace(/^\ufeff/, '').trimEnd()
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
    const aoa = lines.map((line) => parseCsvLine(line))
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '副转只拆分规则')
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    XLSX.writeFile(wb, `副转只拆分规则_${dateStr}.xlsx`)
  }, [])

  const handleSubBoltCsvSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !canViewInventory) return
      setSubBoltRulesUploading(true)
      try {
        const matrix = await readFirstSheetAsStringMatrix(file)
        const { csv, errors: convErrors } = convertSpreadsheetMatrixToSubBoltRulesCsv(matrix)
        if (!csv) {
          message.error(convErrors.length > 0 ? convErrors.join('；') : '无法从表格生成规则')
          return
        }
        if (convErrors.length > 0) {
          message.warning(convErrors.join('；'))
        }
        const res = await api.setSubBoltRules(csv)
        if (res.success && res.data) {
          message.success(`已更新副转只规则（${res.data.rowCount} 行物料映射）`)
          await loadSubBoltRules()
        } else {
          message.error(res.error || '上传失败')
        }
      } catch (err) {
        message.error(err instanceof Error ? err.message : '读取文件失败')
      } finally {
        setSubBoltRulesUploading(false)
      }
    },
    [canViewInventory, loadSubBoltRules]
  )

  useEffect(() => {
    // 无库存查看权限的配货员仍须加载规则表，出库时才能按规则自动拆分；配置卡片仅对 canViewInventory 展示
    if (!user) return
    if (!user.canViewInventory && !user.canManagePickingOrders) return
    void loadSubBoltRules()
  }, [user, loadSubBoltRules])

  const loadOrder = useCallback(async (orderNo: string) => {
    if (!orderNo.trim()) {
      message.warning('请输入单号')
      return
    }
    setLoading(true)
    try {
      const result = await api.getPickingOrderItems(orderNo.trim())
      if (result.success && result.data) {
        if (result.data.length === 0) {
          message.warning(`未找到单号「${orderNo.trim()}」的配货单`)
          setOrderItems([])
          setCurrentOrderNo('')
        } else {
          const trimmed = orderNo.trim()
          setOrderItems(result.data)
          setCurrentOrderNo(trimmed)
          setSelectedIds([])
          if (trimmed) {
            onOrderLoaded?.(trimmed)
          }
        }
      } else {
        message.error(result.error || '查询失败')
      }
    } catch {
      message.error('查询出错')
    } finally {
      setLoading(false)
      // 搜索完成后重新聚焦搜索框，便于连续扫码下一单
      setTimeout(() => searchInputRef.current?.focus?.(), 80)
    }
  }, [onOrderLoaded])

  const handleSearch = useCallback(() => {
    loadOrder(orderNoInput)
  }, [orderNoInput, loadOrder])

  useEffect(() => {
    if (!initialOrderNo) return
    if (currentOrderNo) return
    setOrderNoInput(initialOrderNo)
    loadOrder(initialOrderNo)
  }, [initialOrderNo, currentOrderNo, loadOrder])

  // 进入页面时默认聚焦搜索框，便于扫码枪扫条形码后回车搜索
  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus?.(), 100)
    return () => clearTimeout(timer)
  }, [])

  const handleDeleteItem = useCallback(async (id: number) => {
    try {
      const result = await api.deletePickingOrderItem(id)
      if (result.success) {
        message.success('删除成功')
        loadOrder(currentOrderNo)
      } else {
        message.error(result.error || '删除失败')
      }
    } catch {
      message.error('删除出错')
    }
  }, [currentOrderNo, loadOrder])

  const handleDeleteOrder = useCallback(async () => {
    if (!currentOrderNo) return
    try {
      const result = await api.deletePickingOrderByOrderNo(currentOrderNo)
      if (result.success) {
        message.success(`已删除订单 ${currentOrderNo} 的全部记录`)
        setOrderItems([])
        setCurrentOrderNo('')
        setOrderNoInput('')
      } else {
        message.error(result.error || '删除失败')
      }
    } catch {
      message.error('删除出错')
    }
  }, [currentOrderNo])

  const handleResetPick = useCallback(async (ids: number[]) => {
    if (!canOutbound) {
      message.warning('当前用户没有配货出库权限')
      return
    }
    try {
      const result = await api.resetPickingItems(ids)
      if (result.success) {
        message.success('已重置配货状态')
        loadOrder(currentOrderNo)
      } else {
        message.error(result.error || '重置失败')
      }
    } catch {
      message.error('重置出错')
    }
  }, [canOutbound, currentOrderNo, loadOrder])

  const handleOpenAddItem = useCallback(() => {
    setEditingItem(null)
    itemForm.resetFields()
    itemForm.setFieldsValue({ order_no: currentOrderNo })
    setItemModalOpen(true)
  }, [currentOrderNo, itemForm])

  const handleOpenEditItem = useCallback((record: PickingOrderItem) => {
    setEditingItem(record)
    itemForm.setFieldsValue({
      order_no: record.order_no,
      seq_no: record.seq_no,
      product_code: record.product_code,
      description: record.description,
      quantity: record.quantity,
      unit: record.unit,
      project_name: record.project_name,
      required_date: record.required_date,
      planner: record.planner
    })
    setItemModalOpen(true)
  }, [itemForm])

  const handleItemSubmit = useCallback(async () => {
    try {
      const values = await itemForm.validateFields()
      setItemSubmitting(true)
      const payload: Parameters<typeof api.addPickingOrderItem>[0] = {
        order_no: values.order_no,
        seq_no: values.seq_no,
        product_code: values.product_code,
        description: values.description || '',
        quantity: values.quantity,
        unit: values.unit || '',
        project_name: values.project_name || '',
        required_date: values.required_date || '',
        planner: values.planner || '',
        unit_price_ex_tax: 0,
        tax_rate: '',
        unit_price_inc_tax: 0,
        total_amount: 0,
        order_date: '',
        required_factory: ''
      }
      const result = editingItem
        ? await api.updatePickingOrderItem(editingItem.id, payload)
        : await api.addPickingOrderItem(payload)
      if (result.success) {
        message.success(editingItem ? '更新成功' : '新增成功')
        setItemModalOpen(false)
        loadOrder(values.order_no)
        if (values.order_no !== currentOrderNo) {
          setOrderNoInput(values.order_no)
          setCurrentOrderNo(values.order_no)
        }
      } else {
        message.error(result.error || '操作失败')
      }
    } catch {
      // form validation
    } finally {
      setItemSubmitting(false)
    }
  }, [editingItem, itemForm, currentOrderNo, loadOrder])

  const handleOpenSplitModal = useCallback((record: PickingOrderItem) => {
    setSplitTargetItem(record)
    setSplitModalOpen(true)
    setSplitSearchText('')
    setSplitSearchResults([])
    setSplitRows([])
    setSplitRemark(record.pick_remark || '')
    api.getPickingOrderSplits(record.id).then((res) => {
      if (!res.success || !res.data) return
      const rows: SplitRow[] = (res.data as PickingSplitRow[]).map((r, index) => ({
        id: `${record.id}-${r.component_code}-${index}`,
        product: {
          id: 0,
          code: r.component_code,
          description: r.component_code,
          name: '',
          spec: '',
          grade: '',
          surface_treatment: '',
          material: '',
          special_note: '',
          drawings_count: 0,
          created_at: '',
          updated_at: ''
        } as Product,
        quantity: r.quantity_pieces
      }))
      if (rows.length > 0) setSplitRows(rows)
    })
  }, [])

  // 副转只：根据规则自动拆分为栓、母、平垫、弹垫出库
  const hasBothFlatCodes = useCallback((rule?: SubBoltRule | null) => {
    if (!rule) return false
    return !!rule.flat97Code && !!rule.flat95Code
  }, [])

  const resolveProductByCode = useCallback(async (code: string): Promise<Product> => {
    try {
      const result = await api.searchProducts(code)
      if (result.success && result.data && result.data.length > 0) {
        const exact = result.data.find((p) => (p.code || '').trim() === code.trim())
        if (exact) return exact
        return result.data[0]
      }
    } catch {
      // ignore and fallback
    }
    return {
      id: 0,
      code,
      description: code,
      name: '',
      spec: '',
      grade: '',
      surface_treatment: '',
      material: '',
      special_note: '',
      drawings_count: 0,
      created_at: '',
      updated_at: ''
    } as Product
  }, [])

  const handleAutoSubBoltSplit = useCallback(async (record: PickingOrderItem, chosenFlatCode?: string) => {
    const rule = getSubBoltRule(record.product_code)
    if (!rule) {
      return
    }
    const remaining = record.quantity - (record.picked_quantity ?? 0)
    const baseQty = remaining > 0 ? remaining : record.quantity
    const components: Array<{ code: string; quantity: number }> = []

    const pushRow = (code: string | undefined, qty: number) => {
      if (!code || qty <= 0) return
      components.push({ code, quantity: qty })
    }

    pushRow(rule.boltCode, baseQty)
    pushRow(rule.motherCode, baseQty)

    const flatCode = chosenFlatCode || rule.flat97Code || rule.flat95Code
    if (flatCode) {
      pushRow(flatCode, baseQty * (rule.doubleFlatFactor || 1))
    }

    pushRow(rule.springCode, baseQty)

    if (components.length === 0) {
      return
    }

    const resolvedRows = await Promise.all(
      components.map(async (comp, idx) => {
        const product = await resolveProductByCode(comp.code)
        return {
          id: `${record.id}-${comp.code}-${idx}`,
          product,
          quantity: comp.quantity
        } as SplitRow
      })
    )

    setSplitTargetItem(record)
    setSplitRows(resolvedRows)
    setSplitRemark(record.pick_remark || '')
    setSplitModalOpen(true)
  }, [resolveProductByCode, getSubBoltRule])

  const handleOpenOutboundChoice = useCallback((record: PickingOrderItem) => {
    if (!canOutbound) {
      message.warning('当前用户没有配货出库权限')
      return
    }
    if (record.is_picked === 1) return

    // 若为副转只物料，则直接按规则拆分出库（不允许按原物料直接扣减库存）
    const rule = getSubBoltRule(record.product_code)
    if (rule) {
      if (hasBothFlatCodes(rule)) {
        setFlatPadChoiceItem(record)
        setFlatPadChoiceRule(rule)
        setFlatPadChoiceCode(rule.flat97Code || rule.flat95Code || '')
        setFlatPadChoiceOpen(true)
        return
      }
      handleAutoSubBoltSplit(record)
      return
    }

    setOutboundTargetItem(record)
    setOutboundChoiceOpen(true)
  }, [canOutbound, handleAutoSubBoltSplit, hasBothFlatCodes, getSubBoltRule])

  const handleConfirmFlatPadChoice = useCallback(() => {
    if (!flatPadChoiceItem || !flatPadChoiceRule) return
    if (!flatPadChoiceCode) {
      message.warning('请选择平垫编码（97 或 95）')
      return
    }
    handleAutoSubBoltSplit(flatPadChoiceItem, flatPadChoiceCode)
    setFlatPadChoiceOpen(false)
    setFlatPadChoiceItem(null)
    setFlatPadChoiceRule(null)
    setFlatPadChoiceCode('')
  }, [flatPadChoiceItem, flatPadChoiceRule, flatPadChoiceCode, handleAutoSubBoltSplit])

  const handleChooseSplit = useCallback(() => {
    if (outboundTargetItem) {
      const item = outboundTargetItem
      setOutboundChoiceOpen(false)
      setOutboundTargetItem(null)
      handleOpenSplitModal(item)
    }
  }, [outboundTargetItem, handleOpenSplitModal])

  const handleChooseNoSplit = useCallback(() => {
    if (outboundTargetItem) {
      const item = outboundTargetItem
      const remaining = item.quantity - (item.picked_quantity ?? 0)
      setNoSplitTargetItem(item)
      setNoSplitActualQty(remaining)
      setNoSplitRemark('')
      setOutboundChoiceOpen(false)
      setOutboundTargetItem(null)
      setNoSplitModalOpen(true)
    }
  }, [outboundTargetItem])

  const handleConfirmNoSplit = useCallback(async () => {
    if (!canOutbound) {
      message.warning('当前用户没有配货出库权限')
      return
    }
    if (!noSplitTargetItem) return
    const qty = noSplitActualQty
    if (!qty || qty <= 0) {
      message.warning('实际出库数量必须大于 0')
      return
    }
    const remaining = noSplitTargetItem.quantity - (noSplitTargetItem.picked_quantity ?? 0)
    if (qty > remaining) {
      message.warning(`实际出库数量不能大于未配数量（${remaining}）`)
      return
    }
    setNoSplitSubmitting(true)
    try {
      const remarkBase = `订单号：${noSplitTargetItem.order_no}`
      const remark = noSplitRemark ? `${remarkBase}，${noSplitRemark}` : remarkBase
      const result = await api.confirmPickingItems([
        {
          id: noSplitTargetItem.id,
          pickedQty: qty,
          remark
        }
      ])
      if (result.success && result.data) {
        const { success, failed, errors, inventoryErrors } = result.data
        if (success > 0) {
          message.success(qty >= remaining ? '配货已完成' : `本次出库 ${qty} 只，剩余 ${remaining - qty} 待配`)
        }
        if (failed > 0 && errors?.length) {
          Modal.warning({ title: '出库失败', content: errors.map((e, i) => <div key={i} style={{ fontSize: 12 }}>{e}</div>) })
        }
        if (inventoryErrors?.length) {
          Modal.info({
            title: '以下物料不在库存系统中（已标记配货，未扣减库存）',
            content: <div style={{ maxHeight: 200, overflow: 'auto' }}>{inventoryErrors.map((e, i) => <div key={i} style={{ fontSize: 12 }}>{e}</div>)}</div>
          })
        }
        setNoSplitModalOpen(false)
        setNoSplitTargetItem(null)
        loadOrder(currentOrderNo)
      } else {
        message.error(result.error || '确认出库失败')
      }
    } catch {
      message.error('确认出库出错')
    } finally {
      setNoSplitSubmitting(false)
    }
  }, [canOutbound, noSplitTargetItem, noSplitActualQty, noSplitRemark, currentOrderNo, loadOrder])

  const handleCloseSplitModal = useCallback(() => {
    setSplitModalOpen(false)
    setSplitTargetItem(null)
    setSplitSearchText('')
    setSplitSearchResults([])
  }, [])

  const handleSplitSearch = useCallback(async (value?: string) => {
    const query = (value ?? splitSearchText).trim()
    if (!query) {
      setSplitSearchResults([])
      return
    }
    setSplitSearchLoading(true)
    try {
      const result = await api.searchProducts(query)
      if (result.success && result.data) {
        setSplitSearchResults(result.data)
      } else {
        message.error(result.error || '搜索失败')
      }
    } catch {
      message.error('搜索出错')
    } finally {
      setSplitSearchLoading(false)
    }
  }, [splitSearchText])

  const handleAddSplitProduct = useCallback((product: Product) => {
    const defaultQty = splitTargetItem ? splitTargetItem.quantity : 1
    setSplitRows((prev) => [
      ...prev,
      {
        id: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        product,
        quantity: defaultQty
      }
    ])
  }, [splitTargetItem])

  const handleSplitQuantityChange = useCallback((rowId: string, value: number | null) => {
    setSplitRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, quantity: typeof value === 'number' && value > 0 ? value : 1 }
          : row
      )
    )
  }, [])

  const handleRemoveSplitRow = useCallback((rowId: string) => {
    setSplitRows((prev) => prev.filter((row) => row.id !== rowId))
  }, [])

  const doConfirmSplit = useCallback(async () => {
    if (!canOutbound) {
      message.warning('当前用户没有配货出库权限')
      return
    }
    if (!splitTargetItem) return
    const validRows = splitRows.filter((r) => typeof r.quantity === 'number' && r.quantity > 0)
    if (validRows.length === 0) return
    const totalSplitPieces = validRows.reduce((sum, r) => sum + r.quantity, 0)
    setSplitSubmitting(true)
    try {
      // 若已出库，先重置（恢复库存、清除拆分明细），再按新拆分明细重新配货
      if (splitTargetItem.is_picked === 1) {
        const resetResult = await api.resetPickingItems([splitTargetItem.id])
        if (!resetResult.success) {
          message.error(resetResult.error || '重置失败，无法修改拆分')
          return
        }
      }
      const remarkBase = `订单号：${splitTargetItem.order_no}`
      const remarkExtra = splitRemark || `拆分出库：原编码 ${splitTargetItem.product_code}`
      const remark = `${remarkBase}，${remarkExtra}`
      const result = await api.confirmPickingItems([
        {
          id: splitTargetItem.id,
          pickedQty: totalSplitPieces,
          remark,
          components: validRows.map((r) => ({
            code: r.product.code,
            quantity: r.quantity
          }))
        }
      ])
      if (result.success && result.data) {
        const { success, failed, errors, inventoryErrors } = result.data
        if (success > 0) {
          message.success('拆分出库成功')
        }
        if (failed > 0) {
          Modal.warning({
            title: '部分出库失败',
            content: (
              <div>
                {errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12 }}>
                    {e}
                  </div>
                ))}
              </div>
            )
          })
        }
        if (inventoryErrors.length > 0) {
          Modal.info({
            title: '以下物料不在库存系统中（已标记配货，未扣减库存）',
            content: (
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                {inventoryErrors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12 }}>
                    {e}
                  </div>
                ))}
              </div>
            )
          })
        }
        handleCloseSplitModal()
        loadOrder(currentOrderNo)
      } else {
        message.error(result.error || '拆分出库失败')
      }
    } catch {
      message.error('拆分出库出错')
    } finally {
      setSplitSubmitting(false)
    }
  }, [canOutbound, splitTargetItem, splitRows, splitRemark, handleCloseSplitModal, loadOrder, currentOrderNo])

  const handleConfirmSplit = useCallback(() => {
    if (!splitTargetItem) return
    if (splitRows.length === 0) {
      message.warning('请先新增拆分后的物料')
      return
    }
    const validRows = splitRows.filter((r) => typeof r.quantity === 'number' && r.quantity > 0)
    if (validRows.length === 0) {
      message.warning('拆分物料的出库数量必须大于 0')
      return
    }
    Modal.confirm({
      title: '出库前确认',
      content: '是否检查一平/双平？数量是否x2？',
      okText: '已确认，出库',
      cancelText: '取消返回',
      onOk: doConfirmSplit
    })
  }, [splitTargetItem, splitRows, doConfirmSplit])

  // Excel import logic
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      if (!evt.target?.result) return
      try {
        const workbook = XLSX.read(evt.target.result as ArrayBuffer, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
        if (rows.length === 0) { message.warning('文件中没有数据'); return }
        const parsed = rows.map((row, idx) => {
          const getStr = (keys: string[]) => String(keys.map(k => row[k]).find(v => v !== undefined && v !== '') ?? '').trim()
          const getNum = (keys: string[]) => {
            const v = keys.map(k => row[k]).find(v => v !== undefined && v !== '')
            return v !== undefined ? Number(v) : 0
          }
          const order_no = getStr(['单号', 'order_no'])
          const product_code = getStr(['编码', '物料号', 'code', 'product_code'])
          const quantity = getNum(['数量', 'quantity'])
          const valid = !!order_no && !!product_code && !isNaN(quantity) && quantity >= 0
          return {
            _row: idx + 2,
            _valid: valid,
            _error: !order_no ? '单号为空' : !product_code ? '编码为空' : (isNaN(quantity) || quantity < 0) ? '数量无效' : '',
            order_no,
            seq_no: getNum(['序号', 'seq_no']),
            product_code,
            description: getStr(['物料描述', 'description']),
            quantity,
            unit: getStr(['单位', 'unit']),
            unit_price_ex_tax: getNum(['不含税单价', 'unit_price_ex_tax']),
            tax_rate: getStr(['税率', 'tax_rate']),
            unit_price_inc_tax: getNum(['含税单价', 'unit_price_inc_tax']),
            total_amount: getNum(['合计', 'total_amount']),
            order_date: getStr(['下单日期', 'order_date']),
            required_date: getStr(['需求日期', 'required_date']),
            planner: getStr(['计划员', 'planner']),
            project_name: getStr(['工程名称', 'project_name']),
            required_factory: getStr(['需求工厂', 'required_factory'])
          }
        })
        setImportPreview(parsed)
        setImportFileName(file.name)
        setImportStep(1)
      } catch (err) {
        message.error('解析文件失败：' + (err as Error).message)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }, [])

  const loadOrderList = useCallback(async () => {
    setOrderListLoading(true)
    try {
      const result = await api.getPickingOrderList()
      if (result.success && result.data) {
        setOrderList(result.data)
      }
    } catch {
      message.error('加载订单列表失败')
    } finally {
      setOrderListLoading(false)
    }
  }, [])

  const handleImportConfirm = useCallback(async () => {
    const validRows = importPreview.filter(r => r._valid)
    if (validRows.length === 0) { message.warning('没有有效数据'); return }
    setImporting(true)
    try {
      const items = validRows.map(({ _row: _, _valid: __, _error: ___, ...rest }) => rest)
      const result = await api.importPickingOrderItems(items, importOverwriteMode)
      if (result.success && result.data) {
        setImportStep(2)
        if (result.data.success > 0) {
          message.success(`成功导入 ${result.data.success} 条`)
        }
      } else {
        message.error(result.error || '导入失败')
      }
    } catch {
      message.error('导入出错')
    } finally {
      setImporting(false)
    }
  }, [importPreview, importOverwriteMode])

  const handleImportClose = useCallback(() => {
    setImportVisible(false)
    setImportStep(0)
    setImportPreview([])
    setImportFileName('')
    setImportOverwriteMode(false)
    if (currentOrderNo) loadOrder(currentOrderNo)
  }, [currentOrderNo, loadOrder])

  const getOutboundStatus = useCallback((item: PickingOrderItem): string => {
    if (item.is_picked === 1) return '已出库'
    const picked = item.picked_quantity ?? 0
    if (picked > 0) return '部分出库'
    return '待出库'
  }, [])

  const getDeliveryFlowStatus = useCallback((item: PickingOrderItem): string => {
    if (item.is_picked === 1) return '已送货'
    if (item.delivery_note_printed === 1) return '已配送货单已打'
    return '待配货'
  }, [])

  const handleExportOrders = useCallback(async (orderNos?: string[]) => {
    try {
      const result = await api.getPickingOrderExportData(orderNos)
      if (!result.success || !result.data) {
        message.error(result.error || '导出失败')
        return
      }
      const items = result.data
      if (items.length === 0) {
        message.warning('没有可导出的数据')
        return
      }
      const hasOutbound = (item: PickingOrderItem): boolean => item.is_picked === 1 || (item.picked_quantity ?? 0) > 0
      const orderStatusMap = new Map<string, string>()
      const grouped = new Map<string, PickingOrderItem[]>()
      for (const item of items) {
        const rows = grouped.get(item.order_no) || []
        rows.push(item)
        grouped.set(item.order_no, rows)
      }
      for (const [orderNo, rows] of grouped.entries()) {
        const allDelivered = rows.every((row) => row.is_picked === 1)
        const anyOutbound = rows.some((row) => hasOutbound(row))
        const orderStatus = allDelivered ? '已送货' : (anyOutbound ? '在途订单' : '待提计划')
        orderStatusMap.set(orderNo, orderStatus)
      }
      const wsData = items.map((r) => ({
        单号: r.order_no,
        序号: r.seq_no,
        编码: r.product_code,
        物料描述: r.description,
        数量: r.quantity,
        单位: r.unit,
        工程名称: r.project_name,
        需求日期: r.required_date,
        计划员: r.planner,
        出库状态: getOutboundStatus(r),
        送货流程状态: getDeliveryFlowStatus(r),
        订单状态: orderStatusMap.get(r.order_no) || '待提计划'
      }))
      const ws = XLSX.utils.json_to_sheet(wsData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '配货单')
      const now = new Date()
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      XLSX.writeFile(wb, `配货单导出_${dateStr}.xlsx`)
      message.success(`已导出 ${items.length} 条记录`)
    } catch {
      message.error('导出出错')
    }
  }, [])

  const handleExportDeliverySheet = useCallback(async () => {
    if (selectedIds.length === 0) {
      message.warning('请先勾选要导出的物料')
      return
    }
    if (!currentOrderNo) {
      message.warning('请先查询订单后再导出')
      return
    }

    const selectedItems = orderItems
      .filter(item => selectedIds.includes(item.id))
      .sort((a, b) => a.seq_no - b.seq_no)

    if (selectedItems.length === 0) {
      message.warning('未找到已勾选的有效条目')
      return
    }

    const orderNos = Array.from(new Set(selectedItems.map(item => item.order_no)))
    if (orderNos.length !== 1) {
      message.warning('送货单导出仅支持同一订单号的条目')
      return
    }

    try {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('送货单')
      sheet.pageSetup = {
        paperSize: 9,
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      }

      sheet.columns = [
        { width: 10 }, // A 序号
        { width: 22 }, // B 物料编码
        { width: 50 }, // C 物料描述
        { width: 10 }, // D 数量
        { width: 26 } // E 工程名称
      ]

      const orderNo = orderNos[0]
      const now = new Date()
      const exportDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const projectName = selectedItems.find(item => item.project_name?.trim())?.project_name || '-'
      const logoDataUrl = await loadFirstAvailableImageDataUrl([DELIVERY_LOGO_URL, fallbackLogoUrl])
      const barcodeDataUrl = buildBarcodeDataUrl(orderNo)
      const barcodeImageId = workbook.addImage({ base64: barcodeDataUrl, extension: 'png' })
      const logoImageId = logoDataUrl ? workbook.addImage({ base64: logoDataUrl, extension: 'png' }) : null

      const applyTableBorders = (fromRow: number, toRow: number): void => {
        for (let row = fromRow; row <= toRow; row++) {
          for (const col of ['A', 'B', 'C', 'D', 'E']) {
            const cell = sheet.getCell(`${col}${row}`)
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            }
          }
        }
      }

      const renderOneCopy = (startRow: number): number => {
        const titleRow = startRow
        const orderRow = startRow + 1
        const headerRow = startRow + 2
        const materialStartRow = startRow + 3
        const materialEndRow = materialStartRow + selectedItems.length - 1
        const footerAddressRow = materialEndRow + 1
        const footerSignRow = materialEndRow + 2

        sheet.getCell(`C${titleRow}`).value = DELIVERY_NOTE_TITLE
        sheet.getCell(`C${titleRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
        sheet.getCell(`C${titleRow}`).font = { bold: true, size: 16 }

        if (logoImageId) {
          sheet.addImage(logoImageId, {
            tl: { col: 0, row: titleRow - 1 + 0.1 },
            ext: { width: 72, height: 36 }
          })
        }

        sheet.addImage(barcodeImageId, {
          tl: { col: 4, row: titleRow - 1 + 0.05 },
          ext: { width: 170, height: 40 }
        })

        sheet.mergeCells(`A${orderRow}:E${orderRow}`)
        sheet.getCell(`A${orderRow}`).value = `购买单位：丰尚             送货日期：${exportDateStr}                      订单号：${orderNo}   `
        sheet.getCell(`A${orderRow}`).font = { bold: true, size: 12 }
        sheet.getCell(`A${orderRow}`).alignment = { vertical: 'middle', horizontal: 'left' }

        sheet.getCell(`A${headerRow}`).value = '序号'
        sheet.getCell(`B${headerRow}`).value = '物料编码'
        sheet.getCell(`C${headerRow}`).value = '物料描述'
        sheet.getCell(`D${headerRow}`).value = '数量'
        sheet.getCell(`E${headerRow}`).value = '工程名称'
        for (const col of ['A', 'B', 'C', 'D', 'E']) {
          const cell = sheet.getCell(`${col}${headerRow}`)
          cell.font = { bold: true }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' }
          }
        }

        selectedItems.forEach((item, index) => {
          const row = materialStartRow + index
          sheet.getCell(`A${row}`).value = item.seq_no
          sheet.getCell(`B${row}`).value = item.product_code || '-'
          sheet.getCell(`C${row}`).value = item.description || '-'
          sheet.getCell(`D${row}`).value = item.quantity
          sheet.getCell(`A${row}`).alignment = { vertical: 'middle', horizontal: 'center' }
          sheet.getCell(`B${row}`).alignment = { vertical: 'middle', horizontal: 'left' }
          sheet.getCell(`C${row}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
          sheet.getCell(`D${row}`).alignment = { vertical: 'middle', horizontal: 'center' }
        })

        sheet.mergeCells(`E${materialStartRow}:E${materialEndRow}`)
        sheet.getCell(`E${materialStartRow}`).value = projectName
        sheet.getCell(`E${materialStartRow}`).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }

        sheet.mergeCells(`A${footerAddressRow}:E${footerAddressRow}`)
        sheet.getCell(`A${footerAddressRow}`).value = '公司地址：扬州市邗江区三盛国际广场3幢1607室                                               电话：0514-87950633'
        sheet.getCell(`A${footerAddressRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
        sheet.getCell(`A${footerAddressRow}`).font = { size: 11 }

        sheet.mergeCells(`A${footerSignRow}:E${footerSignRow}`)
        sheet.getCell(`A${footerSignRow}`).value = '送货：                               质检：                           收货：                          '
        sheet.getCell(`A${footerSignRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
        sheet.getCell(`A${footerSignRow}`).font = { size: 11 }

        for (let row = titleRow; row <= footerSignRow; row++) {
          sheet.getRow(row).height = row === titleRow ? 28 : 24
        }
        applyTableBorders(headerRow, materialEndRow)

        return footerSignRow
      }

      const firstCopyEndRow = renderOneCopy(1)
      renderOneCopy(firstCopyEndRow + 3)

      const fileName = `送货单_${orderNo}_${exportDateStr}.xlsx`
      const xlsxBuffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob(
        [xlsxBuffer],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      const markResult = await api.markDeliveryNotePrinted(selectedItems.map((item) => item.id))
      if (!markResult.success) {
        message.warning(markResult.error || '送货单已导出，但标记“已打送货单”失败')
      } else if (currentOrderNo) {
        void loadOrder(currentOrderNo)
      }

      message.success(`送货单导出成功（${selectedItems.length} 条，一式两份）`)
      if (!logoDataUrl) {
        message.warning('未加载到公司 Logo，已导出无 Logo 版本')
      }
    } catch {
      message.error('导出送货单失败，请稍后重试')
    }
  }, [selectedIds, currentOrderNo, orderItems, loadOrder])

  const handleBatchDeleteOrders = useCallback(async () => {
    if (selectedOrderNos.length === 0) {
      message.warning('请先选择要删除的订单')
      return
    }
    setOrderListDeleting(true)
    try {
      const result = await api.batchDeletePickingOrders(selectedOrderNos)
      if (result.success && result.data !== undefined) {
        message.success(`已删除 ${result.data} 条记录`)
        setSelectedOrderNos([])
        loadOrderList()
        if (currentOrderNo && selectedOrderNos.includes(currentOrderNo)) {
          setOrderItems([])
          setCurrentOrderNo('')
          setOrderNoInput('')
        } else if (currentOrderNo) {
          loadOrder(currentOrderNo)
        }
      } else {
        message.error(result.error || '删除失败')
      }
    } catch {
      message.error('删除出错')
    } finally {
      setOrderListDeleting(false)
    }
  }, [selectedOrderNos, currentOrderNo, loadOrderList, loadOrder])

  const handleClearAllOrders = useCallback(async () => {
    setOrderListDeleting(true)
    try {
      const result = await api.deleteAllPickingOrders()
      if (result.success && result.data !== undefined) {
        message.success(`已清空 ${result.data} 条记录`)
        setSelectedOrderNos([])
        loadOrderList()
        setOrderItems([])
        setCurrentOrderNo('')
        setOrderNoInput('')
      } else {
        message.error(result.error || '清空失败')
      }
    } catch {
      message.error('清空出错')
    } finally {
      setOrderListDeleting(false)
    }
  }, [loadOrderList])

  const pendingItems = orderItems.filter(i => i.is_picked === 0)
  const pickedItems = orderItems.filter(i => i.is_picked === 1)
  const validCountImport = importPreview.filter(r => r._valid).length
  const invalidCountImport = importPreview.filter(r => !r._valid).length

  const handleOpenPrintLabel = useCallback(
    (record: PickingOrderItem) => {
      if (!onOpenPrintLabel) {
        message.warning('当前环境不支持打标签跳转')
        return
      }
      onOpenPrintLabel({
        productCode: record.product_code,
        orderNo: record.order_no,
        projectName: record.project_name,
        quantity: record.quantity,
        unit: record.unit || '只'
      })
    },
    [onOpenPrintLabel]
  )

  const handleOpenBilingualLabelRow = useCallback(
    async (record: PickingOrderItem) => {
      if (!onOpenBilingualLabel) {
        message.warning('当前环境不支持双语标签跳转')
        return
      }
      const res = await api.getProductByCode(record.product_code.trim())
      const en = res.success && res.data ? (res.data.description_en?.trim() ?? '') : ''
      onOpenBilingualLabel({
        productCode: record.product_code,
        orderNo: record.order_no,
        projectName: record.project_name,
        quantity: record.quantity,
        unit: record.unit || '只',
        lineDescriptionZh: record.description || record.product_code,
        lineDescriptionEn: en
      })
    },
    [onOpenBilingualLabel]
  )

  const handleOpenCombinedLabel = useCallback(() => {
    if (!onOpenPrintLabel) {
      message.warning('当前环境不支持打标签跳转')
      return
    }
    if (selectedIds.length === 0) {
      message.warning('请先勾选要拼箱的物料')
      return
    }
    if (selectedIds.length < 2 || selectedIds.length > 4) {
      message.warning('拼箱标签目前仅支持同时选择 2～4 个物料')
      return
    }
    if (!currentOrderNo) {
      message.warning('请先查询并加载配货单')
      return
    }
    const items = selectedIds
      .map((id) => orderItems.find((i) => i.id === id))
      .filter((i): i is PickingOrderItem => !!i)

    if (items.length < 2 || items.length > 4 || items.length !== selectedIds.length) {
      message.error('选中的物料数据有误，请重新选择')
      return
    }

    // 初始化拼箱物料编码、数量和单位（数量默认取待配数量，单位默认“只”）
    const initialCode: Record<number, string> = {}
    const initialQty: Record<number, number> = {}
    const initialUnit: Record<number, '只' | '套'> = {}
    items.forEach((item) => {
      initialCode[item.id] = item.product_code
      const remaining = item.quantity - (item.picked_quantity ?? 0)
      initialQty[item.id] = remaining > 0 ? remaining : item.quantity
      initialUnit[item.id] = (item.unit === '套' ? '套' : '只') as '只' | '套'
    })
    setCombineModalForBilingual(false)
    setCombineItems(items)
    setCombineCodeMap(initialCode)
    setCombineQtyMap(initialQty)
    setCombineUnitMap(initialUnit)
    setCombineModalOpen(true)
  }, [onOpenPrintLabel, selectedIds, currentOrderNo, orderItems])

  const handleOpenBilingualCombined = useCallback(() => {
    if (!onOpenBilingualLabel) {
      message.warning('当前环境不支持双语标签跳转')
      return
    }
    if (selectedIds.length === 0) {
      message.warning('请先勾选要拼箱的物料')
      return
    }
    if (selectedIds.length < 2 || selectedIds.length > 3) {
      message.warning('中英文拼箱目前仅支持同时选择 2～3 个物料')
      return
    }
    if (!currentOrderNo) {
      message.warning('请先查询并加载配货单')
      return
    }
    const items = selectedIds
      .map((id) => orderItems.find((i) => i.id === id))
      .filter((i): i is PickingOrderItem => !!i)

    if (items.length < 2 || items.length > 3 || items.length !== selectedIds.length) {
      message.error('选中的物料数据有误，请重新选择')
      return
    }

    const initialCode: Record<number, string> = {}
    const initialQty: Record<number, number> = {}
    const initialUnit: Record<number, '只' | '套'> = {}
    items.forEach((item) => {
      initialCode[item.id] = item.product_code
      const remaining = item.quantity - (item.picked_quantity ?? 0)
      initialQty[item.id] = remaining > 0 ? remaining : item.quantity
      initialUnit[item.id] = (item.unit === '套' ? '套' : '只') as '只' | '套'
    })
    setCombineModalForBilingual(true)
    setCombineItems(items)
    setCombineCodeMap(initialCode)
    setCombineQtyMap(initialQty)
    setCombineUnitMap(initialUnit)
    setCombineModalOpen(true)
  }, [onOpenBilingualLabel, selectedIds, currentOrderNo, orderItems])

  const handleConfirmCombinedModal = useCallback(async () => {
    if (combineModalForBilingual) {
      if (!onOpenBilingualLabel) {
        message.warning('当前环境不支持双语标签跳转')
        return
      }
      if (!currentOrderNo || combineItems.length < 2) {
        message.error('拼箱数据有误，请重新选择（至少需要 2 个物料）')
        return
      }
      const withProject = combineItems.map((item) => {
        const code = (combineCodeMap[item.id] ?? item.product_code).trim()
        const qty = combineQtyMap[item.id] ?? item.quantity
        const unit = combineUnitMap[item.id] ?? '只'
        return {
          code,
          description: item.description || item.product_code,
          quantity: qty > 0 ? qty : item.quantity,
          unit,
          projectName: item.project_name
        }
      })
      if (withProject.some((it) => !it.quantity || it.quantity <= 0)) {
        message.warning('请为每个物料输入大于 0 的数量')
        return
      }
      const bilingualCombinedItems: NonNullable<PrintPagePreset['bilingualCombinedItems']> = []
      for (const row of withProject) {
        const res = await api.getProductByCode(row.code)
        const en = res.success && res.data ? (res.data.description_en?.trim() ?? '') : ''
        bilingualCombinedItems.push({
          productCode: row.code,
          descriptionZh: row.description,
          descriptionEn: en,
          quantity: row.quantity,
          unit: row.unit
        })
      }
      const first = bilingualCombinedItems[0]
      const firstWithCode = withProject[0]
      onOpenBilingualLabel({
        productCode: first?.productCode ?? combineItems[0]?.product_code ?? '',
        orderNo: currentOrderNo,
        projectName: firstWithCode?.projectName ?? combineItems[0]?.project_name ?? '',
        quantity: first?.quantity ?? 0,
        unit: first?.unit ?? '只',
        bilingualCombinedItems,
        boxNo: combineBoxNo != null && combineBoxNo > 0 ? combineBoxNo : undefined
      })
      setCombineModalOpen(false)
      setCombineModalForBilingual(false)
      return
    }

    if (!onOpenPrintLabel) {
      message.warning('当前环境不支持打标签跳转')
      return
    }
    if (!currentOrderNo || combineItems.length < 2) {
      message.error('拼箱数据有误，请重新选择（至少需要 2 个物料）')
      return
    }
    const withProject = combineItems.map((item) => {
      const code = (combineCodeMap[item.id] ?? item.product_code).trim()
      const qty = combineQtyMap[item.id] ?? item.quantity
      const unit = combineUnitMap[item.id] ?? '只'
      return {
        code, // 编码被清空时传空字符串，标签上不显示编码但仍显示描述和数量
        description: item.description || item.product_code,
        quantity: qty > 0 ? qty : item.quantity,
        unit,
        projectName: item.project_name
      }
    })
    const combinedItems: CombinedLabelItem[] = withProject.map(
      ({ projectName: _, ...rest }) => rest
    )

    if (combinedItems.some((it) => !it.quantity || it.quantity <= 0)) {
      message.warning('请为每个物料输入大于 0 的数量')
      return
    }

    const firstWithCode = withProject.find((it) => it.code)
    const first = combinedItems[0]

    onOpenPrintLabel({
      productCode: firstWithCode?.code ?? combineItems[0]?.product_code ?? '',
      orderNo: currentOrderNo,
      projectName: firstWithCode?.projectName ?? combineItems[0]?.project_name ?? '',
      quantity: first.quantity,
      unit: first.unit ?? '只',
      combinedItems,
      boxNo: combineBoxNo != null && combineBoxNo > 0 ? combineBoxNo : undefined
    })
    setCombineModalOpen(false)
  }, [
    combineModalForBilingual,
    onOpenBilingualLabel,
    onOpenPrintLabel,
    currentOrderNo,
    combineItems,
    combineCodeMap,
    combineQtyMap,
    combineUnitMap,
    combineBoxNo
  ])

  const handleCombineCodeChange = useCallback((itemId: number, value: string) => {
    setCombineCodeMap((prev) => ({ ...prev, [itemId]: value }))
  }, [])

  const buildBatchOutboundPayload = useCallback((
    items: PickingOrderItem[],
    flatPadChoiceForBatch?: '97' | '95'
  ) => {
    const orderNo = currentOrderNo || items[0]?.order_no || ''
    return items
      .map((item) => {
        const remaining = item.quantity - (item.picked_quantity ?? 0)
        const basePayload: {
          id: number
          pickedQty: number
          remark: string
          components?: { code: string; quantity: number }[]
        } = {
          id: item.id,
          pickedQty: remaining,
          remark: orderNo ? `订单号：${orderNo}，统一出库` : '统一出库'
        }
        const rule = getSubBoltRule(item.product_code)
        if (!rule) {
          return basePayload
        }

        const components: { code: string; quantity: number }[] = []
        const pushComp = (code: string | undefined, qty: number) => {
          if (!code || qty <= 0) return
          components.push({ code, quantity: qty })
        }

        pushComp(rule.boltCode, remaining)
        pushComp(rule.motherCode, remaining)
        const flatCode = hasBothFlatCodes(rule)
          ? (flatPadChoiceForBatch === '95' ? rule.flat95Code : rule.flat97Code)
          : (rule.flat97Code || rule.flat95Code)
        pushComp(flatCode, remaining * (rule.doubleFlatFactor || 1))
        pushComp(rule.springCode, remaining)

        if (components.length > 0) {
          basePayload.components = components
          basePayload.remark = orderNo
            ? `订单号：${orderNo}，统一出库，原编码${item.product_code}`
            : `统一出库，原编码${item.product_code}`
        }

        return basePayload
      })
      .filter((p) => p.pickedQty > 0)
  }, [currentOrderNo, hasBothFlatCodes, getSubBoltRule])

  const executeBatchOutbound = useCallback((
    items: PickingOrderItem[],
    flatPadChoiceForBatch?: '97' | '95'
  ) => {
    if (!canOutbound) {
      message.warning('当前用户没有配货出库权限')
      return
    }
    const payload = buildBatchOutboundPayload(items, flatPadChoiceForBatch)
    if (payload.length === 0) {
      message.warning('所选条目没有可出库数量')
      return
    }

    Modal.confirm({
      title: '确认统一出库',
      content: `共 ${payload.length} 条记录，将按剩余未出数量一次性出库。是否继续？`,
      okText: '确认出库',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await api.confirmPickingItems(payload)
          if (result.success && result.data) {
            const { success, failed, errors, inventoryErrors } = result.data
            if (success > 0) {
              message.success(`已统一出库 ${success} 条记录`)
            }
            if (failed > 0 && errors?.length) {
              Modal.warning({
                title: '部分出库失败',
                content: (
                  <div>
                    {errors.map((e, i) => (
                      <div key={i} style={{ fontSize: 12 }}>
                        {e}
                      </div>
                    ))}
                  </div>
                )
              })
            }
            if (inventoryErrors?.length) {
              Modal.info({
                title: '以下物料不在库存系统中（已标记配货，未扣减库存）',
                content: (
                  <div style={{ maxHeight: 200, overflow: 'auto' }}>
                    {inventoryErrors.map((e, i) => (
                      <div key={i} style={{ fontSize: 12 }}>
                        {e}
                      </div>
                    ))}
                  </div>
                )
              })
            }
            if (currentOrderNo) {
              loadOrder(currentOrderNo)
            }
          } else {
            message.error(result.error || '统一出库失败')
          }
        } catch {
          message.error('统一出库出错')
        }
      }
    })
  }, [canOutbound, buildBatchOutboundPayload, currentOrderNo, loadOrder])

  const handleBatchOutbound = useCallback(() => {
    if (!canOutbound) {
      message.warning('当前用户没有配货出库权限')
      return
    }
    if (selectedIds.length === 0) {
      message.warning('请先勾选要出库的条目')
      return
    }

    const items = selectedIds
      .map((id) => orderItems.find((i) => i.id === id))
      .filter((i): i is PickingOrderItem => !!i && i.is_picked === 0)

    if (items.length === 0) {
      message.warning('所选条目均已出库')
      return
    }

    const ambiguousFlatPadItems = items.filter((item) => {
      const rule = getSubBoltRule(item.product_code)
      return !!rule && hasBothFlatCodes(rule)
    })

    if (ambiguousFlatPadItems.length > 0) {
      setBatchPendingItems(items)
      setBatchFlatPadChoice('97')
      setBatchFlatPadChoiceOpen(true)
      return
    }

    executeBatchOutbound(items)
  }, [canOutbound, selectedIds, orderItems, hasBothFlatCodes, executeBatchOutbound, getSubBoltRule])

  const handleConfirmBatchFlatPadChoice = useCallback(() => {
    if (batchPendingItems.length === 0) {
      setBatchFlatPadChoiceOpen(false)
      return
    }
    executeBatchOutbound(batchPendingItems, batchFlatPadChoice)
    setBatchFlatPadChoiceOpen(false)
    setBatchPendingItems([])
  }, [batchPendingItems, batchFlatPadChoice, executeBatchOutbound])

  const isRuleMatchedItem = useCallback((item: PickingOrderItem) => {
    const description = (item.description || '').trim()
    const hasFu = description.includes('副')
    const has1228 = description.includes('1228')
    const has3632 = description.includes('3632')
    // 规则：勾选描述不含“副”，或描述中含“1228”/“3632”的条目
    return !hasFu || has1228 || has3632
  }, [])

  const handleSelectByRule = useCallback(() => {
    const selectableItems = orderItems.filter((item) => item.is_picked !== 1)
    if (selectableItems.length === 0) {
      message.warning('当前无可勾选条目')
      return
    }
    const matchedIds = selectableItems.filter(isRuleMatchedItem).map((item) => item.id)
    setSelectedIds(matchedIds)
    message.success(`已勾选“只/1228/3632”规则条目 ${matchedIds.length} 条`)
  }, [orderItems, isRuleMatchedItem])

  const handleInverseRuleSelection = useCallback(() => {
    const selectableItems = orderItems.filter((item) => item.is_picked !== 1)
    if (selectableItems.length === 0) {
      message.warning('当前无可勾选条目')
      return
    }
    const inverseIds = selectableItems
      .filter((item) => !isRuleMatchedItem(item))
      .map((item) => item.id)
    setSelectedIds(inverseIds)
    message.success(`已反选“只/1228/3632”规则结果，共勾选 ${inverseIds.length} 条`)
  }, [orderItems, isRuleMatchedItem])

  const columns = [
    {
      title: '序号',
      dataIndex: 'seq_no',
      key: 'seq_no',
      width: 60,
      align: 'center' as const
    },
    {
      title: '编码',
      dataIndex: 'product_code',
      key: 'product_code',
      width: 150,
      render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text>
    },
    {
      title: '物料描述',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      ellipsis: true,
      render: (v: string, record: PickingOrderItem) => (
        <Space size="small" wrap>
          <span title={v}>{v || record.product_code}</span>
          <Space size={4}>
            {canOutbound && (
              <Button
                type="primary"
                size="small"
                onClick={() => handleOpenOutboundChoice(record)}
                disabled={record.is_picked === 1}
              >
                出库
              </Button>
            )}
            <Button
              type="link"
              size="small"
              onClick={() => handleOpenPrintLabel(record)}
            >
              打标签
            </Button>
            {onOpenBilingualLabel && (
              <Button
                type="link"
                size="small"
                onClick={() => void handleOpenBilingualLabelRow(record)}
              >
                双语标签
              </Button>
            )}
          </Space>
        </Space>
      )
    },
    {
      title: '应出数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'right' as const,
      render: (v: number, record: PickingOrderItem) => (
        <span>
          {v}
          {record.unit ? <Text type="secondary" style={{ fontSize: 11, marginLeft: 2 }}>{record.unit}</Text> : null}
        </span>
      )
    },
    {
      title: '工程名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 100,
      ellipsis: true
    },
    {
      title: '实际出库量',
      key: 'picked_qty',
      width: 130,
      render: (_: unknown, record: PickingOrderItem) => {
        if (record.is_picked === 1) {
          return <Text>{record.picked_quantity ?? record.quantity} {record.unit || '只'}</Text>
        }
        const picked = record.picked_quantity ?? 0
        const total = record.quantity
        if (picked > 0) {
          return <Text type="secondary">已出 {picked}，剩余 {total - picked} {record.unit || '只'}</Text>
        }
        return <Text type="secondary">待出库 {total} {record.unit || '只'}</Text>
      }
    },
    {
      title: '备注',
      key: 'remark',
      width: 160,
      render: (_: unknown, record: PickingOrderItem) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{record.pick_remark || '-'}</Text>
      )
    },
    {
      title: '状态',
      key: 'status',
      width: 90,
      align: 'center' as const,
      render: (_: unknown, record: PickingOrderItem) => {
        if (record.is_picked === 1) {
          return (
            <Tooltip title={`${record.picked_by} · ${record.picked_at?.slice(0, 16) ?? ''}`}>
              <Tag color="success">已出库</Tag>
            </Tooltip>
          )
        }
        const picked = record.picked_quantity ?? 0
        if (picked > 0) {
          return <Tag color="processing">部分出库</Tag>
        }
        return <Tag color="warning">待配货</Tag>
      }
    },
    {
      title: '操作',
      key: 'action',
      width: canManage ? 140 : 100,
      render: (_: unknown, record: PickingOrderItem) => (
        <Space size="small">
          {canManage && (
            <>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleOpenEditItem(record)}
                disabled={record.is_picked === 1}
              >
                编辑
              </Button>
              <Popconfirm
                title="确定删除此条目？"
                onConfirm={() => handleDeleteItem(record.id)}
                okText="删除"
                cancelText="取消"
                okType="danger"
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </>
          )}
          {canOutbound && ((record.is_picked === 1) || ((record.is_picked === 0) && (record.picked_quantity ?? 0) > 0)) && (
            <Popconfirm
              title={record.is_picked === 1 ? '重置后将恢复库存、清除配货状态。是否继续？' : '撤销本次部分出库，恢复库存。是否继续？'}
              onConfirm={() => handleResetPick([record.id])}
              okText="重置"
              cancelText="取消"
              okType="danger"
            >
              <Button type="link" size="small" icon={<ReloadOutlined />}>
                重置
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ]

  const rowSelection = {
    selectedRowKeys: selectedIds,
    onChange: (keys: React.Key[]) => setSelectedIds(keys as number[]),
    getCheckboxProps: (_record: PickingOrderItem) => ({
      disabled: false
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />
      {/* Search bar */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            ref={searchInputRef}
            placeholder="扫码或输入单号后按回车查询"
            value={orderNoInput}
            onChange={(e) => setOrderNoInput(e.target.value)}
            onPressEnter={handleSearch}
            prefix={<SearchOutlined />}
            allowClear
            size="large"
            style={{ flex: 1, minWidth: 220, maxWidth: 360, fontSize: 16 }}
            autoFocus
          />
          <Button type="primary" size="large" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
            查询
          </Button>
          <Button
            type="primary"
            size="large"
            onClick={handleOpenCombinedLabel}
            disabled={orderItems.length === 0}
          >
            拼箱
          </Button>
          {onOpenBilingualLabel && (
            <Button
              type="primary"
              size="large"
              onClick={handleOpenBilingualCombined}
              disabled={orderItems.length === 0}
            >
              中英文拼箱
            </Button>
          )}
          {canOutbound && (
            <Button
              size="large"
              onClick={handleBatchOutbound}
              disabled={orderItems.length === 0}
            >
              统一出库
            </Button>
          )}
          <Button
            size="large"
            onClick={handleSelectByRule}
            disabled={orderItems.length === 0}
          >
            勾选只/1228/3632的物料
          </Button>
          <Button
            size="large"
            onClick={handleInverseRuleSelection}
            disabled={orderItems.length === 0}
          >
            反选只/1228/3632的物料
          </Button>
          {canManage && (
            <>
              <Button size="large" icon={<UnorderedListOutlined />} onClick={() => { setOrderListVisible(true); loadOrderList() }}>
                订单管理
              </Button>
              <Button size="large" icon={<UploadOutlined />} onClick={() => setImportVisible(true)}>
                Excel导入
              </Button>
              <Button size="large" icon={<ExportOutlined />} onClick={() => handleExportOrders()}>
                导出所有订单
              </Button>
              <Button size="large" icon={<PlusOutlined />} onClick={handleOpenAddItem}>
                新增条目
              </Button>
              {currentOrderNo && (
                <Popconfirm
                  title={`删除订单「${currentOrderNo}」的全部记录？此操作不可撤销。`}
                  onConfirm={handleDeleteOrder}
                  okText="删除"
                  cancelText="取消"
                  okType="danger"
                >
                  <Button size="large" danger>
                    删除此订单
                  </Button>
                </Popconfirm>
              )}
            </>
          )}
        </div>
      </Card>

      {canViewInventory && (
        <>
          <input
            ref={subBoltCsvInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            style={{ display: 'none' }}
            onChange={(e) => void handleSubBoltCsvSelected(e)}
          />
          <Card size="small" title="副转只拆分规则（表格）" style={{ marginBottom: 12 }}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              出库时若物料号命中规则表，将按栓/母/平垫/弹垫自动拆分扣库存。支持上传
              <Text strong>CSV / XLSX / XLS</Text>
              ：首行表头可用中文或英文别名（须能识别「物料号」或「物料编码」列），系统会转为统一的标准 CSV
              再保存。可先下载当前规则 XLSX，在 WPS 或 Excel 中编辑后再上传覆盖。上传后立即对所有客户端生效。
            </Text>
            <Space wrap align="center">
              <Tag color={subBoltRulesSource === 'custom' ? 'blue' : 'default'}>
                {subBoltRulesSource === 'custom' ? '当前：自定义规则' : '当前：内置规则'}
              </Tag>
              <Text type="secondary">共 {subBoltRulesRowCount} 条物料映射</Text>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadSubBoltRules()}>
                刷新
              </Button>
              <Button size="small" onClick={() => void handleDownloadCurrentSubBoltRulesXlsx()}>
                下载当前规则 XLSX
              </Button>
              <Button
                size="small"
                type="primary"
                icon={<UploadOutlined />}
                loading={subBoltRulesUploading}
                onClick={() => subBoltCsvInputRef.current?.click()}
              >
                上传覆盖规则
              </Button>
            </Space>
          </Space>
        </Card>
        </>
      )}

      {/* Order items table */}
      {orderItems.length > 0 && (
        <Card
          size="small"
          title={
            <Space>
              <span>单号：<Text strong>{currentOrderNo}</Text></span>
              <Tag color="blue">共 {orderItems.length} 条</Tag>
              <Tag color="warning">待配货 {pendingItems.length}</Tag>
              <Tag color="success">已出库 {pickedItems.length}</Tag>
            </Space>
          }
          extra={
            <Space>
              <Button
                type="default"
                icon={<ExportOutlined />}
                onClick={handleExportDeliverySheet}
                disabled={selectedIds.length === 0}
              >
                导出送货单（选中）
              </Button>
              <Button
                type="default"
                icon={<ExportOutlined />}
                onClick={() => handleExportOrders(currentOrderNo ? [currentOrderNo] : undefined)}
                disabled={orderItems.length === 0}
              >
                导出当前订单
              </Button>
            </Space>
          }
          style={{ flex: 1, overflow: 'auto' }}
          styles={{ body: { padding: 0 } }}
        >
          <ResizableTable
            rowKey="id"
            size="small"
            dataSource={orderItems}
            columns={columns}
            rowSelection={rowSelection}
            pagination={false}
            scroll={{ x: 1100 }}
            loading={loading}
            rowClassName={(record) => record.is_picked === 1 ? 'picking-row-picked' : ''}
          />
        </Card>
      )}

      {/* Add/Edit item modal */}
      <Modal
        title={editingItem ? '编辑配货条目' : '新增配货条目'}
        open={itemModalOpen}
        onOk={handleItemSubmit}
        onCancel={() => setItemModalOpen(false)}
        confirmLoading={itemSubmitting}
        destroyOnClose
        width={480}
      >
        <Form form={itemForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="单号" name="order_no" rules={[{ required: true, message: '请输入单号' }]}>
            <Input placeholder="订单单号" />
          </Form.Item>
          <Form.Item label="序号" name="seq_no" rules={[{ required: true, message: '请输入序号' }]}>
            <InputNumber style={{ width: '100%' }} min={1} placeholder="行序号" />
          </Form.Item>
          <Form.Item label="物料编码" name="product_code" rules={[{ required: true, message: '请输入物料编码' }]}>
            <Input placeholder="物料编码" />
          </Form.Item>
          <Form.Item label="物料描述" name="description">
            <Input placeholder="物料描述" />
          </Form.Item>
          <Form.Item label="数量" name="quantity" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber style={{ width: '100%' }} min={0} placeholder="应出数量" />
          </Form.Item>
          <Form.Item label="单位" name="unit">
            <Input placeholder="EA / 件 / 套..." />
          </Form.Item>
          <Form.Item label="工程名称" name="project_name">
            <Input placeholder="工程名称" />
          </Form.Item>
          <Form.Item label="需求日期" name="required_date">
            <Input placeholder="如：2026/1/20" />
          </Form.Item>
          <Form.Item label="计划员" name="planner">
            <Input placeholder="计划员姓名" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Excel import modal */}
      <Modal
        title="Excel 批量导入配货单"
        open={importVisible}
        onCancel={handleImportClose}
        width={780}
        footer={
          importStep === 0
            ? [
                <Button key="cancel" onClick={handleImportClose}>取消</Button>,
                <Button key="select" type="primary" icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                  选择文件
                </Button>
              ]
            : importStep === 1
              ? [
                  <Button key="back" onClick={() => setImportStep(0)}>重新选择</Button>,
                  <Button
                    key="import"
                    type="primary"
                    onClick={handleImportConfirm}
                    loading={importing}
                    disabled={validCountImport === 0}
                  >
                    确认导入 ({validCountImport} 条)
                  </Button>
                ]
              : [
                  <Button key="done" type="primary" onClick={handleImportClose}>完成</Button>
                ]
        }
        destroyOnClose
      >
        <Steps
          current={importStep}
          size="small"
          style={{ marginBottom: 24 }}
          items={[{ title: '选择文件' }, { title: '预览数据' }, { title: '导入完成' }]}
        />
        {importStep === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <FileExcelOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
            <div style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 15 }}>请选择配货单 Excel 文件</Text>
            </div>
            <Alert
              type="info"
              showIcon
              message="Excel 列名说明（顺序不限）"
              description={
                <div style={{ textAlign: 'left', fontSize: 12 }}>
                  <p>必填：<Tag>单号</Tag><Tag>编码</Tag><Tag>数量</Tag><Tag>序号</Tag></p>
                  <p>选填：<Tag>物料描述</Tag><Tag>单位</Tag><Tag>工程名称</Tag><Tag>需求日期</Tag><Tag>计划员</Tag><Tag>需求工厂</Tag><Tag>不含税单价</Tag><Tag>税率</Tag><Tag>含税单价</Tag><Tag>合计</Tag><Tag>下单日期</Tag></p>
                  <p style={{ color: '#888', marginTop: 4 }}>已出库的条目重复导入时不会覆盖配货状态</p>
                  <div style={{ marginTop: 12 }}>
                    <Checkbox
                      checked={importOverwriteMode}
                      onChange={(e) => setImportOverwriteMode(e.target.checked)}
                    >
                      覆盖导入：导入前先删除文件中订单号的未出库条目，再导入（已出库条目不受影响）
                    </Checkbox>
                  </div>
                </div>
              }
              style={{ maxWidth: 520, margin: '0 auto', textAlign: 'left' }}
            />
          </div>
        )}
        {importStep === 1 && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Checkbox
                checked={importOverwriteMode}
                onChange={(e) => setImportOverwriteMode(e.target.checked)}
              >
                覆盖导入（导入前先删除文件中订单号的未出库条目）
              </Checkbox>
            </div>
            <Space style={{ marginBottom: 12 }}>
              <Text>文件：{importFileName}</Text>
              <Tag color="processing">共 {importPreview.length} 行</Tag>
              <Tag color="success">有效 {validCountImport} 行</Tag>
              {invalidCountImport > 0 && <Tag color="error">无效 {invalidCountImport} 行</Tag>}
            </Space>
            <ResizableTable
              dataSource={importPreview}
              rowKey="_row"
              size="small"
              pagination={false}
              scroll={{ y: 320 }}
              columns={[
                { title: '行', dataIndex: '_row', width: 50 },
                {
                  title: '状态', dataIndex: '_valid', width: 80,
                  render: (v: boolean, r: any) => v
                    ? <Tag color="success">有效</Tag>
                    : <Tag color="error">{r._error}</Tag>
                },
                { title: '单号', dataIndex: 'order_no', width: 120, ellipsis: true },
                { title: '序号', dataIndex: 'seq_no', width: 55 },
                { title: '编码', dataIndex: 'product_code', width: 140, ellipsis: true },
                { title: '物料描述', dataIndex: 'description', ellipsis: true },
                { title: '数量', dataIndex: 'quantity', width: 70 },
                { title: '工程', dataIndex: 'project_name', width: 80, ellipsis: true }
              ]}
            />
          </div>
        )}
        {importStep === 2 && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
            <div><Text style={{ fontSize: 16 }}>导入完成</Text></div>
          </div>
        )}
      </Modal>

      {/* Order management drawer */}
      <Drawer
        title="配货单订单管理"
        width={560}
        open={orderListVisible}
        onClose={() => { setOrderListVisible(false); setSelectedOrderNos([]) }}
        extra={
          <Space>
            <Button
              icon={<ExportOutlined />}
              onClick={() => handleExportOrders(selectedOrderNos.length > 0 ? selectedOrderNos : undefined)}
              disabled={orderList.length === 0}
            >
              导出{selectedOrderNos.length > 0 ? `所选(${selectedOrderNos.length})` : '全部'}
            </Button>
            <Popconfirm
              title={`确定删除选中的 ${selectedOrderNos.length} 个订单？`}
              onConfirm={handleBatchDeleteOrders}
              okText="删除"
              cancelText="取消"
              okType="danger"
              disabled={selectedOrderNos.length === 0}
            >
              <Button danger loading={orderListDeleting} disabled={selectedOrderNos.length === 0}>
                批量删除
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确定清空数据库中所有配货单数据？此操作不可撤销。"
              onConfirm={handleClearAllOrders}
              okText="清空"
              cancelText="取消"
              okType="danger"
            >
              <Button danger icon={<ClearOutlined />} loading={orderListDeleting}>
                清空全部
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">数据库中共 {orderList.length} 个订单，点击单号可快速查询</Text>
        </div>
        <ResizableTable
          size="small"
          rowKey="order_no"
          loading={orderListLoading}
          dataSource={orderList}
          pagination={{ pageSize: 20 }}
          rowSelection={{
            selectedRowKeys: selectedOrderNos,
            onChange: (keys) => setSelectedOrderNos(keys as string[])
          }}
          columns={[
            {
              title: '订单号',
              dataIndex: 'order_no',
              key: 'order_no',
              render: (no: string) => (
                <Button type="link" size="small" onClick={() => { setOrderNoInput(no); setOrderListVisible(false); loadOrder(no) }}>
                  {no}
                </Button>
              )
            },
            { title: '总条数', dataIndex: 'total_count', key: 'total_count', width: 80 },
            { title: '待配货', dataIndex: 'pending_count', key: 'pending_count', width: 80, render: (v: number) => <Tag color="warning">{v}</Tag> },
            { title: '已出库', dataIndex: 'picked_count', key: 'picked_count', width: 80, render: (v: number) => <Tag color="success">{v}</Tag> }
          ]}
        />
      </Drawer>

      {/* 副转只：平垫97/95选择 */}
      <Modal
        title="选择平垫编码"
        open={flatPadChoiceOpen}
        onCancel={() => {
          setFlatPadChoiceOpen(false)
          setFlatPadChoiceItem(null)
          setFlatPadChoiceRule(null)
          setFlatPadChoiceCode('')
        }}
        onOk={handleConfirmFlatPadChoice}
        okText="确认并继续出库"
        cancelText="取消"
        destroyOnClose
        width={420}
      >
        {flatPadChoiceItem && flatPadChoiceRule && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
              物料 <Text code>{flatPadChoiceItem.product_code}</Text> 同时配置了平垫 97/95 编码，请选择本次出库使用的平垫编码。
            </div>
            <Radio.Group
              value={flatPadChoiceCode}
              onChange={(e) => setFlatPadChoiceCode(e.target.value)}
              style={{ display: 'flex', gap: 8, flexDirection: 'column' }}
            >
              {flatPadChoiceRule.flat97Code && (
                <Radio value={flatPadChoiceRule.flat97Code}>平垫 97：{flatPadChoiceRule.flat97Code}</Radio>
              )}
              {flatPadChoiceRule.flat95Code && (
                <Radio value={flatPadChoiceRule.flat95Code}>平垫 95：{flatPadChoiceRule.flat95Code}</Radio>
              )}
            </Radio.Group>
          </div>
        )}
      </Modal>

      {/* 统一出库：平垫97/95统一选择 */}
      <Modal
        title="统一出库平垫编码选择"
        open={batchFlatPadChoiceOpen}
        onCancel={() => {
          setBatchFlatPadChoiceOpen(false)
          setBatchPendingItems([])
        }}
        onOk={handleConfirmBatchFlatPadChoice}
        okText="确认并继续统一出库"
        cancelText="取消"
        destroyOnClose
        width={440}
      >
        <div style={{ paddingTop: 8 }}>
          <div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
            已选条目中存在同时配置平垫 97/95 编码的物料，请选择本次统一出库统一使用哪种平垫编码。
          </div>
          <Radio.Group
            value={batchFlatPadChoice}
            onChange={(e) => setBatchFlatPadChoice(e.target.value)}
            style={{ display: 'flex', gap: 8, flexDirection: 'column' }}
          >
            <Radio value="97">统一按照 97 平垫出库</Radio>
            <Radio value="95">统一按照 95 平垫出库</Radio>
          </Radio.Group>
        </div>
      </Modal>

      {/* 出库选择：拆 / 不拆 */}
      <Modal
        title="选择出库方式"
        open={outboundChoiceOpen}
        onCancel={() => { setOutboundChoiceOpen(false); setOutboundTargetItem(null) }}
        footer={null}
        width={360}
        destroyOnClose
      >
        {outboundTargetItem && (
          <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#666' }}>
              <Text code>{outboundTargetItem.product_code}</Text>
              <span style={{ marginLeft: 8 }}>{outboundTargetItem.description || '-'}</span>
              <div style={{ marginTop: 4 }}>应出数量：{outboundTargetItem.quantity} {outboundTargetItem.unit || '只'}</div>
            </div>
            <Space size="middle">
              <Button type="primary" size="large" onClick={handleChooseSplit}>
                拆
              </Button>
              <Button size="large" onClick={handleChooseNoSplit}>
                不拆
              </Button>
            </Space>
            <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
              「拆」：选择拆分后的物料，按子件出库；「不拆」：按当前物料直接出库，可部分出库。
            </div>
          </div>
        )}
      </Modal>

      {/* 不拆：实际出库数量 */}
      <Modal
        title={noSplitTargetItem ? `出库 - ${noSplitTargetItem.product_code}` : '出库'}
        open={noSplitModalOpen}
        onCancel={() => { setNoSplitModalOpen(false); setNoSplitTargetItem(null) }}
        onOk={handleConfirmNoSplit}
        okText="确认出库"
        cancelText="取消"
        confirmLoading={noSplitSubmitting}
        destroyOnClose
        width={480}
      >
        {noSplitTargetItem && (
          <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}><Text strong>物料：</Text>{noSplitTargetItem.description || noSplitTargetItem.product_code}</div>
              <div style={{ marginBottom: 8 }}>
                <Text strong>应出数量：</Text>{noSplitTargetItem.quantity} {noSplitTargetItem.unit || '只'}
                {(noSplitTargetItem.picked_quantity ?? 0) > 0 && (
                  <span style={{ marginLeft: 12, color: '#ff9800' }}>
                    已出 {(noSplitTargetItem.picked_quantity ?? 0)}，剩余 {noSplitTargetItem.quantity - (noSplitTargetItem.picked_quantity ?? 0)} {noSplitTargetItem.unit || '只'}
                  </span>
                )}
              </div>
            </div>
            <Form layout="vertical">
              <Form.Item
                label="本次实际出库数量（只）"
                help="货不全时可修改为部分数量；一次性全出则保持默认即可"
              >
                <InputNumber
                  min={1}
                  max={noSplitTargetItem.quantity - (noSplitTargetItem.picked_quantity ?? 0)}
                  value={noSplitActualQty}
                  onChange={(v) => setNoSplitActualQty(v ?? 0)}
                  style={{ width: '100%' }}
                  addonAfter="只"
                />
              </Form.Item>
              <Form.Item label="备注（选填）">
                <Input
                  placeholder="可填写备注"
                  value={noSplitRemark}
                  onChange={(e) => setNoSplitRemark(e.target.value)}
                />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      {/* Split picking modal */}
      <Modal
        title={
          splitTargetItem
            ? `拆分配货 - 单号 ${splitTargetItem.order_no} 序号 ${splitTargetItem.seq_no}`
            : '拆分配货'
        }
        open={splitModalOpen}
        onCancel={handleCloseSplitModal}
        footer={null}
        width={900}
        destroyOnClose
      >
        {splitTargetItem && (
          <div style={{ marginTop: 8 }}>
            <Alert
              type="info"
              showIcon
              message="拆分说明"
              description={
                <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                  <div>原物料不扣减库存，下方选择的物料将实际扣减库存。</div>
                  <div>
                    原编码：<Text code>{splitTargetItem.product_code}</Text>，描述：
                    {splitTargetItem.description || '-'}，应出数量：{splitTargetItem.quantity}
                    {splitTargetItem.unit && (
                      <Text type="secondary" style={{ marginLeft: 4 }}>
                        {splitTargetItem.unit}
                      </Text>
                    )}
                  </div>
                </div>
              }
              style={{ marginBottom: 12 }}
            />

            <Card size="small" title="搜索并选择实际出库物料" style={{ marginBottom: 12 }}>
              <Input.Search
                placeholder="多条件搜索，用空格分隔，如：5783 10*20"
                value={splitSearchText}
                onChange={(e) => setSplitSearchText(e.target.value)}
                onSearch={handleSplitSearch}
                enterButton={<><SearchOutlined /> 搜索</>}
                loading={splitSearchLoading}
              />
              <div style={{ marginTop: 8 }}>
                <ResizableTable
                  size="small"
                  rowKey="id"
                  dataSource={splitSearchResults}
                  pagination={false}
                  scroll={{ y: 200 }}
                  columns={[
                    { title: '物料号', dataIndex: 'code', key: 'code', width: 120 },
                    { title: '物料描述', dataIndex: 'description', key: 'description', ellipsis: true },
                    {
                      title: '操作',
                      key: 'action',
                      width: 80,
                      render: (_: unknown, record: Product) => (
                        <Button type="link" size="small" onClick={() => handleAddSplitProduct(record)}>
                          选择
                        </Button>
                      )
                    }
                  ]}
                />
              </div>
            </Card>

            <Card
              size="small"
              title="拆分后的出库明细"
              extra={
                <span style={{ fontSize: 12 }}>
                  原应出：{splitTargetItem.quantity}{splitTargetItem.unit || ''}，已分配合计：
                  {splitRows.reduce((sum, r) => sum + (r.quantity || 0), 0)}只
                  （≈ {splitRows.reduce((sum, r) => sum + (r.quantity || 0), 0) / 1000}千）
                </span>
              }
            >
              <ResizableTable
                size="small"
                rowKey="id"
                dataSource={splitRows}
                pagination={false}
                locale={{ emptyText: '请在上方搜索并选择实际出库物料' }}
                columns={[
                  {
                    title: '编码',
                    dataIndex: ['product', 'code'],
                    key: 'code',
                    width: 140,
                    render: (_: unknown, row: SplitRow) => <Text code style={{ fontSize: 12 }}>{row.product.code}</Text>
                  },
                  {
                    title: '物料描述',
                    dataIndex: ['product', 'description'],
                    key: 'description',
                    ellipsis: true,
                    render: (_: unknown, row: SplitRow) => row.product.description
                  },
                  {
                    title: '出库数量（只）',
                    key: 'quantity',
                    width: 140,
                    render: (_: unknown, row: SplitRow) => (
                      <InputNumber
                        size="small"
                        min={1}
                        step={1}
                        value={row.quantity}
                        onChange={(v) => handleSplitQuantityChange(row.id, v)}
                        style={{ width: 120 }}
                      />
                    )
                  },
                  {
                    title: '操作',
                    key: 'action',
                    width: 80,
                    render: (_: unknown, row: SplitRow) => (
                      <Button type="link" size="small" danger onClick={() => handleRemoveSplitRow(row.id)}>
                        删除
                      </Button>
                    )
                  }
                ]}
              />

              <div style={{ marginTop: 12 }}>
                <Input
                  placeholder="备注（选填，如：拆分原因、使用位置等）"
                  value={splitRemark}
                  onChange={(e) => setSplitRemark(e.target.value)}
                />
              </div>

              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <Space>
                  <Button onClick={handleCloseSplitModal}>取消</Button>
                  <Button type="primary" onClick={handleConfirmSplit} loading={splitSubmitting}>
                    确认保存并出库
                  </Button>
                </Space>
              </div>
            </Card>
          </div>
        )}
      </Modal>

      {/* Combine label quantity modal */}
      <Modal
        title={combineModalForBilingual ? '中英文拼箱数量设置' : '拼箱数量设置'}
        open={combineModalOpen}
        onCancel={() => {
          setCombineModalOpen(false)
          setCombineModalForBilingual(false)
        }}
        onOk={() => void handleConfirmCombinedModal()}
        okText={combineModalForBilingual ? '跳转双语大标签' : '跳转打印大标签'}
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
            {combineModalForBilingual
              ? '中英文拼箱：中文行为配货行描述，英文行从物料库「英文描述」拉取。可编辑编码、数量、单位及箱号，然后点击「跳转双语大标签」。'
              : '可编辑物料编码（支持清空后重新输入），选择数量及单位（套/只），可填写箱号（如 4 表示 4 号箱，会打印为 4#），然后点击「跳转打印大标签」。'}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 16,
              gap: 4
            }}
          >
            <span style={{ width: 60, fontSize: 12 }}>箱号：</span>
            <InputNumber
              min={1}
              placeholder="如 4 表示 4 号箱"
              value={combineBoxNo}
              onChange={(v) => setCombineBoxNo(v ?? undefined)}
              style={{ width: 140 }}
            />
          </div>
          {combineItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 10,
                gap: 8,
                flexWrap: 'wrap'
              }}
            >
              <Input
                value={combineCodeMap[item.id] ?? item.product_code}
                onChange={(e) => handleCombineCodeChange(item.id, e.target.value)}
                placeholder="物料编码"
                style={{ width: 140, fontFamily: 'monospace', fontSize: 12 }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 120,
                  fontSize: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={item.description || item.product_code}
              >
                {item.description || item.product_code}
              </span>
              <InputNumber
                min={1}
                step={1}
                value={combineQtyMap[item.id]}
                onChange={(v) =>
                  setCombineQtyMap((prev) => ({
                    ...prev,
                    [item.id]: v ?? 0
                  }))
                }
                style={{ width: 90 }}
              />
              <Radio.Group
                value={combineUnitMap[item.id] ?? '只'}
                onChange={(e) =>
                  setCombineUnitMap((prev) => ({
                    ...prev,
                    [item.id]: e.target.value
                  }))
                }
                size="small"
              >
                <Radio.Button value="只">只</Radio.Button>
                <Radio.Button value="套">套</Radio.Button>
              </Radio.Group>
            </div>
          ))}
        </div>
      </Modal>

      <style>{`
        .picking-row-picked td {
          background-color: #f6ffed !important;
          color: #888;
        }
      `}</style>
    </div>
  )
}

export default PickingOrderPage
