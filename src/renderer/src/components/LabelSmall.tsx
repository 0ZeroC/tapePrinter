import { useEffect, useState, useMemo, useRef } from 'react'
import QRCode from 'qrcode'
import type { Product } from '../utils/api'
import stampImg from '../assets/stamp.png'

interface LabelSmallProps {
  product: Product
  productCode?: string
  quantity?: number
  unit?: string
  descFontSizePt?: number
}

function LabelSmall({
  product,
  productCode,
  quantity,
  unit,
  descFontSizePt = 8
}: LabelSmallProps): JSX.Element {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const qrRequestIdRef = useRef(0)

  // 当天日期
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  // 优先使用用户输入的编码；为空时回退到物料本身编码，避免首次渲染生成空二维码
  const displayCode = (productCode || '').trim() || product.code

  // 生成二维码（只包含物品编码）
  useEffect(() => {
    const qrContent = displayCode
    const requestId = ++qrRequestIdRef.current

    if (!qrContent) {
      setQrDataUrl('')
      return
    }

    QRCode.toDataURL(qrContent, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M'
    })
      .then((url) => {
        // 仅应用最后一次请求结果，避免异步竞态导致二维码被旧结果覆盖
        if (requestId === qrRequestIdRef.current) {
          setQrDataUrl(url)
        }
      })
      .catch(() => {
        if (requestId === qrRequestIdRef.current) {
          setQrDataUrl('')
        }
      })
  }, [displayCode])

  return (
    <div className="label-small">
      <div className="label-company">
        <span>通用产品标签</span>
      </div>
      <div className="label-content">
        <div className="label-left">
          <div className="label-row"><span className="label-field">物料编码 :</span> {displayCode}</div>
          <div className="label-row label-row-desc" style={{ fontSize: `${descFontSizePt}pt` }}>
            物料描述 : {product.description || '-'}
          </div>
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
