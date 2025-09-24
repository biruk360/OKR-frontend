# OKR Management System - Setup Guide

This guide will walk you through setting up the OKR Management System on your local machine.

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **PostgreSQL 15+** - [Download here](https://www.postgresql.org/download/)
- **Docker** (optional, for easier database setup) - [Download here](https://www.docker.com/)

### 1. Clone and Install

```bash
# Navigate to your project directory
cd "OKR System/OKR-frontend"

# Install dependencies
npm install
```

### 2. Environment Configuration

```bash
# Copy the environment template
cp env.example .env.local

# Edit the environment file with your settings
nano .env.local  # or use your preferred editor
```

Update `.env.local` with your configuration:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/okr_system"

# NextAuth Configuration
NEXTAUTH_SECRET="your-super-secret-key-here-make-it-long-and-random"
NEXTAUTH_URL="http://localhost:3000"

# Pusher Configuration (for real-time features)
PUSHER_APP_ID="your-pusher-app-id"
PUSHER_SECRET="your-pusher-secret"
PUSHER_KEY="your-pusher-key"
PUSHER_CLUSTER="your-pusher-cluster"
```

### 3. Database Setup

#### Option A: Using Docker (Recommended)

```bash
# Start PostgreSQL and Redis using Docker
docker-compose up -d

# Wait for services to be ready (about 10 seconds)
sleep 10

# Set up the database schema
npm run db:push

# Generate Prisma client
npm run db:generate

# Seed the database with sample data
npm run db:seed
```

#### Option B: Local PostgreSQL

1. **Create Database:**
   ```sql
   -- Connect to PostgreSQL as superuser
   psql -U postgres

   -- Create database and user
   CREATE DATABASE okr_system;
   CREATE USER okr_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE okr_system TO okr_user;
   \q
   ```

2. **Update Environment:**
   ```env
   DATABASE_URL="postgresql://okr_user:your_password@localhost:5432/okr_system"
   ```

3. **Set up Schema:**
   ```bash
   npm run db:push
   npm run db:generate
   npm run db:seed
   ```

### 4. Start Development Server

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

## 🔑 Default Login Credentials

After seeding the database, you can log in with these accounts:

| Role | Email | Password | Description |
|------|-------|----------|-------------|
| Admin | admin@company.com | admin123 | Full system access |
| Executive | ceo@company.com | admin123 | Company-level management |
| Department Lead | engineering.lead@company.com | admin123 | Engineering team lead |
| Department Lead | marketing.lead@company.com | admin123 | Marketing team lead |
| Department Lead | sales.lead@company.com | admin123 | Sales team lead |
| Employee | engineer1@company.com | admin123 | Software engineer |
| Employee | engineer2@company.com | admin123 | Software engineer |
| Employee | marketer1@company.com | admin123 | Marketing specialist |
| Employee | salesrep1@company.com | admin123 | Sales representative |

## 🛠️ Development Commands

```bash
# Development
npm run dev              # Start development server
npm run build           # Build for production
npm run start           # Start production server
npm run lint            # Run ESLint

# Database
npm run db:generate     # Generate Prisma client
npm run db:push         # Push schema changes to database
npm run db:migrate      # Create and run migrations
npm run db:studio       # Open Prisma Studio (database GUI)
npm run db:seed         # Seed database with sample data

# Docker
docker-compose up -d    # Start services
docker-compose down     # Stop services
docker-compose logs     # View service logs
```

## 📁 Project Structure

```
OKR-frontend/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/          # Authentication endpoints
│   │   ├── objectives/    # Objective management
│   │   ├── users/         # User management
│   │   └── ...
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # Main application pages
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── dashboard/         # Dashboard components
│   ├── objectives/        # Objective-related components
│   └── layout/            # Layout components
├── lib/                   # Utility libraries
│   ├── auth.ts           # NextAuth configuration
│   ├── prisma.ts         # Prisma client
│   ├── pusher.ts         # Pusher configuration
│   └── utils.ts          # Utility functions
├── prisma/               # Database schema and migrations
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Database seeding script
├── types/                # TypeScript type definitions
└── public/               # Static assets
```

## 🔧 Configuration

### Database Configuration

The system uses PostgreSQL with Prisma ORM. Key configuration points:

- **Connection**: Set via `DATABASE_URL` environment variable
- **Schema**: Defined in `prisma/schema.prisma`
- **Migrations**: Managed through Prisma migrations
- **Seeding**: Sample data via `prisma/seed.ts`

### Authentication Configuration

- **Provider**: NextAuth.js with credentials
- **Session**: JWT-based sessions
- **Roles**: Admin, Executive, Department Lead, Employee
- **Pages**: Custom sign-in/sign-up pages

### Real-time Configuration

- **Provider**: Pusher
- **Events**: Objective updates, comments, notifications
- **Channels**: User-specific and objective-specific channels

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Error**
   ```bash
   # Check if PostgreSQL is running
   pg_isready -h localhost -p 5432
   
   # Check Docker services
   docker-compose ps
   ```

2. **Prisma Client Not Generated**
   ```bash
   npm run db:generate
   ```

3. **Environment Variables Not Loaded**
   ```bash
   # Ensure .env.local exists and is properly formatted
   cat .env.local
   ```

4. **Port Already in Use**
   ```bash
   # Kill process on port 3000
   lsof -ti:3000 | xargs kill -9
   ```

5. **Docker Issues**
   ```bash
   # Reset Docker containers
   docker-compose down -v
   docker-compose up -d
   ```

### Database Issues

1. **Reset Database**
   ```bash
   # Drop and recreate database
   docker-compose down -v
   docker-compose up -d
   npm run db:push
   npm run db:seed
   ```

2. **View Database**
   ```bash
   # Open Prisma Studio
   npm run db:studio
   ```

### Performance Issues

1. **Clear Next.js Cache**
   ```bash
   rm -rf .next
   npm run dev
   ```

2. **Reinstall Dependencies**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

## 🔒 Security Notes

### Development Environment

- Default passwords are used for demo purposes
- Change all passwords in production
- Use strong, unique secrets for `NEXTAUTH_SECRET`
- Enable HTTPS in production

### Production Deployment

- Use environment-specific database credentials
- Enable database SSL connections
- Set up proper CORS policies
- Implement rate limiting
- Use secure session cookies

## 📚 Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Pusher Documentation](https://pusher.com/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

## 🆘 Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review the console logs for error messages
3. Ensure all prerequisites are installed
4. Verify environment variables are set correctly
5. Check database connectivity

For additional support, refer to the main README.md file or create an issue in the project repository.

---

**Happy coding! 🚀**
