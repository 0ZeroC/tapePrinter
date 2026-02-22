import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { api, setToken, type UserInfo } from '../utils/api'

interface AuthContextType {
  user: UserInfo | null
  loading: boolean
  login: (username: string, password: string) => Promise<string | null>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const result = await api.getMe()
      if (result.success && result.data) {
        setUser(result.data)
      } else {
        setToken(null)
        setUser(null)
      }
    } catch {
      setToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    const result = await api.login(username, password)
    if (result.success && result.data) {
      setToken(result.data.token)
      setUser(result.data.user)
      return null
    }
    return result.error || '登录失败'
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  return useContext(AuthContext)
}
