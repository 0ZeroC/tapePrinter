import { useCallback, useMemo, useState, type JSX } from 'react'
import { Button, Card, Input, Modal, Space, Typography, message } from 'antd'
import { DeleteOutlined, ExportOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import ExcelJS from 'exceljs'
import JsBarcode from 'jsbarcode'
import ResizableTable from '../components/ResizableTable'
import { api, type PickingOrderItem } from '../utils/api'

const { Text } = Typography
const DELIVERY_NOTE_TITLE = '通用送货单'

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

type MergeGroup = { from: number; to: number; key: string }

function buildContiguousGroups(items: PickingOrderItem[], keyOf: (item: PickingOrderItem) => string): MergeGroup[] {
  if (items.length === 0) return []
  const groups: MergeGroup[] = []
  let start = 0
  let prev = keyOf(items[0])
  for (let i = 1; i <= items.length; i++) {
    const curr = i < items.length ? keyOf(items[i]) : '__END__'
    if (curr !== prev) {
      groups.push({ from: start, to: i - 1, key: prev })
      start = i
      prev = curr
    }
  }
  return groups
}

function MergedDeliverySheetPage(): JSX.Element {
  const [items, setItems] = useState<PickingOrderItem[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [queryOrderNo, setQueryOrderNo] = useState('')
  const [queryRows, setQueryRows] = useState<PickingOrderItem[]>([])
  const [queryLoading, setQueryLoading] = useState(false)
  const [querySelectedIds, setQuerySelectedIds] = useState<number[]>([])
  const [exporting, setExporting] = useState(false)

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.order_no.localeCompare(b.order_no) || a.seq_no - b.seq_no || a.id - b.id),
    [items]
  )

  const handleQueryOrder = useCallback(async () => {
    const orderNo = queryOrderNo.trim()
    if (!orderNo) {
      message.warning('请输入订单号')
      return
    }
    setQueryLoading(true)
    try {
      const result = await api.getPickingOrderItems(orderNo)
      if (!result.success) {
        message.error(result.error || '查询失败')
        return
      }
      const rows = result.data || []
      setQueryRows(rows.sort((a, b) => a.seq_no - b.seq_no))
      setQuerySelectedIds([])
      if (rows.length === 0) {
        message.warning(`未找到订单号「${orderNo}」的物料行`)
      }
    } catch {
      message.error('查询订单出错')
    } finally {
      setQueryLoading(false)
    }
  }, [queryOrderNo])

  const handleConfirmAddRows = useCallback(() => {
    if (querySelectedIds.length === 0) {
      message.warning('请先勾选要增加的物料')
      return
    }
    const selectedRows = queryRows.filter((row) => querySelectedIds.includes(row.id))
    if (selectedRows.length === 0) {
      message.warning('未找到有效勾选项')
      return
    }
    setItems((prev) => {
      const exists = new Set(prev.map((r) => r.id))
      const appended = selectedRows.filter((row) => !exists.has(row.id))
      if (appended.length < selectedRows.length) {
        message.info('已自动跳过重复物料行')
      }
      return [...prev, ...appended]
    })
    setAddModalOpen(false)
    setQueryRows([])
    setQuerySelectedIds([])
    setQueryOrderNo('')
    message.success(`已增加 ${selectedRows.length} 条物料`)
  }, [queryRows, querySelectedIds])

  const handleRemoveSelected = useCallback(() => {
    if (selectedIds.length === 0) {
      message.warning('请先勾选要移除的物料')
      return
    }
    setItems((prev) => prev.filter((row) => !selectedIds.includes(row.id)))
    setSelectedIds([])
    message.success(`已移除 ${selectedIds.length} 条物料`)
  }, [selectedIds])

  const handleExport = useCallback(async () => {
    if (sortedItems.length === 0) {
      message.warning('请先增加要导出的物料')
      return
    }
    setExporting(true)
    try {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('拼送货单')
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
        { width: 26 }, // E 工程名称
        { width: 24 } // F 订单号(含条码)
      ]

      const now = new Date()
      const exportDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

      const applyTableBorders = (fromRow: number, toRow: number): void => {
        for (let row = fromRow; row <= toRow; row++) {
          for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) {
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
        const materialEndRow = materialStartRow + sortedItems.length - 1
        const footerAddressRow = materialEndRow + 1
        const footerSignRow = materialEndRow + 2

        sheet.getCell(`C${titleRow}`).value = DELIVERY_NOTE_TITLE
        sheet.getCell(`C${titleRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
        sheet.getCell(`C${titleRow}`).font = { bold: true, size: 16 }

        sheet.mergeCells(`A${orderRow}:F${orderRow}`)
        sheet.getCell(`A${orderRow}`).value = `购买单位：________             送货日期：${exportDateStr}`
        sheet.getCell(`A${orderRow}`).font = { bold: true, size: 12 }
        sheet.getCell(`A${orderRow}`).alignment = { vertical: 'middle', horizontal: 'left' }

        sheet.getCell(`A${headerRow}`).value = '序号'
        sheet.getCell(`B${headerRow}`).value = '物料编码'
        sheet.getCell(`C${headerRow}`).value = '物料描述'
        sheet.getCell(`D${headerRow}`).value = '数量'
        sheet.getCell(`E${headerRow}`).value = '工程名称'
        sheet.getCell(`F${headerRow}`).value = '订单号'
        for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) {
          const cell = sheet.getCell(`${col}${headerRow}`)
          cell.font = { bold: true }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2F2F2' }
          }
        }

        sortedItems.forEach((item, index) => {
          const row = materialStartRow + index
          sheet.getCell(`A${row}`).value = index + 1
          sheet.getCell(`B${row}`).value = item.product_code || '-'
          sheet.getCell(`C${row}`).value = item.description || '-'
          sheet.getCell(`D${row}`).value = item.quantity
          sheet.getCell(`A${row}`).alignment = { vertical: 'middle', horizontal: 'center' }
          sheet.getCell(`B${row}`).alignment = { vertical: 'middle', horizontal: 'left' }
          sheet.getCell(`C${row}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
          sheet.getCell(`D${row}`).alignment = { vertical: 'middle', horizontal: 'center' }
        })

        const projectGroups = buildContiguousGroups(sortedItems, (item) => (item.project_name || '-').trim() || '-')
        for (const group of projectGroups) {
          const from = materialStartRow + group.from
          const to = materialStartRow + group.to
          if (from !== to) {
            sheet.mergeCells(`E${from}:E${to}`)
          }
          sheet.getCell(`E${from}`).value = group.key
          sheet.getCell(`E${from}`).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        }

        const orderGroups = buildContiguousGroups(sortedItems, (item) => item.order_no)
        for (const group of orderGroups) {
          const from = materialStartRow + group.from
          const to = materialStartRow + group.to
          if (from !== to) {
            sheet.mergeCells(`F${from}:F${to}`)
          }
          sheet.getCell(`F${from}`).value = group.key
          sheet.getCell(`F${from}`).alignment = { vertical: 'top', horizontal: 'center', wrapText: true }
          const barcodeDataUrl = buildBarcodeDataUrl(group.key)
          const barcodeImageId = workbook.addImage({ base64: barcodeDataUrl, extension: 'png' })
          sheet.addImage(barcodeImageId, {
            tl: { col: 5, row: from - 1 + 0.75 },
            ext: { width: 120, height: 36 }
          })
        }

        sheet.mergeCells(`A${footerAddressRow}:F${footerAddressRow}`)
        sheet.getCell(`A${footerAddressRow}`).value = '公司地址：____________________                                               电话：____________________'
        sheet.getCell(`A${footerAddressRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
        sheet.getCell(`A${footerAddressRow}`).font = { size: 11 }

        sheet.mergeCells(`A${footerSignRow}:F${footerSignRow}`)
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

      const fileName = `拼送货单_${exportDateStr}.xlsx`
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

      const markResult = await api.markDeliveryNotePrinted(sortedItems.map((item) => item.id))
      if (!markResult.success) {
        message.warning(markResult.error || '拼送货单已导出，但标记“已打送货单”失败')
      }

      message.success(`拼送货单导出成功（${sortedItems.length} 条，一式两份）`)
    } catch {
      message.error('导出拼送货单失败，请稍后重试')
    } finally {
      setExporting(false)
    }
  }, [sortedItems])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <Space wrap>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => setAddModalOpen(true)}>
            增加物料
          </Button>
          <Button icon={<DeleteOutlined />} danger disabled={selectedIds.length === 0} onClick={handleRemoveSelected}>
            移除所选
          </Button>
          <Button icon={<ExportOutlined />} type="default" loading={exporting} onClick={handleExport}>
            导出拼送货单
          </Button>
          <Text type="secondary">当前已选 {sortedItems.length} 条物料</Text>
        </Space>
      </Card>

      <Card title="拼单物料清单">
        <ResizableTable
          rowKey="id"
          dataSource={sortedItems}
          pagination={{ pageSize: 20 }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys as number[])
          }}
          columns={[
            { title: '订单号', dataIndex: 'order_no', key: 'order_no', width: 170 },
            { title: '序号', dataIndex: 'seq_no', key: 'seq_no', width: 70 },
            { title: '物料编码', dataIndex: 'product_code', key: 'product_code', width: 150 },
            { title: '物料描述', dataIndex: 'description', key: 'description', width: 320 },
            { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90 },
            { title: '工程名称', dataIndex: 'project_name', key: 'project_name', width: 180 }
          ]}
        />
      </Card>

      <Modal
        title="增加拼单物料"
        open={addModalOpen}
        onCancel={() => {
          setAddModalOpen(false)
          setQueryRows([])
          setQuerySelectedIds([])
          setQueryOrderNo('')
        }}
        onOk={handleConfirmAddRows}
        okText="确认增加"
        cancelText="取消"
        width={980}
      >
        <Space style={{ marginBottom: 12 }}>
          <Input
            style={{ width: 260 }}
            placeholder="请输入订单号"
            value={queryOrderNo}
            onChange={(e) => setQueryOrderNo(e.target.value)}
            onPressEnter={() => void handleQueryOrder()}
          />
          <Button icon={<SearchOutlined />} loading={queryLoading} onClick={() => void handleQueryOrder()}>
            查询订单
          </Button>
          <Text type="secondary">查询后勾选物料行，点击“确认增加”返回拼单清单</Text>
        </Space>

        <ResizableTable
          rowKey="id"
          loading={queryLoading}
          dataSource={queryRows}
          pagination={{ pageSize: 8 }}
          rowSelection={{
            selectedRowKeys: querySelectedIds,
            onChange: (keys) => setQuerySelectedIds(keys as number[])
          }}
          columns={[
            { title: '订单号', dataIndex: 'order_no', key: 'order_no', width: 170 },
            { title: '序号', dataIndex: 'seq_no', key: 'seq_no', width: 70 },
            { title: '物料编码', dataIndex: 'product_code', key: 'product_code', width: 150 },
            { title: '物料描述', dataIndex: 'description', key: 'description', width: 300 },
            { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90 },
            { title: '工程名称', dataIndex: 'project_name', key: 'project_name', width: 180 }
          ]}
        />
      </Modal>
    </div>
  )
}

export default MergedDeliverySheetPage
