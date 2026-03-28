import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Modal,
  Upload,
  Button,
  Table,
  message,
  Space,
  Popconfirm,
  Spin,
  Typography,
  Tag
} from 'antd'
import { InboxOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd/es/upload'
import { api, fetchProductDrawingFileBlob, type Product, type ProductDrawingMeta } from '../utils/api'

const { Dragger } = Upload
const { Text } = Typography

const ACCEPT = '.pdf,image/jpeg,image/png,image/gif,image/webp'

interface ProductDrawingsModalProps {
  product: Product | null
  open: boolean
  onClose: () => void
  onProductUpdated?: (p: Product) => void
}

function ProductDrawingsModal({
  product,
  open,
  onClose,
  onProductUpdated
}: ProductDrawingsModalProps): JSX.Element {
  const [list, setList] = useState<ProductDrawingMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  const [previewId, setPreviewId] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<'pdf' | 'image' | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewBlobRef = useRef<string | null>(null)

  const loadList = useCallback(async () => {
    if (!product) return
    setLoading(true)
    try {
      const res = await api.listProductDrawings(product.id)
      if (res.success && res.data) {
        setList(res.data)
      } else {
        message.error(res.error || '加载图纸列表失败')
      }
    } catch {
      message.error('加载图纸列表出错')
    } finally {
      setLoading(false)
    }
  }, [product])

  useEffect(() => {
    if (open && product) {
      void loadList()
      setPendingFiles([])
    }
    if (!open) {
      setList([])
      setPendingFiles([])
      setPreviewId(null)
    }
  }, [open, product, loadList])

  useEffect(() => {
    if (previewId == null) {
      if (previewBlobRef.current) {
        URL.revokeObjectURL(previewBlobRef.current)
        previewBlobRef.current = null
      }
      setPreviewUrl(null)
      setPreviewMode(null)
      setPreviewError(null)
      setPreviewLoading(false)
      return
    }

    let cancelled = false
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current)
      previewBlobRef.current = null
    }
    setPreviewUrl(null)
    setPreviewMode(null)
    setPreviewError(null)
    setPreviewLoading(true)

    fetchProductDrawingFileBlob(previewId)
      .then(({ blob, contentType }) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        previewBlobRef.current = url
        const isPdf = contentType.includes('pdf') || blob.type.includes('pdf')
        setPreviewMode(isPdf ? 'pdf' : 'image')
        setPreviewUrl(url)
      })
      .catch((e: Error) => {
        if (!cancelled) setPreviewError(e.message)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [previewId])

  const draggerProps: UploadProps = {
    multiple: true,
    accept: ACCEPT,
    showUploadList: false,
    disabled: uploading,
    beforeUpload: (file) => {
      setPendingFiles((p) => [...p, file as File])
      return false
    }
  }

  const flushUpload = async (): Promise<void> => {
    if (!product || pendingFiles.length === 0) return
    setUploading(true)
    try {
      const res = await api.uploadProductDrawings(product.id, pendingFiles)
      if (res.success && res.data) {
        message.success(`已上传 ${pendingFiles.length} 个文件`)
        setPendingFiles([])
        await loadList()
        if (res.data.product) onProductUpdated?.(res.data.product)
      } else {
        message.error(res.error || '上传失败')
      }
    } catch {
      message.error('上传出错')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (drawingId: number): Promise<void> => {
    try {
      const res = await api.deleteProductDrawing(drawingId)
      if (res.success && res.data?.product) {
        message.success('已删除')
        await loadList()
        onProductUpdated?.(res.data.product)
      } else {
        message.error(res.error || '删除失败')
      }
    } catch {
      message.error('删除失败')
    }
  }

  return (
    <>
      <Modal
        title={
          product ? (
            <span>
              图纸 — <Text code>{product.code}</Text> {product.name}
            </span>
          ) : (
            '图纸'
          )
        }
        open={open}
        onCancel={onClose}
        footer={null}
        width={760}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Dragger {...draggerProps}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此处，可多选</p>
            <p className="ant-upload-hint">PDF、jpg、png、gif、webp，单文件最大 30MB</p>
          </Dragger>

          {pendingFiles.length > 0 && (
            <div>
              <Space wrap style={{ marginBottom: 8 }}>
                {pendingFiles.map((f, i) => (
                  <Tag
                    key={`${f.name}-${i}`}
                    closable
                    onClose={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                  >
                    {f.name}
                  </Tag>
                ))}
              </Space>
              <div>
                <Button type="primary" loading={uploading} onClick={() => void flushUpload()}>
                  上传待选文件（{pendingFiles.length}）
                </Button>
                <Button type="link" onClick={() => setPendingFiles([])} disabled={uploading}>
                  清空待选
                </Button>
              </div>
            </div>
          )}

          <Text type="secondary" style={{ fontSize: 12 }}>
            已建档物料可随时在此追加图纸，无需进入「编辑」弹窗。下方列表可预览、删除单份文件。
          </Text>

          <Table<ProductDrawingMeta>
            size="small"
            rowKey="id"
            loading={loading}
            dataSource={list}
            pagination={false}
            locale={{ emptyText: '暂无图纸，请上传' }}
            columns={[
              {
                title: '文件名',
                dataIndex: 'original_name',
                key: 'original_name',
                ellipsis: true
              },
              {
                title: '上传时间',
                dataIndex: 'created_at',
                key: 'created_at',
                width: 168
              },
              {
                title: '操作',
                key: 'op',
                width: 148,
                render: (_: unknown, row) => (
                  <Space size={0} wrap>
                    <Button
                      type="link"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => setPreviewId(row.id)}
                    >
                      预览
                    </Button>
                    <Popconfirm title="确定删除该图纸？" onConfirm={() => void handleDelete(row.id)}>
                      <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                )
              }
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title="图纸预览"
        open={previewId != null}
        onCancel={() => setPreviewId(null)}
        footer={null}
        width={900}
        styles={{ body: { minHeight: 420, paddingTop: 12 } }}
        destroyOnClose
        afterClose={() => {
          if (previewBlobRef.current) {
            URL.revokeObjectURL(previewBlobRef.current)
            previewBlobRef.current = null
          }
          setPreviewUrl(null)
          setPreviewMode(null)
          setPreviewError(null)
        }}
      >
        {previewLoading && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin tip="加载中…" />
          </div>
        )}
        {previewError && !previewLoading && <Text type="danger">{previewError}</Text>}
        {!previewLoading && !previewError && previewUrl && previewMode === 'pdf' && (
          <iframe
            title="图纸 PDF"
            src={previewUrl}
            style={{ width: '100%', height: '70vh', border: '1px solid #f0f0f0', borderRadius: 4 }}
          />
        )}
        {!previewLoading && !previewError && previewUrl && previewMode === 'image' && (
          <div style={{ textAlign: 'center', maxHeight: '70vh', overflow: 'auto' }}>
            <img
              src={previewUrl}
              alt="图纸"
              style={{ maxWidth: '100%', height: 'auto', verticalAlign: 'top' }}
            />
          </div>
        )}
      </Modal>
    </>
  )
}

export default ProductDrawingsModal
