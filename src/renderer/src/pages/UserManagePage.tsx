import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Space,
  Popconfirm,
  message,
  Tag,
  Card,
  Typography
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { api, type UserRecord } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

const { Title } = Typography

function UserManagePage(): JSX.Element {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getUsers()
      if (result.success && result.data) {
        setUsers(result.data)
      }
    } catch {
      message.error('加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleAdd = (): void => {
    setEditingUser(null)
    form.resetFields()
    form.setFieldsValue({ role: 'user', can_view_inventory: false, can_manage_data: false })
    setModalOpen(true)
  }

  const handleEdit = (record: UserRecord): void => {
    setEditingUser(record)
    form.setFieldsValue({
      username: record.username,
      display_name: record.display_name,
      role: record.role,
      can_view_inventory: record.can_view_inventory === 1,
      can_manage_data: record.can_manage_data === 1,
      password: ''
    })
    setModalOpen(true)
  }

  const handleDelete = async (id: number): Promise<void> => {
    try {
      const result = await api.deleteUser(id)
      if (result.success) {
        message.success('删除成功')
        loadUsers()
      } else {
        message.error(result.error || '删除失败')
      }
    } catch {
      message.error('删除出错')
    }
  }

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      if (editingUser) {
        const data: any = {
          display_name: values.display_name,
          role: values.role,
          can_view_inventory: values.can_view_inventory,
          can_manage_data: values.can_manage_data
        }
        if (values.password) {
          data.password = values.password
        }
        const result = await api.updateUser(editingUser.id, data)
        if (result.success) {
          message.success('更新成功')
          setModalOpen(false)
          loadUsers()
        } else {
          message.error(result.error || '更新失败')
        }
      } else {
        if (!values.password) {
          message.error('请设置密码')
          return
        }
        const result = await api.createUser({
          username: values.username,
          password: values.password,
          display_name: values.display_name || values.username,
          role: values.role,
          can_view_inventory: values.can_view_inventory,
          can_manage_data: values.can_manage_data
        })
        if (result.success) {
          message.success('创建成功')
          setModalOpen(false)
          loadUsers()
        } else {
          message.error(result.error || '创建失败')
        }
      }
    } catch {
      // form validation
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleInventory = async (
    record: UserRecord,
    checked: boolean
  ): Promise<void> => {
    try {
      const result = await api.updateUser(record.id, { can_view_inventory: checked })
      if (result.success) {
        message.success(checked ? '已开启库存查看权限' : '已关闭库存查看权限')
        loadUsers()
      } else {
        message.error(result.error || '更新失败')
      }
    } catch {
      message.error('操作失败')
    }
  }

  const handleToggleManageData = async (
    record: UserRecord,
    checked: boolean
  ): Promise<void> => {
    try {
      const result = await api.updateUser(record.id, { can_manage_data: checked })
      if (result.success) {
        message.success(checked ? '已开启数据管理权限' : '已关闭数据管理权限')
        loadUsers()
      } else {
        message.error(result.error || '更新失败')
      }
    } catch {
      message.error('操作失败')
    }
  }

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '显示名', dataIndex: 'display_name', key: 'display_name', width: 120 },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string) =>
        role === 'admin' ? <Tag color="red">管理员</Tag> : <Tag color="blue">普通用户</Tag>
    },
    {
      title: '库存查看权限',
      key: 'can_view_inventory',
      width: 130,
      render: (_: unknown, record: UserRecord) => (
        <Switch
          checked={record.can_view_inventory === 1 || record.role === 'admin'}
          disabled={record.role === 'admin'}
          onChange={(checked) => handleToggleInventory(record, checked)}
        />
      )
    },
    {
      title: '数据管理权限',
      key: 'can_manage_data',
      width: 130,
      render: (_: unknown, record: UserRecord) => (
        <Switch
          checked={record.can_manage_data === 1 || record.role === 'admin'}
          disabled={record.role === 'admin'}
          onChange={(checked) => handleToggleManageData(record, checked)}
        />
      )
    },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: unknown, record: UserRecord) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          {record.id !== currentUser?.userId && (
            <Popconfirm
              title="确定要删除此用户吗？"
              onConfirm={() => handleDelete(record.id)}
              okText="删除"
              cancelText="取消"
              okType="danger"
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
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
          用户管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增用户
        </Button>
      </div>

      <Card
        size="small"
        style={{ flex: 1, overflow: 'auto' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingUser ? '编辑用户' : '新增用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="登录用户名" disabled={!!editingUser} />
          </Form.Item>
          <Form.Item label="显示名称" name="display_name">
            <Input placeholder="在系统中显示的名称" />
          </Form.Item>
          <Form.Item
            label={editingUser ? '重置密码（留空不修改）' : '登录密码'}
            name="password"
            rules={editingUser ? [] : [{ required: true, message: '请设置密码' }]}
          >
            <Input.Password placeholder={editingUser ? '留空则不修改密码' : '设置登录密码'} />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'user', label: '普通用户' },
                { value: 'admin', label: '管理员' }
              ]}
            />
          </Form.Item>
          <Form.Item
            label="库存查看权限"
            name="can_view_inventory"
            valuePropName="checked"
          >
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
          <Form.Item
            label="数据管理权限"
            name="can_manage_data"
            valuePropName="checked"
          >
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default UserManagePage
