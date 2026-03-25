import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

const JWT_SECRET = 'inventory-management-secret-key-2024'
const JWT_EXPIRES_IN = '24h'

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
