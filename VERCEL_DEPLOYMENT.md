# Vercel Deployment Guide

This guide will help you deploy the OKR Management System to Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub/GitLab/Bitbucket Account**: Your code should be in a Git repository
3. **PostgreSQL Database**: You'll need a production database (Vercel Postgres, Supabase, or any PostgreSQL provider)

## Step 1: Prepare Your Database

### Option A: Use Vercel Postgres (Recommended)

1. Go to your Vercel dashboard
2. Navigate to your project → Storage → Create Database
3. Select "Postgres"
4. Create the database and note the connection string

### Option B: Use External PostgreSQL

You can use:
- **Supabase** (Free tier available): [supabase.com](https://supabase.com)
- **Neon** (Free tier available): [neon.tech](https://neon.tech)
- **Railway** (Free tier available): [railway.app](https://railway.app)
- **Amazon RDS** (Paid)
- Any other PostgreSQL provider

## Step 2: Update Prisma Schema for Production

The current schema uses SQLite for development. For production, you'll need to use PostgreSQL.

**Note**: You can keep SQLite for local development and use PostgreSQL for production by using environment variables.

The `DATABASE_URL` environment variable will determine which database to use.

## Step 3: Deploy to Vercel

### Method 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub/GitLab/Bitbucket**
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import Project in Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Click "Import Git Repository"
   - Select your repository
   - Click "Import"

3. **Configure Project Settings**
   - **Framework Preset**: Next.js (should auto-detect)
   - **Root Directory**: `./` (default)
   - **Build Command**: `prisma generate && next build` (already in package.json)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` (default)

4. **Add Environment Variables**
   Click "Environment Variables" and add the following:

   ```
   DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
   NEXTAUTH_SECRET=your-random-secret-key-here
   NEXTAUTH_URL=https://your-app.vercel.app
   PUSHER_APP_ID=your-pusher-app-id
   PUSHER_SECRET=your-pusher-secret
   PUSHER_KEY=your-pusher-key
   PUSHER_CLUSTER=your-pusher-cluster
   ```

   **Important Notes:**
   - Generate `NEXTAUTH_SECRET` using: `openssl rand -base64 32`
   - `NEXTAUTH_URL` should be your Vercel deployment URL (update after first deploy)
   - For Pusher, sign up at [pusher.com](https://pusher.com) if you haven't already

5. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete
   - Once deployed, update `NEXTAUTH_URL` with your actual deployment URL

### Method 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```

4. **Follow the prompts:**
   - Set up and deploy? **Yes**
   - Which scope? Select your account
   - Link to existing project? **No** (for first deployment)
   - Project name? (Press Enter for default)
   - Directory? (Press Enter for `./`)
   - Override settings? **No**

5. **Add Environment Variables**
   ```bash
   vercel env add DATABASE_URL
   vercel env add NEXTAUTH_SECRET
   vercel env add NEXTAUTH_URL
   vercel env add PUSHER_APP_ID
   vercel env add PUSHER_SECRET
   vercel env add PUSHER_KEY
   vercel env add PUSHER_CLUSTER
   ```

6. **Deploy to Production**
   ```bash
   vercel --prod
   ```

## Step 4: Run Database Migrations

After deployment, you need to run Prisma migrations to set up your database schema.

### Option 1: Using Vercel CLI

```bash
# Set your production DATABASE_URL
export DATABASE_URL="your-production-database-url"

# Run migrations
npx prisma migrate deploy
```

### Option 2: Using Prisma Migrate in a Script

Create a migration script and run it manually or via a GitHub Action:

```bash
# In your local terminal with DATABASE_URL set
npx prisma migrate deploy
```

### Option 3: Using Prisma Studio (for initial setup)

```bash
# Connect to production database
DATABASE_URL="your-production-database-url" npx prisma studio
```

Then use Prisma Studio to push the schema.

## Step 5: Seed the Database (Optional)

If you want to seed your production database with initial data:

```bash
# Set your production DATABASE_URL
export DATABASE_URL="your-production-database-url"

# Run seed script
npm run db:seed
```

**Warning**: Only seed if you want initial test data. For production, you may want to skip this.

## Step 6: Verify Deployment

1. Visit your deployment URL: `https://your-app.vercel.app`
2. Test the application:
   - Sign up/Login
   - Create an objective
   - Create a key result
   - Verify real-time features (if Pusher is configured)

## Environment Variables Reference

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ Yes | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `NEXTAUTH_SECRET` | Secret for NextAuth.js | ✅ Yes | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your app URL | ✅ Yes | `https://your-app.vercel.app` |
| `PUSHER_APP_ID` | Pusher App ID | ⚠️ Optional | For real-time features |
| `PUSHER_SECRET` | Pusher Secret | ⚠️ Optional | For real-time features |
| `PUSHER_KEY` | Pusher Key | ⚠️ Optional | For real-time features |
| `PUSHER_CLUSTER` | Pusher Cluster | ⚠️ Optional | For real-time features |
| `EMAIL_SERVER_HOST` | SMTP Host | ⚠️ Optional | For email notifications |
| `EMAIL_SERVER_PORT` | SMTP Port | ⚠️ Optional | `587` |
| `EMAIL_SERVER_USER` | SMTP User | ⚠️ Optional | Your email |
| `EMAIL_SERVER_PASSWORD` | SMTP Password | ⚠️ Optional | Your email password |
| `EMAIL_FROM` | From Email | ⚠️ Optional | `noreply@yourcompany.com` |

## Troubleshooting

### Build Fails with Prisma Errors

- Ensure `postinstall` script is in package.json (already added)
- Check that `DATABASE_URL` is set correctly
- Verify Prisma schema is valid

### Database Connection Errors

- Verify `DATABASE_URL` format is correct
- Check if your database allows connections from Vercel IPs
- Ensure SSL is enabled (add `?sslmode=require` to connection string)

### NextAuth Errors

- Verify `NEXTAUTH_SECRET` is set and is a random string
- Ensure `NEXTAUTH_URL` matches your deployment URL exactly
- Check that cookies are enabled in your browser

### Real-time Features Not Working

- Verify all Pusher environment variables are set
- Check Pusher dashboard for connection status
- Ensure Pusher channels are properly configured

## Continuous Deployment

Once connected to Git, Vercel will automatically deploy:
- **Production**: Every push to `main` branch
- **Preview**: Every push to other branches (creates preview deployments)

## Custom Domain

1. Go to your project in Vercel dashboard
2. Navigate to Settings → Domains
3. Add your custom domain
4. Update `NEXTAUTH_URL` environment variable to match your custom domain
5. Redeploy

## Monitoring

- **Logs**: View in Vercel dashboard under "Deployments" → Click on deployment → "Functions" tab
- **Analytics**: Enable in Vercel dashboard (Settings → Analytics)
- **Error Tracking**: Consider integrating Sentry or similar

## Security Checklist

- ✅ Use strong `NEXTAUTH_SECRET`
- ✅ Enable SSL for database connections
- ✅ Use environment variables for all secrets
- ✅ Keep dependencies updated
- ✅ Review Vercel security settings
- ✅ Enable Vercel's DDoS protection

## Support

- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Next.js Docs**: [nextjs.org/docs](https://nextjs.org/docs)
- **Prisma Docs**: [prisma.io/docs](https://www.prisma.io/docs)

---

**Ready to deploy?** Follow the steps above and your OKR Management System will be live on Vercel! 🚀

