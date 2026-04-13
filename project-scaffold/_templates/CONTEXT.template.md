# CONTEXT — features/[module-name] ([web|mobile|both])
> Copy this file into every new feature folder. Fill it in before writing any code.
> AI reads this file instead of scanning the entire module folder.
> Keep it updated as the module evolves.

## Purpose
<!-- One sentence: what does this module do? -->

## Screens
<!-- List each screen/page in this module -->
- `ScreenName` — description

## Components used (from shared/)
<!-- Which shared components does this module use? -->
- `ComponentName` — why / where

## State
<!-- Zustand stores (web) or Riverpod providers (mobile) -->
- `useXxxStore` / `xxxProvider` — what state it holds

## Services
<!-- Feature-specific services and their key methods -->
- `XxxService` (`features/[module]/services/xxx_service.ts`)
  - `methodName(params)` → `ReturnType`

## API endpoints
<!-- REST endpoints this module calls -->
- `GET /endpoint`
- `POST /endpoint`

## Key types / models
<!-- The main data types this module works with -->
```ts
interface XxxModel { ... }
```

## Do NOT import from
<!-- Cross-feature import guard — list feature modules this must never import -->
- Any other `features/` module (unless explicitly noted here)
