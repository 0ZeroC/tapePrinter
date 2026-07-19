import { useState } from 'react'
import { Layout, Menu, theme, Button, Dropdown, Space, Modal, Form, Input, message } from 'antd'
import {
  PrinterOutlined,
  DatabaseOutlined,
  ImportOutlined,
  ExportOutlined,
  AppstoreOutlined,
  TeamOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  UnorderedListOutlined
} from '@ant-design/icons'
import { useAuth } from './contexts/AuthContext'
import { api } from './utils/api'
import LoginPage from './pages/LoginPage'
import BilingualPackingPrintPage from './pages/BilingualPackingPrintPage'
import PrintPage, { type PrintPagePreset } from './pages/PrintPage'
import DataPage from './pages/DataPage'
import StockInPage from './pages/StockInPage'
import StockOutPage from './pages/StockOutPage'
import StockPage from './pages/StockPage'
import UserManagePage from './pages/UserManagePage'
import PickingOrderPage from './pages/PickingOrderPage'
import MergedDeliverySheetPage from './pages/MergedDeliverySheetPage'

const { Sider, Content } = Layout

type PageKey =
  | 'print'
  | 'packingPrint'
  | 'bilingualPrint'
  | 'bilingualPackingPrint'
  | 'data'
  | 'stockIn'
  | 'stockOut'
  | 'stock'
  | 'users'
  | 'pickingOrder'
  | 'mergedDelivery'

interface CombinedLabelItem {
  code: string
  description: string
  quantity: number
  unit?: string
}

function App(): JSX.Element {
  const { user, loading, logout } = useAuth()
  const [currentPage, setCurrentPage] = useState<PageKey>('print')
  const [collapsed, setCollapsed] = useState(false)
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [pwdForm] = Form.useForm()
  const [pwdLoading, setPwdLoading] = useState(false)
  const [printPreset, setPrintPreset] = useState<PrintPagePreset | null>(null)
  const [lastPickingOrderNo, setLastPickingOrderNo] = useState<string>('')
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        加载中...
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  const menuItems = [
    { key: 'print' as PageKey, icon: <PrinterOutlined />, label: '标签打印' },
    { key: 'packingPrint' as PageKey, icon: <PrinterOutlined />, label: '打包标签' },
    { key: 'bilingualPrint' as PageKey, icon: <PrinterOutlined />, label: '双语标签' },
    {
      key: 'bilingualPackingPrint' as PageKey,
      icon: <PrinterOutlined />,
      label: '双语拼箱标签'
    },
    ...(user.canViewInventory
      ? [
          { key: 'stockIn' as PageKey, icon: <ImportOutlined />, label: '入库' },
          { key: 'stockOut' as PageKey, icon: <ExportOutlined />, label: '出库' }
        ]
      : []),
    { key: 'pickingOrder' as PageKey, icon: <UnorderedListOutlined />, label: '配货单' },
    { key: 'mergedDelivery' as PageKey, icon: <UnorderedListOutlined />, label: '拼送货单' },
    ...(user.canViewInventory
      ? [{ key: 'stock' as PageKey, icon: <AppstoreOutlined />, label: '库存' }]
      : []),
    ...(user.canManageData
      ? [{ key: 'data' as PageKey, icon: <DatabaseOutlined />, label: '物料库' }]
      : []),
    ...(user.role === 'admin'
      ? [{ key: 'users' as PageKey, icon: <TeamOutlined />, label: '用户管理' }]
      : [])
  ]

  const handleOpenPrintFromPicking = (payload: {
    productCode: string
    orderNo: string
    projectName: string
    quantity: number
    unit: string
    combinedItems?: CombinedLabelItem[]
    boxNo?: number
  }): void => {
    setPrintPreset(payload)
    setCurrentPage('print')
  }

  const handleOpenBilingualFromPicking = (payload: PrintPagePreset): void => {
    setPrintPreset(payload)
    setCurrentPage('bilingualPrint')
  }

  const handleOpenBilingualPackingFromPicking = (payload: PrintPagePreset): void => {
    setPrintPreset(payload)
    setCurrentPage('bilingualPackingPrint')
  }

  const handlePickingOrderLoaded = (orderNo: string): void => {
    setLastPickingOrderNo(orderNo)
  }

  const renderPage = (): JSX.Element => {
    switch (currentPage) {
      case 'print':
        return <PrintPage preset={printPreset} />
      case 'packingPrint':
        return <PrintPage preset={printPreset} mode="packing" />
      case 'bilingualPrint':
        return <PrintPage preset={printPreset} mode="bilingual" />
      case 'bilingualPackingPrint':
        return <BilingualPackingPrintPage preset={printPreset} />
      case 'stockIn':
        return user.canViewInventory ? <StockInPage /> : <PrintPage />
      case 'stockOut':
        return user.canViewInventory ? <StockOutPage /> : <PrintPage />
      case 'stock':
        return user.canViewInventory ? <StockPage /> : <PrintPage />
      case 'data':
        return user.canManageData ? <DataPage /> : <PrintPage />
      case 'pickingOrder':
        return (
          <PickingOrderPage
            onOpenPrintLabel={handleOpenPrintFromPicking}
            onOpenBilingualLabel={handleOpenBilingualFromPicking}
            onOpenBilingualPackingLabel={handleOpenBilingualPackingFromPicking}
            initialOrderNo={lastPickingOrderNo}
            onOrderLoaded={handlePickingOrderLoaded}
          />
        )
      case 'mergedDelivery':
        return <MergedDeliverySheetPage />
      case 'users':
        return user.role === 'admin' ? <UserManagePage /> : <PrintPage />
      default:
        return <PrintPage />
    }
  }

  const handleChangePassword = async (): Promise<void> => {
    try {
      const values = await pwdForm.validateFields()
      setPwdLoading(true)
      const result = await api.changePassword(values.oldPassword, values.newPassword)
      if (result.success) {
        message.success('密码修改成功')
        setPwdModalOpen(false)
        pwdForm.resetFields()
      } else {
        message.error(result.error || '修改失败')
      }
    } catch {
      // validation error
    } finally {
      setPwdLoading(false)
    }
  }

  const userMenuItems = [
    {
      key: 'changePwd',
      icon: <KeyOutlined />,
      label: '修改密码',
      onClick: () => setPwdModalOpen(true)
    },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout }
  ]

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        style={{ borderRight: '1px solid #f0f0f0' }}
      >
        <div
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: 'bold',
            fontSize: collapsed ? 14 : 16,
            color: '#1677ff',
            overflow: 'hidden',
            whiteSpace: 'nowrap'
          }}
        >
          {collapsed ? '库存' : '库存管理系统'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[currentPage]}
          items={menuItems}
          onClick={({ key }) => setCurrentPage(key as PageKey)}
          style={{ borderRight: 'none', flex: 1 }}
        />
        <div
          style={{
            padding: collapsed ? '8px 4px' : '8px 12px',
            borderTop: '1px solid #f0f0f0'
          }}
        >
          <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
            <Button
              type="text"
              block
              style={{
                textAlign: 'left',
                height: 'auto',
                padding: '6px 8px',
                overflow: 'hidden'
              }}
            >
              <Space>
                <UserOutlined />
                {!collapsed && (
                  <span style={{ fontSize: 13 }}>{user.displayName || user.username}</span>
                )}
              </Space>
            </Button>
          </Dropdown>
        </div>
      </Sider>
      <Layout>
        <Content
          style={{
            margin: 16,
            padding: 20,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
            overflow: 'auto'
          }}
        >
          {renderPage()}
        </Content>
      </Layout>

      <Modal
        title="修改密码"
        open={pwdModalOpen}
        onOk={handleChangePassword}
        onCancel={() => {
          setPwdModalOpen(false)
          pwdForm.resetFields()
        }}
        confirmLoading={pwdLoading}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="旧密码"
            name="oldPassword"
            rules={[{ required: true, message: '请输入旧密码' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 4, message: '密码至少4位' }
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次密码输入不一致'))
                }
              })
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  )
}

export default App
