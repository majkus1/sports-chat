# Czat Sportowy (Sports Chat) 🏈⚽

**Live sports chat platform with AI-powered match analysis**

🌐 **[Live Application](https://czatsportowy.pl)** - Try it now!

A real-time sports discussion platform built with Next.js, featuring live chat functionality, AI-generated match analysis, and comprehensive football statistics integration.

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

### ⚽ Football Data Integration
- **Live Fixtures**: Real-time match data from API-Football
- **Team Statistics**: Detailed team performance metrics
- **League Coverage**: Multiple football leagues and competitions
- **Search Functionality**: Find matches by team or league name

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
- **Next.js 15.4.6** - React framework with SSR/SSG
- **React 19.1.1** - UI library
- **Tailwind CSS 4.1.11** - Utility-first CSS framework
- **SCSS** - Enhanced styling capabilities
- **Socket.IO Client** - Real-time communication
- **React Icons** - Icon library
- **React Spinners** - Loading indicators

### Backend
- **Node.js** - Runtime environment
- **Express.js 5.1.0** - Web framework
- **Socket.IO 4.8.1** - Real-time communication server
- **MongoDB 6.18** - Database
- **Mongoose 8.17.1** - ODM for MongoDB

### Authentication & Security
- **JWT (jsonwebtoken)** - Token-based authentication
- **bcrypt** - Password hashing
- **Google Auth Library** - OAuth integration
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing

### External APIs & Services
- **OpenAI GPT-4** - AI match analysis
- **API-Football (RapidAPI)** - Football data
- **Nodemailer** - Email services

### Development Tools
- **ESLint** - Code linting
- **PostCSS** - CSS processing
- **next-i18next** - Internationalization

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- MongoDB database
- OpenAI API key
- API-Football (RapidAPI) key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/czat-sportowy.git
   cd czat-sportowy
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env.local` file in the root directory:
   ```env
   # Database
   MONGODB_URI=your_mongodb_connection_string
   
   # JWT Secrets
   JWT_SECRET=your_jwt_secret
   REFRESH_TOKEN_SECRET=your_refresh_token_secret
   
   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   
   # API-Football
   RAPIDAPI_KEY=your_rapidapi_key
   
   # Email (Nodemailer)
   EMAIL_HOST=your_smtp_host
   EMAIL_PORT=587
   EMAIL_USER=your_email
   EMAIL_PASS=your_email_password
   
   # Google OAuth
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   
   # Socket.IO
   NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
   
   # Redis (Cache)
   REDIS_URL=redis://localhost:6379
   ```

4. **Start the development servers**
   ```bash
   # Terminal 1: Next.js development server
   npm run dev
   
   # Terminal 2: Socket.IO server
   node server.js
   ```

5. **Access the application**
   - Frontend: http://localhost:3001
   - Socket Server: http://localhost:3000

## 📁 Project Structure

```
czat-sportowy/
├── components/           # React components
│   ├── ChatComponent.js     # Main chat interface
│   ├── PrivateChatComponent.js # Private messaging
│   ├── NavBar.js           # Navigation bar
│   ├── LoginModal.js       # Authentication modals
│   └── ...
├── pages/               # Next.js pages and API routes
│   ├── api/             # Backend API endpoints
│   │   ├── auth/        # Authentication endpoints
│   │   └── football/    # Football data endpoints
│   ├── pilka-nozna/     # Football pages
│   └── ...
├── models/              # MongoDB schemas
│   ├── User.js          # User model
│   ├── Message.js       # Message model
│   └── MatchAnalysis.js # AI analysis model
├── lib/                 # Utility libraries
│   ├── auth.js          # Authentication utilities
│   ├── db.js            # Database connection
│   └── mailer.js        # Email services
├── context/             # React context providers
├── public/              # Static assets and translations
│   └── locales/         # i18n translation files
├── styles/              # SCSS stylesheets
└── server.js            # Socket.IO server
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Token refresh
- `GET /api/auth/me` - Get current user
- `POST /api/auth/google` - Google OAuth
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Password reset

### Chat & Messaging
- `GET /api/getMessages` - Get chat messages
- `POST /api/sendMessage` - Send public message
- `GET /api/getPrivateMessages` - Get private messages
- `POST /api/sendPrivateMessage` - Send private message

### Football Data
- `GET /api/football/fixtures` - Get today's fixtures
- `GET /api/football/fetchLiveFixtures` - Get live matches
- `POST /api/football/fetchTeamStatistics` - Get team stats
- `POST /api/football/fetchPredictions` - Get match predictions
- `POST /api/football/getOrCreateAnalysis` - AI match analysis

## 🌍 Internationalization

The application supports multiple languages with full i18n implementation:

- **Polish (pl)** - Default language
- **English (en)** - Secondary language

Language files are located in `public/locales/[lang]/common.json`

## 🔒 Security Features

- **JWT Authentication** with access and refresh tokens
- **Password Hashing** using bcrypt
- **Rate Limiting** on Socket.IO connections
- **Input Validation** and sanitization
- **CORS Protection** with allowed origins
- **Security Headers** via Helmet
- **SQL Injection Protection** through Mongoose ODM

## 🚀 Deployment

### Production Environment Variables
Ensure all environment variables are properly configured for production:

```env
NODE_ENV=production
MONGODB_URI=your_production_mongodb_uri
JWT_SECRET=your_secure_jwt_secret
REFRESH_TOKEN_SECRET=your_secure_refresh_secret
# ... other production variables
```

### Build and Start
```bash
npm run build
npm start
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Future Enhancements

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