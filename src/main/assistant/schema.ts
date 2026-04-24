/** 允许出现在 SQL 中的表（users / app_meta 永不暴露给模型） */
export const ASSISTANT_TABLES_ALL = [
  'products',
  'product_drawings',
  'inventory',
  'inventory_logs',
  'picking_order_items',
  'picking_order_splits',
  'print_logs'
] as const

export const ASSISTANT_TABLES_NO_INVENTORY = [
  'products',
  'product_drawings',
  'picking_order_items',
  'picking_order_splits',
  'print_logs'
] as const

export function buildSchemaPrompt(canViewInventory: boolean): string {
  const tables = canViewInventory ? ASSISTANT_TABLES_ALL : ASSISTANT_TABLES_NO_INVENTORY
  return `
你是 SQLite 查询助手。用户问题将用中文描述。你必须只输出一个 JSON 对象，不要 markdown，不要其它文字。
格式严格为：{"sql":"一条 SELECT 语句","note":"简短说明"}

规则：
- 只允许 SELECT；禁止多语句；不要分号或仅末尾可有分号。
- 只能使用这些表：${tables.join(', ')}。
- 禁止访问 users、app_meta 或任何 sqlite_% 系统表。
- 时间字段多为本地时间文本，比较可用 date(created_at)、datetime(created_at)，或与 'YYYY-MM-DD' 字符串比较。
- inventory_logs.type：入库一般为 'in'，出库为 'out'。
- picking_order_splits.picking_item_id 关联 picking_order_items.id；工程名在 picking_order_items.project_name。
- products.id 与 inventory.product_id 关联（外键）；inventory_logs / print_logs 的 product_id 仅作历史引用，可能对应已删除的物品，与 products 联查请用 LEFT JOIN。物料编码在 products.code。
- 需要 LIMIT 时不要超过 500；若未指定 LIMIT，系统会追加 LIMIT 500。

表结构摘要：
- products: id, code, name, spec, surface_treatment, grade, barcode, material, special_note, description, created_at, updated_at
- product_drawings: id, product_id, file_relpath, original_name, sort_order, created_at
- inventory: id, product_id, quantity, updated_at
- inventory_logs: id, product_id, type, quantity, remark, operator_id, operator_name, created_at
- picking_order_items: id, order_no, seq_no, product_code, description, quantity, unit, project_name, planner, order_date, required_date, is_picked, picked_quantity, picked_at, picked_by, created_at, updated_at, ...
- picking_order_splits: id, picking_item_id, component_code, quantity_pieces, created_at, updated_at
- print_logs: id, product_id, quantity, print_count, label_type, operator_id, operator_name, created_at
`.trim()
}
