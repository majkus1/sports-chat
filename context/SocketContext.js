'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
	const [socket, setSocket] = useState(null)
	const [isConnected, setIsConnected] = useState(false)
	const [connectionError, setConnectionError] = useState(null)
	const reconnectAttempts = useRef(0)
	const maxReconnectAttempts = 5
	const reconnectTimeoutRef = useRef(null)

	useEffect(() => {
		// Socket.IO automatically appends /socket.io/ to the path
		// On production, nginx proxies /socket.io/ to localhost:3000
		// So we just need the base URL (without /socket.io/)
		const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'
		
		// Create socket with proper configuration
		const newSocket = io(socketUrl, {
			withCredentials: true,
			transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
			reconnection: true,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 5000,
			reconnectionAttempts: maxReconnectAttempts,
			timeout: 20000,
			forceNew: false, // Reuse existing connection if available
		})

		// Connection event handlers
		newSocket.on('connect', () => {
			if (process.env.NODE_ENV === 'development') {
				console.log('Socket.IO connected:', newSocket.id)
			}
			setIsConnected(true)
			setConnectionError(null)
			reconnectAttempts.current = 0
		})

		newSocket.on('disconnect', (reason) => {
			if (process.env.NODE_ENV === 'development') {
				console.log('Socket.IO disconnected:', reason)
			}
			setIsConnected(false)
			
			// If it's a manual disconnect or server closed, don't try to reconnect
			if (reason === 'io server disconnect' || reason === 'io client disconnect') {
				return
			}
		})

		newSocket.on('connect_error', (error) => {
			if (process.env.NODE_ENV === 'development') {
				console.error('Socket.IO connection error:', error)
			}
			setIsConnected(false)
			
			// Handle ERR_BLOCKED_BY_CLIENT specifically
			if (error.message?.includes('ERR_BLOCKED_BY_CLIENT') || 
			    error.message?.includes('blocked') ||
			    error.type === 'TransportError') {
				setConnectionError('Połączenie zablokowane przez przeglądarkę. Sprawdź ustawienia rozszerzeń (np. adblocker).')
			} else {
				setConnectionError('Błąd połączenia z serwerem czatu.')
			}
			
			reconnectAttempts.current += 1
			
			// If max attempts reached, show persistent error
			if (reconnectAttempts.current >= maxReconnectAttempts) {
				setConnectionError('Nie można połączyć z serwerem czatu. Odśwież stronę lub sprawdź połączenie internetowe.')
			}
		})

		newSocket.on('reconnect', (attemptNumber) => {
			if (process.env.NODE_ENV === 'development') {
				console.log('Socket.IO reconnected after', attemptNumber, 'attempts')
			}
			setIsConnected(true)
			setConnectionError(null)
			reconnectAttempts.current = 0
		})

		newSocket.on('reconnect_attempt', (attemptNumber) => {
			if (process.env.NODE_ENV === 'development') {
				console.log('Socket.IO reconnection attempt:', attemptNumber)
			}
		})

		newSocket.on('reconnect_error', (error) => {
			if (process.env.NODE_ENV === 'development') {
				console.error('Socket.IO reconnection error:', error)
			}
		})

		newSocket.on('reconnect_failed', () => {
			if (process.env.NODE_ENV === 'development') {
				console.error('Socket.IO reconnection failed after max attempts')
			}
			setConnectionError('Nie można ponownie połączyć z serwerem czatu. Odśwież stronę.')
		})

		setSocket(newSocket)

		// Cleanup on unmount
		return () => {
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current)
			}
			newSocket.close()
			setSocket(null)
			setIsConnected(false)
		}
	}, [])

	return (
		<SocketContext.Provider value={{ socket, isConnected, connectionError }}>
			{children}
		</SocketContext.Provider>
	)
}

export function useSocket() {
	const context = useContext(SocketContext)
	if (!context) {
		throw new Error('useSocket must be used within SocketProvider')
	}
	return context
}

