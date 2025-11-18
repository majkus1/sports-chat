import { useState, useEffect, useContext, useRef, useCallback } from 'react'
import { UserContext } from '../context/UserContext'
import { useSocket } from '../context/SocketContext'
import { useAnalysis } from '../context/AnalysisContext'
import Modal from './Modal'
import PrivateChatComponent from './PrivateChatComponent'
import { GiPlayButton } from 'react-icons/gi'
import { useTranslations, useLocale } from 'next-intl'

const ChatComponent = ({
	chatId,
	homeTeam,
	awayTeam,
	prediction,
	predictionPercent,
	predictionWinner,
	predictionGoals,
	winOrDraw,
	homeStats,
	awayStats,
	isAnalysisEnabled,
	isLive,
	currentGoals,
	comparison,
	h2h,
}) => {
	const [messages, setMessages] = useState([])
	const [currentMessage, setCurrentMessage] = useState('')
	const [isPrivateChatOpen, setPrivateChatOpen] = useState(false)
	const [selectedUser, setSelectedUser] = useState(null)
	const messagesContainerRef = useRef(null)
	const locale = useLocale()
	const t = useTranslations('common')
	const [analysis, setAnalysis] = useState({ text: '', pred: '' })
	const [showGenerateButton, setShowGenerateButton] = useState(false)
	const [limitExceeded, setLimitExceeded] = useState(false)
	const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false)
	const analysisRequestedRef = useRef(false) // Prevent multiple simultaneous requests
	const midnightTimeoutRef = useRef(null) // Store timeout ID for midnight reset

	const { user, isAuthed } = useContext(UserContext)
	const { socket, isConnected, connectionError } = useSocket()
	const { isGenerating, setIsGenerating } = useAnalysis()
	const username = user?.username

	// Helper functions for localStorage limit tracking
	const getTodayDateString = () => {
		const now = new Date()
		const year = now.getFullYear()
		const month = String(now.getMonth() + 1).padStart(2, '0')
		const day = String(now.getDate()).padStart(2, '0')
		return `${year}-${month}-${day}`
	}

	const getLocalStorageLimitKey = () => {
		return `analysis_limit_exceeded:${getTodayDateString()}`
	}

	const checkLocalStorageLimit = () => {
		// localStorage limit only applies to unauthenticated users
		// Authenticated users have their own limit tracked on the server
		if (isAuthed) {
			return false
		}
		
		if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
			return false
		}
		
		const key = getLocalStorageLimitKey()
		const stored = localStorage.getItem(key)
		
		if (!stored) {
			return false
		}
		
		// Check if stored date matches today
		const storedDate = stored.split(':')[1] // Format: "exceeded:YYYY-MM-DD"
		const today = getTodayDateString()
		
		// If date doesn't match, clear old entry
		if (storedDate !== today) {
			localStorage.removeItem(key)
			return false
		}
		
		return true
	}

	const setLocalStorageLimit = () => {
		if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
			return
		}
		
		const key = getLocalStorageLimitKey()
		const today = getTodayDateString()
		localStorage.setItem(key, `exceeded:${today}`)
	}

	const clearLocalStorageLimit = () => {
		if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
			return
		}
		
		// Clear all analysis limit keys (only old entries, not today's)
		const today = getTodayDateString()
		const keysToRemove = []
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i)
			if (key && key.startsWith('analysis_limit_exceeded:')) {
				// Extract date from key (format: "analysis_limit_exceeded:YYYY-MM-DD")
				const keyDate = key.split(':')[1]
				// Remove if date doesn't match today
				if (keyDate !== today) {
					keysToRemove.push(key)
				}
			}
		}
		keysToRemove.forEach(key => localStorage.removeItem(key))
	}

	// Check and reset localStorage limit at midnight
	useEffect(() => {
		const checkAndResetLimit = () => {
			const now = new Date()
			const tomorrow = new Date(now)
			tomorrow.setDate(tomorrow.getDate() + 1)
			tomorrow.setHours(0, 0, 0, 0)
			
			const msUntilMidnight = tomorrow.getTime() - now.getTime()
			
			// Clear any old entries (not from today)
			clearLocalStorageLimit()
			
			// Set timeout to clear ALL entries (including today's) at midnight
			midnightTimeoutRef.current = setTimeout(() => {
				// At midnight, clear all analysis limit keys (including today's)
				if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
					const keysToRemove = []
					for (let i = 0; i < localStorage.length; i++) {
						const key = localStorage.key(i)
						if (key && key.startsWith('analysis_limit_exceeded:')) {
							keysToRemove.push(key)
						}
					}
					keysToRemove.forEach(key => localStorage.removeItem(key))
				}
				// Recursively set next midnight check
				checkAndResetLimit()
			}, msUntilMidnight)
		}
		
		// Start the first check
		checkAndResetLimit()
		
		// Cleanup: clear timeout when component unmounts
		return () => {
			if (midnightTimeoutRef.current) {
				clearTimeout(midnightTimeoutRef.current)
				midnightTimeoutRef.current = null
			}
		}
	}, [])

	const fetchWithRefresh = useCallback(async (url, opts = {}) => {
		const res = await fetch(url, { credentials: 'include', ...opts })
		if (res.status !== 401) return res
		// odśwież access
		const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
		if (!r.ok) return res // brak refresh -> zwracamy 401
		// spróbuj ponownie
		return fetch(url, { credentials: 'include', ...opts })
	}, [])

	// Check if analysis exists in database (only for pre-match)
	useEffect(() => {
		// Always check analysis if analysis is enabled
		// This ensures limit checking happens immediately when chat opens
		if (!isAnalysisEnabled) {
			if (process.env.NODE_ENV === 'development') {
				console.log('[ChatComponent] checkAnalysis skipped: isAnalysisEnabled is false');
			}
			return;
		}

		const checkExistingAnalysis = async () => {
			// Check localStorage limit first (client-side check)
			if (checkLocalStorageLimit()) {
				setLimitExceeded(true)
				setShowGenerateButton(false)
				if (isAuthed) {
					setAnalysis({ 
						text: locale === 'pl' 
							? 'Osiągnąłeś dzienny limit 3 analiz. Wróć jutro lub wkrótce wykup dostęp do nieskończonej liczby analiz.'
							: 'You have reached the daily limit of 3 analyses. Come back tomorrow or purchase unlimited access soon.',
						pred: '' 
					})
				} else {
					setAnalysis({ 
						text: locale === 'pl'
							? 'Osiągnąłeś dzienny limit 3 analiz. Zaloguj się lub zarejestruj, aby wygenerować więcej analiz.'
							: 'You have reached the daily limit of 3 analyses. Log in or register to generate more analyses.',
						pred: '' 
					})
				}
				return
			}

			try {
				const fixtureId = chatId.startsWith('Liga-') ? chatId.replace('Liga-', '') : chatId
				
				if (process.env.NODE_ENV === 'development') {
					console.log('[ChatComponent] Calling checkAnalysis', {
						fixtureId,
						isLive,
						isAnalysisEnabled,
						hasHomeStats: !!homeStats?.playedTotal,
						hasAwayStats: !!awayStats?.playedTotal
					});
				}
				
				// For live matches, always check limit (don't check database)
				if (isLive) {
					const response = await fetch('/api/football/checkAnalysis', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						credentials: 'include',
						body: JSON.stringify({
							fixtureId,
							language: locale === 'pl' ? 'pl' : 'en',
							isLive: true, // Explicitly mark as live match to skip database check
						}),
					})
					
					const data = await response.json()
					if (data.canGenerate) {
						// User can generate - show button
						setShowGenerateButton(true)
						setLimitExceeded(false)
					} else {
						// User has reached limit - save to localStorage only for unauthenticated users
						if (!data.isLoggedIn) {
							setLocalStorageLimit()
						}
						setShowGenerateButton(false)
						setLimitExceeded(true)
						if (data.isLoggedIn) {
							setAnalysis({ 
								text: locale === 'pl' 
									? 'Osiągnąłeś dzienny limit 3 analiz. Wróć jutro lub wkrótce wykup dostęp do nieskończonej liczby analiz.'
									: 'You have reached the daily limit of 3 analyses. Come back tomorrow or purchase unlimited access soon.',
								pred: '' 
							})
						} else {
							setAnalysis({ 
								text: locale === 'pl'
									? 'Osiągnąłeś dzienny limit 3 analiz. Zaloguj się lub zarejestruj, aby wygenerować więcej analiz.'
									: 'You have reached the daily limit of 3 analyses. Log in or register to generate more analyses.',
								pred: '' 
							})
						}
					}
					return
				}

				// For pre-match, check database first, then limit
				const response = await fetch('/api/football/checkAnalysis', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({
						fixtureId,
						language: locale === 'pl' ? 'pl' : 'en',
						isLive: false, // Explicitly mark as pre-match to check database
					}),
				})

				const data = await response.json()
				if (data.exists && data.analysis) {
					// Analysis exists in database - show it
					const { text, prediction: pred } = parseAnalysis(data.analysis)
					setAnalysis({ text: text || '', pred })
					setShowGenerateButton(false)
					setLimitExceeded(false)
				} else {
					// Analysis doesn't exist - check if user can generate
					if (data.canGenerate) {
						// User can generate - show button
						setShowGenerateButton(true)
						setLimitExceeded(false)
					} else {
						// User has reached limit - save to localStorage and hide button
						setLocalStorageLimit()
						setShowGenerateButton(false)
						setLimitExceeded(true)
						if (data.isLoggedIn) {
							setAnalysis({ 
								text: locale === 'pl' 
									? 'Osiągnąłeś dzienny limit 3 analiz. Wróć jutro lub wkrótce wykup dostęp do nieskończonej liczby analiz.'
									: 'You have reached the daily limit of 3 analyses. Come back tomorrow or purchase unlimited access soon.',
								pred: '' 
							})
						} else {
							setAnalysis({ 
								text: locale === 'pl'
									? 'Osiągnąłeś dzienny limit 3 analiz. Zaloguj się lub zarejestruj, aby wygenerować więcej analiz.'
									: 'You have reached the daily limit of 3 analyses. Log in or register to generate more analyses.',
								pred: '' 
							})
						}
					}
				}
			} catch (error) {
				if (process.env.NODE_ENV === 'development') {
					console.error('[ChatComponent] Error checking analysis:', error)
				}
				// On error, hide button and show error message (fail closed for security)
				setShowGenerateButton(false)
				setLimitExceeded(true)
				setAnalysis({ 
					text: locale === 'pl'
						? 'Błąd sprawdzania limitu. Spróbuj odświeżyć stronę.'
						: 'Error checking limit. Please refresh the page.',
					pred: '' 
				})
			}
		}

		checkExistingAnalysis()
		
		// Reset states when chatId changes
		return () => {
			setAnalysis({ text: '', pred: '' })
			setShowGenerateButton(false)
			setLimitExceeded(false)
			setIsLoadingAnalysis(false)
			analysisRequestedRef.current = false
		}
	}, [isAnalysisEnabled, homeStats, awayStats, isLive, chatId, locale])
	
	// Additional effect to check analysis when stats become available (for pre-match)
	// This ensures checkAnalysis is called even if stats load after component mount
	useEffect(() => {
		if (!isAnalysisEnabled || isLive) {
			return;
		}
		
		// Only trigger if stats just became available
		if (homeStats?.playedTotal && awayStats?.playedTotal) {
			if (process.env.NODE_ENV === 'development') {
				console.log('[ChatComponent] Stats loaded, ensuring checkAnalysis was called');
			}
			// The main useEffect should handle this, but we can add a safety check here
			// by checking if we already have analysis state
			if (!analysis.text && !showGenerateButton && !limitExceeded) {
				// Analysis state is empty - trigger check again
				const fixtureId = chatId.startsWith('Liga-') ? chatId.replace('Liga-', '') : chatId;
				fetch('/api/football/checkAnalysis', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({
						fixtureId,
						language: locale === 'pl' ? 'pl' : 'en',
						isLive: false,
					}),
				})
				.then(res => res.json())
				.then(data => {
					if (data.exists && data.analysis) {
						const { text, prediction: pred } = parseAnalysis(data.analysis);
						setAnalysis({ text: text || '', pred });
						setShowGenerateButton(false);
						setLimitExceeded(false);
					} else if (data.canGenerate) {
						setShowGenerateButton(true);
						setLimitExceeded(false);
					} else {
						// User has reached limit - save to localStorage
						setLocalStorageLimit();
						setShowGenerateButton(false);
						setLimitExceeded(true);
						if (data.isLoggedIn) {
							setAnalysis({ 
								text: locale === 'pl' 
									? 'Osiągnąłeś dzienny limit 3 analiz. Wróć jutro lub wkrótce wykup dostęp do nieskończonej liczby analiz.'
									: 'You have reached the daily limit of 3 analyses. Come back tomorrow or purchase unlimited access soon.',
								pred: '' 
							});
						} else {
							setAnalysis({ 
								text: locale === 'pl'
									? 'Osiągnąłeś dzienny limit 3 analiz. Zaloguj się lub zarejestruj, aby wygenerować więcej analiz.'
									: 'You have reached the daily limit of 3 analyses. Log in or register to generate more analyses.',
								pred: '' 
							});
						}
					}
				})
				.catch(error => {
					if (process.env.NODE_ENV === 'development') {
						console.error('[ChatComponent] Error in secondary checkAnalysis:', error);
					}
				});
			}
		}
	}, [isAnalysisEnabled, isLive, homeStats?.playedTotal, awayStats?.playedTotal, chatId, locale, analysis.text, showGenerateButton, limitExceeded])

	useEffect(() => {
		if (messagesContainerRef.current) {
			messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
		}
	}, [messages])

	useEffect(() => {
		if (!socket) return

		const fetchMessages = async () => {
			try {
				const response = await fetch(`/api/getMessages?chatId=${chatId}`, {
					credentials: 'include',
				})
				const data = await response.json()
				setMessages(data)
			} catch (error) {
				if (process.env.NODE_ENV === 'development') {
					console.error('Błąd pobierania wiadomości:', error)
				}
			}
		}
		fetchMessages()

		if (isConnected) {
			socket.emit('join_chat', chatId)
		}

		const handleReceiveMessage = (message) => {
			if (message.chatId === chatId) {
				setMessages(prevMessages => [...prevMessages, message])
			}
		}

		socket.on('receive_message', handleReceiveMessage)
		
		return () => {
			socket.off('receive_message', handleReceiveMessage)
		}
	}, [chatId, socket, isConnected])

	const handleGenerateAnalysis = async () => {
		// Check localStorage limit first (client-side check)
		if (checkLocalStorageLimit()) {
			setLimitExceeded(true)
			setShowGenerateButton(false)
			if (isAuthed) {
				setAnalysis({ 
					text: locale === 'pl' 
						? 'Osiągnąłeś dzienny limit 3 analiz. Wróć jutro lub wkrótce wykup dostęp do nieskończonej liczby analiz.'
						: 'You have reached the daily limit of 3 analyses. Come back tomorrow or purchase unlimited access soon.',
					pred: '' 
				})
			} else {
				setAnalysis({ 
					text: locale === 'pl'
						? 'Osiągnąłeś dzienny limit 3 analiz. Zaloguj się lub zarejestruj, aby wygenerować więcej analiz.'
						: 'You have reached the daily limit of 3 analyses. Log in or register to generate more analyses.',
					pred: '' 
				})
			}
			return
		}

		if (
			!isAnalysisEnabled ||
			!homeStats?.playedTotal ||
			!awayStats?.playedTotal ||
			analysisRequestedRef.current ||
			isGenerating
		) {
			return
		}

		setIsLoadingAnalysis(true)
		setAnalysis({ text: t('ai'), pred: '' })
		setShowGenerateButton(false)
		analysisRequestedRef.current = true
		setIsGenerating(true)

		try {
			// Create AbortController for timeout
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout

			// Extract fixture ID from chatId (format: "Liga-{id}")
			const fixtureId = chatId.startsWith('Liga-') ? chatId.replace('Liga-', '') : chatId;
			
			const requestBody = {
						fixtureId: fixtureId,
						homeTeam,
						awayTeam,
						isLive,
						currentGoals,
						language: locale === 'pl' ? 'pl' : 'en',
						prediction,
						predictionPercent: predictionPercent || null,
						predictionWinner: predictionWinner || null,
						predictionGoals: predictionGoals || null,
						winOrDraw: winOrDraw || null,
						comparison: comparison || null,
						h2h: h2h || [],
						homeStats: {
							playedTotal: homeStats?.playedTotal || 0,
							form: homeStats?.form || 'N/A',
							last5Form: homeStats?.last5Form || 'N/A',
							last5Att: homeStats?.last5Att || 'N/A',
							last5Def: homeStats?.last5Def || 'N/A',
							last5GoalsFor: homeStats?.last5GoalsFor || 0,
							last5GoalsAgainst: homeStats?.last5GoalsAgainst || 0,
							last5GoalsForAvg: homeStats?.last5GoalsForAvg || '0',
							last5GoalsAgainstAvg: homeStats?.last5GoalsAgainstAvg || '0',
							goalsForAvgTotal: homeStats?.goalsForAvgTotal || '0',
							goalsForAvgHome: homeStats?.goalsForAvgHome || '0',
							goalsForAvgAway: homeStats?.goalsForAvgAway || '0',
							goalsAgainstAvgTotal: homeStats?.goalsAgainstAvgTotal || '0',
							goalsAgainstAvgHome: homeStats?.goalsAgainstAvgHome || '0',
							goalsAgainstAvgAway: homeStats?.goalsAgainstAvgAway || '0',
							goalsOver05: homeStats?.goalsOver05 || 0,
							goalsUnder05: homeStats?.goalsUnder05 || 0,
							goalsOver15: homeStats?.goalsOver15 || 0,
							goalsUnder15: homeStats?.goalsUnder15 || 0,
							goalsOver25: homeStats?.goalsOver25 || 0,
							goalsUnder25: homeStats?.goalsUnder25 || 0,
							goalsOver35: homeStats?.goalsOver35 || 0,
							goalsUnder35: homeStats?.goalsUnder35 || 0,

							goalsOver05aga: homeStats?.goalsOver05aga || 0,
							goalsUnder05aga: homeStats?.goalsUnder05aga || 0,
							goalsOver15aga: homeStats?.goalsOver15aga || 0,
							goalsUnder15aga: homeStats?.goalsUnder15aga || 0,
							goalsOver25aga: homeStats?.goalsOver25aga || 0,
							goalsUnder25aga: homeStats?.goalsUnder25aga || 0,
							goalsOver35aga: homeStats?.goalsOver35aga || 0,
							goalsUnder35aga: homeStats?.goalsUnder35aga || 0,

							goalsfortotal: homeStats?.goalsfortotal || 0,
							goalsforhome: homeStats?.goalsforhome || 0,
							goalsforaway: homeStats?.goalsforaway || 0,
							goalsagatotal: homeStats?.goalsagatotal || 0,
							goalsagahome: homeStats?.goalsagahome || 0,
							goalsagaaway: homeStats?.goalsagaaway || 0,

							winstotal: homeStats?.winstotal || 0,
							winshome: homeStats?.winshome || 0,
							winsaway: homeStats?.winsaway || 0,

							drawstotal: homeStats?.drawstotal || 0,
							drawshome: homeStats?.drawshome || 0,
							drawsaway: homeStats?.drawsaway || 0,

							losestotal: homeStats?.losestotal || 0,
							loseshome: homeStats?.loseshome || 0,
							losesaway: homeStats?.losesaway || 0,

							cleansheettotal: homeStats?.cleansheettotal || 0,
							cleansheethome: homeStats?.cleansheethome || 0,
							cleansheetaway: homeStats?.cleansheetaway || 0,

							failedtoscoretotal: homeStats?.failedtoscoretotal || 0,
							failedtoscorehome: homeStats?.failedtoscorehome || 0,
							failedtoscoreaway: homeStats?.failedtoscoreaway || 0,
							biggestWin: homeStats?.biggestWin || null,
							biggestLoss: homeStats?.biggestLoss || null,
							biggestStreakWins: homeStats?.biggestStreakWins || 0,
							biggestStreakDraws: homeStats?.biggestStreakDraws || 0,
							biggestStreakLoses: homeStats?.biggestStreakLoses || 0,
							penaltyScored: homeStats?.penaltyScored || 0,
							penaltyMissed: homeStats?.penaltyMissed || 0,
							penaltyTotal: homeStats?.penaltyTotal || 0,
							mostUsedFormation: homeStats?.mostUsedFormation || 'N/A',
						},
						awayStats: {
							playedTotal: awayStats?.playedTotal || 0,
							form: awayStats?.form || 'N/A',
							last5Form: awayStats?.last5Form || 'N/A',
							last5Att: awayStats?.last5Att || 'N/A',
							last5Def: awayStats?.last5Def || 'N/A',
							last5GoalsFor: awayStats?.last5GoalsFor || 0,
							last5GoalsAgainst: awayStats?.last5GoalsAgainst || 0,
							last5GoalsForAvg: awayStats?.last5GoalsForAvg || '0',
							last5GoalsAgainstAvg: awayStats?.last5GoalsAgainstAvg || '0',
							goalsForAvgTotal: awayStats?.goalsForAvgTotal || '0',
							goalsForAvgHome: awayStats?.goalsForAvgHome || '0',
							goalsForAvgAway: awayStats?.goalsForAvgAway || '0',
							goalsAgainstAvgTotal: awayStats?.goalsAgainstAvgTotal || '0',
							goalsAgainstAvgHome: awayStats?.goalsAgainstAvgHome || '0',
							goalsAgainstAvgAway: awayStats?.goalsAgainstAvgAway || '0',
							goalsOver05: awayStats?.goalsOver05 || 0,
							goalsUnder05: awayStats?.goalsUnder05 || 0,
							goalsOver15: awayStats?.goalsOver15 || 0,
							goalsUnder15: awayStats?.goalsUnder15 || 0,
							goalsOver25: awayStats?.goalsOver25 || 0,
							goalsUnder25: awayStats?.goalsUnder25 || 0,
							goalsOver35: awayStats?.goalsOver35 || 0,
							goalsUnder35: awayStats?.goalsUnder35 || 0,

							goalsOver05aga: awayStats?.goalsOver05aga || 0,
							goalsUnder05aga: awayStats?.goalsUnder05aga || 0,
							goalsOver15aga: awayStats?.goalsOver15aga || 0,
							goalsUnder15aga: awayStats?.goalsUnder15aga || 0,
							goalsOver25aga: awayStats?.goalsOver25aga || 0,
							goalsUnder25aga: awayStats?.goalsUnder25aga || 0,
							goalsOver35aga: awayStats?.goalsOver35aga || 0,
							goalsUnder35aga: awayStats?.goalsUnder35aga || 0,

							goalsfortotal: awayStats?.goalsfortotal || 0,
							goalsforhome: awayStats?.goalsforhome || 0,
							goalsforaway: awayStats?.goalsforaway || 0,
							goalsagatotal: awayStats?.goalsagatotal || 0,
							goalsagahome: awayStats?.goalsagahome || 0,
							goalsagaaway: awayStats?.goalsagaaway || 0,

							winstotal: awayStats?.winstotal || 0,
							winshome: awayStats?.winshome || 0,
							winsaway: awayStats?.winsaway || 0,

							drawstotal: awayStats?.drawstotal || 0,
							drawshome: awayStats?.drawshome || 0,
							drawsaway: awayStats?.drawsaway || 0,

							losestotal: awayStats?.losestotal || 0,
							loseshome: awayStats?.loseshome || 0,
							losesaway: awayStats?.losesaway || 0,

							cleansheettotal: awayStats?.cleansheettotal || 0,
							cleansheethome: awayStats?.cleansheethome || 0,
							cleansheetaway: awayStats?.cleansheetaway || 0,

							failedtoscoretotal: awayStats?.failedtoscoretotal || 0,
							failedtoscorehome: awayStats?.failedtoscorehome || 0,
							failedtoscoreaway: awayStats?.failedtoscoreaway || 0,
							biggestWin: awayStats?.biggestWin || null,
							biggestLoss: awayStats?.biggestLoss || null,
							biggestStreakWins: awayStats?.biggestStreakWins || 0,
							biggestStreakDraws: awayStats?.biggestStreakDraws || 0,
							biggestStreakLoses: awayStats?.biggestStreakLoses || 0,
							penaltyScored: awayStats?.penaltyScored || 0,
							penaltyMissed: awayStats?.penaltyMissed || 0,
							penaltyTotal: awayStats?.penaltyTotal || 0,
							mostUsedFormation: awayStats?.mostUsedFormation || 'N/A',
						},
					};
					
					const response = await fetch('/api/football/getOrCreateAnalysis', {
						method: 'POST',
						headers: { 
							'Content-Type': 'application/json',
						},
						credentials: 'include',
						signal: controller.signal,
						body: JSON.stringify(requestBody),
					})
					
					clearTimeout(timeoutId);
					
					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						if (process.env.NODE_ENV === 'development') {
							console.error('API error:', response.status, errorData);
						}
						
						// Handle specific error cases
						if (errorData.error === 'generation_in_progress') {
							setAnalysis({ 
								text: errorData.message || (locale === 'pl' ? 'Analiza jest już generowana w innym meczu. Spróbuj ponownie po zakończeniu generowania.' : 'Analysis is already being generated for another match. Please try again after the current generation is complete.'), 
								pred: '' 
							});
							setShowGenerateButton(true)
							setIsGenerating(false)
							setIsLoadingAnalysis(false)
							analysisRequestedRef.current = false
							return;
						}
						
						if (errorData.error === 'limit_exceeded') {
							// Save to localStorage only for unauthenticated users
							if (!errorData.isLoggedIn) {
								setLocalStorageLimit()
							}
							setLimitExceeded(true)
							setShowGenerateButton(false)
							if (errorData.isLoggedIn) {
								setAnalysis({ 
									text: errorData.message || 'Osiągnąłeś dzienny limit 3 analiz. Wróć jutro lub wkrótce wykup dostęp do nieskończonej liczby analiz.', 
									pred: '' 
								});
							} else {
								setAnalysis({ 
									text: errorData.message || 'Osiągnąłeś dzienny limit 3 analiz. Zaloguj się lub zarejestruj, aby wygenerować więcej analiz.', 
									pred: '' 
								});
							}
							setIsGenerating(false)
							setIsLoadingAnalysis(false)
							analysisRequestedRef.current = false
							return;
						}
						
						setAnalysis({ text: t('analysis_unavailable'), pred: '' });
						return;
					}
					
					const data = await response.json();
					
					if (!data.analysis) {
						if (process.env.NODE_ENV === 'development') {
							console.error('No analysis in response:', data);
						}
						setAnalysis({ text: t('analysis_unavailable'), pred: '' });
						return;
					}
					
					const { text, prediction: pred } = parseAnalysis(data.analysis);
					setAnalysis({ text: text || t('analysis_unavailable'), pred });
					setIsGenerating(false)
					setIsLoadingAnalysis(false)
					analysisRequestedRef.current = false
		} catch (error) {
			// Reset flag on error so user can retry
			analysisRequestedRef.current = false
			setIsGenerating(false)
			setIsLoadingAnalysis(false)
			setShowGenerateButton(true)
			if (process.env.NODE_ENV === 'development') {
				if (error.name === 'AbortError') {
					console.error('Request timeout - analiza trwa zbyt długo');
				} else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
					console.error('Network error - sprawdź połączenie lub limit OpenAI:', error);
				} else {
					console.error('Błąd podczas pobierania analizy:', error);
				}
			}
			setAnalysis({ text: t('analysis_unavailable'), pred: '' });
		}
	}

	const handleSendMessage = async () => {
		if (!isAuthed) {
			if (process.env.NODE_ENV === 'development') {
				console.error('Użytkownik niezalogowany')
			}
			return
		}
		if (currentMessage.trim()) {
			try {
				const response = await fetchWithRefresh('/api/sendMessage', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						username: username || 'Anonim',
						content: currentMessage,
						chatId,
					}),
				})
				const data = await response.json()
				if (data.success) {
					if (socket && isConnected) {
						const messageObject = {
							username: username || 'Anonim',
							content: currentMessage,
							chatId,
						}
						socket.emit('send_message', messageObject)
					}
					setCurrentMessage('')
				} else {
					if (process.env.NODE_ENV === 'development') {
						console.error('Błąd wysyłania wiadomości:', data.message)
					}
				}
			} catch (error) {
				if (process.env.NODE_ENV === 'development') {
					console.error('Błąd podczas wysyłania wiadomości:', error)
				}
			}
		}
	}

	const openPrivateChat = chatUsername => {
		if (chatUsername === username) {
			if (process.env.NODE_ENV === 'development') {
				console.warn('Nie możesz otworzyć czatu z samym sobą.')
			}
			return
		}
		setSelectedUser(chatUsername)
		setPrivateChatOpen(true)
	}

	function parseAnalysis(analysisText) {
		if (!analysisText) return { text: '', prediction: '' }
		const m = analysisText.match(/Przewidywanie:\s*(.+)$/i)
		return {
			text: m ? analysisText.replace(m[0], '').trim() : analysisText.trim(),
			prediction: m ? m[1].trim() : '',
		}
	}

	return (
		<div>
			{connectionError && (
				<div style={{ padding: '10px', background: '#ffebee', color: '#c62828', marginBottom: '10px', borderRadius: '4px' }}>
					{connectionError}
				</div>
			)}
			{isPrivateChatOpen && (
				<Modal onClose={() => setPrivateChatOpen(false)}>
					<PrivateChatComponent receiver={selectedUser} />
				</Modal>
			)}
			<div className="messages-container" ref={messagesContainerRef}>
				{isAnalysisEnabled && (
					<div className="match-analysis">
						{isLoadingAnalysis || analysis.text === t('ai') ? (
							<>
								<div className="simple-spinner"></div>
								<p>{t('ai')}</p>
							</>
						) : analysis.text ? (
							<>
								<p style={{ whiteSpace: 'pre-line' }}>{analysis.text}</p>
								{analysis.pred && (
									<p style={{ marginTop: '10px' }}>
										<strong>{locale === 'pl' ? 'Przewidywanie:' : 'Prediction:'}</strong> {analysis.pred}
									</p>
								)}
							</>
						) : showGenerateButton && !limitExceeded ? (
							<button
								onClick={handleGenerateAnalysis}
								disabled={isGenerating}
								style={{
									padding: '12px 24px',
									background: isGenerating ? '#ccc' : 'green',
									color: '#fff',
									border: 'none',
									borderRadius: '6px',
									cursor: isGenerating ? 'not-allowed' : 'pointer',
									fontSize: '16px',
									fontWeight: '600',
									fontFamily: 'Roboto Condensed, sans-serif',
									textTransform: 'uppercase',
									transition: 'all 0.2s ease',
									pointerEvents: isGenerating ? 'none' : 'auto',
									opacity: isGenerating ? 0.6 : 1,
									width: '100%',
									maxWidth: '400px',
									margin: '0 auto',
									display: 'block',
								}}
								onMouseEnter={(e) => {
									if (!isGenerating) {
										e.currentTarget.style.background = '#1a4a56';
									}
								}}
								onMouseLeave={(e) => {
									if (!isGenerating) {
										e.currentTarget.style.background = '#173b45';
									}
								}}
							>
								{t('generate_analysis')}
							</button>
						) : null}
					</div>
				)}

				{messages.map((msg, idx) => (
					<div key={idx} className="message-one">
						<strong onClick={() => openPrivateChat(msg.username)} style={{ cursor: 'pointer', fontWeight: '700' }}>
							{msg.username}
						</strong>
						: {msg.content}
						<span style={{ marginLeft: '10px', fontSize: '0.6em', color: 'gray' }}>
							{new Date(msg.timestamp).toLocaleTimeString()}
						</span>
					</div>
				))}
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
					<button onClick={handleSendMessage}>
						<GiPlayButton style={{ marginRight: '5px' }} /> Wyślij
					</button>
				</div>
			) : (
				<p className="must-be-login">{t('mustlog')}</p>
			)}
		</div>
	)
}

export default ChatComponent
