# Component Registry
> **AI instruction:** Read this file before writing any component code.
> If a component matching your need exists here — reuse it. Do not create a duplicate.
> When you create a new shared component, append a row to the correct table below.

Last updated: <!-- AI updates this timestamp after each session -->

---

## How to read this file

| Column | Meaning |
|--------|---------|
| Component | The exact import name |
| Props / Params | Key inputs (not exhaustive — see source file) |
| Location | Import path from `shared/` |
| Used in | Feature modules that currently use this component |
| Stack | `web` · `mobile` · `both` |

---

## Atoms — base building blocks

| Component | Props / Params | Location | Used in | Stack |
|-----------|---------------|----------|---------|-------|
| `AppButton` | `label, onPress, variant(primary\|secondary\|ghost), disabled, loading` | `shared/components/atoms/AppButton` | — | both |
| `AppInput` | `label, value, onChange, error, placeholder, type` | `shared/components/atoms/AppInput` | — | both |
| `AppBadge` | `label, color(success\|warning\|error\|info\|neutral)` | `shared/components/atoms/AppBadge` | — | both |
| `AppText` | `children, variant(h1..h4\|body\|caption), color` | `shared/components/atoms/AppText` | — | both |
| `AppIcon` | `name, size, color` | `shared/components/atoms/AppIcon` | — | both |
| `AppDivider` | `spacing, color` | `shared/components/atoms/AppDivider` | — | both |
| `LoadingSpinner` | `size, color` | `shared/components/atoms/LoadingSpinner` | — | both |
| `AppAvatar` | `name, imageUrl, size` | `shared/components/atoms/AppAvatar` | — | both |

## Molecules — composed from atoms

| Component | Props / Params | Location | Used in | Stack |
|-----------|---------------|----------|---------|-------|
| `FormField` | `label, children, error, required, hint` | `shared/components/molecules/FormField` | — | both |
| `SearchBar` | `value, onChange, onClear, placeholder` | `shared/components/molecules/SearchBar` | — | both |
| `StatusChip` | `status: StatusType, label?` | `shared/components/molecules/StatusChip` | — | both |
| `ConfirmDialog` | `title, body, onConfirm, onCancel, destructive?` | `shared/components/molecules/ConfirmDialog` | — | both |
| `EmptyState` | `icon, title, body, action?` | `shared/components/molecules/EmptyState` | — | both |
| `ListItem` | `title, subtitle?, leading?, trailing?, onPress?` | `shared/components/molecules/ListItem` | — | both |
| `FilterSheet` | `filters, activeFilters, onApply, onReset` | `shared/components/molecules/FilterSheet` | — | both |
| `DateRangePicker` | `from, to, onChange, mode(single\|range)` | `shared/components/molecules/DateRangePicker` | — | both |

## Organisms — complex, composed UI blocks

| Component | Props / Params | Location | Used in | Stack |
|-----------|---------------|----------|---------|-------|
| `DataTable` | `columns, rows, onRowPress?, onAction?, sortable?, paginated?` | `shared/components/organisms/DataTable` | — | both |
| `PageHeader` | `title, subtitle?, back?, actions?[]` | `shared/components/organisms/PageHeader` | — | both |
| `BottomSheet` | `title, children, onClose, snapPoints?` | `shared/components/organisms/BottomSheet` | — | mobile |
| `SidePanel` | `title, children, onClose, width?` | `shared/components/organisms/SidePanel` | — | web |
| `StatCard` | `label, value, delta?, icon?, color?` | `shared/components/organisms/StatCard` | — | both |
| `ListPage` | `title, data, renderItem, filters?, searchable?` | `shared/components/organisms/ListPage` | — | both |

---

## Shared stores (Zustand — web / Riverpod — mobile)

| Store | State shape (key fields) | Location | Used in |
|-------|--------------------------|----------|---------|
| `useAuthStore` | `user, token, isAuthenticated, login(), logout()` | `shared/stores/authStore` | all modules |
| `useUIStore` | `isLoading, toast, modal, showToast(), showModal()` | `shared/stores/uiStore` | all modules |
| `useNetworkStore` | `isOnline, pendingSync[]` | `shared/stores/networkStore` | all modules |

---

## Shared services

| Service | Key methods | Location | Used in |
|---------|------------|----------|---------|
| `ApiService` | `get(), post(), put(), delete(), upload()` | `shared/services/apiService` | all modules |
| `StorageService` | `get(), set(), remove(), clear()` | `shared/services/storageService` | all modules |
| `LogService` | `info(), warn(), error(), debug()` | `shared/services/logService` | all modules |

---

## Shared utilities

| Utility | Key exports | Location |
|---------|------------|----------|
| `formatters` | `formatCurrency(), formatDate(), formatPhone(), formatNumber()` | `shared/utils/formatters` |
| `validators` | `isEmail(), isPhone(), isRequired(), isMinLength()` | `shared/utils/validators` |
| `constants` | `APP_NAME, API_BASE_URL, STATUS_COLORS, DATE_FORMATS` | `shared/utils/constants` |

---
<!-- AI: append new rows above this line. Never delete existing rows. -->
