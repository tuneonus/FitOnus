# FitOnus — Phase 8: Advanced Analytics
# Codebase Audit, Calculation Engine & Clean Architecture Specification

**Status:** Completed Architectural Blueprint & Audit  
**Phase:** 8.1 — Advanced Analytics Codebase Audit & Architecture  
**Role:** Senior Full-Stack Architect (React Native, Node.js 22, Express 5, Neon PostgreSQL)  
**Strict Scope:** Task 8.1 Only. Zero modification of existing source code. Zero migration executions. Parallel-session safe.

---

## 1. Executive Summary

FitOnus has successfully implemented core foundations across Phases 1 through 6, with Phase 7 (Challenges & Gamification) actively under development in parallel. While fundamental tracking features exist (logging workouts, meals, water, body weight, and habits), analytical capabilities across the mobile application currently suffer from three architectural bottlenecks:

1. **Client-Side Heavy Computation:** Screens such as `WorkoutAnalyticsScreen` fetch raw entity collections into mobile memory and perform rough, unindexed JavaScript calculations (e.g. `Date.now() - 30 * 86400000`), ignoring local calendar boundaries, timezone shifts, and Daylight Saving Time (DST). This approach breaks down as users log hundreds of sessions.
2. **Missing Progression Dimensions:** `PersonalRecordsScreen` only displays a single snapshot point (`[{ label: 'PR', value: activeWeight }]`) because no historical progression endpoint exists; Nutrition Analytics only tracks calories and protein while omitting carbohydrate/fat trends and target adherence rates; Hydration lacks weekly consistency analytics; and Body Measurements lack time-series progress curves.
3. **Mock Data Artifacts in Activity Overview:** The Home dashboard (`ActivitySummary`) and `ActivityScreen` remain tightly coupled to mock step counts (`55,590`) and synthetic activity rings from `homeMock.ts`, rather than aggregating genuine logged strength workouts, active training minutes, and real metabolic metrics.

**Phase 8 Objective:**  
Design and implement a production-grade, server-aggregated **Advanced Analytics Engine** that transforms raw, genuine user records into deep, deterministic insights across six domains:
- **Workout Analytics:** Frequency, volume trends, duration trends, exercise-specific 1RM progression curves, and consistency.
- **Nutrition Analytics:** Calories, protein, carbs, fat trends, macro energy splits, and calorie/macro target adherence.
- **Hydration Analytics:** Daily intake, weekly trends, and hydration goal adherence.
- **Body Composition Analytics:** Weight trends, EMA smoothing, rate of change (velocity in kg/week), and measurement progression.
- **Goals & Habits Analytics:** Goal completion rates, habit completion consistency, and streak history.
- **User Activity Overview:** Unified weekly and monthly summaries, period-over-period comparisons, and genuine progress indicators.

**Core Principles:**
- **Zero Fabricated Biometrics:** No synthetic smartwatch steps, sleep stages, or heart rate variability (HRV) without physical sensor hardware.
- **Database Efficiency:** 100% of analytical aggregations are computed directly on existing PostgreSQL tables (`workout_sessions`, `workout_session_sets`, `personal_records`, `meals`, `water_intake`, `weight_logs`, `body_measurements`, `goals`, `habits`). **No duplicate activity tables.**
- **Clean Architecture Modular Monolith:** Isolated within `backend/src/modules/analytics/` with strict domain boundaries, parameterized raw SQL adapters, and typed REST APIs under `/api/v1/analytics/`.
- **Preserved Magic Patterns UI:** Zero redesign of navigation, bottom tabs, or visual components.

---

## 2. Existing Feature Audit

A comprehensive code and schema audit was conducted across all existing analytical touchpoints in FitOnus:

| Feature / Screen | Current Implementation | Database Source | Backend API | Mobile Component & Store | Missing Functionality | Data Accuracy & Integrity Issues |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Home Activity Dashboard** | `ActivitySummary.tsx` on `HomeScreen.tsx` | None (reads `homeMock.ts`). Guarded by `useHasDeviceData()`. | None. No unified overview endpoint. | `ActivitySummary.tsx`, `ProgressRing.tsx`. | Real workout volume, active lifting minutes, completed sessions, and nutrition summary on Home. | Displays synthetic `55,590` steps or blocks screen if no watch is connected, ignoring real workouts. |
| **Workout Analytics** | `WorkoutAnalyticsScreen.tsx` | `workout_sessions` | `GET /api/v1/workouts/sessions` | `useWorkoutStore.ts`, `BarChart.tsx`, `SegmentedControl.tsx`. | Exercise-specific progression, duration trends over time, monthly frequency trends. | In-memory filtering (`Date.now() - 30*86400000`) ignores calendar boundaries; loads all sessions into RAM. |
| **Personal Records** | `PersonalRecordsScreen.tsx` | `personal_records` | `GET /api/v1/workouts/records` | `PersonalRecordsScreen.tsx`, `LineChart.tsx`. | Time-series progression curve over 30d/90d/1y for selected lifts. | Chart only receives a single dummy point `[{ label: 'PR', value: activeWeight }]`. Formula discrepancies for e1RM. |
| **Nutrition Analytics** | `NutritionAnalyticsScreen.tsx` | `meals`, `user_profiles` | `GET /api/v1/nutrition/analytics?range=week\|month` | `NutritionAnalyticsScreen.tsx`, `nutritionApi.ts`, `BarChart.tsx`. | Carbohydrate trends, fat trends, calorie target adherence %, macro adherence %. | Range fixed to 7 or 28 days only; missing adherence percentage against user goals. |
| **Hydration Tracking** | `WaterTracker.tsx` on `NutritionScreen.tsx` | `water_intake` | `POST /api/v1/nutrition/water`, `GET /api/v1/progress/analytics?metric=water` | `nutritionStore.ts`, `WaterTracker.tsx`. | Dedicated hydration trends screen/card, weekly averages, goal adherence rate. | Water goal hardcoded to 3000ml in progress telemetry; lacks weekly adherence analytics. |
| **Weight Progression** | `WeightScreen.tsx`, `ProgressScreen.tsx` | `weight_logs`, `user_profiles` | `GET /api/v1/progress/weight`, `GET /api/v1/progress/analytics?metric=weight` | `weightStore.ts`, `useProgressStore.ts`, `LineChart.tsx`. | Weight velocity (kg/week), goal ETA, body measurement progression curves. | Measurements only return raw logs and single latest diff; no multi-point time-series. |
| **Goals & Habits** | `GoalsScreen.tsx`, `GoalDetailScreen.tsx` | `goals`, `goal_checkpoints`, `habits`, `habit_completions` | `GET /api/v1/goals`, `GET /api/v1/habits`, `GET /api/v1/habits/:id/streaks` | `useGoalsStore.ts`, `ProgressBar.tsx`. | Aggregated habit completion rate (% over 30/90 days), consistency heatmap, goal completion rate. | No unified consistency metric across all habits; streaks can break if calculated in UTC instead of local date. |
| **Period Comparisons** | `ProgressScreen.tsx`, `ReportsScreen.tsx` | `workout_sessions`, `meals`, `weight_logs` | `GET /api/v1/progress/comparison`, `GET /api/v1/progress/reports` | `useProgressStore.ts`, `WeeklyReportScreen.tsx`, `MonthlyReportScreen.tsx`. | Like-for-like day comparisons (e.g. Mon-Wed vs Mon-Wed of prior week); volume comparison; habit adherence. | Compares incomplete current week against complete past week; hardcodes `'Avg sleep'` to `'—'`. |

---

## 3. Current Database Sources

All required analytical metrics are already supported by existing, production-verified migrations (`0001` through `0010`):

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FITONUS DATABASE FOUNDATION                                   │
├──────────────────────────────┬──────────────────────────────┬───────────────────────────────────┤
│ Domain Module                │ Source Tables                │ Key Analytical Columns            │
├──────────────────────────────┼──────────────────────────────┼───────────────────────────────────┤
│ Workouts & Training          │ workout_sessions             │ started_at, completed_at,         │
│                              │                              │ duration_seconds, total_volume_kg,│
│                              │                              │ total_sets, total_reps,           │
│                              │                              │ is_completed                      │
│                              │ workout_session_sets         │ exercise_id, weight_kg, reps,     │
│                              │                              │ is_warmup, is_pr, rpe             │
│                              │ personal_records             │ exercise_id, record_type,         │
│                              │                              │ weight_kg, reps, volume_kg,       │
│                              │                              │ estimated_1rm_kg, achieved_at     │
│                              │ exercises                    │ id, name, category,               │
│                              │                              │ primary_muscles                   │
├──────────────────────────────┼──────────────────────────────┼───────────────────────────────────┤
│ Nutrition & Hydration        │ meals                        │ date (DATE), total_calories,      │
│                              │                              │ total_protein_g, total_carbs_g,   │
│                              │                              │ total_fat_g, total_fiber_g        │
│                              │ meal_items                   │ calories, protein_g, carbs_g,     │
│                              │                              │ fat_g, logged_weight_g            │
│                              │ water_intake                 │ date (DATE), amount_ml, logged_at │
├──────────────────────────────┼──────────────────────────────┼───────────────────────────────────┤
│ Body Composition             │ weight_logs                  │ weight_kg, logged_at, source,     │
│                              │                              │ deleted_at                        │
│                              │ body_measurements            │ waist_cm, chest_cm, hip_cm,       │
│                              │                              │ arm_cm, neck_cm, body_fat_pct,    │
│                              │                              │ muscle_mass_kg, logged_at         │
│                              │ user_profiles                │ starting_weight_kg,               │
│                              │                              │ current_weight_kg,                │
│                              │                              │ target_weight_kg, primary_goal,   │
│                              │                              │ daily_calorie_target,             │
│                              │                              │ daily_protein_grams,              │
│                              │                              │ workout_days_per_week             │
├──────────────────────────────┼──────────────────────────────┼───────────────────────────────────┤
│ Goals & Habit Consistency    │ goals                        │ type, status, start_value,        │
│                              │                              │ current_value, target_value,      │
│                              │                              │ target_date, completed_at         │
│                              │ goal_checkpoints             │ goal_id, value, date, recorded_at │
│                              │ habits                       │ frequency, target_days_per_week,  │
│                              │                              │ current_streak, longest_streak,   │
│                              │                              │ total_completions                 │
│                              │ habit_completions            │ habit_id, date (DATE)             │
└──────────────────────────────┴──────────────────────────────┴───────────────────────────────────┘
```

**Index Verification:**
- `workout_sessions (user_id, started_at DESC)` — Indexed (`idx_workout_sessions_user_date`)
- `workout_session_sets (session_id, set_number ASC)` — Indexed (`idx_session_sets_session`)
- `workout_session_sets (exercise_id)` — Indexed (`idx_session_sets_exercise`)
- `personal_records (user_id, exercise_id, record_type, achieved_at DESC)` — Indexed (`idx_personal_records_user_exercise_achieved`)
- `meals (user_id, date DESC)` — Indexed (`idx_meals_user_date`)
- `water_intake (user_id, date DESC)` — Indexed (`idx_water_intake_user_date`)
- `weight_logs (user_id, logged_at DESC)` — Indexed (`idx_weight_logs_user_logged`)
- `body_measurements (user_id, logged_at DESC)` — Indexed (`idx_body_measurements_user_logged`)
- `goals (user_id, status)` — Indexed (`idx_goals_user_status`)
- `habit_completions (user_id, date DESC)` — Indexed (`idx_habit_completions_user_date`)

**Conclusion:** All queries are strictly index-covered. **No new database migration or table creation is required for Task 8.1.**

---

## 4. Reusable Backend & Mobile Components

### 4.1 Backend Architecture Components
- **`Database` & `SqlExecutor` (`backend/src/database/transaction.ts`):** Parameterized execution, connection pooling, and transaction support.
- **`defineRoute` & Route Plumbing (`backend/src/shared/http/route.ts`):** Type-safe Express 5 routing with standardized JSON response envelopes (`{ success, message, data, [error] }`).
- **`createAuthenticate` Middleware (`backend/src/middleware/authenticate.ts`):** Strict Bearer JWT token verification and tenant user injection (`req.user.id`).
- **`calculateEma` (`backend/src/modules/progress/domain/ema-calculator.ts`):** Mathematically verified exponential moving average calculation with alpha tuning and rounding.
- **`getTimeRangeBuckets` & `getZonedDateParts` (`backend/src/modules/progress/domain/calendar-bounds.ts`):** DST-safe, timezone-aware calendar partitioning (Daily, Weekly, Monthly, Yearly).
- **Streak Calculators (`backend/src/modules/goals/domain/streak-calculator.ts`):** Daily and weekly habit streak algorithms.

### 4.2 Mobile Components (Magic Patterns Design System)
- **Visual Chart Components (`mobile/src/shared/components/charts/`):**
  - `BarChart.tsx`: Goal line support, custom value formatters, highlight indexes, and responsive bars.
  - `LineChart.tsx`: SVG spline/line curves, min/max padding, area fills, and tooltip triggers.
  - `ProgressRing.tsx`: Concentric and standalone circular completion indicators.
  - `Sparkline.tsx`: Compact trend indicators for lists and cards.
- **UI System Controls (`mobile/src/shared/components/ui/`):**
  - `SegmentedControl.tsx`: Range and view mode switching (D/W/M/Y, Frequency/Volume).
  - `EmptyState.tsx`: Standardized empty illustrations with actionable buttons.
  - `ProgressBar.tsx`: Linear completion bars with thematic fills.
  - `SourceTag.tsx`: Clear provenance attribution (`Manual`, `Estimated`, `Synced`).
  - `Screen.tsx`, `SectionHeader.tsx`, `ListRow.tsx`, `Chip.tsx`.

---

## 5. Missing Functionality to be Implemented

1. **Server-Side Workout Aggregation API:** Aggregates session counts, duration, and volume into daily, weekly, and monthly time-series buckets with zero client memory filtering.
2. **Exercise Strength Progression Engine:** Time-series curve of top sets, reps, volume, and estimated 1RM for any exercise over 30d, 90d, 180d, or 1y.
3. **Comprehensive Nutrition & Adherence Engine:** Trend series for all 4 macronutrients (Calories, Protein, Carbs, Fat) plus goal adherence percentages ($\pm 10\%$ calorie window; $\ge 90\%$ protein target).
4. **Hydration Analytics Engine:** Aggregated daily intake, weekly rolling averages, and percentage of days meeting hydration targets.
5. **Body Composition Analytics Engine:** Multi-metric circumference and composition progression curves (waist, chest, hips, arms, body fat %, muscle mass) with weekly weight velocity ($\text{kg/week}$).
6. **Habit & Goal Completion Analytics:** Aggregated completion percentage over time, streak longevity, and consistency heatmaps.
7. **Unified Activity Overview:** Composite summary endpoint delivering workout frequency, training volume, active minutes, nutrition summary, and period-over-period comparisons in a single high-performance request for the Home screen.

---

## 6. Analytics Calculation Rules & Mathematical Formulations

To ensure strict scientific integrity, all analytical metrics are governed by deterministic, documented formulas:

### 6.1 Workout Analytics
- **Completed Session Frequency:**
  $$\text{Freq}(P) = \sum_{s \in \text{Sessions}} [s.\text{user\_id} = U \land s.\text{is\_completed} = \text{true} \land s.\text{started\_at} \in P]$$
- **Total Duration:**
  $$\text{Duration}_{\text{total}} = \text{round}\left(\frac{\sum s.\text{duration\_seconds}}{60}\right) \quad [\text{minutes}]$$
- **Average Session Duration:**
  $$\text{Duration}_{\text{avg}} = \begin{cases} \text{round}\left(\frac{\text{Duration}_{\text{total}}}{\text{Freq}(P)}\right) & \text{if } \text{Freq}(P) > 0 \\ 0 & \text{if } \text{Freq}(P) = 0 \end{cases}$$
- **Training Volume:**
  $$\text{Volume}(P) = \sum_{s \in P} s.\text{total\_volume\_kg} \quad [\text{kg}]$$
- **Estimated 1RM (Epley Formula):**
  $$\text{e1RM} = \begin{cases} \text{weight\_kg} \times \left(1 + \frac{\text{reps}}{30}\right) & \text{if } \text{reps} > 1 \\ \text{weight\_kg} & \text{if } \text{reps} = 1 \end{cases}$$
- **Workout Consistency Score (%):**
  $$\text{Consistency}_{\text{workout}} = \begin{cases} \min\left(100, \text{round}\left(\frac{\text{Freq}_{\text{week}}}{T_{\text{days\_per\_week}}} \times 100\right)\right) & \text{if } T_{\text{days\_per\_week}} > 0 \\ \min\left(100, \text{round}\left(\frac{\text{Freq}_{\text{week}}}{3} \times 100\right)\right) & \text{if } T_{\text{days\_per\_week}} \text{ is null} \end{cases}$$

### 6.2 Nutrition Analytics
- **Daily Intake:**
  $$\text{Kcal}(d) = \sum_{m \in \text{meals}(d)} m.\text{total\_calories}, \quad \text{Protein}(d) = \sum_{m} m.\text{total\_protein\_g}$$
  $$\text{Carbs}(d) = \sum_{m} m.\text{total\_carbs\_g}, \quad \text{Fat}(d) = \sum_{m} m.\text{total\_fat\_g}$$
- **Average Intake Over Period:**
  Let $L = |\{d \in P \mid \text{count}(\text{meals}(d)) > 0\}|$ be the number of **logged days**.
  $$\text{Kcal}_{\text{avg}} = \begin{cases} \text{round}\left(\frac{\sum_{d \in \text{logged}} \text{Kcal}(d)}{L}\right) & \text{if } L > 0 \\ 0 & \text{if } L = 0 \end{cases}$$
  > [!IMPORTANT]
  > **Data Integrity Rule on Missing Days:** Unlogged days ($L = 0$) are strictly excluded from the denominator. Never average missing days as 0 kcal.
- **Macronutrient Energy Contribution:**
  $$\text{MacroKcal} = (\text{Protein}_{\text{g}} \times 4) + (\text{Carbs}_{\text{g}} \times 4) + (\text{Fat}_{\text{g}} \times 9)$$
  $$\%_{\text{protein}} = \text{round}\left(\frac{\text{Protein}_{\text{g}} \times 4}{\text{MacroKcal}} \times 100\right), \quad \%_{\text{carbs}} = \text{round}\left(\frac{\text{Carbs}_{\text{g}} \times 4}{\text{MacroKcal}} \times 100\right), \quad \%_{\text{fat}} = 100 - \%_{\text{protein}} - \%_{\text{carbs}}$$
- **Calorie Target Adherence Rate (%):**
  $$\text{Adherence}_{\text{kcal}} = \begin{cases} \text{round}\left(\frac{|\{d \in \text{logged} \mid |\text{Kcal}(d) - T_{\text{kcal}}| \le 0.10 \times T_{\text{kcal}}\}|}{L} \times 100\right) & \text{if } L > 0 \land T_{\text{kcal}} > 0 \\ 0 & \text{otherwise} \end{cases}$$
- **Protein Target Adherence Rate (%):**
  $$\text{Adherence}_{\text{protein}} = \begin{cases} \text{round}\left(\frac{|\{d \in \text{logged} \mid \text{Protein}(d) \ge 0.90 \times T_{\text{protein}}\}|}{L} \times 100\right) & \text{if } L > 0 \land T_{\text{protein}} > 0 \\ 0 & \text{otherwise} \end{cases}$$

### 6.3 Hydration Analytics
- **Daily Water Intake:**
  $$\text{Water}(d) = \sum_{w \in \text{water\_intake}(d)} w.\text{amount\_ml} \quad [\text{ml}]$$
- **Hydration Target Adherence Rate (%):**
  $$\text{Adherence}_{\text{water}} = \begin{cases} \text{round}\left(\frac{|\{d \in \text{logged\_water} \mid \text{Water}(d) \ge T_{\text{water}}\}|}{L_{\text{water}}} \times 100\right) & \text{if } L_{\text{water}} > 0 \\ 0 & \text{otherwise} \end{cases}$$
  *(Default $T_{\text{water}} = 3000\text{ ml}$ unless configured).*

### 6.4 Body Composition Analytics
- **Exponential Moving Average (EMA):**
  $$\text{EMA}_t = \alpha \times W_t + (1 - \alpha) \times \text{EMA}_{t-1}, \quad \alpha = 0.1, \quad \text{decimals} = 1$$
- **Weight Velocity (Rate of Change):**
  $$\text{Velocity} = \text{round}\left(\frac{W_{\text{latest}} - W_{\text{earliest}}}{\text{elapsed\_days}} \times 7 \times 10\right) / 10 \quad [\text{kg/week}]$$
- **Goal Weight Progress Percentage:**
  $$\text{Progress}_{\text{weight}} = \begin{cases} \text{clamp}\left(\text{round}\left(\frac{W_{\text{start}} - W_{\text{curr}}}{W_{\text{start}} - W_{\text{target}}} \times 100\right), 0, 100\right) & \text{if } W_{\text{start}} \ne W_{\text{target}} \\ 100 & \text{if } W_{\text{curr}} = W_{\text{target}} \\ 0 & \text{otherwise} \end{cases}$$

### 6.5 Goals & Habits Analytics
- **Habit Completion Rate over Window $W$ (e.g. 30 days):**
  $$\text{Rate}_{\text{habit}} = \text{round}\left(\frac{\text{Actual Completions in } W}{\text{Scheduled Days in } W} \times 100\right)$$
  *(For daily habits, $\text{Scheduled} = |W|$; for weekly habits, $\text{Scheduled} = \frac{|W|}{7} \times \text{target\_days\_per\_week}$).*
- **Goal Completion Rate:**
  $$\text{Rate}_{\text{goals}} = \begin{cases} \text{round}\left(\frac{\text{count}(\text{status} = \text{'completed'})}{\text{count}(\text{total goals})} \times 100\right) & \text{if } \text{total goals} > 0 \\ 0 & \text{otherwise} \end{cases}$$

### 6.6 Period-over-Period Comparisons
- **Delta & Percentage Change:**
  $$\Delta = V_{\text{curr}} - V_{\text{prev}}, \quad \% \Delta = \begin{cases} \text{round}\left(\frac{V_{\text{curr}} - V_{\text{prev}}}{V_{\text{prev}}} \times 100\right) & \text{if } V_{\text{prev}} > 0 \\ 0 & \text{otherwise} \end{cases}$$
- **Like-for-Like Day Alignment:**
  When comparing an incomplete current period (e.g. Monday–Wednesday) against the prior period, the comparison engine calculates both:
  1. **Period-to-Date (Like-for-Like):** Mon–Wed of current week vs Mon–Wed of prior week (fair comparison).
  2. **Total Completed Period:** Complete prior week vs complete 2-weeks-prior week.

---

## 7. Backend Clean Architecture Plan

The analytics engine will be implemented in a dedicated modular directory: `backend/src/modules/analytics/`.

```text
backend/src/modules/analytics/
├── domain/
│   ├── analytics-period.ts            # Calendar range bucketing (Daily, Weekly, Monthly, Yearly)
│   ├── workout-analytics-models.ts    # Frequency, volume, duration, e1RM progression models
│   ├── nutrition-analytics-models.ts  # Macros, energy contribution, adherence models
│   ├── hydration-analytics-models.ts  # Water trend and adherence models
│   ├── body-analytics-models.ts       # Weight velocity, measurement progress models
│   └── goals-habits-analytics-models.ts # Habit rate, consistency heatmap, goal models
├── application/
│   ├── ports.ts                       # IAnalyticsWorkoutPort, IAnalyticsNutritionPort, etc.
│   ├── analytics-views.ts             # Strongly typed DTO response envelopes
│   └── use-cases/
│       ├── get-activity-overview.ts   # Unified home/dashboard activity summary
│       ├── get-workout-analytics.ts   # Frequency, volume, and duration trends
│       ├── get-exercise-progression.ts # Exercise-specific 1RM & volume curves
│       ├── get-nutrition-analytics.ts # Macro trends & target adherence rates
│       ├── get-hydration-analytics.ts # Water trends & goal adherence
│       ├── get-body-analytics.ts      # Weight velocity & measurement progression
│       └── get-goals-habits-analytics.ts # Habit completion rate & heatmap
├── infrastructure/
│   ├── pg-analytics-workout-adapter.ts # Parameterized SQL queries for workout sessions & sets
│   ├── pg-analytics-nutrition-adapter.ts # SQL aggregations on meals & water_intake
│   ├── pg-analytics-body-adapter.ts    # SQL aggregations on weight_logs & body_measurements
│   └── pg-analytics-goals-adapter.ts   # SQL aggregations on goals, checkpoints & habits
├── interface/
│   ├── analytics.schemas.ts           # Zod validation schemas for all query params & responses
│   ├── analytics.controller.ts        # HTTP controller routing requests to use cases
│   └── analytics.routes.ts            # Express 5 route definitions using defineRoute
└── index.ts                           # Module composition factory: createAnalyticsModule()
```

---

## 8. Proposed API Endpoint Specifications

All endpoints require Bearer JWT authentication, enforce strict user data isolation, and return standardized FitOnus envelopes:

### 8.1 `GET /api/v1/analytics/overview`
- **Purpose:** Consolidated dashboard summary (Workouts, Calories, Water, Weight, Streak, Period comparison).
- **Query Parameters:** `timezone?: string` (e.g. `America/New_York`), `refDate?: string` (YYYY-MM-DD).
- **Response Shape (200 OK):**
  ```json
  {
    "success": true,
    "message": "Activity overview retrieved",
    "data": {
      "period": "Oct 3 – Oct 9, 2026",
      "workoutSummary": {
        "completedSessions": 4,
        "targetSessions": 4,
        "totalVolumeKg": 24500,
        "totalDurationMinutes": 215,
        "consistencyPct": 100
      },
      "nutritionSummary": {
        "avgCalories": 2180,
        "targetCalories": 2200,
        "avgProteinGrams": 162,
        "targetProteinGrams": 160,
        "calorieAdherencePct": 85,
        "proteinAdherencePct": 100,
        "loggedDays": 6
      },
      "hydrationSummary": {
        "avgWaterMl": 2850,
        "targetWaterMl": 3000,
        "adherencePct": 80
      },
      "bodySummary": {
        "currentWeightKg": 78.4,
        "startWeightKg": 82.0,
        "targetWeightKg": 75.0,
        "weeklyVelocityKg": -0.4,
        "progressPct": 51.4
      },
      "comparisonVsPriorWeek": [
        { "label": "Workouts", "current": "4", "previous": "3", "better": true },
        { "label": "Volume", "current": "24.5 t", "previous": "21.0 t", "better": true },
        { "label": "Calories", "current": "2,180 kcal", "previous": "2,240 kcal", "better": true }
      ]
    }
  }
  ```

### 8.2 `GET /api/v1/analytics/workouts`
- **Purpose:** Workout frequency, volume, and duration trends over time.
- **Query Parameters:** `range`: `'W'` | `'M'` | `'3M'` | `'Y'`, `timezone?: string`.
- **Response Shape (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "range": "M",
      "totalSessions": 16,
      "totalVolumeKg": 98400,
      "avgDurationMin": 52,
      "consistencyPct": 92,
      "frequencySeries": [
        { "label": "W-3", "value": 4 },
        { "label": "W-2", "value": 3 },
        { "label": "W-1", "value": 5 },
        { "label": "This wk", "value": 4 }
      ],
      "volumeSeries": [
        { "label": "W-3", "value": 22500 },
        { "label": "W-2", "value": 19800 },
        { "label": "W-1", "value": 31600 },
        { "label": "This wk", "value": 24500 }
      ],
      "durationSeries": [
        { "label": "W-3", "value": 50 },
        { "label": "W-2", "value": 48 },
        { "label": "W-1", "value": 55 },
        { "label": "This wk", "value": 53 }
      ]
    }
  }
  ```

### 8.3 `GET /api/v1/analytics/workouts/exercises/:exerciseId`
- **Purpose:** Exercise strength progression curve (e1RM, top weight, volume per session over time).
- **Query Parameters:** `range`: `'30d'` | `'90d'` | `'180d'` | `'1y'` | `'all'`.
- **Response Shape (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "exerciseId": "e3b0c442-98fc-1c14-9afbf4c8996fb924",
      "exerciseName": "Barbell Bench Press",
      "currentPr": { "weightKg": 100, "reps": 5, "estimated1rmKg": 116.7, "achievedAt": "2026-10-05T18:30:00Z" },
      "progression": [
        { "date": "2026-08-10", "topWeightKg": 85, "reps": 6, "estimated1rmKg": 99.2, "volumeKg": 2100 },
        { "date": "2026-09-02", "topWeightKg": 92.5, "reps": 5, "estimated1rmKg": 107.9, "volumeKg": 2450 },
        { "date": "2026-10-05", "topWeightKg": 100, "reps": 5, "estimated1rmKg": 116.7, "volumeKg": 2800 }
      ]
    }
  }
  ```

### 8.4 `GET /api/v1/analytics/nutrition`
- **Purpose:** Full macronutrient trends (Calories, Protein, Carbs, Fat) and goal adherence rates.
- **Query Parameters:** `range`: `'week'` | `'month'`, `timezone?: string`.
- **Response Shape (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "range": "week",
      "avgCalories": 2180,
      "targetCalories": 2200,
      "calorieAdherencePct": 85,
      "proteinAdherencePct": 100,
      "macroSplit": [
        { "label": "Protein", "pct": 30, "grams": 162 },
        { "label": "Carbs", "pct": 45, "grams": 245 },
        { "label": "Fat", "pct": 25, "grams": 60 }
      ],
      "dailyTrends": [
        { "date": "2026-10-03", "label": "Sat", "calories": 2150, "protein": 158, "carbs": 240, "fat": 62, "logged": true },
        { "date": "2026-10-04", "label": "Sun", "calories": 2220, "protein": 165, "carbs": 250, "fat": 58, "logged": true }
      ]
    }
  }
  ```

### 8.5 `GET /api/v1/analytics/hydration`
- **Purpose:** Daily water intake, weekly averages, and adherence rates.
- **Query Parameters:** `range`: `'7d'` | `'30d'`, `timezone?: string`.
- **Response Shape (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "avgWaterMl": 2850,
      "targetWaterMl": 3000,
      "adherencePct": 80,
      "points": [
        { "date": "2026-10-03", "label": "Sat", "amountMl": 3000, "goalMet": true },
        { "date": "2026-10-04", "label": "Sun", "amountMl": 2500, "goalMet": false }
      ]
    }
  }
  ```

### 8.6 `GET /api/v1/analytics/body`
- **Purpose:** Weight velocity, EMA-smoothed curve, and body measurement progression.
- **Query Parameters:** `range`: `'M'` | `'3M'` | `'6M'` | `'Y'`, `timezone?: string`.
- **Response Shape (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "startingWeightKg": 82.0,
      "currentWeightKg": 78.4,
      "targetWeightKg": 75.0,
      "weeklyVelocityKg": -0.4,
      "goalProgressPct": 51.4,
      "weightTrend": [
        { "date": "2026-09-01", "raw": 81.5, "ema": 81.6 },
        { "date": "2026-10-01", "raw": 78.6, "ema": 78.8 }
      ],
      "measurementTrends": {
        "waistCm": [{ "date": "2026-09-01", "value": 86.0 }, { "date": "2026-10-01", "value": 83.5 }],
        "chestCm": [{ "date": "2026-09-01", "value": 102.0 }, { "date": "2026-10-01", "value": 103.0 }]
      }
    }
  }
  ```

### 8.7 `GET /api/v1/analytics/goals-habits`
- **Purpose:** Goal completion rate, habit completion rates, and weekly/monthly consistency heatmap.
- **Query Parameters:** `windowDays?: number` (default 30), `timezone?: string`.
- **Response Shape (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "goalStats": { "totalGoals": 5, "active": 3, "completed": 2, "completionRatePct": 40 },
      "habitsSummary": [
        {
          "habitId": "h-1",
          "title": "Drink 3L Water",
          "currentStreak": 14,
          "longestStreak": 21,
          "completionRatePct": 86.7,
          "completionsLast30Days": 26
        }
      ],
      "overallHabitAdherencePct": 88.5
    }
  }
  ```

---

## 9. Mobile Integration Plan

### 9.1 Typed API Client & Zustand Store
- Create `mobile/src/features/analytics/api/analyticsApi.ts`:
  - Methods: `getOverview()`, `getWorkoutAnalytics(range)`, `getExerciseProgression(exerciseId, range)`, `getNutritionAnalytics(range)`, `getHydrationAnalytics(range)`, `getBodyAnalytics(range)`, `getGoalsHabitsAnalytics(windowDays)`.
- Create `mobile/src/features/analytics/store/advancedAnalyticsStore.ts`:
  - Zustand store managing cache, loading states, error states, and pull-to-refresh for all 6 analytical domains.

### 9.2 Screen Upgrades (Zero UI Redesign)
1. **`HomeScreen.tsx` (`ActivitySummary.tsx`):**
   - Eliminate `homeMock.ts` step imports and `useHasDeviceData()` blocking gate.
   - Wire to `useAdvancedAnalyticsStore.overview`.
   - Renders actual completed workouts, volume in tons, active training minutes, and genuine adherence rings.
2. **`WorkoutAnalyticsScreen.tsx`:**
   - Replace in-memory array filtering with `getWorkoutAnalytics(view)`.
   - Wire `<BarChart>` directly to server-aggregated `frequencySeries` and `volumeSeries`.
   - Add duration trend view option (`Avg minutes / session`).
3. **`PersonalRecordsScreen.tsx`:**
   - When user taps a lift, fetch `getExerciseProgression(selectedLiftId)`.
   - Feed the real multi-point `progression` array into `<LineChart points={progression.map(...)} />`.
   - Renders real historical strength trajectory instead of single-point dummy.
4. **`NutritionAnalyticsScreen.tsx`:**
   - Display carbs and fat bars in addition to calories and protein.
   - Display Calorie Adherence % badge and Protein Adherence % badge.
5. **`ProgressScreen.tsx`:**
   - Connect period comparisons to like-for-like day alignment.
   - Render multi-point body measurement curves when measurements exist.

---

## 10. Fresh User Experience & Truthful States

For a brand-new user with zero activity:
1. **No Fabricated Chart Points:** Charts never render synthetic sine waves, fake PR curves, or simulated streaks.
2. **Standardized Empty States:**
   - Workouts: Renders `EmptyState` with `BarChart3` icon: *"No completed workouts yet. Complete your first session to see training volume and frequency trends."* CTA $\to$ `activeWorkout`.
   - PRs: Renders `EmptyState` with `Trophy` icon: *"No personal records established. Complete sets with weight and reps to build your progression curve."* CTA $\to$ `activeWorkout`.
   - Nutrition: Renders `EmptyState` with `Utensils` icon: *"No meals logged yet. Log your first meal to start tracking calories and macronutrients."* CTA $\to$ `foodSearch`.
   - Body: Renders `EmptyState` with `Scale` icon: *"Log your starting weight to begin tracking progress."* CTA $\to$ `weight`.
3. **Proper Distinctions:**
   - Unlogged days are displayed as dashed or empty markers, not 0 kcal.
   - Averages display `"0 kcal"` or `"0 sessions"` only when 0 logged entries exist, avoiding NaN and division-by-zero.
   - Adherence metrics show `"—"` (dash) until at least 3 active days are recorded.

---

## 11. Performance & Scalability Considerations

1. **Database Query Efficiency:**
   - Every analytical query aggregates in PostgreSQL using indexed timestamps (`started_at`, `date`, `logged_at`).
   - Grouping via `date_trunc('day', ...)` or `date_trunc('week', ...)` collapses thousands of raw sets/logs into 7 to 30 lightweight array points in $< 15\text{ ms}$.
   - Response payloads remain compact ($< 4\text{ KB}$), avoiding mobile JSON deserialization bottlenecks.
2. **Concurrency & Memory:**
   - Queries are read-only and execute without locking (`SELECT ... WHERE user_id = $1`).
   - Neon connection pooler reuses connections across requests.
3. **Client-Side Rendering:**
   - SVGs in `LineChart` and `BarChart` are bounded to a maximum of 30 visible bars or 52 yearly points, ensuring 60 FPS scrolling and zero frame drops on mobile.

---

## 12. Security & Tenant Isolation

1. **Authentication Enforcement:** All `/api/v1/analytics/*` routes require `access: { kind: 'authenticated' }`. Missing or expired JWT returns HTTP 401.
2. **Tenant Isolation:** Every SQL query strictly requires `WHERE user_id = $1`. Cross-tenant data access is impossible by design.
3. **Zod Validation:** All query parameters (`range`, `timezone`, `exerciseId`, `windowDays`) are validated via strict Zod schemas with regex constraints on IDs and date strings.
4. **No Direct Model Access:** External users cannot query raw table telemetry directly; access is moderated strictly through use cases and DTO views.

---

## 13. Phase 7 Conflict Analysis & Parallel-Session Isolation

- **Phase 7 Scope:** Session 1 / parallel agent is implementing **Phase 7.5 Mobile Challenges & Gamification**.
- **Phase 7 Files (Strictly Untouched):**
  - `backend/migrations/0011_create_challenges_and_gamification.sql`
  - `backend/src/modules/challenges/`
  - `backend/tests/unit/challenges/`
  - `mobile/src/features/home/components/QuickActions.tsx`, `Onboarding*`, etc.
- **Phase 8 Isolation Strategy:**
  - Phase 8 is entirely located in `backend/src/modules/analytics/`.
  - Task 8.1 modifies **ZERO source files**.
  - Zero database migrations executed.
  - Phase 8 queries existing core tables (`workout_sessions`, `meals`, `weight_logs`, etc.) and does not depend on or modify `challenges` tables.
  - Composition in `backend/src/container.ts` will only be added in Task 8.4 via an isolated one-line module factory.

---

## 14. Phase 8 Implementation Roadmap

| Task | Objective | Key Files to Create / Modify | Dependencies | Test Requirements | Completion Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **8.1** | **Architecture & Codebase Audit** *(Current)* | `backend/docs/PHASE_8_ADVANCED_ANALYTICS_ARCHITECTURE.md` | Existing Phase 1–6 implementations | Read-only inspection; verify existing 477 backend tests pass | Architecture document delivered; user approval received. |
| **8.2** | **Analytics Domain & Calculation Engine** | `backend/src/modules/analytics/domain/*`, `pg-analytics-*-adapter.ts` | Existing SQL tables (`0001`–`0010`) | Unit tests for all mathematical formulas; 1RM Epley tests; EMA tests | 100% test coverage on calculation edge cases (zero values, DST). |
| **8.3** | **Analytics Application Use Cases** | `backend/src/modules/analytics/application/use-cases/*` | Task 8.2 Domain & Adapters | Unit tests for all 7 use cases with mock repository ports | All use cases return verified DTO shapes matching API contract. |
| **8.4** | **REST APIs & Integration Tests** | `backend/src/modules/analytics/interface/*`, `container.ts` | Task 8.3 Use Cases, `defineRoute` | Supertest HTTP integration suite; 401 unauthenticated; 400 validation; user isolation | All 7 REST endpoints operational with automated integration tests. |
| **8.5** | **Mobile Analytics Integration** | `mobile/src/features/analytics/api/*`, `advancedAnalyticsStore.ts`, Screen updates | Task 8.4 REST APIs | Mobile Jest / unit tests; store state transitions; empty state tests | Real charts rendered on Workout, PR, Nutrition, Progress, and Home screens. |
| **8.6** | **QA, Fresh-User & Performance Verification** | E2E verification script, documentation update | Task 8.5 Mobile | Fresh-user empty test; multi-month data test; latency benchmark ($< 50\text{ms}$) | End-to-end verification report; zero regressions across Phases 1–7. |

---

## 15. Open Questions & Design Decisions

1. **Exercise Progression Range Default:**
   - *Decision:* Default exercise progression curve to `'90d'`. For users with $< 3$ workouts, fallback to all-time so early milestones are immediately visible.
2. **Calorie Adherence Window:**
   - *Decision:* Standardized at $\pm 10\%$ of daily calorie target (e.g. for a 2000 kcal target, 1800–2200 kcal is counted as adherent).
3. **Protein Adherence Threshold:**
   - *Decision:* Set at $\ge 90\%$ of daily protein target (e.g. $\ge 144\text{g}$ for a 160g target).
4. **Timezone Handling:**
   - *Decision:* Client passes device IANA timezone (e.g. `Europe/London`, `America/New_York`) as query parameter. Backend partitions days in that local timezone before aggregating UTC database records.

---

> [!IMPORTANT]
> **Task 8.1 Completion Notice:** Architecture and codebase audit are complete. In strict compliance with instructions:
> - Zero source code files have been modified.
> - Zero Phase 7 files have been touched.
> - Zero database migrations have been executed.
> - Database branches remain strictly intact and protected.
> - Awaiting user approval before proceeding to Task 8.2.

