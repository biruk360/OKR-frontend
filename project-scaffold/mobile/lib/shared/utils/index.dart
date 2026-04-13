// lib/shared/utils/index.dart
// Barrel export for all shared utilities.
// Usage: import 'package:app/shared/utils/index.dart';

export 'formatters.dart';
export 'validators.dart';
export 'constants.dart';

// ─────────────────────────────────────────────────────────────────────────────
// lib/shared/utils/formatters.dart  (scaffold)
// Never inline format logic inside widgets — add all functions here.
// ─────────────────────────────────────────────────────────────────────────────
//
// import 'package:intl/intl.dart';
//
// abstract final class AppFormatters {
//   static String currency(double amount, {String symbol = '\$'}) =>
//     NumberFormat.currency(symbol: symbol, decimalDigits: 2).format(amount);
//
//   static String date(DateTime date, {String pattern = 'MMM dd, yyyy'}) =>
//     DateFormat(pattern).format(date);
//
//   static String shortDate(DateTime date) => DateFormat('MM/dd/yyyy').format(date);
//
//   static String timeAgo(DateTime date) {
//     final diff = DateTime.now().difference(date);
//     if (diff.inDays > 0) return '${diff.inDays}d ago';
//     if (diff.inHours > 0) return '${diff.inHours}h ago';
//     if (diff.inMinutes > 0) return '${diff.inMinutes}m ago';
//     return 'just now';
//   }
//
//   static String phone(String raw) {
//     final digits = raw.replaceAll(RegExp(r'\D'), '');
//     if (digits.length == 10) return '(${digits.substring(0,3)}) ${digits.substring(3,6)}-${digits.substring(6)}';
//     return raw;
//   }
//
//   static String compactNumber(num n) => NumberFormat.compact().format(n);
// }

// ─────────────────────────────────────────────────────────────────────────────
// lib/shared/utils/constants.dart  (scaffold)
// ─────────────────────────────────────────────────────────────────────────────
//
// abstract final class AppConstants {
//   static const String apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://api.example.com');
//   static const String appName    = String.fromEnvironment('APP_NAME', defaultValue: 'App');
//   static const String appVersion = String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0');
//
//   // Pagination
//   static const int defaultPageSize = 20;
//
//   // Timeouts
//   static const Duration connectTimeout = Duration(seconds: 10);
//   static const Duration receiveTimeout = Duration(seconds: 15);
// }
