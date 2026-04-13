// lib/foundation/tokens/app_colors.dart
// Single source of truth for all colors in the Flutter app.
// Never hardcode a color value in any widget — reference AppColors instead.

import 'package:flutter/material.dart';

abstract final class AppColors {
  // ── Brand ──────────────────────────────────────────────────
  static const primary = MaterialColor(0xFF2563EB, {
    50:  Color(0xFFEFF6FF),
    100: Color(0xFFDBEAFE),
    500: Color(0xFF3B82F6),
    600: Color(0xFF2563EB),
    700: Color(0xFF1D4ED8),
    900: Color(0xFF1E3A5F),
  });

  static const secondary = MaterialColor(0xFF7C3AED, {
    50:  Color(0xFFF5F3FF),
    100: Color(0xFFEDE9FE),
    500: Color(0xFF8B5CF6),
    600: Color(0xFF7C3AED),
    700: Color(0xFF6D28D9),
    900: Color(0xFF2E1065),
  });

  // ── Semantic ────────────────────────────────────────────────
  static const success = Color(0xFF16A34A);
  static const successLight = Color(0xFFDCFCE7);
  static const warning = Color(0xFFD97706);
  static const warningLight = Color(0xFFFEF3C7);
  static const error = Color(0xFFE11D48);
  static const errorLight = Color(0xFFFFE4E6);
  static const info = Color(0xFF2563EB);
  static const infoLight = Color(0xFFDBEAFE);

  // ── Neutral ─────────────────────────────────────────────────
  static const neutral50  = Color(0xFFF8FAFC);
  static const neutral100 = Color(0xFFF1F5F9);
  static const neutral200 = Color(0xFFE2E8F0);
  static const neutral300 = Color(0xFFCBD5E1);
  static const neutral400 = Color(0xFF94A3B8);
  static const neutral500 = Color(0xFF64748B);
  static const neutral600 = Color(0xFF475569);
  static const neutral700 = Color(0xFF334155);
  static const neutral800 = Color(0xFF1E293B);
  static const neutral900 = Color(0xFF0F172A);

  // ── Always ──────────────────────────────────────────────────
  static const white = Color(0xFFFFFFFF);
  static const black = Color(0xFF000000);
  static const transparent = Colors.transparent;
}

// Status color helper — used by StatusChip and similar widgets
enum AppStatus { active, inactive, pending, error, info }

extension AppStatusColor on AppStatus {
  Color get color => switch (this) {
    AppStatus.active   => AppColors.success,
    AppStatus.inactive => AppColors.neutral500,
    AppStatus.pending  => AppColors.warning,
    AppStatus.error    => AppColors.error,
    AppStatus.info     => AppColors.info,
  };

  Color get lightColor => switch (this) {
    AppStatus.active   => AppColors.successLight,
    AppStatus.inactive => AppColors.neutral100,
    AppStatus.pending  => AppColors.warningLight,
    AppStatus.error    => AppColors.errorLight,
    AppStatus.info     => AppColors.infoLight,
  };
}
