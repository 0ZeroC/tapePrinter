import { useMemo, type ReactElement } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { Product } from '../utils/api'
import logoImg from '../assets/logo.png'
import stampImg from '../assets/stamp.png'

export interface CombinedLabelItem {
  code: string
  description: string
  quantity: number
  unit?: string
}

interface LabelLargeProps {
  product: Product
  productCode?: string
  quantity?: number
  unit?: string
  orderNo?: string
  projectName?: string
  orderNoFontSizePt?: number
  projectNameFontSizePt?: number
  descFontSizePt?: number
  combinedItems?: CombinedLabelItem[]
  /** 拼箱标签的箱号，会显示在日期同一行后面，如 4# */
  boxNo?: number
}

function LabelLarge({
  product,
  productCode,
  quantity,
  unit,
  orderNo,
  projectName,
  orderNoFontSizePt,
  projectNameFontSizePt,
  descFontSizePt,
  combinedItems,
  boxNo
}: LabelLargeProps): ReactElement {
  const displayCode = productCode ?? product.code
  const displayCombinedItems = combinedItems?.slice(0, 4) ?? []
  const isCombinedDense = displayCombinedItems.length >= 4

  // 当天日期
  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const orderFontSize = useMemo(
    () => (orderNoFontSizePt && orderNoFontSizePt > 0 ? orderNoFontSizePt : 11.5),
    [orderNoFontSizePt]
  )
  const projectFontSize = useMemo(
    () => (projectNameFontSizePt && projectNameFontSizePt > 0 ? projectNameFontSizePt : 11.5),
    [projectNameFontSizePt]
  )
  const descFontSize = useMemo(
    () => (descFontSizePt && descFontSizePt > 0 ? descFontSizePt : 12.5),
    [descFontSizePt]
  )

  const qrContent = useMemo(
    () => String(displayCode ?? product?.code ?? '-').trim() || '-',
    [displayCode, product?.code]
  )

  return (
    <div className="label-large">
      {combinedItems && combinedItems.length > 0 && (
        <img src={stampImg} alt="检验合格" className="label-combined-stamp-overlay" />
      )}
      <div className="label-title">
        <img src={logoImg} alt="logo" className="label-logo" />
        <span>扬州硕瑞机电有限公司</span>
      </div>
      <div className="label-info">
        <div className="label-details">
          {combinedItems && combinedItems.length > 0 ? (
            <>
              {/* 第二行：订单号 + 工程名称在同一文本流中，换行从左侧顶格开始 */}
              <div className="label-row">
                <span
                  className="label-value"
                  style={{
                    whiteSpace: 'normal',
                    wordBreak: 'break-all'
                  }}
                >
                  <span
                    style={{
                      fontSize: `${orderFontSize}pt`
                    }}
                  >
                    {orderNo || '-'}
                  </span>
                  {' '}
                  <span
                    style={{
                      fontSize: `${projectFontSize}pt`
                    }}
                  >
                    {projectName || '-'}
                  </span>
                </span>
              </div>
              {/* 第四行：表头 “物料编码” “物料描述” “数量” */}
              <div className="label-row label-row-combined-header">
                <span
                  className="label-field"
                  style={{
                    minWidth: '25mm',
                    width: '25mm',
                    textAlign: 'left'
                  }}
                >
                  物料编码
                </span>
                <span
                  className="label-field"
                  style={{
                    minWidth: '45mm',
                    width: '45mm',
                    textAlign: 'left'
                  }}
                >
                  物料描述
                </span>
                <span
                  className="label-field"
                  style={{
                    minWidth: '19mm',
                    width: '19mm',
                    textAlign: 'right'
                  }}
                >
                  数量
                </span>
              </div>
              {/* 物料行：最多展示 4 条 */}
              {displayCombinedItems.map((item, index) => (
                <div
                  className="label-row label-row-combined-item"
                  key={index}
                  style={{
                    marginBottom: isCombinedDense ? '2mm' : undefined,
                    lineHeight: isCombinedDense ? 1.45 : undefined
                  }}
                >
                  <span
                    className="label-value label-code-value"
                    style={{
                      fontSize: isCombinedDense ? '8pt' : '9pt',
                      minWidth: '25mm',
                      width: '25mm',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {item.code}
                  </span>
                  <span
                    className="label-value label-desc-value"
                    style={{
                      fontSize: `${Math.max(descFontSize - (isCombinedDense ? 3 : 2), 8)}pt`,
                      minWidth: '45mm',
                      width: '45mm'
                    }}
                  >
                    {item.description}
                  </span>
                  <span
                    className="label-value"
                    style={{
                      fontSize: `${Math.max(projectFontSize - (isCombinedDense ? 1 : 0), 9)}pt`,
                      minWidth: '19mm',
                      width: '19mm',
                      textAlign: 'right',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.quantity} {item.unit || '只'}
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
                {boxNo != null && boxNo > 0 && (
                  <span
                    className="label-value"
                    style={{
                      fontSize: '23pt',
                      whiteSpace: 'nowrap',
                      marginLeft: '8mm',
                      position: 'relative',
                      top: '-5mm'
                    }}
                  >
                    {boxNo}#
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="label-row">
                <span className="label-field">订单号：</span>
                <span className="label-value" style={{ fontSize: `${orderFontSize}pt` }}>
                  {orderNo || '-'}
                </span>
              </div>
              <div className="label-row">
                <span className="label-field">工程名称：</span>
                <span className="label-value" style={{ fontSize: `${projectFontSize}pt` }}>
                  {projectName || '-'}
                </span>
              </div>
              <div className="label-row">
                <span className="label-field">物料编码：</span>
                <span className="label-value">{displayCode}</span>
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
                  <span className="label-value" style={{ fontSize: '13.5pt' }}>
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
              <QRCodeSVG
                value={qrContent}
                size={80}
                level="M"
                marginSize={1}
                includeMargin={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LabelLarge
