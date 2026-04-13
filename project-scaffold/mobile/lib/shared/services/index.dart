// lib/shared/services/index.dart
// Barrel export for all shared services.
// Usage: import 'package:app/shared/services/index.dart';

export 'api_service.dart';
export 'storage_service.dart';
export 'log_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// lib/shared/services/api_service.dart  (scaffold)
// ─────────────────────────────────────────────────────────────────────────────
//
// import 'package:dio/dio.dart';
// import 'package:flutter_riverpod/flutter_riverpod.dart';
// import 'package:app/shared/utils/constants.dart';
//
// class ApiService {
//   final Dio _dio;
//
//   ApiService({String? baseUrl}) : _dio = Dio(BaseOptions(
//     baseUrl: baseUrl ?? AppConstants.apiBaseUrl,
//     connectTimeout: const Duration(seconds: 10),
//     receiveTimeout: const Duration(seconds: 15),
//     headers: {'Content-Type': 'application/json'},
//   )) {
//     _dio.interceptors.add(_AuthInterceptor());
//   }
//
//   Future<T> get<T>(String path, {Map<String, dynamic>? params}) async {
//     final res = await _dio.get(path, queryParameters: params);
//     return res.data as T;
//   }
//
//   Future<T> post<T>(String path, {dynamic data}) async {
//     final res = await _dio.post(path, data: data);
//     return res.data as T;
//   }
//
//   Future<T> put<T>(String path, {dynamic data}) async {
//     final res = await _dio.put(path, data: data);
//     return res.data as T;
//   }
//
//   Future<void> delete(String path) async => _dio.delete(path);
// }
//
// final apiServiceProvider = Provider<ApiService>((ref) => ApiService());

// ─────────────────────────────────────────────────────────────────────────────
// lib/shared/services/storage_service.dart  (scaffold)
// ─────────────────────────────────────────────────────────────────────────────
//
// import 'package:shared_preferences/shared_preferences.dart';
//
// class StorageService {
//   final SharedPreferences _prefs;
//   StorageService(this._prefs);
//
//   String? get(String key) => _prefs.getString(key);
//   Future<bool> set(String key, String value) => _prefs.setString(key, value);
//   Future<bool> remove(String key) => _prefs.remove(key);
//   Future<bool> clear() => _prefs.clear();
// }
//
// final storageServiceProvider = Provider<StorageService>((ref) {
//   throw UnimplementedError('Override in ProviderScope with SharedPreferences instance');
// });
