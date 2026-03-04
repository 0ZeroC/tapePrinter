import { useState, useCallback, useRef, useEffect } from 'react'
import { Table } from 'antd'
import type { TableProps, ColumnsType } from 'antd/es/table'

const MIN_COLUMN_WIDTH = 50

interface ResizableTitleProps extends React.HTMLAttributes<HTMLTableCellElement> {
  onResize: (index: number, delta: number) => void
  width?: number
  index: number
}

function ResizableTitle({ onResize, width, index, children, ...restProps }: ResizableTitleProps) {
  const [resizing, setResizing] = useState(false)
  const startXRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizing(true)
    startXRef.current = e.clientX
  }, [])

  useEffect(() => {
    if (!resizing) return
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current
      startXRef.current = e.clientX
      onResize(index, delta)
    }
    const handleMouseUp = () => setResizing(false)
    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizing, index, onResize])

  return (
    <th
      {...restProps}
      style={{
        ...restProps.style,
        position: 'relative',
        userSelect: resizing ? 'none' : undefined
      }}
    >
      {children}
      {width !== undefined && (
        <span
          className="resizable-table-handle"
          onMouseDown={handleMouseDown}
          style={{ cursor: resizing ? 'col-resize' : 'col-resize' }}
        />
      )}
    </th>
  )
}

/**
 * 为列配置添加可调节宽度和内容换行支持
 * - 移除 ellipsis 以允许内容换行显示
 */
export function prepareColumnsForResize<T>(columns: ColumnsType<T>): ColumnsType<T> {
  return columns.map((col) => {
    const c = { ...col } as Record<string, unknown>
    if (c.ellipsis === true) delete c.ellipsis
    return c as typeof col
  })
}

export interface ResizableTableProps<T> extends Omit<TableProps<T>, 'columns'> {
  columns: ColumnsType<T>
  /** 是否启用列宽拖拽调节，默认 true */
  resizable?: boolean
}

export function ResizableTable<T extends object>({
  columns,
  resizable = true,
  ...tableProps
}: ResizableTableProps<T>) {
  const [cols, setCols] = useState<ColumnsType<T>>(() => {
    const prepared = prepareColumnsForResize(columns)
    return prepared
  })

  const handleResize = useCallback((index: number, delta: number) => {
    setCols((prev) => {
      const next = [...prev]
      const col = next[index] as Record<string, unknown>
      if (!col || col.width === undefined) return prev
      const currentWidth = Number(col.width) || 0
      const newWidth = Math.max(MIN_COLUMN_WIDTH, currentWidth + delta)
      next[index] = { ...col, width: newWidth }
      return next
    })
  }, [])

  // 仅初次挂载时使用 columns；后续列结构变化可由父组件通过 key 触发重挂载

  const finalColumns = resizable
    ? cols.map((col, index) => {
        const c = col as Record<string, unknown>
        const w = c.width as number | undefined
        const hasWidth = typeof w === 'number'
        return {
          ...c,
          onHeaderCell: hasWidth
            ? () => ({
                width: w,
                index,
                onResize: handleResize
              })
            : undefined
        }
      })
    : cols

  const components = resizable
    ? {
        header: {
          cell: (props: React.HTMLAttributes<HTMLTableCellElement> & { width?: number; index?: number; onResize?: (i: number, d: number) => void }) => {
            const { width, index, onResize, ...rest } = props
            if (index !== undefined && onResize) {
              return <ResizableTitle width={width} index={index} onResize={onResize} {...rest} />
            }
            return <th {...rest} />
          }
        }
      }
    : undefined

  return (
    <Table
      {...tableProps}
      columns={finalColumns}
      components={components}
      className={`${tableProps.className || ''} resizable-table`.trim()}
    />
  )
}

export default ResizableTable
