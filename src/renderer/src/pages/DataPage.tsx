import { useState, useEffect, useCallback } from 'react'
import {
  Table,
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
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  ClearOutlined
} from '@ant-design/icons'
import type { Product } from '../../../preload/index.d'
import ProductForm from '../components/ProductForm'
import ImportModal from '../components/ImportModal'

const { Title } = Typography

function DataPage(): JSX.Element {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [filterText, setFilterText] = useState('')

  // 表单弹窗
  const [formVisible, setFormVisible] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  // 导入弹窗
  const [importVisible, setImportVisible] = useState(false)

  // 多选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // 加载所有物品
  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.api.getAllProducts()
      if (result.success && result.data) {
        setProducts(result.data)
        setFilteredProducts(result.data)
      } else {
        message.error(result.error || '加载数据失败')
      }
    } catch (err) {
      message.error('加载数据出错')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  // 本地过滤
  useEffect(() => {
    if (!filterText.trim()) {
      setFilteredProducts(products)
      return
    }
    const keyword = filterText.trim().toLowerCase()
    setFilteredProducts(
      products.filter(
        (p) =>
          p.code.toLowerCase().includes(keyword) ||
          p.description.toLowerCase().includes(keyword) ||
          p.name.toLowerCase().includes(keyword) ||
          p.spec.toLowerCase().includes(keyword) ||
          p.grade.toLowerCase().includes(keyword) ||
          p.surface_treatment.toLowerCase().includes(keyword) ||
          p.material.toLowerCase().includes(keyword) ||
          p.special_note.toLowerCase().includes(keyword)
      )
    )
  }, [filterText, products])

  // 删除物品
  const handleDelete = useCallback(
    async (id: number) => {
      try {
        const result = await window.api.deleteProduct(id)
        if (result.success) {
          message.success('删除成功')
          loadProducts()
        } else {
          message.error(result.error || '删除失败')
        }
      } catch (err) {
        message.error('删除出错')
      }
    },
    [loadProducts]
  )

  // 批量删除
  const handleDeleteSelected = useCallback(async () => {
    if (selectedRowKeys.length === 0) return
    try {
      const result = await window.api.deleteProducts(selectedRowKeys as number[])
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

  // 清空所有数据
  const handleDeleteAll = useCallback(async () => {
    try {
      const result = await window.api.deleteAllProducts()
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

  // 打开新增表单
  const handleAdd = useCallback(() => {
    setEditingProduct(null)
    setFormVisible(true)
  }, [])

  // 打开编辑表单
  const handleEdit = useCallback((product: Product) => {
    setEditingProduct(product)
    setFormVisible(true)
  }, [])

  // 表单提交成功
  const handleFormSuccess = useCallback(() => {
    setFormVisible(false)
    setEditingProduct(null)
    loadProducts()
  }, [loadProducts])

  // 导入成功
  const handleImportSuccess = useCallback(() => {
    setImportVisible(false)
    loadProducts()
  }, [loadProducts])

  // 表格列定义
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
      width: 260,
      ellipsis: true,
      render: (text: string) => text || <span style={{ color: '#ccc' }}>-</span>
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
      {/* 标题和操作按钮 */}
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
              description={`确定要删除选中的 ${selectedRowKeys.length} 条数据吗？关联的库存和出入库记录也会被清除。`}
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
          <Popconfirm
            title="清空所有数据"
            description="确定要清空所有物品数据吗？此操作不可恢复，库存和出入库记录也会被全部清除！"
            onConfirm={handleDeleteAll}
            okText="确认清空"
            cancelText="取消"
            okType="danger"
          >
            <Button danger icon={<ClearOutlined />}>
              清空全部
            </Button>
          </Popconfirm>
          <Button icon={<ReloadOutlined />} onClick={loadProducts} loading={loading}>
            刷新
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportVisible(true)}>
            导入 Excel
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增物品
          </Button>
        </Space>
      </div>

      {/* 过滤搜索 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Input
          placeholder="输入关键字过滤列表..."
          prefix={<SearchOutlined />}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          allowClear
        />
      </Card>

      {/* 物品列表表格 */}
      <Card
        size="small"
        style={{ flex: 1, overflow: 'auto' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
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
          scroll={{ y: 'calc(100vh - 340px)' }}
        />
      </Card>

      {/* 新增/编辑物品表单弹窗 */}
      <ProductForm
        visible={formVisible}
        product={editingProduct}
        onSuccess={handleFormSuccess}
        onCancel={() => {
          setFormVisible(false)
          setEditingProduct(null)
        }}
      />

      {/* Excel 导入弹窗 */}
      <ImportModal
        visible={importVisible}
        onSuccess={handleImportSuccess}
        onCancel={() => setImportVisible(false)}
      />
    </div>
  )
}

export default DataPage
