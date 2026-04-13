// lib/foundation/tokens/app_spacing.dart
abstract final class AppSpacing {
  static const double xs  = 4;
  static const double sm  = 8;
  static const double md  = 12;
  static const double lg  = 16;
  static const double xl  = 20;
  static const double xxl = 24;
  static const double x3l = 32;
  static const double x4l = 48;
  static const double x5l = 64;
}

abstract final class AppRadius {
  static const double none = 0;
  static const double sm   = 4;
  static const double md   = 8;
  static const double lg   = 12;
  static const double xl   = 16;
  static const double full = 9999;
}

// lib/foundation/tokens/app_typography.dart
import 'package:flutter/material.dart';

abstract final class AppTypography {
  static const String fontFamily = 'Inter'; // replace with your chosen font

  static const TextStyle h1 = TextStyle(fontSize: 32, fontWeight: FontWeight.w700, height: 1.25);
  static const TextStyle h2 = TextStyle(fontSize: 24, fontWeight: FontWeight.w600, height: 1.3);
  static const TextStyle h3 = TextStyle(fontSize: 20, fontWeight: FontWeight.w600, height: 1.35);
  static const TextStyle h4 = TextStyle(fontSize: 18, fontWeight: FontWeight.w500, height: 1.4);

  static const TextStyle bodyLarge  = TextStyle(fontSize: 16, fontWeight: FontWeight.w400, height: 1.5);
  static const TextStyle body       = TextStyle(fontSize: 14, fontWeight: FontWeight.w400, height: 1.5);
  static const TextStyle bodySmall  = TextStyle(fontSize: 13, fontWeight: FontWeight.w400, height: 1.5);
  static const TextStyle caption    = TextStyle(fontSize: 12, fontWeight: FontWeight.w400, height: 1.4);
  static const TextStyle label      = TextStyle(fontSize: 12, fontWeight: FontWeight.w500, height: 1.4, letterSpacing: 0.5);
  static const TextStyle button     = TextStyle(fontSize: 14, fontWeight: FontWeight.w600, height: 1.25, letterSpacing: 0.1);
}

abstract final class AppDuration {
  static const fast   = Duration(milliseconds: 100);
  static const normal = Duration(milliseconds: 200);
  static const slow   = Duration(milliseconds: 300);
}
