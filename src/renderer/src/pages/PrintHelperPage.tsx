import { Card, Typography } from 'antd'
import PrintDialogHelperPanel from '../components/PrintDialogHelperPanel'

const { Title, Paragraph } = Typography

function PrintHelperPage(): JSX.Element {
  return (
    <div style={{ maxWidth: 720 }}>
      <Title level={3} style={{ marginTop: 0 }}>
        打印助手
      </Title>
      <Paragraph type="secondary">
        管理浏览器打印弹窗的自动确认方式。这里保存的启用状态、延迟和点击坐标，会直接用于标签打印和配货单一键打印。
      </Paragraph>
      <Card>
        <PrintDialogHelperPanel />
      </Card>
    </div>
  )
}

export default PrintHelperPage
