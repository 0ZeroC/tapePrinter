import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Input,
  Table,
  Button,
  InputNumber,
  Card,
  Modal,
  message,
  Space,
  Descriptions,
  Tag,
  Empty,
  Select,
  Dropdown
} from 'antd'
import { SearchOutlined, ExportOutlined, FilterOutlined, DownloadOutlined, DeleteOutlined, DownOutlined, UploadOutlined, UndoOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { api, type Product, type InventoryLog } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import StockImportModal from '../components/StockImportModal'

function StockOutPage(): JSX.Element {
  const { user } = useAuth()
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [currentStock, setCurrentStock] = useState<number | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [logs, setLogs] = useState<InventoryLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [filterDateStart, setFilterDateStart] = useState('')
  const [filterDateEnd, setFilterDateEnd] = useState('')
  const [filterOperator, setFilterOperator] = useState<string>('')
  const [filterKeyword, setFilterKeyword] = useState('')
  const searchInputRef = useRef<any>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [deleting, setDeleting] = useState(false)
  const [importVisible, setImportVisible] = useState(false)
  const pageSize = 20

  const isAdmin = user?.role === 'admin'
  const canViewInventory = user?.canViewInventory ?? false

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const dateStr = (log.created_at || '').slice(0, 10)
      if (filterDateStart && dateStr < filterDateStart) return false
      if (filterDateEnd && dateStr > filterDateEnd) return false
      if (filterOperator && (log.operator_name || '') !== filterOperator) return false
      if (filterKeyword.trim()) {
        const kw = filterKeyword.trim().toLowerCase()
        const code = (log.product_code || '').toLowerCase()
        const name = (log.product_name || '').toLowerCase()
        const remark = (log.remark || '').toLowerCase()
        if (!code.includes(kw) && !name.includes(kw) && !remark.includes(kw)) return false
      }
      return true
    })
  }, [logs, filterDateStart, filterDateEnd, filterOperator, filterKeyword])

  const operatorOptions = useMemo(() => {
    const names = Array.from(new Set(logs.map((l) => l.operator_name).filter(Boolean))) as string[]
    return names.sort().map((name) => ({ label: name, value: name }))
  }, [logs])

  const loadLogs = useCallback(async () => {
    if (!canViewInventory) return
    setLogsLoading(true)
    try {
      const result = await api.getInventoryLogs(undefined, 'out')
      if (result.success && result.data) {
        setLogs(result.data)
      }
    } catch {
      // ignore
    } finally {
      setLogsLoading(false)
    }
  }, [canViewInventory])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const handleSearch = useCallback(async (value: string) => {
    if (!value.trim()) {
      setSearchResults([])
      return
    }
    setLoading(true)
    try {
      const result = await api.searchProducts(value.trim())
      if (result.success && result.data) {
        setSearchResults(result.data)
        if (result.data.length === 1) {
          handleSelectProduct(result.data[0])
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

  const handleSelectProduct = useCallback(
    async (product: Product) => {
      setSelectedProduct(product)
      setQuantity(1)
      setRemark('')
      if (canViewInventory) {
        try {
          const result = await api.getInventory(product.id)
          if (result.success) {
            setCurrentStock(result.data ?? 0)
          }
        } catch {
          setCurrentStock(null)
        }
      } else {
        setCurrentStock(null)
      }
      setModalOpen(true)
    },
    [canViewInventory]
  )

  const handleStockOut = useCallback(async () => {
    if (!selectedProduct) return
    if (quantity < 1) {
      message.warning('请输入有效的数量')
      return
    }
    setSubmitting(true)
    try {
      const result = await api.stockOut(selectedProduct.id, quantity, remark)
      if (result.success) {
        message.success(`出库成功：${selectedProduct.name} x ${quantity}`)
        setModalOpen(false)
        setSearchText('')
        setSearchResults([])
        loadLogs()
        setTimeout(() => searchInputRef.current?.focus(), 100)
      } else {
        message.error(result.error || '出库失败')
      }
    } catch {
      message.error('出库出错')
    } finally {
      setSubmitting(false)
    }
  }, [selectedProduct, quantity, remark, loadLogs])

  const handleExportExcel = useCallback(() => {
    if (filteredLogs.length === 0) {
      message.warning('没有可导出的数据')
      return
    }
    const data = filteredLogs.map((log) => ({
      时间: log.created_at || '',
      编码: log.product_code || '',
      名称: log.product_name || '',
      规格: log.product_spec || '',
      '数量(千)': log.quantity,
      操作人: log.operator_name || '',
      备注: log.remark || ''
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const colWidths = [{ wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 25 }]
    ws['!cols'] = colWidths
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '出库明细')
    const dateStr = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `出库明细_${dateStr}.xlsx`)
    message.success('导出成功')
  }, [filteredLogs])

  const handleRevoke = useCallback((record: InventoryLog) => {
    Modal.confirm({
      title: '撤销出库记录',
      content: `确定要撤销此条出库记录吗？将恢复库存 ${record.quantity}千（${record.product_code} ${record.product_name}）`,
      okText: '确认撤销',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const result = await api.revokeInventoryLog(record.id)
        if (result.success) {
          message.success('撤销成功，库存已恢复')
          loadLogs()
        } else {
          message.error(result.error || '撤销失败')
        }
      }
    })
  }, [loadLogs])

  const currentPageLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredLogs.slice(start, start + pageSize)
  }, [filteredLogs, currentPage])

  const handleSelectCurrentPage = useCallback(() => {
    const pageIds = currentPageLogs.map((log) => log.id)
    const allSelected = pageIds.every((id) => selectedRowKeys.includes(id))
    if (allSelected) {
      setSelectedRowKeys((prev) => prev.filter((key) => !pageIds.includes(key as number)))
    } else {
      setSelectedRowKeys((prev) => Array.from(new Set([...prev, ...pageIds])))
    }
  }, [currentPageLogs, selectedRowKeys])

  const handleSelectAll = useCallback(() => {
    const allIds = filteredLogs.map((log) => log.id)
    if (selectedRowKeys.length === allIds.length) {
      setSelectedRowKeys([])
    } else {
      setSelectedRowKeys(allIds)
    }
  }, [filteredLogs, selectedRowKeys])

  const handleDeleteSelected = useCallback(async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的记录')
      return
    }
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 条出库记录吗？此操作不可撤销。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setDeleting(true)
        try {
          const result = await api.deleteInventoryLogs(selectedRowKeys as number[])
          if (result.success) {
            message.success(`成功删除 ${result.data} 条记录`)
            setSelectedRowKeys([])
            loadLogs()
          } else {
            message.error(result.error || '删除失败')
          }
        } catch {
          message.error('删除出错')
        } finally {
          setDeleting(false)
        }
      }
    })
  }, [selectedRowKeys, loadLogs])

  const searchColumns = [
    { title: '物料号', dataIndex: 'code', key: 'code', width: 120 },
    { title: '物料描述', dataIndex: 'description', key: 'description', width: 140 },
    { title: '物品名称', dataIndex: 'name', key: 'name', width: 140 },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 120 },
    { title: '等级', dataIndex: 'grade', key: 'grade', width: 70 },
    { title: '表面处理', dataIndex: 'surface_treatment', key: 'surface_treatment', width: 100 },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: Product) => (
        <Button type="link" size="small" onClick={() => handleSelectProduct(record)}>
          出库
        </Button>
      )
    }
  ]

  const logColumns = [
    { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 170 },
    { title: '编码', dataIndex: 'product_code', key: 'product_code', width: 120 },
    { title: '名称', dataIndex: 'product_name', key: 'product_name', width: 160 },
    { title: '规格', dataIndex: 'product_spec', key: 'product_spec', width: 140 },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (val: number) => <Tag color="red">-{val}千</Tag>
    },
    { title: '操作人', dataIndex: 'operator_name', key: 'operator_name', width: 90 },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    ...(canViewInventory ? [{
      title: '操作',
      key: 'action',
      width: 70,
      render: (_: unknown, record: InventoryLog) => (
        <Button type="link" size="small" danger icon={<UndoOutlined />} onClick={() => handleRevoke(record)}>
          撤销
        </Button>
      )
    }] : [])
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
          提示：使用扫码枪扫描物品二维码可自动搜索并弹出出库窗口
        </div>
      </Card>

      {searchResults.length > 0 && (
        <Card
          size="small"
          title={`搜索结果 (${searchResults.length} 条)`}
          style={{ marginBottom: 16 }}
          styles={{ body: { padding: 0 } }}
        >
          <Table
            dataSource={searchResults}
            columns={searchColumns}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ y: 160 }}
            loading={loading}
            onRow={(record) => ({
              onClick: () => handleSelectProduct(record),
              style: { cursor: 'pointer' }
            })}
          />
        </Card>
      )}

      {canViewInventory && (
        <Card
          size="small"
          title={
            <Space>
              <FilterOutlined />
              出库记录
              {filteredLogs.length !== logs.length && (
                <span style={{ fontWeight: 'normal', color: '#666', fontSize: 12 }}>
                  （已筛选 {filteredLogs.length} / {logs.length} 条）
                </span>
              )}
            </Space>
          }
          style={{ flex: 1, overflow: 'auto' }}
          styles={{ body: { padding: 0 } }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <Space wrap size="small">
              <span style={{ color: '#666' }}>时间：</span>
              <Input
                type="date"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                style={{ width: 140 }}
              />
              <span style={{ color: '#999' }}>至</span>
              <Input
                type="date"
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                style={{ width: 140 }}
              />
              <span style={{ color: '#666', marginLeft: 8 }}>操作人：</span>
              <Select
                placeholder="全部"
                allowClear
                value={filterOperator || undefined}
                onChange={(v) => setFilterOperator(v ?? '')}
                options={[{ label: '全部', value: '' }, ...operatorOptions]}
                style={{ width: 120 }}
              />
              <span style={{ color: '#666' }}>关键词：</span>
              <Input
                placeholder="编码/名称/备注"
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                style={{ width: 160 }}
                allowClear
              />
              <Button
                size="small"
                onClick={() => {
                  setFilterDateStart('')
                  setFilterDateEnd('')
                  setFilterOperator('')
                  setFilterKeyword('')
                }}
              >
                清空筛选
              </Button>
              <Button
                size="small"
                type="primary"
                ghost
                icon={<DownloadOutlined />}
                onClick={handleExportExcel}
                disabled={filteredLogs.length === 0}
              >
                导出Excel
              </Button>
              <Button
                size="small"
                icon={<UploadOutlined />}
                onClick={() => setImportVisible(true)}
              >
                Excel导入出库
              </Button>
              {isAdmin && (
                <>
                  <Dropdown
                    menu={{
                      items: [
                        { key: 'page', label: '本页全选', onClick: handleSelectCurrentPage },
                        { key: 'all', label: `全选所有 (${filteredLogs.length} 条)`, onClick: handleSelectAll },
                        { key: 'clear', label: '取消选择', onClick: () => setSelectedRowKeys([]), disabled: selectedRowKeys.length === 0 }
                      ]
                    }}
                  >
                    <Button size="small">
                      <Space>
                        选择
                        <DownOutlined />
                      </Space>
                    </Button>
                  </Dropdown>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={handleDeleteSelected}
                    disabled={selectedRowKeys.length === 0}
                    loading={deleting}
                  >
                    删除 {selectedRowKeys.length > 0 ? `(${selectedRowKeys.length})` : ''}
                  </Button>
                </>
              )}
            </Space>
          </div>
          <Table
            dataSource={filteredLogs}
            columns={logColumns}
            rowKey="id"
            size="small"
            rowSelection={isAdmin ? {
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys)
            } : undefined}
            pagination={{
              pageSize,
              showSizeChanger: false,
              current: currentPage,
              onChange: (page) => setCurrentPage(page)
            }}
            loading={logsLoading}
            locale={{ emptyText: <Empty description={logs.length === 0 ? '暂无出库记录' : '无符合条件的记录'} /> }}
          />
        </Card>
      )}

      <Modal
        title="出库操作"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={520}
        destroyOnClose
      >
        {selectedProduct && (
          <div>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="物料号">{selectedProduct.code}</Descriptions.Item>
              <Descriptions.Item label="物品名称">{selectedProduct.name}</Descriptions.Item>
              <Descriptions.Item label="规格">{selectedProduct.spec || '-'}</Descriptions.Item>
              <Descriptions.Item label="等级">{selectedProduct.grade || '-'}</Descriptions.Item>
              <Descriptions.Item label="表面处理">
                {selectedProduct.surface_treatment || '-'}
              </Descriptions.Item>
              {canViewInventory && currentStock !== null && (
                <Descriptions.Item label="当前库存">
                  <Tag color={currentStock > 0 ? 'blue' : 'red'}>{currentStock}千</Tag>
                </Descriptions.Item>
              )}
            </Descriptions>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>出库数量（千）：</div>
              <InputNumber
                min={0.001}
                max={999999}
                step={1}
                value={quantity}
                onChange={(v) => setQuantity(v || 1)}
                style={{ width: '100%' }}
                size="large"
                autoFocus
                addonAfter="千"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>备注（选填）：</div>
              <Input.TextArea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="输入备注信息..."
                rows={2}
              />
            </div>
            <Button
              type="primary"
              danger
              icon={<ExportOutlined />}
              size="large"
              block
              onClick={handleStockOut}
              loading={submitting}
            >
              确认出库
            </Button>
          </div>
        )}
      </Modal>

      <StockImportModal
        visible={importVisible}
        type="out"
        onSuccess={() => {
          setImportVisible(false)
          loadLogs()
        }}
        onCancel={() => setImportVisible(false)}
      />
    </div>
  )
}

export default StockOutPage
