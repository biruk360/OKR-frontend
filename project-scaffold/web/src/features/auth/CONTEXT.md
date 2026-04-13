# CONTEXT — features/auth (web)
> AI reads this instead of scanning the entire auth folder.
> Keep this file updated when the module changes.

## Purpose
Handles user authentication: login, registration, password reset, token management, and route protection.

## Screens (see SITEMAP.md for routes)
- `LoginScreen` — email + password login form
- `RegisterScreen` — new account creation
- `ForgotPasswordScreen` — request password reset email
- `ResetPasswordScreen` — set new password via token

## Components used (from shared/)
- `AppButton`, `AppInput`, `FormField`, `AppText` — form UI
- `LoadingSpinner` — async feedback
- `ConfirmDialog` — logout confirmation

## State
- `useAuthStore` (`shared/stores/authStore`) — user, token, isAuthenticated, login(), logout()
- No local feature store needed

## Services
- `AuthService` (`features/auth/services/authService.ts`) — login(), register(), forgotPassword(), resetPassword(), refreshToken()
- Calls `ApiService` from `shared/services`

## API endpoints
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/refresh`

## Route guard
- `middleware.ts` (Next.js) redirects unauthenticated users to `/login`
- Authenticated users visiting `/login` redirect to `/`

## Do NOT import from
- Any other `features/` module
- Directly from `@/shared/components/atoms/AppButton` — always use `@/shared/components`

## Key types
```ts
interface LoginPayload { email: string; password: string; }
interface AuthResponse { token: string; user: User; }
interface User { id: string; name: string; email: string; role: string; }
```
