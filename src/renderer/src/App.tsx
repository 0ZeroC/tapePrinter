import { useState } from 'react'
import { Layout, Menu, theme } from 'antd'
import {
  PrinterOutlined,
  DatabaseOutlined,
  ImportOutlined,
  ExportOutlined,
  AppstoreOutlined
} from '@ant-design/icons'
import PrintPage from './pages/PrintPage'
import DataPage from './pages/DataPage'
import StockInPage from './pages/StockInPage'
import StockOutPage from './pages/StockOutPage'
import StockPage from './pages/StockPage'

const { Sider, Content } = Layout

type PageKey = 'print' | 'data' | 'stockIn' | 'stockOut' | 'stock'

const menuItems = [
  {
    key: 'print' as PageKey,
    icon: <PrinterOutlined />,
    label: '标签打印'
  },
  {
    key: 'stockIn' as PageKey,
    icon: <ImportOutlined />,
    label: '入库'
  },
  {
    key: 'stockOut' as PageKey,
    icon: <ExportOutlined />,
    label: '出库'
  },
  {
    key: 'stock' as PageKey,
    icon: <AppstoreOutlined />,
    label: '库存'
  },
  {
    key: 'data' as PageKey,
    icon: <DatabaseOutlined />,
    label: '数据管理'
  }
]

function App(): JSX.Element {
  const [currentPage, setCurrentPage] = useState<PageKey>('print')
  const [collapsed, setCollapsed] = useState(false)
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  const renderPage = (): JSX.Element => {
    switch (currentPage) {
      case 'print':
        return <PrintPage />
      case 'stockIn':
        return <StockInPage />
      case 'stockOut':
        return <StockOutPage />
      case 'stock':
        return <StockPage />
      case 'data':
        return <DataPage />
      default:
        return <PrintPage />
    }
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        style={{
          borderRight: '1px solid #f0f0f0'
        }}
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
          {collapsed ? '打印' : '标签打印软件'}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[currentPage]}
          items={menuItems}
          onClick={({ key }) => setCurrentPage(key as PageKey)}
          style={{ borderRight: 'none' }}
        />
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
    </Layout>
  )
}

export default App
