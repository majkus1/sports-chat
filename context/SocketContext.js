'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { UserContext } from './UserContext'
import { ACCESS_REFRESH_EVENT, refreshAccessToken } from '@/lib/authFetch'

const SocketContext = createContext(null)

/** Ile czekamy na potwierdzenie z serwera, zanim uznamy wysyłkę za nieudaną. */
const ACK_TIMEOUT_MS = 10000

export function SocketProvider({ children }) {
	const userFromAuth = useContext(UserContext)
	const [socket, setSocket] = useState(null)
	const [isConnected, setIsConnected] = useState(false)
	const [connectionError, setConnectionError] = useState(null)
	const socketRef = useRef(null)
	/** Handshake używa ciasteczek — po zalogowaniu trzeba połączyć ponownie, żeby JWT z polem `un` trafił na serwer */
	const wasAuthedRef = useRef(false)

	useEffect(() => {
		// Socket.IO automatically appends /socket.io/ to the path
		// On production, nginx proxies /socket.io/ to localhost:3000
		// So we just need the base URL (without /socket.io/)
		const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000'

		const newSocket = io(socketUrl, {
			withCredentials: true,
			transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
			reconnection: true,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 5000,
			// Wcześniej było 5 prób — po nich socket.io przestawało próbować na zawsze
			// i czat cichł do końca sesji, bez żadnego komunikatu.
			reconnectionAttempts: Infinity,
			timeout: 20000,
			forceNew: false, // Reuse existing connection if available
		})

		socketRef.current = newSocket

		newSocket.on('connect', () => {
			if (process.env.NODE_ENV === 'development') {
				console.log('Socket.IO connected:', newSocket.id)
			}
			setIsConnected(true)
			setConnectionError(null)
		})

		newSocket.on('disconnect', (reason) => {
			if (process.env.NODE_ENV === 'development') {
				console.log('Socket.IO disconnected:', reason)
			}
			setIsConnected(false)

			// Rozłączenie zainicjowane przez serwer nie jest ponawiane automatycznie.
			if (reason === 'io server disconnect') {
				newSocket.connect()
			}
		})

		newSocket.on('connect_error', (error) => {
			if (process.env.NODE_ENV === 'development') {
				console.error('Socket.IO connection error:', error)
			}
			setIsConnected(false)

			if (
				error.message?.includes('ERR_BLOCKED_BY_CLIENT') ||
				error.message?.includes('blocked') ||
				error.type === 'TransportError'
			) {
				setConnectionError(
					'Połączenie zablokowane przez przeglądarkę. Sprawdź ustawienia rozszerzeń (np. adblocker).'
				)
			} else {
				setConnectionError('Błąd połączenia z serwerem czatu.')
			}
		})

		/**
		 * Serwer sygnalizuje, że sesja tego połączenia jest już nieważna.
		 * Ciasteczko `accessToken` jest httpOnly, więc nie da się podmienić tokenu
		 * na żywym połączeniu — jedyną drogą jest odświeżenie i nowy handshake.
		 */
		newSocket.on('auth_expired', () => {
			refreshAccessToken()
				.then((res) => {
					if (res.ok) return
					setConnectionError('Sesja wygasła. Zaloguj się ponownie, aby pisać.')
				})
				.catch(() => {})
		})

		/** Po odświeżeniu access tokena (timer, 401 w HTTP) potrzebny jest nowy handshake. */
		const onAccessRefresh = () => {
			newSocket.disconnect()
			newSocket.connect()
		}
		// Listener podpięty w tym samym efekcie co tworzenie socketu. Wcześniej siedział
		// w osobnym useEffect zależnym od stanu `socket`, więc pierwszy refresh
		// z UserContext potrafił go wyprzedzić — HTTP miało świeże ciasteczko,
		// a socket dalej trzymał sesję sprzed odświeżenia.
		window.addEventListener(ACCESS_REFRESH_EVENT, onAccessRefresh)

		setSocket(newSocket)

		return () => {
			window.removeEventListener(ACCESS_REFRESH_EVENT, onAccessRefresh)
			newSocket.close()
			socketRef.current = null
			setSocket(null)
			setIsConnected(false)
		}
	}, [])

	useEffect(() => {
		if (!socket) return
		const authed = !!(userFromAuth?.isAuthed && userFromAuth?.user?.username)
		if (authed !== wasAuthedRef.current) {
			wasAuthedRef.current = authed
			socket.disconnect()
			socket.connect()
		}
	}, [socket, userFromAuth?.isAuthed, userFromAuth?.user?.username])

	/**
	 * Emit z potwierdzeniem. Zwraca `{ ok, code?, message? }` zamiast znikać w ciszy —
	 * dzięki temu UI może pokazać status wysyłki i pozwolić ponowić próbę.
	 */
	const emitWithAck = useCallback((event, payload) => {
		const active = socketRef.current
		if (!active || !active.connected) {
			return Promise.resolve({ ok: false, code: 'disconnected' })
		}

		return new Promise((resolve) => {
			let settled = false
			const timer = setTimeout(() => {
				if (settled) return
				settled = true
				resolve({ ok: false, code: 'timeout' })
			}, ACK_TIMEOUT_MS)

			active.emit(event, payload, (response) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				resolve(response || { ok: false, code: 'no_ack' })
			})
		})
	}, [])

	/**
	 * Wysyła wiadomość i — jeśli serwer odrzucił ją z powodu wygasłej sesji —
	 * odświeża token, czeka na ponowne połączenie i próbuje raz jeszcze.
	 * Ten sam `clientMsgId` gwarantuje, że ponowienie nie zapisze duplikatu.
	 */
	const sendWithAuthRetry = useCallback(
		async (event, payload) => {
			const first = await emitWithAck(event, payload)
			if (first.ok) return first
			if (first.code !== 'auth_expired' && first.code !== 'auth_revoked') return first

			const refreshed = await refreshAccessToken().catch(() => null)
			if (!refreshed || !refreshed.ok) return { ok: false, code: 'session_lost' }

			// ACCESS_REFRESH_EVENT rozłącza i łączy ponownie — czekamy na nowe połączenie.
			const reconnected = await waitForConnection(socketRef, ACK_TIMEOUT_MS)
			if (!reconnected) return { ok: false, code: 'disconnected' }

			return emitWithAck(event, payload)
		},
		[emitWithAck]
	)

	return (
		<SocketContext.Provider
			value={{ socket, isConnected, connectionError, emitWithAck, sendWithAuthRetry }}
		>
			{children}
		</SocketContext.Provider>
	)
}

function waitForConnection(socketRef, timeoutMs) {
	const active = socketRef.current
	if (!active) return Promise.resolve(false)
	if (active.connected) return Promise.resolve(true)

	return new Promise((resolve) => {
		const done = (value) => {
			clearTimeout(timer)
			active.off('connect', onConnect)
			resolve(value)
		}
		const onConnect = () => done(true)
		const timer = setTimeout(() => done(false), timeoutMs)
		active.on('connect', onConnect)
	})
}

export function useSocket() {
	const context = useContext(SocketContext)
	if (!context) {
		throw new Error('useSocket must be used within SocketProvider')
	}
	return context
}
