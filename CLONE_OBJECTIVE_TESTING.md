# Clone Objective - Testing Guide

## User Story Implementation Status: ✅ COMPLETE

### Acceptance Criteria Validation

#### ✅ AC1: Clone Button Visibility for Authorized Users
**Given** I am logged in with permissions to create objectives,
**When** I view an objective card or its detail page,
**Then** I must see a "Clone" option within a menu or as a button.

**Implementation:**
- ✅ Clone button appears for Department Leads, Executives, and System Administrators
- ✅ Button is visible on both objective cards and detail pages
- ✅ Button is only visible for active objectives (not archived)
- ✅ Clone icon (copy) clearly indicates cloning functionality
- ✅ Button is completely hidden for unauthorized users (regular employees)

#### ✅ AC2: Clone Modal with Pre-populated Title
**Given** I have clicked the "Clone" option,
**When** a "Clone Objective" modal appears,
**Then** the system must display a form with the "Title" field pre-populated with "Copy of [Original Objective Title]".

**Implementation:**
- ✅ Modal title: "Clone Objective"
- ✅ Title field pre-populated with "Copy of [Original Objective Title]"
- ✅ Title field is editable for customization
- ✅ Form validation ensures title is required

#### ✅ AC3: Timeframe Selection and Key Results Option
**Given** I am on the clone modal,
**When** I view the form,
**Then** I must be required to select a new Timeframe for the cloned objective.
**And** there must be a checkbox labeled "Include Key Results", which is checked by default.

**Implementation:**
- ✅ Timeframe selection is required (marked with red asterisk)
- ✅ Dropdown shows all available timeframes with dates
- ✅ "Include Key Results" checkbox is checked by default
- ✅ Checkbox shows helpful text about what will be cloned
- ✅ Dynamic preview shows number of key results to be cloned

#### ✅ AC4: Clone with Key Results
**Given** the "Include Key Results" checkbox is checked,
**When** I save the clone,
**Then** a new objective must be created with exact copies of the original Key Results.
**And** the progress for each cloned Key Result must be reset to its starting value.

**Implementation:**
- ✅ All key results are cloned exactly (title, description, target value, unit, owner)
- ✅ Progress is reset to 0 for all cloned key results
- ✅ Key results maintain their original structure and relationships
- ✅ Cloned key results are set to ACTIVE status
- ✅ All key result data is preserved except progress

#### ✅ AC5: Clone without Key Results
**Given** the "Include Key Results" checkbox is unchecked,
**When** I save the clone,
**Then** a new objective must be created with no Key Results.

**Implementation:**
- ✅ Objective is cloned without any key results
- ✅ All objective data is preserved (title, description, level, owner, department)
- ✅ New objective is created in the selected timeframe
- ✅ Objective is set to ACTIVE status

#### ✅ AC6: Success Notification and Dashboard Update
**Given** I have successfully submitted the form,
**When** the action is complete,
**Then** I must see a success notification: "Objective cloned successfully."
**And** I must see the new cloned objective on the main dashboard under the newly selected timeframe.

**Implementation:**
- ✅ Exact success message: "Objective cloned successfully."
- ✅ Automatic redirect to the new cloned objective's detail page
- ✅ New objective appears in appropriate dashboard based on level
- ✅ Objective is visible in the selected timeframe section
- ✅ All cloned data is immediately available

## Test Cases

### Test Case 1: Clone with Key Results ✅
1. **Login** as Department Lead (`engineering.lead@company.com` / `admin123`)
2. **Navigate** to Department OKRs dashboard
3. **Find** an objective from "Q1" that has three Key Results with some progress
4. **Click** "Clone" button
5. **Verify** modal appears with:
   - ✅ Title pre-populated as "Copy of [Original Title]"
   - ✅ Timeframe dropdown available
   - ✅ "Include Key Results" checkbox checked by default
   - ✅ Preview showing 3 key results to be cloned
6. **Change** timeframe to "Q2" and leave "Include Key Results" checked
7. **Click** "Create Clone"
8. **Verify**:
   - ✅ Success message: "Objective cloned successfully."
   - ✅ Redirected to new objective's detail page
   - ✅ New objective titled "Copy of..." appears in Q2 section
   - ✅ All three Key Results are present with progress reset to 0
   - ✅ All key result data preserved (titles, targets, units, owners)

### Test Case 2: Clone without Key Results ✅
1. **Use** the same objective from Test Case 1
2. **Click** "Clone" button
3. **Change** timeframe to "Q2"
4. **Uncheck** "Include Key Results" checkbox
5. **Verify** preview text changes to indicate no key results will be cloned
6. **Click** "Create Clone"
7. **Verify**:
   - ✅ Success message: "Objective cloned successfully."
   - ✅ Redirected to new objective's detail page
   - ✅ New objective appears in Q2 section
   - ✅ Objective has no Key Results listed
   - ✅ All objective data preserved (title, description, level, owner)

### Test Case 3: Permission Check ✅
1. **Login** as regular employee (`john.doe@company.com` / `admin123`)
2. **Navigate** to My OKRs dashboard
3. **Find** any objective
4. **Verify**:
   - ✅ No clone button visible on objective cards
   - ✅ No clone button visible on objective detail pages
5. **Login** as Admin (`admin@company.com` / `admin123`)
6. **Navigate** to Company OKRs dashboard
7. **Verify**:
   - ✅ Clone buttons visible on all objective cards
   - ✅ Clone buttons visible on objective detail pages

### Test Case 4: Duplicate Title Prevention ✅
1. **Login** as Admin
2. **Clone** an objective to a specific timeframe
3. **Try** to clone the same objective again with the same title to the same timeframe
4. **Verify**:
   - ✅ Error message: "An objective with this title already exists in the selected timeframe"
   - ✅ Clone operation is prevented
   - ✅ User can modify title to proceed

### Test Case 5: Different Objective Levels ✅
1. **Test** cloning Company-level objectives
2. **Test** cloning Department-level objectives  
3. **Test** cloning Individual-level objectives
4. **Verify**:
   - ✅ All levels can be cloned successfully
   - ✅ Cloned objectives maintain their original level
   - ✅ Cloned objectives appear in appropriate dashboards
   - ✅ All level-specific data is preserved

## Technical Implementation Details

### Components Created/Modified:
1. **CloneObjectiveModal.tsx** - Modal with timeframe selection and key results option
2. **CloneObjectiveButton.tsx** - Clone button with permission checks
3. **ObjectivesList.tsx** - Enhanced with clone buttons for authorized users
4. **Objective detail page** - Enhanced with clone functionality
5. **API endpoint** - New clone route for objective duplication

### Database Operations:
- **Objective Cloning**: Complete objective duplication with new timeframe
- **Key Results Cloning**: Exact duplication with progress reset to 0
- **Transaction Safety**: Atomic operations prevent data inconsistency
- **Duplicate Prevention**: Checks for existing objectives with same title in timeframe

### Permission System:
- **Authorized Roles**: Department Lead, Executive, System Administrator
- **Unauthorized Roles**: Regular employees cannot clone objectives
- **Level Preservation**: Cloned objectives maintain their original level
- **Owner Preservation**: Cloned objectives maintain their original owner

### API Endpoints:
- `POST /api/objectives/[id]/clone` - Clone objective with optional key results

## Files Created/Modified:
- `/components/objectives/CloneObjectiveModal.tsx` (new)
- `/components/objectives/CloneObjectiveButton.tsx` (new)
- `/components/objectives/ObjectivesList.tsx` (enhanced)
- `/app/dashboard/objectives/[id]/page.tsx` (enhanced)
- `/app/api/objectives/[id]/clone/route.ts` (new)

## User Experience Features:
- **Pre-populated Title**: Automatically suggests "Copy of [Original Title]"
- **Timeframe Selection**: Required dropdown with all available timeframes
- **Key Results Option**: Checkbox to include/exclude key results
- **Dynamic Preview**: Shows what will be cloned based on selections
- **Automatic Redirect**: Redirects to new objective's detail page
- **Permission-Based UI**: Clone buttons only appear for authorized users

## Security Features:
- **Role-Based Access**: Clone functionality restricted to authorized roles
- **Duplicate Prevention**: Prevents creating objectives with duplicate titles in same timeframe
- **Transaction Safety**: Atomic operations prevent data inconsistency
- **Data Integrity**: Proper handling of objective and key result relationships
- **Validation**: Server-side validation of all required fields

## Data Handling:
- **Complete Cloning**: All objective data preserved (title, description, level, owner, department)
- **Key Results Cloning**: Exact duplication with progress reset to 0
- **Status Management**: Cloned objectives and key results set to ACTIVE
- **Timeframe Assignment**: New objective assigned to selected timeframe
- **Referential Integrity**: All foreign key relationships properly maintained

## Key Features:
- **Smart Title Generation**: Automatically suggests "Copy of [Original Title]"
- **Flexible Key Results**: Option to include or exclude key results
- **Progress Reset**: All cloned key results start with 0 progress
- **Timeframe Selection**: Required selection of new timeframe
- **Permission Controls**: Only authorized users can clone objectives
- **Duplicate Prevention**: Prevents creating objectives with same title in same timeframe
- **Automatic Redirect**: Redirects to new objective's detail page after cloning

## Ready for Production ✅
All acceptance criteria have been implemented and tested. The system provides:
- Complete objective cloning workflow
- Role-based permission controls
- Flexible key results cloning with progress reset
- Timeframe selection and duplicate prevention
- Automatic redirect and success notifications
- Comprehensive validation and error handling

The implementation is ready for user acceptance testing and production deployment.

## Dependencies Satisfied:
- ✅ User stories for creating and viewing objectives (1.1, 1.2, 1.3) are implemented
- ✅ User story for adding Key Results (1.8) is implemented for testing cloning with KRs
- ✅ All required components and API endpoints are in place
- ✅ Database schema supports objective and key result cloning
- ✅ Permission system properly restricts access to authorized users






