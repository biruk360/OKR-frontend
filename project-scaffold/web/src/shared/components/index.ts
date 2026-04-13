// shared/components/index.ts
// Master barrel export for all shared UI components.
// AI reads this file to know what components exist.
// Import like: import { AppButton, DataTable } from '@/shared/components'

// ── Atoms ───────────────────────────────────────────
export { AppButton } from './atoms/AppButton';
export { AppInput } from './atoms/AppInput';
export { AppBadge } from './atoms/AppBadge';
export { AppText } from './atoms/AppText';
export { AppIcon } from './atoms/AppIcon';
export { AppDivider } from './atoms/AppDivider';
export { LoadingSpinner } from './atoms/LoadingSpinner';
export { AppAvatar } from './atoms/AppAvatar';

// ── Molecules ────────────────────────────────────────
export { FormField } from './molecules/FormField';
export { SearchBar } from './molecules/SearchBar';
export { StatusChip } from './molecules/StatusChip';
export { ConfirmDialog } from './molecules/ConfirmDialog';
export { EmptyState } from './molecules/EmptyState';
export { ListItem } from './molecules/ListItem';
export { FilterSheet } from './molecules/FilterSheet';
export { DateRangePicker } from './molecules/DateRangePicker';

// ── Organisms ────────────────────────────────────────
export { DataTable } from './organisms/DataTable';
export { PageHeader } from './organisms/PageHeader';
export { SidePanel } from './organisms/SidePanel';
export { StatCard } from './organisms/StatCard';
export { ListPage } from './organisms/ListPage';
