
#!/bin/bash

# OKR Management System Setup Script
# This script sets up the development environment for the OKR system

set -e

echo "🚀 Setting up OKR Management System..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if Docker is installed (optional)
if command -v docker &> /dev/null; then
    echo "✅ Docker detected - will use Docker for database"
    USE_DOCKER=true
else
    echo "⚠️  Docker not found - you'll need to set up PostgreSQL manually"
    USE_DOCKER=false
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create environment file if it doesn't exist
if [ ! -f .env.local ]; then
    echo "📝 Creating environment file..."
    cp env.example .env.local
    echo "⚠️  Please update .env.local with your configuration"
else
    echo "✅ Environment file already exists"
fi

# Set up database
if [ "$USE_DOCKER" = true ]; then
    echo "🐳 Starting Docker services..."
    docker-compose up -d
    
    echo "⏳ Waiting for database to be ready..."
    sleep 10
    
    echo "🗄️  Setting up database schema..."
    npm run db:push
    
    echo "🔧 Generating Prisma client..."
    npm run db:generate
    
    echo "🌱 Seeding database..."
    npm run db:seed || echo "⚠️  Seeding failed - you may need to run it manually"
else
    echo "⚠️  Please set up PostgreSQL manually and run:"
    echo "   npm run db:push"
    echo "   npm run db:generate"
    echo "   npm run db:seed"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env.local with your configuration"
echo "2. Start the development server: npm run dev"
echo "3. Open http://localhost:3000 in your browser"
echo ""
echo "Default admin credentials (if seeded):"
echo "Email: admin@company.com"
echo "Password: admin123"
echo ""
echo "Happy coding! 🚀"
