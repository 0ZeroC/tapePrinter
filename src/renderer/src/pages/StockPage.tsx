import { useState, useEffect, useCallback } from 'react'
import {
  Input,
  Button,
  InputNumber,
  Card,
  Modal,
  message,
  Descriptions,
  Tag,
  Empty
} from 'antd'
import {
  SearchOutlined,
  EditOutlined,
  DownloadOutlined,
  UploadOutlined
} from '@ant-design/icons'
import * as XLSX from 'xlsx'
import ResizableTable from '../components/ResizableTable'
import { api, type InventoryWithProduct } from '../utils/api'
import ImportInventoryModal from '../components/ImportInventoryModal'

function StockPage(): JSX.Element {
  const [inventoryList, setInventoryList] = useState<InventoryWithProduct[]>([])
  const [filteredList, setFilteredList] = useState<InventoryWithProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')

  const [importVisible, setImportVisible] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<InventoryWithProduct | null>(null)
  const [newQuantity, setNewQuantity] = useState<number>(0)
  const [remark, setRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadInventory = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getAllInventory()
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

  const filterList = (list: InventoryWithProduct[], keyword: string) => {
    const keywords = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (keywords.length === 0) {
      setFilteredList(list)
      return
    }
    const fields = ['code', 'description', 'name', 'spec', 'grade', 'surface_treatment', 'material', 'special_note'] as const
    const normalize = (s: string) => s.toLowerCase().replace(/[*×]/g, '_')
    const filtered = list.filter((item) =>
      keywords.every((kw) => {
        const nkw = normalize(kw)
        return fields.some((f) => normalize(item[f] ?? '').includes(nkw))
      })
    )
    setFilteredList(filtered)
  }

  const handleSearchChange = (value: string) => {
    setSearchText(value)
    filterList(inventoryList, value)
  }

  const handleEdit = (item: InventoryWithProduct) => {
    setEditItem(item)
    setNewQuantity(item.quantity)
    setRemark('')
    setModalOpen(true)
  }

  const handleSetInventory = useCallback(async () => {
    if (!editItem) return
    setSubmitting(true)
    try {
      const result = await api.setInventory(editItem.product_id, newQuantity, remark)
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

  const handleExport = useCallback(() => {
    const dataToExport = filteredList.length > 0 ? filteredList : inventoryList
    if (dataToExport.length === 0) {
      message.warning('没有可导出的数据')
      return
    }

    const exportData = dataToExport.map((item) => ({
      物料号: item.code,
      物品名称: item.name,
      物料描述: item.description,
      规格: item.spec,
      等级: item.grade,
      表面处理: item.surface_treatment,
      材质: item.material,
      特殊备注: item.special_note,
      库存数量: item.quantity,
      更新时间: item.updated_at
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    ws['!cols'] = [
      { wch: 15 },
      { wch: 20 },
      { wch: 30 },
      { wch: 15 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 10 },
      { wch: 20 }
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '库存数据')

    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    XLSX.writeFile(wb, `库存数据_${dateStr}.xlsx`)
    message.success(`已导出 ${dataToExport.length} 条数据`)
  }, [filteredList, inventoryList])

  const handleImportSuccess = useCallback(() => {
    setImportVisible(false)
    loadInventory()
  }, [loadInventory])

  const columns = [
    { title: '物料号', dataIndex: 'code', key: 'code', width: 120 },
    {
      title: '物料描述',
      dataIndex: 'description',
      key: 'description',
      width: 260,
      render: (text: string) => (text || '-')
    },
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
          {val}千
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
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Input
            placeholder="多条件搜索，用空格分隔，如：5783 10*20"
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            prefix={<SearchOutlined />}
            allowClear
            size="large"
            style={{ flex: 1, fontSize: 16 }}
          />
          <Button size="large" onClick={loadInventory} loading={loading}>
            刷新
          </Button>
          <Button size="large" icon={<DownloadOutlined />} onClick={handleExport}>
            导出 Excel
          </Button>
          <Button size="large" icon={<UploadOutlined />} onClick={() => setImportVisible(true)}>
            导入库存
          </Button>
        </div>
      </Card>

      <Card
        size="small"
        title={`库存列表 ${filteredList.length > 0 ? `(${filteredList.length} 项)` : ''}`}
        style={{ flex: 1, overflow: 'auto' }}
        styles={{ body: { padding: 0 } }}
      >
        <ResizableTable
          dataSource={filteredList}
          columns={columns}
          rowKey="product_id"
          size="small"
          pagination={{
            pageSize: 30,
            showSizeChanger: true,
            pageSizeOptions: ['20', '30', '50', '100']
          }}
          loading={loading}
          locale={{ emptyText: <Empty description="暂无库存数据" /> }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

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
              <Descriptions.Item label="表面处理">
                {editItem.surface_treatment || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="当前库存" span={2}>
                <Tag color="blue" style={{ fontSize: 16, padding: '2px 12px' }}>
                  {editItem.quantity}千
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>修改后数量（千）：</div>
              <InputNumber
                min={-999999}
                max={999999}
                step={1}
                value={newQuantity}
                onChange={(v) => setNewQuantity(v ?? 0)}
                style={{ width: '100%' }}
                size="large"
                autoFocus
                addonAfter="千"
              />
              {newQuantity !== editItem.quantity && (
                <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>
                  {newQuantity > editItem.quantity
                    ? `将增加 ${newQuantity - editItem.quantity}千`
                    : `将减少 ${editItem.quantity - newQuantity}千`}
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

      <ImportInventoryModal
        visible={importVisible}
        onSuccess={handleImportSuccess}
        onCancel={() => setImportVisible(false)}
      />
    </div>
  )
}

export default StockPage
