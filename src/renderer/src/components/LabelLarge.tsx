import { useEffect, useState, useMemo } from 'react'
import QRCode from 'qrcode'
import type { Product } from '../../../preload/index.d'
import logoImg from '../assets/logo.png'
import stampImg from '../assets/stamp.png'

interface LabelLargeProps {
  product: Product
  quantity?: number
  unit?: string
}

function LabelLarge({ product, quantity, unit }: LabelLargeProps): JSX.Element {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  // 当天日期
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  // 生成二维码（只包含物品编码）
  useEffect(() => {
    const qrContent = product.code

    QRCode.toDataURL(qrContent, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M'
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [product])

  return (
    <div className="label-large">
      <div className="label-title">
        <img src={logoImg} alt="logo" className="label-logo" />
        <span>扬州硕瑞机电有限公司</span>
      </div>
      <div className="label-info">
        <div className="label-details">
          <div className="label-row">
            <span className="label-field">物品名称：</span>
            <span className="label-value">{product.name}</span>
          </div>
          <div className="label-row">
            <span className="label-field">规　　格：</span>
            <span className="label-value">{product.spec || '-'}</span>
          </div>
          <div className="label-row">
            <span className="label-field">表面处理：</span>
            <span className="label-value">{product.surface_treatment || '-'}</span>
          </div>
          <div className="label-row">
            <span className="label-field">等　　级：</span>
            <span className="label-value">{product.grade || '-'}</span>
          </div>
          {quantity && (
            <div className="label-row">
              <span className="label-field">数　　量：</span>
              <span className="label-value" style={{ fontWeight: 'bold', fontSize: '16.5pt' }}>
                {quantity} {unit || '只'}
              </span>
            </div>
          )}
          <div className="label-row">
            <span className="label-field">日　　期：</span>
            <span className="label-value" style={{ fontSize: '13pt' }}>{today}</span>
          </div>
        </div>
        <div className="label-right">
          <img src={stampImg} alt="检验合格" className="label-stamp" />
          <div className="label-qrcode">
            {qrDataUrl && <img src={qrDataUrl} alt="QR Code" />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LabelLarge
