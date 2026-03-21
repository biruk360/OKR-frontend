# Timeframe Type Configuration Feature

## Overview

Admins can now configure timeframe types (Monthly, Quarterly, 6-Month, or Yearly) on the Settings page. The system automatically calculates start and end dates based on the selected type, and timeframe types are displayed throughout the entire platform.

## Changes Made

### 1. Database Schema Update
- Added `type` field to `Timeframe` model in Prisma schema
- Default type is `QUARTERLY` for backward compatibility
- Types supported: `MONTHLY`, `QUARTERLY`, `SIX_MONTH`, `YEARLY`

### 2. Timeframe Management UI
- **Type Selector**: Dropdown to select timeframe type (Monthly, Quarterly, 6-Month, Yearly)
- **Auto-Date Generation**: Start and end dates are automatically calculated based on:
  - Selected type
  - Base date (the date from which to calculate the period)
- **Auto-Name Generation**: Timeframe name is automatically generated based on type:
  - Monthly: "January 2025", "February 2025", etc.
  - Quarterly: "Q1 2025", "Q2 2025", etc.
  - 6-Month: "H1 2025", "H2 2025"
  - Yearly: "2025", "2026", etc.

### 3. API Updates
- **POST /api/timeframes**: Now accepts `type` field
- **PATCH /api/timeframes/[id]**: Now accepts `type` field for updates
- Type validation ensures only valid types are accepted

### 4. Platform-Wide Display Updates
Timeframe type is now displayed with a badge in:
- ✅ Objectives list cards
- ✅ Objective detail pages
- ✅ Key results lists
- ✅ Recent objectives widget
- ✅ Progress tracking page
- ✅ All timeframe dropdowns (with type label)
- ✅ Parent objective selector
- ✅ Todo lists
- ✅ Create/Edit/Clone objective modals

### 5. Helper Utilities
Created `lib/timeframe-utils.ts` with:
- `calculateTimeframeDates()`: Calculates dates based on type
- `generateTimeframes()`: Generates multiple timeframes
- `getTimeframeTypeLabel()`: Gets display label for type
- `formatTimeframeDisplay()`: Formats timeframe for display

## How It Works

### For Admins (Settings Page)

1. **Create New Timeframe**:
   - Select timeframe type (Monthly, Quarterly, 6-Month, or Yearly)
   - Select a base date
   - System automatically calculates:
     - Start date (first day of the period)
     - End date (last day of the period)
     - Name (e.g., "Q1 2025", "January 2025")

2. **Edit Existing Timeframe**:
   - Change the type to recalculate dates
   - Modify dates manually if needed
   - Update name if desired

3. **Timeframe Types**:
   - **Monthly**: 1 month period (e.g., January 1 - January 31)
   - **Quarterly**: 3 month period (e.g., Q1: Jan 1 - Mar 31)
   - **6-Month**: 6 month period (e.g., H1: Jan 1 - Jun 30)
   - **Yearly**: 12 month period (e.g., Jan 1 - Dec 31)

### Date Calculation Logic

- **Monthly**: First day of selected month to last day of that month
- **Quarterly**: First day of quarter to last day of quarter
  - Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
- **6-Month**: First day of half to last day of half
  - H1: Jan-Jun, H2: Jul-Dec
- **Yearly**: January 1 to December 31 of selected year

## User Experience

### Visual Indicators
- Timeframe type is shown as a blue badge next to timeframe names
- Format: `Timeframe Name (Type)` in dropdowns
- Example: "Q1 2025 (Quarterly)" or "January 2025 (Monthly)"

### Automatic Updates
- When admin changes timeframe type, dates are recalculated automatically
- Changes are reflected immediately across the platform
- Page refresh ensures all components show updated timeframe information

## Database Migration

The schema has been updated. For existing deployments:

1. Run `npm run db:push` to update the database schema
2. Existing timeframes will have `type: 'QUARTERLY'` as default
3. Admins can update existing timeframes to set the correct type

## Testing Checklist

- [x] Admin can create timeframes with different types
- [x] Dates are auto-calculated correctly for each type
- [x] Timeframe type is displayed in all lists and cards
- [x] Timeframe type appears in all dropdowns
- [x] Editing timeframe type recalculates dates
- [x] Changes are reflected throughout the platform
- [x] API endpoints validate timeframe types
- [x] Backward compatibility maintained (defaults to QUARTERLY)

## Future Enhancements

Potential improvements:
- Bulk timeframe generation (generate multiple periods at once)
- Custom timeframe periods (e.g., 2-month, 9-month)
- Timeframe templates for quick creation
- Automatic timeframe generation for future periods

---

**Status**: ✅ Complete and ready for use

