import { useEffect, useState, useMemo, useRef } from 'react'
import QRCode from 'qrcode'
import type { Product } from '../utils/api'
import logoImg from '../assets/logo.png'
import stampImg from '../assets/stamp.png'

interface LabelSmallProps {
  product: Product
  productCode?: string
  quantity?: number
  unit?: string
  descFontSizePt?: number
  /** 二维码生成完成后回调（批量打印前等待） */
  onQrReady?: () => void
}

function LabelSmall({
  product,
  productCode,
  quantity,
  unit,
  descFontSizePt = 8,
  onQrReady
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

    let cancelled = false
    QRCode.toDataURL(qrContent, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M'
    })
      .then((url) => {
        if (cancelled || requestId !== qrRequestIdRef.current) return
        setQrDataUrl(url)
      })
      .catch(() => {
        if (cancelled || requestId !== qrRequestIdRef.current) return
        setQrDataUrl('')
      })

    return () => {
      cancelled = true
    }
  }, [displayCode])

  // 批量打印：等 qrDataUrl 写入且图片节点就绪后再通知（避免 setJob 与 waitQr 竞态）
  useEffect(() => {
    if (!onQrReady) return
    if (!displayCode.trim()) {
      onQrReady()
      return
    }
    if (!qrDataUrl) return

    const img = document.createElement('img')
    img.onload = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => onQrReady())
      })
    }
    img.onerror = () => onQrReady()
    img.src = qrDataUrl
  }, [qrDataUrl, displayCode, onQrReady])

  return (
    <div className="label-small">
      <div className="label-company">
        <img src={logoImg} alt="logo" className="label-logo" />
        <span>扬州硕瑞机电有限公司</span>
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
