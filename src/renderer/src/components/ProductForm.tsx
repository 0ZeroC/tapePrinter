import { useEffect } from 'react'
import { Modal, Form, Input, message } from 'antd'
import type { Product, ProductData } from '../../../preload/index.d'

interface ProductFormProps {
  visible: boolean
  product: Product | null
  onSuccess: () => void
  onCancel: () => void
}

function ProductForm({ visible, product, onSuccess, onCancel }: ProductFormProps): JSX.Element {
  const [form] = Form.useForm<ProductData>()
  const isEditing = !!product

  useEffect(() => {
    if (visible) {
      if (product) {
        form.setFieldsValue({
          code: product.code,
          name: product.name,
          spec: product.spec,
          surface_treatment: product.surface_treatment,
          grade: product.grade
        })
      } else {
        form.resetFields()
      }
    }
  }, [visible, product, form])

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      let result

      if (isEditing && product) {
        result = await window.api.updateProduct(product.id, values)
      } else {
        result = await window.api.createProduct(values)
      }

      if (result.success) {
        message.success(isEditing ? '更新成功' : '创建成功')
        onSuccess()
      } else {
        message.error(result.error || (isEditing ? '更新失败' : '创建失败'))
      }
    } catch (err) {
      // 表单验证失败，不处理
      if ((err as { errorFields?: unknown }).errorFields) return
      message.error('操作失败')
    }
  }

  return (
    <Modal
      title={isEditing ? '编辑物品' : '新增物品'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onCancel}
      okText={isEditing ? '保存' : '创建'}
      cancelText="取消"
      destroyOnClose
      width={500}
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 16 }}
      >
        <Form.Item
          label="物品编码"
          name="code"
          rules={[
            { required: true, message: '请输入物品编码' },
            { max: 50, message: '编码不能超过50个字符' }
          ]}
        >
          <Input placeholder="请输入物品编码（唯一标识）" />
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
          <Input placeholder="请输入物品规格" />
        </Form.Item>

        <Form.Item
          label="表面处理"
          name="surface_treatment"
          rules={[{ max: 100, message: '表面处理不能超过100个字符' }]}
        >
          <Input placeholder="请输入表面处理方式" />
        </Form.Item>

        <Form.Item
          label="等级"
          name="grade"
          rules={[{ max: 50, message: '等级不能超过50个字符' }]}
        >
          <Input placeholder="请输入等级" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default ProductForm
