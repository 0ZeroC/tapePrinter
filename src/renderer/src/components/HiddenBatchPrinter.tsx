import { forwardRef, useCallback, useImperativeHandle, useState, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import LabelSmall from './LabelSmall'
import LabelLarge from './LabelLarge'
import { api, type Product } from '../utils/api'
import { printLabelByTemplate, type LabelTemplateType } from '../utils/labelPrinter'
import '../styles/label-print.css'

export interface BatchPrintJob {
  product: Product
  productCode: string
  orderNo: string
  projectName: string
  quantity: number
  unit: string
  templateType: LabelTemplateType
}

export interface HiddenBatchPrinterHandle {
  printJob: (job: BatchPrintJob) => Promise<void>
}

const QR_WAIT_TIMEOUT_MS = 15000
const QR_POLL_INTERVAL_MS = 80

let qrReadyResolver: (() => void) | null = null

function notifyQrReady(): void {
  qrReadyResolver?.()
  qrReadyResolver = null
}

function waitForQrImageInPrintArea(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = (): void => {
      const img = document.querySelector(
        '.print-area .label-small .label-qrcode img'
      ) as HTMLImageElement | null
      if (img?.src && img.complete && img.naturalWidth > 0) {
        resolve()
        return
      }
      if (img?.src && !img.complete) {
        img.onload = () => resolve()
        img.onerror = () => resolve()
        return
      }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error('二维码生成超时'))
        return
      }
      window.setTimeout(tick, QR_POLL_INTERVAL_MS)
    }
    tick()
  })
}

function waitForSmallLabelQr(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      qrReadyResolver = null
      resolve()
    }
    const fail = (err: Error): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      qrReadyResolver = null
      reject(err)
    }

    const timer = window.setTimeout(() => fail(new Error('二维码生成超时')), timeoutMs)
    qrReadyResolver = finish

    void waitForQrImageInPrintArea(timeoutMs)
      .then(finish)
      .catch((err) => fail(err instanceof Error ? err : new Error(String(err))))
  })
}

const HiddenBatchPrinter = forwardRef<HiddenBatchPrinterHandle>(function HiddenBatchPrinter(
  _props,
  ref
): ReactElement {
  const [job, setJob] = useState<BatchPrintJob | null>(null)

  const printJob = useCallback(async (nextJob: BatchPrintJob): Promise<void> => {
    flushSync(() => {
      setJob(nextJob)
    })

    if (nextJob.templateType === 'small') {
      await waitForSmallLabelQr(QR_WAIT_TIMEOUT_MS)
      await new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      })
    } else {
      await new Promise((r) => setTimeout(r, 80))
    }

    if (nextJob.product.id > 0) {
      const deductResult = await api.printAndDeduct(
        nextJob.product.id,
        nextJob.quantity,
        1,
        nextJob.templateType,
        true
      )
      if (!deductResult.success) {
        throw new Error(deductResult.error || '记录打印失败')
      }
    }

    await printLabelByTemplate(nextJob.templateType)
  }, [])

  useImperativeHandle(ref, () => ({ printJob }), [printJob])

  const labelKey = job
    ? `${job.templateType}-${job.productCode}-${job.quantity}`
    : 'idle'

  return (
    <div
      className="print-area"
      aria-hidden
      style={{
        position: 'fixed',
        left: -10000,
        top: 0,
        width: 1,
        height: 1,
        overflow: 'hidden',
        pointerEvents: 'none'
      }}
    >
      <div className="label-preview-container">
        <div className="label-preview-item">
          {job && job.templateType === 'small' ? (
            <LabelSmall
              key={labelKey}
              product={job.product}
              productCode={job.productCode}
              quantity={job.quantity}
              unit={job.unit}
              onQrReady={notifyQrReady}
            />
          ) : null}
          {job && job.templateType === 'large' ? (
            <LabelLarge
              key={labelKey}
              product={job.product}
              productCode={job.productCode}
              quantity={job.quantity}
              unit={job.unit}
              orderNo={job.orderNo}
              projectName={job.projectName}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
})

export default HiddenBatchPrinter
