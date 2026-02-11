import { useState, useEffect, useRef, useCallback } from 'react'
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
  Empty
} from 'antd'
import { SearchOutlined, ImportOutlined } from '@ant-design/icons'
import type { Product, InventoryLog } from '../../../preload/index.d'

function StockInPage(): JSX.Element {
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [currentStock, setCurrentStock] = useState<number>(0)
  const [quantity, setQuantity] = useState<number>(1)
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [logs, setLogs] = useState<InventoryLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const searchInputRef = useRef<any>(null)

  // 加载入库记录
  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const result = await window.api.getInventoryLogs(undefined, 'in')
      if (result.success && result.data) {
        setLogs(result.data)
      }
    } catch {
      // ignore
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  // 搜索物品
  const handleSearch = useCallback(async (value: string) => {
    if (!value.trim()) {
      setSearchResults([])
      return
    }
    setLoading(true)
    try {
      const result = await window.api.searchProducts(value.trim())
      if (result.success && result.data) {
        setSearchResults(result.data)
        // 如果只有一个结果（扫码枪精确匹配），自动弹出
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

  // 选择产品，弹出入库弹窗
  const handleSelectProduct = useCallback(async (product: Product) => {
    setSelectedProduct(product)
    setQuantity(1)
    setRemark('')
    // 获取当前库存
    try {
      const result = await window.api.getInventory(product.id)
      if (result.success) {
        setCurrentStock(result.data ?? 0)
      }
    } catch {
      setCurrentStock(0)
    }
    setModalOpen(true)
  }, [])

  // 确认入库
  const handleStockIn = useCallback(async () => {
    if (!selectedProduct) return
    if (quantity < 1) {
      message.warning('请输入有效的数量')
      return
    }
    setSubmitting(true)
    try {
      const result = await window.api.stockIn(selectedProduct.id, quantity, remark)
      if (result.success) {
        message.success(`入库成功：${selectedProduct.name} x ${quantity}`)
        setModalOpen(false)
        setSearchText('')
        setSearchResults([])
        loadLogs()
        // 聚焦搜索框，方便继续扫码
        setTimeout(() => searchInputRef.current?.focus(), 100)
      } else {
        message.error(result.error || '入库失败')
      }
    } catch {
      message.error('入库出错')
    } finally {
      setSubmitting(false)
    }
  }, [selectedProduct, quantity, remark, loadLogs])

  // 搜索结果列
  const searchColumns = [
    { title: '编码', dataIndex: 'code', key: 'code', width: 120 },
    { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 140 },
    { title: '表面处理', dataIndex: 'surface_treatment', key: 'surface_treatment', width: 120 },
    { title: '等级', dataIndex: 'grade', key: 'grade', width: 80 },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: Product) => (
        <Button type="link" size="small" onClick={() => handleSelectProduct(record)}>
          入库
        </Button>
      )
    }
  ]

  // 记录列
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
      render: (val: number) => <Tag color="green">+{val}</Tag>
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 搜索区域 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            ref={searchInputRef}
            placeholder="扫码或输入物品编码、名称搜索..."
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
          提示：使用扫码枪扫描物品二维码可自动搜索并弹出入库窗口
        </div>
      </Card>

      {/* 搜索结果 */}
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

      {/* 入库记录 */}
      <Card
        size="small"
        title="入库记录"
        style={{ flex: 1, overflow: 'auto' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={logs}
          columns={logColumns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          loading={logsLoading}
          locale={{ emptyText: <Empty description="暂无入库记录" /> }}
        />
      </Card>

      {/* 入库弹窗 */}
      <Modal
        title="入库操作"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={520}
        destroyOnClose
      >
        {selectedProduct && (
          <div>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="物品编码">{selectedProduct.code}</Descriptions.Item>
              <Descriptions.Item label="物品名称">{selectedProduct.name}</Descriptions.Item>
              <Descriptions.Item label="规格">{selectedProduct.spec || '-'}</Descriptions.Item>
              <Descriptions.Item label="表面处理">
                {selectedProduct.surface_treatment || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="等级">{selectedProduct.grade || '-'}</Descriptions.Item>
              <Descriptions.Item label="当前库存">
                <Tag color="blue">{currentStock}</Tag>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>入库数量：</div>
              <InputNumber
                min={1}
                max={999999}
                value={quantity}
                onChange={(v) => setQuantity(v || 1)}
                style={{ width: '100%' }}
                size="large"
                autoFocus
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
              icon={<ImportOutlined />}
              size="large"
              block
              onClick={handleStockIn}
              loading={submitting}
            >
              确认入库
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default StockInPage
