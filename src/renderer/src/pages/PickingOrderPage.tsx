import { useState, useRef, useCallback, useEffect } from 'react'
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
  Checkbox
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
import ResizableTable from '../components/ResizableTable'
import { api, type PickingOrderItem, type Product, type PickingSplitRow, type PickingOrderSummary } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

const { Text } = Typography

interface SplitRow {
  id: string
  product: Product
  quantity: number
}

interface CombinedLabelItem {
  code: string
  description: string
  quantity: number
}

interface PickingOrderPageProps {
  onOpenPrintLabel?: (payload: {
    productCode: string
    orderNo: string
    projectName: string
    quantity: number
    unit: string
    combinedItems?: CombinedLabelItem[]
  }) => void
  initialOrderNo?: string
  onOrderLoaded?: (orderNo: string) => void
}

function PickingOrderPage({ onOpenPrintLabel, initialOrderNo, onOrderLoaded }: PickingOrderPageProps): JSX.Element {
  const { user } = useAuth()
  // 只有具有“查看库存”权限的用户，才允许在配货单中进行新增、编辑、删除等管理操作
  const canManage = user?.canViewInventory ?? false

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

  // Order management drawer
  const [orderListVisible, setOrderListVisible] = useState(false)
  const [orderList, setOrderList] = useState<PickingOrderSummary[]>([])
  const [orderListLoading, setOrderListLoading] = useState(false)
  const [selectedOrderNos, setSelectedOrderNos] = useState<string[]>([])
  const [orderListDeleting, setOrderListDeleting] = useState(false)

  // Combine label modal
  const [combineModalOpen, setCombineModalOpen] = useState(false)
  const [combineItems, setCombineItems] = useState<PickingOrderItem[]>([])
  const [combineQtyMap, setCombineQtyMap] = useState<Record<number, number>>({})

  // 出库选择 modal：拆 / 不拆
  const [outboundChoiceOpen, setOutboundChoiceOpen] = useState(false)
  const [outboundTargetItem, setOutboundTargetItem] = useState<PickingOrderItem | null>(null)

  // 不拆 modal：实际出库数量
  const [noSplitModalOpen, setNoSplitModalOpen] = useState(false)
  const [noSplitTargetItem, setNoSplitTargetItem] = useState<PickingOrderItem | null>(null)
  const [noSplitActualQty, setNoSplitActualQty] = useState<number>(0)
  const [noSplitRemark, setNoSplitRemark] = useState('')
  const [noSplitSubmitting, setNoSplitSubmitting] = useState(false)

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
  }, [currentOrderNo, loadOrder])

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
      const payload = {
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
          created_at: '',
          updated_at: ''
        } as Product,
        quantity: r.quantity_pieces
      }))
      if (rows.length > 0) setSplitRows(rows)
    })
  }, [])

  const handleOpenOutboundChoice = useCallback((record: PickingOrderItem) => {
    if (record.is_picked === 1) return
    setOutboundTargetItem(record)
    setOutboundChoiceOpen(true)
  }, [])

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
      const result = await api.confirmPickingItems([
        {
          id: noSplitTargetItem.id,
          pickedQty: qty,
          remark: noSplitRemark || ''
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
  }, [noSplitTargetItem, noSplitActualQty, noSplitRemark, currentOrderNo, loadOrder])

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
      const result = await api.confirmPickingItems([
        {
          id: splitTargetItem.id,
          pickedQty: totalSplitPieces,
          remark: splitRemark || `拆分出库：原编码 ${splitTargetItem.product_code}`,
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
  }, [splitTargetItem, splitRows, splitRemark, handleCloseSplitModal, loadOrder, currentOrderNo])

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
        状态: r.is_picked === 1 ? '已出库' : '待配货'
      }))
      const ws = XLSX.utils.json_to_sheet(wsData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '配货单')
      XLSX.writeFile(wb, `配货单导出_${new Date().toISOString().slice(0, 10)}.xlsx`)
      message.success(`已导出 ${items.length} 条记录`)
    } catch {
      message.error('导出出错')
    }
  }, [])

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

  const handleOpenCombinedLabel = useCallback(() => {
    if (!onOpenPrintLabel) {
      message.warning('当前环境不支持打标签跳转')
      return
    }
    if (selectedIds.length === 0) {
      message.warning('请先勾选要拼箱的物料')
      return
    }
    if (selectedIds.length < 2 || selectedIds.length > 3) {
      message.warning('拼箱标签目前仅支持同时选择 2～3 个物料')
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

    // 初始化拼箱数量（默认取待配数量，即订单数量 - 已出库量）
    const initialQty: Record<number, number> = {}
    items.forEach((item) => {
      const remaining = item.quantity - (item.picked_quantity ?? 0)
      initialQty[item.id] = remaining > 0 ? remaining : item.quantity
    })
    setCombineItems(items)
    setCombineQtyMap(initialQty)
    setCombineModalOpen(true)
  }, [onOpenPrintLabel, selectedIds, currentOrderNo, orderItems])

  const handleConfirmCombinedModal = useCallback(() => {
    if (!onOpenPrintLabel) {
      message.warning('当前环境不支持打标签跳转')
      return
    }
    if (!currentOrderNo || combineItems.length < 2) {
      message.error('拼箱数据有误，请重新选择（至少需要 2 个物料）')
      return
    }
    const combinedItems: CombinedLabelItem[] = combineItems.map((item) => {
      const qty = combineQtyMap[item.id] ?? item.quantity
      return {
        code: item.product_code,
        description: item.description || item.product_code,
        quantity: qty > 0 ? qty : item.quantity
      }
    })

    // 校验数量必须大于 0
    if (combinedItems.some((it) => !it.quantity || it.quantity <= 0)) {
      message.warning('请为每个物料输入大于 0 的数量')
      return
    }

    const first = combineItems[0]

    onOpenPrintLabel({
      productCode: first.product_code,
      orderNo: currentOrderNo,
      projectName: first.project_name,
      quantity: combinedItems[0].quantity,
      unit: '只',
      combinedItems
    })
    setCombineModalOpen(false)
  }, [onOpenPrintLabel, currentOrderNo, combineItems, combineQtyMap])

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
            <Button
              type="primary"
              size="small"
              onClick={() => handleOpenOutboundChoice(record)}
              disabled={record.is_picked === 1}
            >
              出库
            </Button>
            <Button
              type="link"
              size="small"
              onClick={() => handleOpenPrintLabel(record)}
            >
              打标签
            </Button>
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
          {((record.is_picked === 1) || ((record.is_picked === 0) && (record.picked_quantity ?? 0) > 0)) && (
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
    getCheckboxProps: (record: PickingOrderItem) => ({
      disabled: record.is_picked === 1
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
            placeholder="输入完整单号后按回车查询"
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
            size="large"
            onClick={handleOpenCombinedLabel}
            disabled={orderItems.length === 0}
          >
            拼箱
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
            <Button
              type="default"
              icon={<ExportOutlined />}
              onClick={() => handleExportOrders(currentOrderNo ? [currentOrderNo] : undefined)}
              disabled={orderItems.length === 0}
            >
              导出当前订单
            </Button>
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
        title="拼箱数量设置"
        open={combineModalOpen}
        onCancel={() => setCombineModalOpen(false)}
        onOk={handleConfirmCombinedModal}
        okText="跳转打印大标签"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ marginTop: 8 }}>
          {combineItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 8,
                gap: 8
              }}
            >
              <span style={{ width: 140, fontFamily: 'monospace', fontSize: 12 }}>
                {item.product_code}
              </span>
              <span
                style={{
                  flex: 1,
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
                style={{ width: 100 }}
                addonAfter="只"
              />
            </div>
          ))}
          <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
            请确认每个物料的拼箱数量（单位固定为「只」），然后点击「跳转打印大标签」。
          </div>
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
