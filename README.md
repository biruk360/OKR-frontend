# OKR Management System

A comprehensive OKR (Objectives and Key Results) management system built with Next.js, TypeScript, Prisma, and PostgreSQL.

## 🚀 Features

### Core OKR Management
- ✅ Create, edit, and manage objectives at Company, Department, and Individual levels
- ✅ Key Results creation and progress tracking
- ✅ To-Do/Initiative management under Key Results
- ✅ Objective archiving and deletion
- ✅ Clone functionality for objectives and key results

### Hierarchy & Alignment
- ✅ Visual hierarchy tree of all company OKRs
- ✅ Objective alignment (Department → Company, Individual → Department/Company)
- ✅ Parent-child relationship management
- ✅ Search and filtering within hierarchy

### Progress Tracking & Visualization
- ✅ Real-time progress updates
- ✅ Company, Department, and Individual dashboards
- ✅ Progress trend charts and analytics
- ✅ Confidence level tracking (On Track, At Risk, Off Track)
- ✅ Automatic roll-up calculations

### Collaboration & Communication
- ✅ Comments system on objectives and key results
- ✅ @mention functionality
- ✅ Activity feed
- ✅ Email and in-app notifications
- ✅ Notification preferences

### Reporting & Analytics
- ✅ Company-wide progress reports
- ✅ Department-specific reports
- ✅ Individual user reports
- ✅ Alignment status reports
- ✅ Export functionality (CSV/PDF)
- ✅ Advanced filtering and search

### User & Access Management
- ✅ Role-based access control (Admin, Executive, Department Lead, Employee)
- ✅ User authentication and authorization
- ✅ Department/team management
- ✅ Manager-direct report relationships

## 🛠️ Technology Stack

- **Frontend**: Next.js 14 with App Router, React 18, TypeScript
- **Backend**: Next.js API Routes (Full-stack monolith)
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Pusher for live updates
- **Styling**: Tailwind CSS with custom design system
- **Authentication**: NextAuth.js
- **Charts**: Recharts for data visualization
- **Deployment**: Vercel (Frontend) + Amazon RDS (Database)

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 15+
- Docker (optional, for local development)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd OKR-frontend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the environment example file and configure your variables:

```bash
cp env.example .env.local
```

Update `.env.local` with your configuration:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/okr_system"

# NextAuth.js
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"

# Pusher (for real-time updates)
PUSHER_APP_ID="your-pusher-app-id"
PUSHER_SECRET="your-pusher-secret"
PUSHER_KEY="your-pusher-key"
PUSHER_CLUSTER="your-pusher-cluster"
```

### 4. Database Setup

#### Option A: Using Docker (Recommended)

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Wait for services to be ready, then run migrations
npm run db:push
```

#### Option B: Local PostgreSQL

1. Create a PostgreSQL database named `okr_system`
2. Update your `DATABASE_URL` in `.env.local`
3. Run database migrations:

```bash
npm run db:push
```

### 5. Generate Prisma Client

```bash
npm run db:generate
```

### 6. Seed Database (Optional)

```bash
npm run db:seed
```

### 7. Start Development Server

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
OKR-frontend/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Dashboard pages
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── dashboard/         # Dashboard components
│   ├── forms/             # Form components
│   └── layout/            # Layout components
├── lib/                   # Utility libraries
│   ├── auth.ts           # NextAuth configuration
│   ├── prisma.ts         # Prisma client
│   ├── pusher.ts         # Pusher configuration
│   └── utils.ts          # Utility functions
├── prisma/               # Database schema and migrations
│   └── schema.prisma     # Database schema
├── types/                # TypeScript type definitions
└── public/               # Static assets
```

## 🗄️ Database Schema

The system uses a comprehensive PostgreSQL schema with the following key entities:

- **Users**: Authentication, roles, and profiles
- **Departments**: Organizational structure
- **Objectives**: Company, department, and individual levels
- **Key Results**: Measurable outcomes under objectives
- **Todos**: Action items under key results
- **Comments**: Collaboration and feedback
- **Notifications**: Real-time updates
- **Timeframes**: OKR periods (quarters, years)

## 🔐 Authentication & Authorization

The system implements role-based access control with four user roles:

1. **Admin**: Full system access and configuration
2. **Executive**: Company-level objective management
3. **Department Lead**: Department-level management
4. **Employee**: Individual OKR management

## 🔄 Real-time Features

Real-time updates are powered by Pusher and include:

- Progress updates across all users
- Live comments and mentions
- Instant notifications
- Dashboard metric updates

## 📊 Key Features

### Dashboard System
- **Company Dashboard**: Executive view of all company OKRs
- **Department Dashboard**: Team-specific OKR tracking
- **Individual Dashboard**: Personal OKR management ("My OKRs")
- **Progress Analytics**: Trend charts and performance metrics

### OKR Management
- **Hierarchical Structure**: Company → Department → Individual alignment
- **Progress Tracking**: Real-time updates with confidence levels
- **Collaboration**: Comments, mentions, and activity feeds
- **Reporting**: Comprehensive analytics and export capabilities

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

## 🚀 Deployment

### Vercel Deployment

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Database Deployment

For production, use a managed PostgreSQL service:

- **Amazon RDS**: Recommended for AWS deployments
- **Supabase**: Alternative with built-in real-time features
- **PlanetScale**: MySQL-compatible option

## 📈 Performance Optimization

- **Database**: Indexed queries and connection pooling
- **Frontend**: Code splitting and lazy loading
- **Caching**: Redis for session data
- **CDN**: Global asset distribution via Vercel

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- Create an issue in the GitHub repository
- Check the [documentation](docs/)
- Review the [FAQ](docs/FAQ.md)

## 🗺️ Roadmap

### Phase 1: Foundation ✅
- [x] Project setup and authentication
- [x] Basic OKR management
- [x] User interface and design system

### Phase 2: Core Features (In Progress)
- [ ] Complete OKR CRUD operations
- [ ] Hierarchy and alignment system
- [ ] Real-time progress tracking

### Phase 3: Advanced Features
- [ ] Advanced reporting and analytics
- [ ] Mobile application
- [ ] Third-party integrations

### Phase 4: Enterprise Features
- [ ] SSO integration
- [ ] Advanced permissions
- [ ] API for third-party access

---

Built with ❤️ using Next.js, TypeScript, and modern web technologies.
