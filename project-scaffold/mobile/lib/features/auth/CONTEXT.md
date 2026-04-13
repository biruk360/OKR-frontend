# CONTEXT — features/auth (mobile)
> AI reads this instead of scanning the entire auth folder.

## Purpose
Handles user authentication: login, registration, password reset, token persistence, and navigation guarding.

## Screens (see SITEMAP.md for routes)
- `LoginScreen` — email + password login
- `RegisterScreen` — new account creation
- `ForgotPasswordScreen` — request reset email
- `ResetPasswordScreen` — set new password via deep link token

## Widgets used (from shared/components/)
- `AppButton`, `AppInput`, `FormField`, `AppText`, `LoadingSpinner`
- `ConfirmDialog` — logout confirmation

## State (Riverpod)
- `authProvider` (`shared/providers/auth_provider.dart`) — AuthState: user, token, isAuthenticated
- `isAuthenticatedProvider` — convenience selector
- `currentUserProvider` — convenience selector

## Services
- `AuthService` (`features/auth/services/auth_service.dart`)
  - `login(email, password)` → `AuthResponse`
  - `register(payload)` → `AuthResponse`
  - `forgotPassword(email)` → `void`
  - `resetPassword(token, password)` → `void`
  - `refreshToken()` → `String`

## Navigation (go_router)
- Unauthenticated users are redirected to `/login` via router redirect
- On login success → `context.go('/')` (dashboard)
- Deep link for reset: `/reset-password?token=xxx`

## Do NOT import from
- Any other `features/` module
- Individual component files — always use `shared/components/index.dart`
