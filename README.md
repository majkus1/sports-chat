# Czat Sportowy (Sports Chat) 🏈⚽

**Live sports chat platform with AI-powered match analysis**

🌐 **[Live Application](https://czatsportowy.pl)** - Try it now!

A modern real-time sports discussion platform built with **Next.js 15 App Router**, featuring live chat functionality, AI-generated match analysis, interactive football widgets, and comprehensive statistics integration.

## 🌟 Features

### 💬 Real-time Chat System
- **Live Chat**: Real-time messaging for ongoing matches using Socket.IO
- **Pre-match Chat**: Discussion threads for upcoming fixtures
- **Private Messaging**: Direct user-to-user communication
- **Multi-language Support**: Polish and English interface

### 🤖 AI-Powered Match Analysis
- **GPT-4 Integration**: Detailed match analysis using OpenAI's GPT-4
- **Comprehensive Statistics**: Team performance metrics, form, goals data
- **Live Match Analysis**: Real-time analysis during ongoing matches
- **Predictions**: AI-generated match predictions with double chance format
- **Smart Rate Limiting**: Redis-based daily limits with IP/user tracking
  - **IP-based Limiting**: Unauthenticated users limited by IP address
  - **User-based Limiting**: Authenticated users have separate limits per user ID
  - **Shared State**: Redis ensures consistent limits across multiple server instances
  - **Automatic Reset**: Daily limits reset automatically
  - **Limit Enforcement**: Generate button hidden when limit reached, with user-friendly messages

### ⚽ Football Data Integration
- **Live Fixtures**: Real-time match data from API-Football with Redis caching
- **Pagination**: Efficient pagination (50 matches per page) for handling large fixture lists
- **Smart Search**: Full-text search across all fixtures with client-side filtering and pagination
- **Interactive Widgets**: Embedded API-Sports widgets for live scores, statistics, and match details
- **Team Statistics**: Detailed team performance metrics
- **League Coverage**: Multiple football leagues and competitions
- **Date Selection**: Dynamic date picker for browsing fixtures across multiple days
- **Pre-match Analysis**: AI-powered predictions and analysis before matches

### 🔐 User Authentication & Security
- **JWT Authentication**: Secure token-based authentication
- **Google OAuth**: Social login integration
- **Password Reset**: Email-based password recovery
- **Rate Limiting**: Protection against spam and abuse
- **Input Validation**: Comprehensive data sanitization

### 🌐 Internationalization
- **Multi-language UI**: Polish (default) and English support
- **Dynamic Language Switching**: Real-time language changes
- **Localized Content**: AI analysis in user's preferred language

## 🛠️ Tech Stack

### Frontend
- **Next.js 15.4.6** - React framework with **App Router** (latest architecture)
- **React 19.1.1** - UI library
- **Tailwind CSS 4.1.11** - Utility-first CSS framework
- **SCSS** - Enhanced styling capabilities
- **Socket.IO Client** - Real-time communication
- **next-intl** - Internationalization for App Router
- **React Icons** - Icon library
- **React Spinners** - Loading indicators

### Backend
- **Node.js** - Runtime environment
- **Express.js 5.1.0** - Web framework
- **Socket.IO 4.8.1** - Real-time communication server
- **MongoDB 6.18** - Primary database
- **Mongoose 8.17.1** - ODM for MongoDB
- **Redis 4.7.0** - Caching layer for API responses

### Authentication & Security
- **JWT (jsonwebtoken)** - Token-based authentication
- **bcrypt** - Password hashing
- **Google Auth Library** - OAuth integration
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing

### External APIs & Services
- **OpenAI GPT-4** - AI match analysis
- **API-Football (RapidAPI)** - Football data and fixtures
- **API-Sports Widgets** - Interactive football widgets (live scores, statistics, H2H)
- **Nodemailer** - Email services

### Development Tools
- **ESLint** - Code linting
- **PostCSS** - CSS processing
- **next-intl** - Internationalization for App Router

## 🚀 Getting Started

### Prerequisites
- **Node.js 18+**
- **MongoDB** database (local or cloud)
- **Redis** server (for caching, optional but recommended)
- **OpenAI API** key
- **API-Football (RapidAPI)** key
- **API-Sports** key (for widgets)

## 📁 Project Structure

```
czat-sportowy/
├── app/                      # Next.js 15 App Router
│   ├── [locale]/            # Internationalized routes
│   │   ├── pilka-nozna/     # Football pages
│   │   │   ├── przedmeczowe/ # Pre-match fixtures
│   │   │   └── live/        # Live matches
│   │   └── page.js          # Home page
│   └── api/                  # API Routes
│       ├── auth/             # Authentication endpoints
│       ├── football/         # Football data endpoints
│       └── ...
├── components/               # React components
│   ├── ChatComponent.js      # Main chat interface
│   ├── PrivateChatComponent.js # Private messaging
│   ├── NavBar.js             # Navigation bar
│   └── ...
├── context/                  # React context providers
│   ├── SocketContext.js      # Socket.IO connection
│   ├── UserContext.js        # User state
│   └── AlertContext.js       # Alert notifications
├── lib/                      # Utility libraries
│   ├── auth.js               # Authentication utilities
│   ├── db.js                 # MongoDB connection
│   ├── redis.js              # Redis caching
│   └── mailer.js             # Email services
├── models/                   # MongoDB schemas
│   ├── User.js               # User model
│   ├── Message.js            # Message model
│   └── MatchAnalysis.js      # AI analysis model
├── public/                   # Static assets
│   ├── api-sports-football-*.html # API-Sports widgets
│   └── img/                  # Images
├── messages/                 # i18n translations (next-intl)
│   ├── pl.json               # Polish translations
│   └── en.json               # English translations
├── styles/                   # SCSS stylesheets
└── server.js                 # Socket.IO server
```

## 🔧 API Architecture

The application follows RESTful API principles with the following main categories:

- **Authentication** - User login, registration, OAuth, password management
- **Chat & Messaging** - Real-time public and private messaging
- **Football Data** - Fixtures, live matches, statistics, predictions, and AI analysis

## 🌍 Internationalization

The application uses **next-intl** for App Router internationalization:

- **Polish (pl)** - Default language
- **English (en)** - Secondary language

Language files are located in `messages/[lang].json`

Routes are automatically prefixed with locale: `/pl/...` or `/en/...`

## 🔒 Security Features

- **JWT Authentication** with access and refresh tokens
- **Password Hashing** using bcrypt
- **Rate Limiting** on Socket.IO connections
- **AI Analysis Rate Limiting**: Redis-based daily limits to prevent abuse and control API costs
  - **IP Detection**: Smart IP detection handling reverse proxies and load balancers
  - **Per-IP Limits**: Daily limits for unauthenticated users based on IP address
  - **Per-User Limits**: Separate daily limits for authenticated users
  - **Concurrent Generation Lock**: Redis locks prevent multiple simultaneous analysis generations per user/IP
  - **Fail-Safe Design**: Graceful degradation if Redis unavailable
- **Input Validation** and sanitization
- **CORS Protection** with allowed origins
- **Security Headers** via Helmet
- **SQL Injection Protection** through Mongoose ODM

## 🚀 Deployment

### Build and Start
```bash
# Build the application
npm run build

# Start production server
npm start

# Or use PM2 for process management
pm2 start ecosystem.config.js --env production
```

### Redis Setup (Recommended)
Redis is used for caching API responses to improve performance. Follow standard Redis installation and configuration procedures for your deployment environment.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Key Technical Highlights

### For Recruiters & Developers

**Modern Architecture:**
- ✅ **Next.js 15 App Router** - Latest Next.js architecture with React Server Components
- ✅ **TypeScript-ready** - Codebase structured for easy TypeScript migration
- ✅ **Redis Caching** - Optimized API response times with intelligent caching
- ✅ **Real-time Communication** - Socket.IO for live chat and notifications

**Performance Optimizations:**
- ✅ **API Response Caching** - Redis cache reduces API calls by ~60-80%
- ✅ **Server-Side Rendering** - Fast initial page loads
- ✅ **Code Splitting** - Optimized bundle sizes
- ✅ **Image Optimization** - Next.js Image component

**Advanced Rate Limiting & Resource Management:**
- ✅ **Redis-based Rate Limiting** - IP and user-based daily limits for AI analysis generation
- ✅ **Smart IP Detection** - Handles reverse proxies, load balancers, and various network configurations
- ✅ **Distributed Locking** - Redis locks prevent concurrent analysis generation across multiple server instances
- ✅ **Cost Control** - Limits prevent excessive OpenAI API usage while maintaining good user experience
- ✅ **Automatic Limit Reset** - Daily limits automatically reset via Redis TTL

**Developer Experience:**
- ✅ **Clean Code Structure** - Well-organized App Router architecture
- ✅ **Internationalization** - Built-in multi-language support
- ✅ **Error Handling** - Comprehensive error boundaries and logging
- ✅ **Environment-based Configuration** - Easy dev/prod setup

## 🎯 Future Enhancements

- [ ] TypeScript migration
- [ ] Mobile app development
- [ ] Additional sports support (basketball, hockey)
- [ ] User profiles and avatars
- [ ] Match notifications
- [ ] Social features (following users)
- [ ] Advanced statistics dashboard
- [ ] Push notifications
- [ ] Dark mode theme

## 📞 Contact

**Project Owner**: [Michał Lipka]
**Email**: [michalipka1@gmail.com]
**Website**: [https://czatsportowy.pl](https://czatsportowy.pl)

---

*Built with ❤️ for sports enthusiasts*