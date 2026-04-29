import jwt from 'jsonwebtoken'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { Request, Response, NextFunction } from 'express'
import { getAppMetaValue, setAppMetaValue } from './database'

const JWT_SECRET = 'inventory-management-secret-key-2024'
const JWT_EXPIRES_IN = '24h'
const OPEN_API_TOKEN_HASH_KEY = 'open_api_token_sha256'
const OPEN_API_TOKEN_UPDATED_AT_KEY = 'open_api_token_updated_at'
const OPEN_API_ENABLED_KEY = 'open_api_enabled'
const OPEN_API_ALLOWED_IPS_KEY = 'open_api_allowed_ips'
const OPEN_API_SCOPE_KEY = 'open_api_scope'
const OPEN_API_REQUIRED_SCOPE = 'read:all'

export interface JwtPayload {
  userId: number
  username: string
  displayName: string
  role: 'admin' | 'user'
  canViewInventory: boolean
  canManageData: boolean
  canManagePickingOrders: boolean
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return null
  }
}

export interface AuthRequest extends Request {
  user?: JwtPayload
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: '未登录' })
    return
  }
  const token = authHeader.slice(7)
  const payload = verifyToken(token)
  if (!payload) {
    res.status(401).json({ success: false, error: '登录已过期，请重新登录' })
    return
  }
  req.user = payload
  next()
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ success: false, error: '需要管理员权限' })
    return
  }
  next()
}

export function inventoryViewMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || (!req.user.canViewInventory && req.user.role !== 'admin')) {
    res.status(403).json({ success: false, error: '没有查看库存的权限' })
    return
  }
  next()
}

export function dataManageMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || (!req.user.canManageData && req.user.role !== 'admin')) {
    res.status(403).json({ success: false, error: '没有数据管理的权限' })
    return
  }
  next()
}

export function pickingOrderManageMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  // 只有具有“查看库存”权限（或管理员）的用户，才允许在配货单中执行新增、编辑、删除等操作
  if (!req.user || (!req.user.canViewInventory && req.user.role !== 'admin')) {
    res.status(403).json({ success: false, error: '没有查看库存的权限，无法管理配货单' })
    return
  }
  next()
}

export function pickingOrderOutboundMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  // 只有具备“配货出库权限”（或管理员）的用户，才能在配货单中执行出库/重置出库操作
  if (!req.user || (!req.user.canManagePickingOrders && req.user.role !== 'admin')) {
    res.status(403).json({ success: false, error: '没有配货出库权限' })
    return
  }
  next()
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function safeEqualText(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

function getOpenApiTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim()
  }
  const headerToken = req.headers['x-open-api-token']
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim()
  }
  return null
}

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.ip || req.socket.remoteAddress || 'unknown'
}

function splitCsv(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function createOpenApiToken(): string {
  // 返回明文 token 仅一次，数据库仅保存哈希。
  const token = randomBytes(32).toString('hex')
  setAppMetaValue(OPEN_API_TOKEN_HASH_KEY, sha256(token))
  setAppMetaValue(OPEN_API_TOKEN_UPDATED_AT_KEY, new Date().toISOString())
  if (!getAppMetaValue(OPEN_API_SCOPE_KEY)) {
    setAppMetaValue(OPEN_API_SCOPE_KEY, OPEN_API_REQUIRED_SCOPE)
  }
  if (!getAppMetaValue(OPEN_API_ENABLED_KEY)) {
    setAppMetaValue(OPEN_API_ENABLED_KEY, '1')
  }
  return token
}

export function revokeOpenApiToken(): void {
  setAppMetaValue(OPEN_API_TOKEN_HASH_KEY, '')
  setAppMetaValue(OPEN_API_TOKEN_UPDATED_AT_KEY, new Date().toISOString())
}

export function getOpenApiTokenStatus(): { enabled: boolean; updatedAt: string | null } {
  const hash = getAppMetaValue(OPEN_API_TOKEN_HASH_KEY)
  return {
    enabled: !!hash,
    updatedAt: getAppMetaValue(OPEN_API_TOKEN_UPDATED_AT_KEY)
  }
}

export interface OpenApiPolicy {
  enabled: boolean
  requiredScope: string
  allowedIps: string[]
}

export function getOpenApiPolicy(): OpenApiPolicy {
  const enabledRaw = getAppMetaValue(OPEN_API_ENABLED_KEY)
  const scopeRaw = getAppMetaValue(OPEN_API_SCOPE_KEY)
  const allowedIpsRaw = getAppMetaValue(OPEN_API_ALLOWED_IPS_KEY)
  const enabledEnv = (process.env.OPEN_API_ENABLED || '').trim()
  const scopeEnv = (process.env.OPEN_API_SCOPE || '').trim()
  const allowedIpsEnv = (process.env.OPEN_API_ALLOWED_IPS || '').trim()
  return {
    enabled: (enabledRaw ?? enabledEnv) !== '0',
    requiredScope: scopeRaw || scopeEnv || OPEN_API_REQUIRED_SCOPE,
    allowedIps: splitCsv(allowedIpsRaw || allowedIpsEnv)
  }
}

export function setOpenApiPolicy(input: {
  enabled?: boolean
  requiredScope?: string
  allowedIps?: string[]
}): OpenApiPolicy {
  const current = getOpenApiPolicy()
  const nextEnabled = input.enabled === undefined ? current.enabled : input.enabled
  const nextRequiredScope = (input.requiredScope || current.requiredScope || OPEN_API_REQUIRED_SCOPE).trim()
  const nextAllowedIps = (input.allowedIps || current.allowedIps)
    .map((ip) => ip.trim())
    .filter(Boolean)

  setAppMetaValue(OPEN_API_ENABLED_KEY, nextEnabled ? '1' : '0')
  setAppMetaValue(OPEN_API_SCOPE_KEY, nextRequiredScope || OPEN_API_REQUIRED_SCOPE)
  setAppMetaValue(OPEN_API_ALLOWED_IPS_KEY, nextAllowedIps.join(','))

  return getOpenApiPolicy()
}

export function openApiReadMiddleware(req: Request, res: Response, next: NextFunction): void {
  const policy = getOpenApiPolicy()
  if (!policy.enabled) {
    res.status(403).json({ success: false, error: '开放接口未启用' })
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: '开放接口仅支持只读 GET 请求' })
    return
  }

  if (policy.allowedIps.length > 0) {
    const clientIp = getClientIp(req)
    if (!policy.allowedIps.includes(clientIp)) {
      res.status(403).json({ success: false, error: '当前来源 IP 未被允许访问开放接口' })
      return
    }
  }

  const token = getOpenApiTokenFromRequest(req)
  const hashFromDb = getAppMetaValue(OPEN_API_TOKEN_HASH_KEY)
  const envToken = (process.env.OPEN_API_TOKEN || '').trim()
  const hash = hashFromDb || (envToken ? sha256(envToken) : '')
  if (!token || !hash) {
    res.status(401).json({ success: false, error: '开放接口未授权' })
    return
  }
  const incomingHash = sha256(token)
  if (!safeEqualText(incomingHash, hash)) {
    res.status(401).json({ success: false, error: '开放接口令牌无效' })
    return
  }

  if (policy.requiredScope !== OPEN_API_REQUIRED_SCOPE) {
    res.status(403).json({ success: false, error: '开放接口 scope 配置错误，请联系管理员' })
    return
  }
  next()
}
