import { useMemo, type ReactElement } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { Product } from '../utils/api'
import logoImg from '../assets/logo.png'
import stampImg from '../assets/stamp.png'

/** 拼箱时每条物料：中文来自配货行，英文来自物料主数据 */
export interface BilingualLabelItem {
  productCode: string
  descriptionZh: string
  descriptionEn: string
  quantity: number
  unit?: string
}

export interface LabelLargeBilingualProps {
  product: Product
  productCode?: string
  orderNo?: string
  projectName?: string
  orderNoFontSizePt?: number
  projectNameFontSizePt?: number
  descFontSizePt?: number
  /** 单行时中文描述（配货/覆盖），英文用 descriptionEn 或从物料主数据 */
  lineDescriptionZh?: string
  lineDescriptionEn?: string
  quantity?: number
  unit?: string
  /** 2～3 条拼箱 */
  combinedItems?: BilingualLabelItem[]
  boxNo?: number
}

function qtyText(q: number, unit: string | undefined): string {
  const n = q > 0 ? q : 1
  return unit === '套' ? `${n} 套/SET` : `${n} 只/PCS`
}

/** 标题与内容分列，类似表格（不连成一段） */
function TableStyleFieldRow({
  label,
  value,
  fontSizePt,
  marginBottom = '1.6mm',
  labelWidth = '30mm'
}: {
  label: string
  value: string
  fontSizePt: number
  marginBottom?: string
  /** 左列标题区宽度，需容纳「工程名称/Project」等 */
  labelWidth?: string
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        marginBottom,
        alignItems: 'flex-start',
        gap: '2mm',
        fontSize: `${fontSizePt}pt`,
        lineHeight: 1.36
      }}
    >
      <div
        style={{
          flex: `0 0 ${labelWidth}`,
          width: labelWidth,
          maxWidth: labelWidth,
          fontWeight: 500,
          flexShrink: 0,
          paddingRight: '1mm',
          boxSizing: 'border-box'
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          wordBreak: 'break-all'
        }}
      >
        {value}
      </div>
    </div>
  )
}

/** 单行：标签已含斜杠，整行可自动换行 */
function CompactBilingualLine({
  text,
  fontSizePt,
  marginBottom = '1.8mm',
  lineHeight = 1.36
}: {
  text: string
  fontSizePt: number
  marginBottom?: string
  lineHeight?: number
}): ReactElement {
  return (
    <div
      className="label-value"
      style={{
        fontSize: `${fontSizePt}pt`,
        marginBottom,
        lineHeight,
        wordBreak: 'break-all'
      }}
    >
      {text}
    </div>
  )
}

function DateAndBoxRow({
  date,
  boxNo,
  dateFontSizePt,
  boxFontSizePt
}: {
  date: string
  boxNo?: number
  dateFontSizePt: number
  boxFontSizePt: number
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        width: '100%',
        gap: '10mm',
        marginBottom: '1.6mm',
        lineHeight: 1.36,
        whiteSpace: 'nowrap'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          gap: '2mm',
          fontSize: `${dateFontSizePt}pt`,
          whiteSpace: 'nowrap'
        }}
      >
        <div style={{ flexShrink: 0, fontWeight: 500 }}>日期/Date</div>
        <div>{date}</div>
      </div>
      {boxNo != null && boxNo > 0 && (
        <div
          style={{
            display: 'flex',
            flexShrink: 0,
            gap: '2mm',
            fontSize: `${boxFontSizePt}pt`,
            whiteSpace: 'nowrap'
          }}
        >
          <div style={{ fontWeight: 500 }}>箱号/Box</div>
          <div>{boxNo}#</div>
        </div>
      )}
    </div>
  )
}

function LabelLargeBilingual({
  product,
  productCode,
  orderNo,
  projectName,
  orderNoFontSizePt,
  projectNameFontSizePt,
  descFontSizePt,
  lineDescriptionZh,
  lineDescriptionEn,
  quantity,
  unit,
  combinedItems,
  boxNo
}: LabelLargeBilingualProps): ReactElement {
  const displayCode = (productCode ?? product.code).trim() || '-'
  const isCombined = Boolean(combinedItems && combinedItems.length > 0)
  const n = combinedItems?.length ?? 0
  const dense = n >= 3

  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  const orderFont = orderNoFontSizePt && orderNoFontSizePt > 0 ? orderNoFontSizePt : 11.5
  const projectFont = projectNameFontSizePt && projectNameFontSizePt > 0 ? projectNameFontSizePt : 11.5
  const descBase = descFontSizePt && descFontSizePt > 0 ? descFontSizePt : 12.5
  const descEn = Math.max(dense ? descBase - 2.5 : descBase - 1, 8)
  const descZh = Math.max(dense ? descBase - 1.5 : descBase, 9)
  const metaFont = 11.5
  const boxFont = 12

  const qrContent = useMemo(
    () => (isCombined && combinedItems?.[0] ? combinedItems[0].productCode : displayCode) || '-',
    [isCombined, combinedItems, displayCode]
  )

  const zhSingle = (lineDescriptionZh ?? product.description ?? '').trim() || '-'
  const enSingle = (lineDescriptionEn ?? product.description_en ?? '').trim() || '—'
  const qty = quantity && quantity > 0 ? quantity : 1
  const u = unit || '只'

  const vOrder = (orderNo || '').trim() || '-'
  const vProject = (projectName || '').trim() || '-'

  return (
    <div className="label-large label-large-bilingual">
      {isCombined && <img src={stampImg} alt="检验合格" className="label-combined-stamp-overlay" />}
      <div className="label-title">
        <img src={logoImg} alt="logo" className="label-logo" />
        <span>扬州硕瑞机电有限公司</span>
      </div>
      <div className="label-info">
        <div className="label-details">
          {isCombined && combinedItems && combinedItems.length > 0 ? (
            <>
              <TableStyleFieldRow label="订单号/Order" value={vOrder} fontSizePt={orderFont} />
              <TableStyleFieldRow label="工程名称/Project" value={vProject} fontSizePt={projectFont} />
              {combinedItems.map((it, index) => {
                const mZh = Math.max(dense ? descBase - 1.5 : descBase, 8.5)
                const dZh = (it.descriptionZh || it.productCode || '—').trim() || '—'
                const dEn = (it.descriptionEn || '—').trim() || '—'
                const mEn = Math.max(mZh - 0.5, 8)
                const qtyPt = Math.max(mZh - 0.5, 9.5)
                return (
                  <div key={index} style={{ marginBottom: '1.5mm' }}>
                    <CompactBilingualLine text={dZh} fontSizePt={mZh} marginBottom="0.4mm" />
                    <CompactBilingualLine
                      text={dEn}
                      fontSizePt={mEn}
                      marginBottom="1.1mm"
                    />
                    <TableStyleFieldRow
                      label="数量/Quantity"
                      value={qtyText(it.quantity, it.unit)}
                      fontSizePt={qtyPt}
                      marginBottom="0"
                      labelWidth={dense ? '26mm' : '30mm'}
                    />
                  </div>
                )
              })}
              <DateAndBoxRow
                date={today}
                boxNo={boxNo}
                dateFontSizePt={metaFont}
                boxFontSizePt={boxFont}
              />
            </>
          ) : (
            <>
              <TableStyleFieldRow label="订单号/Order" value={vOrder} fontSizePt={orderFont} />
              <TableStyleFieldRow label="工程名称/Project" value={vProject} fontSizePt={projectFont} />
              <CompactBilingualLine text={zhSingle} fontSizePt={descZh} marginBottom="0.4mm" />
              <CompactBilingualLine
                text={enSingle}
                fontSizePt={descEn}
                marginBottom="1.1mm"
              />
              <TableStyleFieldRow
                label="数量/Quantity"
                value={qtyText(qty, u)}
                fontSizePt={descEn}
              />
              <DateAndBoxRow
                date={today}
                boxNo={boxNo}
                dateFontSizePt={metaFont}
                boxFontSizePt={boxFont}
              />
            </>
          )}
        </div>
        <div className={`label-right${isCombined ? ' label-right-combined' : ''}`}>
          {!isCombined && <img src={stampImg} alt="检验合格" className="label-stamp" />}
          <div className="label-qrcode">
            <QRCodeSVG
              value={qrContent}
              size={isCombined ? 52 : 64}
              level="M"
              marginSize={1}
              includeMargin={false}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default LabelLargeBilingual
