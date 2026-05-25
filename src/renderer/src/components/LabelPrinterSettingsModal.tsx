import { useCallback, useEffect, useState, type JSX } from 'react'
import { Modal, message } from 'antd'
import LabelPrinterSettingsForm from './LabelPrinterSettingsForm'
import {
  getLabelPrinterMap,
  setLabelPrinterMap,
  listPrinters,
  type LabelPrinterMap,
  type PrinterInfo
} from '../utils/labelPrinter'

interface LabelPrinterSettingsModalProps {
  open: boolean
  onClose: () => void
  onSaved?: (map: LabelPrinterMap) => void
  zIndex?: number
}

function LabelPrinterSettingsModal({
  open,
  onClose,
  onSaved,
  zIndex
}: LabelPrinterSettingsModalProps): JSX.Element {
  const [printerList, setPrinterList] = useState<PrinterInfo[]>([])
  const [draft, setDraft] = useState<LabelPrinterMap>({})
  const [loading, setLoading] = useState(false)

  const loadPrinters = useCallback(async () => {
    if (!window.electronAPI?.getPrinters) {
      message.info('打印机映射仅在桌面端可用')
      return
    }
    setLoading(true)
    try {
      const printers = await listPrinters()
      setPrinterList(printers)
      if (printers.length === 0) {
        message.warning('未检测到本机打印机，请检查驱动或连接')
      }
    } catch {
      message.error('获取打印机列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setDraft(getLabelPrinterMap())
    void loadPrinters()
  }, [open, loadPrinters])

  const handleSave = useCallback(() => {
    setLabelPrinterMap(draft)
    onSaved?.(draft)
    onClose()
    message.success('打印机映射已保存')
  }, [draft, onClose, onSaved])

  if (!window.electronAPI?.getPrinters) {
    return <></>
  }

  return (
    <Modal
      title="小/大标签打印机映射"
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
      zIndex={zIndex}
    >
      <LabelPrinterSettingsForm
        value={draft}
        onChange={setDraft}
        printerList={printerList}
        loading={loading}
        onRefresh={() => void loadPrinters()}
      />
    </Modal>
  )
}

export default LabelPrinterSettingsModal
