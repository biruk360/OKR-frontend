// lib/shared/providers/index.dart
// Barrel export for all shared Riverpod providers.
// Usage: import 'package:app/shared/providers/index.dart';

export 'auth_provider.dart';
export 'ui_provider.dart';
export 'network_provider.dart';

// ─────────────────────────────────────────────────────────────────────────────
// lib/shared/providers/auth_provider.dart  (scaffold)
// ─────────────────────────────────────────────────────────────────────────────
//
// import 'package:flutter_riverpod/flutter_riverpod.dart';
// import 'package:app/shared/models/user_model.dart';
//
// class AuthState {
//   final UserModel? user;
//   final String? token;
//   final bool isAuthenticated;
//   const AuthState({this.user, this.token, this.isAuthenticated = false});
//
//   AuthState copyWith({UserModel? user, String? token, bool? isAuthenticated}) =>
//     AuthState(
//       user: user ?? this.user,
//       token: token ?? this.token,
//       isAuthenticated: isAuthenticated ?? this.isAuthenticated,
//     );
// }
//
// class AuthNotifier extends StateNotifier<AuthState> {
//   AuthNotifier() : super(const AuthState());
//
//   void login(String token, UserModel user) =>
//     state = state.copyWith(token: token, user: user, isAuthenticated: true);
//
//   void logout() => state = const AuthState();
//
//   void setUser(UserModel user) => state = state.copyWith(user: user);
// }
//
// final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
//   (ref) => AuthNotifier(),
// );
//
// // Convenience selectors
// final isAuthenticatedProvider = Provider<bool>((ref) =>
//   ref.watch(authProvider).isAuthenticated);
//
// final currentUserProvider = Provider<UserModel?>((ref) =>
//   ref.watch(authProvider).user);

// ─────────────────────────────────────────────────────────────────────────────
// lib/shared/providers/ui_provider.dart  (scaffold)
// ─────────────────────────────────────────────────────────────────────────────
//
// enum ToastType { success, error, warning, info }
//
// class ToastMessage {
//   final String message;
//   final ToastType type;
//   const ToastMessage({required this.message, required this.type});
// }
//
// class UIState {
//   final bool isLoading;
//   final ToastMessage? toast;
//   const UIState({this.isLoading = false, this.toast});
//
//   UIState copyWith({bool? isLoading, ToastMessage? toast}) =>
//     UIState(isLoading: isLoading ?? this.isLoading, toast: toast ?? this.toast);
// }
//
// class UINotifier extends StateNotifier<UIState> {
//   UINotifier() : super(const UIState());
//   void setLoading(bool v) => state = state.copyWith(isLoading: v);
//   void showToast(ToastMessage t) => state = state.copyWith(toast: t);
//   void clearToast() => state = UIState(isLoading: state.isLoading);
// }
//
// final uiProvider = StateNotifierProvider<UINotifier, UIState>(
//   (ref) => UINotifier(),
// );
