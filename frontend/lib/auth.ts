/**
 * Authentication utilities for TeamBuilder
 */

const API_BASE = 'http://localhost:8001'  // TeamBuilder backend

export interface User {
  id: string
  email: string
  name: string
  picture?: string
  last_login: string
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/user`, {
      credentials: 'include',
      headers: {
        'X-API-Key': 'your_api_key',
      },
    })

    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to get current user:', error)
    return null
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-API-Key': 'your_api_key',
      },
    })
  } catch (error) {
    console.error('Logout failed:', error)
  }
}
