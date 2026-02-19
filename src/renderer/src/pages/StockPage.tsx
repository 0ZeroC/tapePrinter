import { useState, useEffect, useCallback } from 'react'
import {
  Input,
  Table,
  Button,
  InputNumber,
  Card,
  Modal,
  message,
  Descriptions,
  Tag,
  Empty
} from 'antd'
import { SearchOutlined, EditOutlined } from '@ant-design/icons'
import type { InventoryWithProduct } from '../../../preload/index.d'

function StockPage(): JSX.Element {
  const [inventoryList, setInventoryList] = useState<InventoryWithProduct[]>([])
  const [filteredList, setFilteredList] = useState<InventoryWithProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')

  // 修改库存弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<InventoryWithProduct | null>(null)
  const [newQuantity, setNewQuantity] = useState<number>(0)
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 加载库存列表
  const loadInventory = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.getAllInventory()
      if (result.success && result.data) {
        setInventoryList(result.data)
        filterList(result.data, searchText)
      }
    } catch {
      message.error('加载库存失败')
    } finally {
      setLoading(false)
    }
  }, [searchText])

  useEffect(() => {
    loadInventory()
  }, [])

  // 本地筛选
  const filterList = (list: InventoryWithProduct[], keyword: string) => {
    if (!keyword.trim()) {
      setFilteredList(list)
      return
    }
    const kw = keyword.trim().toLowerCase()
    const filtered = list.filter(
      (item) =>
        item.code?.toLowerCase().includes(kw) ||
        item.description?.toLowerCase().includes(kw) ||
        item.name?.toLowerCase().includes(kw) ||
        item.spec?.toLowerCase().includes(kw) ||
        item.grade?.toLowerCase().includes(kw) ||
        item.surface_treatment?.toLowerCase().includes(kw) ||
        item.material?.toLowerCase().includes(kw) ||
        item.special_note?.toLowerCase().includes(kw)
    )
    setFilteredList(filtered)
  }

  const handleSearchChange = (value: string) => {
    setSearchText(value)
    filterList(inventoryList, value)
  }

  // 打开修改弹窗
  const handleEdit = (item: InventoryWithProduct) => {
    setEditItem(item)
    setNewQuantity(item.quantity)
    setRemark('')
    setModalOpen(true)
  }

  // 确认修改库存
  const handleSetInventory = useCallback(async () => {
    if (!editItem) return
    if (newQuantity < 0) {
      message.warning('库存数量不能为负数')
      return
    }
    setSubmitting(true)
    try {
      const result = await window.api.setInventory(editItem.product_id, newQuantity, remark)
      if (result.success) {
        message.success(`库存已修改：${editItem.name} → ${newQuantity}`)
        setModalOpen(false)
        loadInventory()
      } else {
        message.error(result.error || '修改失败')
      }
    } catch {
      message.error('修改库存出错')
    } finally {
      setSubmitting(false)
    }
  }, [editItem, newQuantity, remark, loadInventory])

  const columns = [
    { title: '物料号', dataIndex: 'code', key: 'code', width: 120 },
    { title: '物品名称', dataIndex: 'name', key: 'name', width: 140 },
    { title: '规格', dataIndex: 'spec', key: 'spec', width: 120 },
    { title: '等级', dataIndex: 'grade', key: 'grade', width: 70 },
    { title: '表面处理', dataIndex: 'surface_treatment', key: 'surface_treatment', width: 100 },
    {
      title: '当前库存',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      sorter: (a: InventoryWithProduct, b: InventoryWithProduct) => a.quantity - b.quantity,
      render: (val: number) => (
        <Tag color={val > 0 ? 'blue' : 'red'} style={{ fontSize: 14, padding: '2px 8px' }}>
          {val}
        </Tag>
      )
    },
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: InventoryWithProduct) => (
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => handleEdit(record)}
        >
          修改
        </Button>
      )
    }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 搜索栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Input
            placeholder="搜索物品编码、名称、规格..."
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            prefix={<SearchOutlined />}
            allowClear
            size="large"
            style={{ flex: 1, fontSize: 16 }}
          />
          <Button type="primary" size="large" onClick={loadInventory} loading={loading}>
            刷新
          </Button>
        </div>
      </Card>

      {/* 库存列表 */}
      <Card
        size="small"
        title={`库存列表 ${filteredList.length > 0 ? `(${filteredList.length} 项)` : ''}`}
        style={{ flex: 1, overflow: 'auto' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={filteredList}
          columns={columns}
          rowKey="product_id"
          size="small"
          pagination={{ pageSize: 30, showSizeChanger: true, pageSizeOptions: ['20', '30', '50', '100'] }}
          loading={loading}
          locale={{ emptyText: <Empty description="暂无库存数据" /> }}
        />
      </Card>

      {/* 修改库存弹窗 */}
      <Modal
        title="修改库存"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={480}
        destroyOnClose
      >
        {editItem && (
          <div>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="物料号">{editItem.code}</Descriptions.Item>
              <Descriptions.Item label="物品名称">{editItem.name}</Descriptions.Item>
              <Descriptions.Item label="规格">{editItem.spec || '-'}</Descriptions.Item>
              <Descriptions.Item label="等级">{editItem.grade || '-'}</Descriptions.Item>
              <Descriptions.Item label="表面处理">{editItem.surface_treatment || '-'}</Descriptions.Item>
              <Descriptions.Item label="当前库存" span={2}>
                <Tag color="blue" style={{ fontSize: 16, padding: '2px 12px' }}>
                  {editItem.quantity}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>修改后数量：</div>
              <InputNumber
                min={0}
                max={999999}
                value={newQuantity}
                onChange={(v) => setNewQuantity(v ?? 0)}
                style={{ width: '100%' }}
                size="large"
                autoFocus
              />
              {newQuantity !== editItem.quantity && (
                <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>
                  {newQuantity > editItem.quantity
                    ? `将增加 ${newQuantity - editItem.quantity}`
                    : `将减少 ${editItem.quantity - newQuantity}`}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>修改原因（选填）：</div>
              <Input.TextArea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="输入修改原因，如：盘点调整、损耗等..."
                rows={2}
              />
            </div>
            <Button
              type="primary"
              icon={<EditOutlined />}
              size="large"
              block
              onClick={handleSetInventory}
              loading={submitting}
            >
              确认修改
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default StockPage
