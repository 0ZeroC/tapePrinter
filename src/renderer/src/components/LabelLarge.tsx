import { useEffect, useState, useMemo } from 'react'
import QRCode from 'qrcode'
import type { Product } from '../utils/api'
import logoImg from '../assets/logo.png'
import stampImg from '../assets/stamp.png'

export interface CombinedLabelItem {
  code: string
  description: string
  quantity: number
}

interface LabelLargeProps {
  product: Product
  quantity?: number
  unit?: string
  orderNo?: string
  projectName?: string
  textFontSizePt?: number
  descFontSizePt?: number
  combinedItems?: CombinedLabelItem[]
}

function LabelLarge({
  product,
  quantity,
  unit,
  orderNo,
  projectName,
  textFontSizePt,
  descFontSizePt,
  combinedItems
}: LabelLargeProps): JSX.Element {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  // 当天日期
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const extraTextFontSize = useMemo(
    () => (textFontSizePt && textFontSizePt > 0 ? textFontSizePt : 11.5),
    [textFontSizePt]
  )
  const descFontSize = useMemo(
    () => (descFontSizePt && descFontSizePt > 0 ? descFontSizePt : 12.5),
    [descFontSizePt]
  )

  // 生成二维码（默认只包含物品编码）
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
          {combinedItems && combinedItems.length > 0 ? (
            <>
              {/* 第二行：只显示订单号 + 工程名称内容，不显示标题 */}
              <div className="label-row">
                <span
                  className="label-value"
                  style={{
                    fontSize: `${extraTextFontSize}pt`,
                    fontWeight: 900,
                    whiteSpace: 'normal',
                    wordBreak: 'break-all'
                  }}
                >
                  {(orderNo || '') || (projectName || '')
                    ? [orderNo, projectName].filter(Boolean).join(' / ')
                    : '-'}
                </span>
              </div>
              {/* 第三行：表头 “物料编码” “物料描述” “数量” */}
              <div className="label-row label-row-combined-header">
                <span
                  className="label-field"
                  style={{
                    minWidth: '24mm',
                    width: '24mm',
                    textAlign: 'left'
                  }}
                >
                  物料编码
                </span>
                <span
                  className="label-field"
                  style={{
                    minWidth: '44mm',
                    width: '44mm',
                    textAlign: 'left'
                  }}
                >
                  物料描述
                </span>
                <span
                  className="label-field"
                  style={{
                    minWidth: '20mm',
                    width: '20mm',
                    textAlign: 'right'
                  }}
                >
                  数量
                </span>
              </div>
              {/* 第四~六行：三个物料行 描述 + 订单数量/配货数量 */}
              {combinedItems.slice(0, 3).map((item, index) => (
                <div className="label-row label-row-combined-item" key={index}>
                  <span
                    className="label-value label-code-value"
                    style={{
                      fontSize: `${Math.max(extraTextFontSize - 2, 8)}pt`,
                      minWidth: '24mm',
                      width: '24mm',
                      whiteSpace: 'normal',
                      wordBreak: 'break-all'
                    }}
                  >
                    {item.code}
                  </span>
                  <span
                    className="label-value label-desc-value"
                    style={{
                      fontSize: `${Math.max(descFontSize - 2, 8)}pt`,
                      minWidth: '44mm',
                      width: '44mm'
                    }}
                  >
                    {item.description}
                  </span>
                  <span
                    className="label-value"
                    style={{
                      fontSize: `${extraTextFontSize}pt`,
                      minWidth: '20mm',
                      width: '20mm',
                      textAlign: 'right',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.quantity}只
                  </span>
                </div>
              ))}
              <div className="label-row">
                <span className="label-field">日　　期：</span>
                <span
                  className="label-value"
                  style={{ fontSize: '11.5pt', whiteSpace: 'nowrap' }}
                >
                  {today}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="label-row">
                <span className="label-field">订单号：</span>
                <span className="label-value" style={{ fontSize: `${extraTextFontSize}pt` }}>
                  {orderNo || '-'}
                </span>
              </div>
              <div className="label-row">
                <span className="label-field">工程名称：</span>
                <span className="label-value" style={{ fontSize: `${extraTextFontSize}pt` }}>
                  {projectName || '-'}
                </span>
              </div>
              <div className="label-row">
                <span className="label-field">物料编码：</span>
                <span className="label-value">{product.code}</span>
              </div>
              <div className="label-row label-row-desc">
                <span className="label-field">物料描述：</span>
                <span
                  className="label-value label-desc-value"
                  style={{ fontSize: `${descFontSize}pt` }}
                >
                  {product.description || '-'}
                </span>
              </div>
              {quantity && (
                <div className="label-row">
                  <span className="label-field">数　　量：</span>
                  <span className="label-value" style={{ fontWeight: 'bold', fontSize: '13.5pt' }}>
                    {quantity} {unit || '只'}
                  </span>
                </div>
              )}
              <div className="label-row">
                <span className="label-field">日　　期：</span>
                <span
                  className="label-value"
                  style={{ fontSize: '11.5pt', whiteSpace: 'nowrap' }}
                >
                  {today}
                </span>
              </div>
            </>
          )}
        </div>
        {!combinedItems && (
          <div className="label-right">
            <img src={stampImg} alt="检验合格" className="label-stamp" />
            <div className="label-qrcode">
              {qrDataUrl && <img src={qrDataUrl} alt="QR Code" />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LabelLarge
