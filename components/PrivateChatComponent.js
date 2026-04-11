import { useState, useEffect, useContext, useRef, useCallback } from 'react'
import { UserContext } from '../context/UserContext'
import { useSocket } from '../context/SocketContext'
import { useTranslations } from 'next-intl'
import { fetchWithAuthRefresh } from '@/lib/authFetch'

const PrivateChatComponent = ({ receiver }) => {
	const [messages, setMessages] = useState([])
	const [currentMessage, setCurrentMessage] = useState('')
	const { user, isAuthed } = useContext(UserContext)
	const { socket, isConnected, connectionError } = useSocket()
	const username = user?.username
	const messagesContainerRef = useRef(null)
	const t = useTranslations('common')

	const fetchWithRefresh = useCallback(
		(url, opts) => fetchWithAuthRefresh(url, opts),
		[]
	)

	useEffect(() => {
		if (messagesContainerRef.current) {
			messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
		}
	}, [messages])

	useEffect(() => {
		if (!socket || !receiver) return

		const sender = username || 'Anonim'
		const chatId = [sender, receiver].sort().join('_')

		if (isConnected) {
		socket.emit('join_chat', chatId)
		}

		const fetchMessages = async () => {
			try {
				const response = await fetchWithRefresh(
					`/api/getPrivateMessages?peer=${encodeURIComponent(receiver)}`
				)
				const data = await response.json()
				if (Array.isArray(data)) {
					setMessages(data)
				} else {
					if (process.env.NODE_ENV === 'development') {
					console.error('Oczekiwano tablicy wiadomości, ale otrzymano:', data)
					}
					setMessages([])
				}
			} catch (error) {
				if (process.env.NODE_ENV === 'development') {
				console.error('Błąd podczas pobierania wiadomości:', error)
				}
			}
		}

		fetchMessages()

		const handleReceivePrivateMessage = (message) => {
			if (process.env.NODE_ENV === 'development') {
			console.log('Otrzymano prywatną wiadomość:', message)
			}
			if (message.chatId !== chatId) return
			setMessages(prevMessages => {
				const last = prevMessages[prevMessages.length - 1]
				if (
					last &&
					last.username === message.username &&
					last.content === message.content
				) {
					return prevMessages
				}
				return [...prevMessages, message]
			})
		}

		socket.on('receive_private_message', handleReceivePrivateMessage)

		return () => {
			socket.off('receive_private_message', handleReceivePrivateMessage)
		}
	}, [receiver, username, socket, isConnected, fetchWithRefresh])

	const handleSendMessage = async () => {
		if (!receiver) {
			if (process.env.NODE_ENV === 'development') {
			console.error('Receiver is not defined!')
			}
			return
		}
		const sender = username || 'Anonim'
		const chatId = [sender, receiver].sort().join('_')
		if (currentMessage.trim()) {
			try {
				const response = await fetchWithRefresh('/api/sendPrivateMessage', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						content: currentMessage,
						peer: receiver,
					}),
				})
				let data = {}
				try {
					data = await response.json()
				} catch (_) {
					/* empty */
				}
				if (response.ok && data.success !== false) {
					const trimmed = currentMessage.trim()
					const displayName =
						typeof data.username === 'string' && data.username.trim()
							? data.username.trim()
							: sender
					setMessages(prev => [
						...prev,
						{
							username: displayName,
							content: trimmed,
							timestamp: new Date(),
						},
					])
					setCurrentMessage('')
					const tryEmit = () => {
						if (socket && socket.connected) {
							socket.emit('send_private_message', {
								content: trimmed,
								chatId,
								peerUsername: receiver,
							})
						}
					}
					tryEmit()
					if (socket && !socket.connected) {
						socket.once('connect', tryEmit)
					}
				} else {
					if (process.env.NODE_ENV === 'development') {
					console.error(data.message)
					}
				}
			} catch (error) {
				if (process.env.NODE_ENV === 'development') {
				console.error('Błąd podczas wysyłania wiadomości:', error)
				}
			}
		}
	}

	const formatDate = timestamp => {
		const messageDate = new Date(timestamp)
		const currentDate = new Date()
		if (
			messageDate.getDate() === currentDate.getDate() &&
			messageDate.getMonth() === currentDate.getMonth() &&
			messageDate.getFullYear() === currentDate.getFullYear()
		) {
			return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		} else {
			return messageDate.toLocaleString([], {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
			})
		}
	}

	if (!isAuthed) {
		return <p>{t('mustlog') || 'Musisz się zalogować, aby napisać wiadomość.'}</p>
	}

	return (
		<div className="private-content-chat">
			{connectionError && (
				<div style={{ padding: '10px', background: '#ffebee', color: '#c62828', marginBottom: '10px', borderRadius: '4px' }}>
					{connectionError}
				</div>
			)}
			<div>
				<div className="messages-container" ref={messagesContainerRef}>
					{messages.map((msg, idx) => (
						<div key={idx} className="message-one">
							<strong>{msg.username}</strong>: {msg.content}
							<span style={{ marginLeft: '10px', fontSize: '0.8em', color: 'gray' }}>{formatDate(msg.timestamp)}</span>
						</div>
					))}
				</div>
			</div>
			{isAuthed ? (
				<div className="send-public-chat">
					<input
						value={currentMessage}
						onChange={e => setCurrentMessage(e.target.value)}
						onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
						type="text"
						placeholder={t('write')}
					/>
					<button onClick={handleSendMessage}>{t('sent')}</button>
				</div>
			) : (
				<p>Musisz się zalogować, aby napisać wiadomość.</p>
			)}
		</div>
	)
}

export default PrivateChatComponent
