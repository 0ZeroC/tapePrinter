import { useEffect, useState, useMemo } from 'react'
import QRCode from 'qrcode'
import type { Product } from '../utils/api'
import logoImg from '../assets/logo.png'
import stampImg from '../assets/stamp.png'

interface LabelSmallProps {
  product: Product
  quantity?: number
  unit?: string
}

function LabelSmall({ product, quantity, unit }: LabelSmallProps): JSX.Element {
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
    <div className="label-small">
      <div className="label-company">
        <img src={logoImg} alt="logo" className="label-logo" />
        <span>扬州硕瑞机电有限公司</span>
      </div>
      <div className="label-content">
        <div className="label-left">
          <div className="label-row"><span className="label-field">物料编码 :</span> {product.code}</div>
          <div className="label-row label-row-desc"><span className="label-field">物料描述 :</span> <span className="label-desc-value">{product.description || '-'}</span></div>
          <div className="label-row"><span className="label-field">数　　量 :</span> {quantity ? `${quantity} ${unit || '只'}` : '-'}</div>
          <div className="label-row"><span className="label-field">日　　期 :</span> <span className="label-date-value">{today}</span></div>
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

export default LabelSmall
