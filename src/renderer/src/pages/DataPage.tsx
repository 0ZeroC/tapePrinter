import { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Space,
  Input,
  Popconfirm,
  message,
  Card,
  Typography,
  Tag
} from 'antd'
import {
  PlusOutlined,
  UploadOutlined,
  DownloadOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  ClearOutlined
} from '@ant-design/icons'
import * as XLSX from 'xlsx'
import ResizableTable from '../components/ResizableTable'
import { api, type Product } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import ProductForm from '../components/ProductForm'
import ImportModal from '../components/ImportModal'

const { Title } = Typography

function DataPage(): JSX.Element {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [filterText, setFilterText] = useState('')

  const [formVisible, setFormVisible] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const [importVisible, setImportVisible] = useState(false)

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const isAdmin = user?.role === 'admin'

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getAllProducts()
      if (result.success && result.data) {
        setProducts(result.data)
        setFilteredProducts(result.data)
      } else {
        message.error(result.error || '加载数据失败')
      }
    } catch {
      message.error('加载数据出错')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    const keywords = filterText.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (keywords.length === 0) {
      setFilteredProducts(products)
      return
    }
    const fields: (keyof Product)[] = ['code', 'description', 'name', 'spec', 'grade', 'surface_treatment', 'material', 'special_note']
    const normalize = (s: string) => s.toLowerCase().replace(/[*×]/g, '_')
    setFilteredProducts(
      products.filter((p) =>
        keywords.every((kw) => {
          const nkw = normalize(kw)
          return fields.some((f) => normalize(String(p[f] ?? '')).includes(nkw))
        })
      )
    )
  }, [filterText, products])

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        const result = await api.deleteProduct(id)
        if (result.success) {
          message.success('删除成功')
          loadProducts()
        } else {
          message.error(result.error || '删除失败')
        }
      } catch {
        message.error('删除出错')
      }
    },
    [loadProducts]
  )

  const handleDeleteSelected = useCallback(async () => {
    if (selectedRowKeys.length === 0) return
    try {
      const result = await api.deleteProducts(selectedRowKeys as number[])
      if (result.success) {
        message.success(`成功删除 ${selectedRowKeys.length} 条数据`)
        setSelectedRowKeys([])
        loadProducts()
      } else {
        message.error(result.error || '批量删除失败')
      }
    } catch {
      message.error('批量删除出错')
    }
  }, [selectedRowKeys, loadProducts])

  const handleDeleteAll = useCallback(async () => {
    try {
      const result = await api.deleteAllProducts()
      if (result.success) {
        message.success('已清空所有数据')
        setSelectedRowKeys([])
        loadProducts()
      } else {
        message.error(result.error || '清空失败')
      }
    } catch {
      message.error('清空数据出错')
    }
  }, [loadProducts])

  const handleAdd = useCallback(() => {
    setEditingProduct(null)
    setFormVisible(true)
  }, [])

  const handleEdit = useCallback((product: Product) => {
    setEditingProduct(product)
    setFormVisible(true)
  }, [])

  const handleFormSuccess = useCallback(() => {
    setFormVisible(false)
    setEditingProduct(null)
    loadProducts()
  }, [loadProducts])

  const handleImportSuccess = useCallback(() => {
    setImportVisible(false)
    loadProducts()
  }, [loadProducts])

  const handleExport = useCallback(() => {
    const dataToExport = filteredProducts.length > 0 ? filteredProducts : products
    if (dataToExport.length === 0) {
      message.warning('没有可导出的数据')
      return
    }

    const exportData = dataToExport.map((p) => ({
      物料号: p.code,
      物品名称: p.name,
      物料描述: p.description,
      规格: p.spec,
      等级: p.grade,
      表面处理: p.surface_treatment,
      材质: p.material,
      特殊备注: p.special_note
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)

    const colWidths = [
      { wch: 15 },
      { wch: 20 },
      { wch: 30 },
      { wch: 15 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 }
    ]
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '物品数据')

    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const fileName = `物品数据_${dateStr}.xlsx`

    XLSX.writeFile(wb, fileName)
    message.success(`已导出 ${dataToExport.length} 条数据`)
  }, [filteredProducts, products])

  const columns = [
    {
      title: '物料号',
      dataIndex: 'code',
      key: 'code',
      width: 130,
      sorter: (a: Product, b: Product) => a.code.localeCompare(b.code)
    },
    {
      title: '物料描述',
      dataIndex: 'description',
      key: 'description',
      width: 320,
      render: (text: string) =>
        text ? text : <span style={{ color: '#ccc' }}>-</span>
    },
    {
      title: '物品名称',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      sorter: (a: Product, b: Product) => a.name.localeCompare(b.name)
    },
    {
      title: '规格',
      dataIndex: 'spec',
      key: 'spec',
      width: 130,
      render: (text: string) => text || <span style={{ color: '#ccc' }}>-</span>
    },
    {
      title: '等级',
      dataIndex: 'grade',
      key: 'grade',
      width: 80,
      render: (text: string) =>
        text ? <Tag color="green">{text}</Tag> : <span style={{ color: '#ccc' }}>-</span>
    },
    {
      title: '表面处理',
      dataIndex: 'surface_treatment',
      key: 'surface_treatment',
      width: 110,
      render: (text: string) =>
        text ? <Tag color="blue">{text}</Tag> : <span style={{ color: '#ccc' }}>-</span>
    },
    {
      title: '材质',
      dataIndex: 'material',
      key: 'material',
      width: 100,
      render: (text: string) => text || <span style={{ color: '#ccc' }}>-</span>
    },
    {
      title: '特殊备注',
      dataIndex: 'special_note',
      key: 'special_note',
      width: 160,
      ellipsis: true,
      render: (text: string) => text || <span style={{ color: '#ccc' }}>-</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: Product) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除「${record.name}」吗？`}
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
            okType="danger"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          物品数据管理
        </Title>
        <Space>
          {selectedRowKeys.length > 0 && (
            <Popconfirm
              title="批量删除"
              description={`确定要删除选中的 ${selectedRowKeys.length} 条数据吗？`}
              onConfirm={handleDeleteSelected}
              okText="删除"
              cancelText="取消"
              okType="danger"
            >
              <Button danger icon={<DeleteOutlined />}>
                删除选中 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          )}
          {isAdmin && (
            <Popconfirm
              title="清空所有数据"
              description="确定要清空所有物品数据吗？此操作不可恢复！"
              onConfirm={handleDeleteAll}
              okText="确认清空"
              cancelText="取消"
              okType="danger"
            >
              <Button danger icon={<ClearOutlined />}>
                清空全部
              </Button>
            </Popconfirm>
          )}
          <Button icon={<ReloadOutlined />} onClick={loadProducts} loading={loading}>
            刷新
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出 Excel
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportVisible(true)}>
            导入 Excel
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增物品
          </Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Input
          placeholder="多条件过滤，用空格分隔，如：5783 10*20"
          prefix={<SearchOutlined />}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          allowClear
        />
      </Card>

      <Card
        size="small"
        style={{ flex: 1, overflow: 'auto' }}
        styles={{ body: { padding: 0 } }}
      >
        <ResizableTable
          dataSource={filteredProducts}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys)
          }}
          pagination={{
            pageSize: 50,
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200']
          }}
          scroll={{ y: 'calc(100vh - 340px)', x: 'max-content' }}
        />
      </Card>

      <ProductForm
        visible={formVisible}
        product={editingProduct}
        onSuccess={handleFormSuccess}
        onCancel={() => {
          setFormVisible(false)
          setEditingProduct(null)
        }}
      />

      <ImportModal
        visible={importVisible}
        onSuccess={handleImportSuccess}
        onCancel={() => setImportVisible(false)}
      />
    </div>
  )
}

export default DataPage
