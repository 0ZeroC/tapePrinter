import { useEffect, useState } from 'react'
import { Modal, Form, Input, message, Upload, Button, Space, Typography, Tag } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd/es/upload'
import { api, type Product, type ProductData } from '../utils/api'

const { Text } = Typography

const DRAWING_ACCEPT = '.pdf,image/jpeg,image/png,image/gif,image/webp'

interface ProductFormProps {
  visible: boolean
  product: Product | null
  onSuccess: () => void
  onCancel: () => void
  /** 图纸上传后同步更新列表中的物料（不关闭弹窗时） */
  onProductPatched?: (p: Product) => void
}

function ProductForm({
  visible,
  product,
  onSuccess,
  onCancel,
  onProductPatched
}: ProductFormProps): JSX.Element {
  const [form] = Form.useForm<ProductData>()
  const isEditing = !!product
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  useEffect(() => {
    if (!visible) return
    setPendingFiles([])
    if (product) {
      form.setFieldsValue({
        code: product.code,
        description: product.description,
        name: product.name,
        spec: product.spec,
        grade: product.grade,
        surface_treatment: product.surface_treatment,
        material: product.material,
        special_note: product.special_note
      })
    } else {
      form.resetFields()
    }
  }, [visible, product, form])

  const uploadProps: UploadProps = {
    multiple: true,
    accept: DRAWING_ACCEPT,
    showUploadList: false,
    beforeUpload: (file) => {
      setPendingFiles((p) => {
        const next = [...p, file as File]
        message.info(`已加入待上传：${file.name}（共 ${next.length} 个）`)
        return next
      })
      return false
    }
  }

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      let result: Awaited<ReturnType<typeof api.createProduct>>

      if (isEditing && product) {
        result = await api.updateProduct(product.id, values)
      } else {
        result = await api.createProduct(values)
      }

      if (!result.success || !result.data) {
        message.error(result.error || (isEditing ? '更新失败' : '创建失败'))
        return
      }

      const savedId = result.data.id

      if (pendingFiles.length > 0) {
        const up = await api.uploadProductDrawings(savedId, pendingFiles)
        if (!up.success || !up.data) {
          message.warning(`物料已保存，但图纸上传失败：${up.error || '未知错误'}`)
        } else if (up.data.product) {
          onProductPatched?.(up.data.product)
        }
        setPendingFiles([])
      }

      message.success(isEditing ? '更新成功' : '创建成功')
      onSuccess()
    } catch (err) {
      if ((err as { errorFields?: unknown }).errorFields) return
      message.error('操作失败')
    }
  }

  const serverCount = product ? Number(product.drawings_count) || 0 : 0

  return (
    <Modal
      title={isEditing ? '编辑物品' : '新增物品'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      okText={isEditing ? '保存' : '创建'}
      cancelText="取消"
      destroyOnClose
      width={560}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          label="物料号"
          name="code"
          rules={[
            { required: true, message: '请输入物料号' },
            { max: 50, message: '物料号不能超过50个字符' }
          ]}
        >
          <Input placeholder="请输入物料号（唯一标识）" />
        </Form.Item>
        <Form.Item
          label="物料描述"
          name="description"
          rules={[{ max: 500, message: '物料描述不能超过500个字符' }]}
        >
          <Input placeholder="请输入物料描述" />
        </Form.Item>
        <Form.Item
          label="物品名称"
          name="name"
          rules={[
            { required: true, message: '请输入物品名称' },
            { max: 100, message: '名称不能超过100个字符' }
          ]}
        >
          <Input placeholder="请输入物品名称" />
        </Form.Item>
        <Form.Item
          label="规格"
          name="spec"
          rules={[{ max: 200, message: '规格不能超过200个字符' }]}
        >
          <Input placeholder="请输入规格" />
        </Form.Item>
        <Form.Item
          label="等级"
          name="grade"
          rules={[{ max: 50, message: '等级不能超过50个字符' }]}
        >
          <Input placeholder="请输入等级" />
        </Form.Item>
        <Form.Item
          label="表面处理"
          name="surface_treatment"
          rules={[{ max: 100, message: '表面处理不能超过100个字符' }]}
        >
          <Input placeholder="请输入表面处理方式" />
        </Form.Item>
        <Form.Item
          label="材质"
          name="material"
          rules={[{ max: 100, message: '材质不能超过100个字符' }]}
        >
          <Input placeholder="请输入材质" />
        </Form.Item>
        <Form.Item
          label="特殊备注"
          name="special_note"
          rules={[{ max: 500, message: '特殊备注不能超过500个字符' }]}
        >
          <Input placeholder="请输入特殊备注" />
        </Form.Item>

        <Form.Item label="图纸（PDF / 图片，可选多份）">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>选择文件（可多选）</Button>
            </Upload>
            {pendingFiles.length > 0 && (
              <div>
                <Space wrap style={{ marginBottom: 6 }}>
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
                <Button type="link" size="small" onClick={() => setPendingFiles([])}>
                  清空待上传
                </Button>
              </div>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              保存时一并上传；单文件最大 30MB。已有 {serverCount} 份图纸时，新文件会追加。
              {isEditing && ' 删除或预览请在列表「图纸」列打开管理。'}
            </Text>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default ProductForm
