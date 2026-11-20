# Nutrition: daily targets, water goal, AI estimates and offline logging

How the nutrition feature behaves today (Phase 5). Product requirements are in
`Resources/docs/11-nutrition-system.txt`; this page records what is built, the decisions behind it, and what is not.

## One set of daily goals

A member's calorie, protein, carbohydrate, fat and water goals are decided in **one place**:
`resolveDailyTargets` (`backend/src/modules/profile/domain/daily-targets.ts`, exported by the profile module). The
nutrition diary, the home dashboard and the nutrition and hydration analytics all read through it, so the same member
never sees two different goals on two screens.

Order of precedence, and the `source` reported with the numbers:

| Source      | When                                                                                          | Numbers                                                                     |
| ----------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `saved`     | Calories (and normally protein) were saved on the profile at onboarding (`> 500` kcal)         | The saved calories and protein; fat and carbs from the split below          |
| `estimated` | Nothing saved, but weight, height and date of birth are known                                 | `MetabolicCalculator.calculateTargets` (Mifflin-St Jeor, the onboarding rules) |
| `default`   | Nothing known                                                                                 | Generic placeholders (dashboard only, labelled). The diary shows **no** goal |

Fat and carbohydrates are never stored. They come from `MetabolicCalculator.splitFatAndCarbs`: fat is 25% of calories
(at least 30 g), carbs are what is left after protein and fat (at least 50 g). A saved target and a freshly calculated
one therefore agree on all four numbers; `tests/unit/profile/daily-targets.test.ts` pins that.

`GET /nutrition/daily` now returns every target (`calories`, `proteinG`, `carbsG`, `fatG`, `waterMl`), plus `source`
and `waterSource`, and the matching `remaining` values. The nutrition analytics `targetCalories` and `targetProtein`
and the analytics overview use the same numbers. Nothing is invented: a goal that cannot be known is `null` and the
apps show "no goal", never a made-up figure.

Known difference: the profile screen's `calculatedTargets` is still recomputed from the current weight, while the diary
shows the saved target. They can differ after a weight change until the profile is saved again.

## Water goal

The goal is the member's own saved value when they set one, otherwise an **estimate of 35 ml per kg of body weight**
(rounded to 50 ml, kept between 1,500 and 5,000 ml) labelled `estimated`, otherwise none. The estimate is only a
starting point: it is never stored and is recomputed from the current weight until the member chooses a goal.

- `PUT /nutrition/water-target` `{ "targetMl": 500..8000 | null }` saves the goal, or clears it with `null` so the
  estimate applies again. It answers with the goal now in effect (`{ targetMl, source }`). Idempotent.
- Stored in `user_nutrition_settings` (migration `0028`, one optional row per member, `ON DELETE CASCADE`), with a
  `CHECK` on the same 500-8000 range as the API. Owned by the nutrition module (`PgNutritionSettingsRepository`).
- Analytics: `GET /analytics/hydration` and the overview use the member's goal; an explicit `targetMl` query value still
  wins; the old fixed 3000 ml survives only for a member with neither a goal nor a weight.
- Mobile: the Water card shows where the goal came from and opens a goal sheet (250 ml steps; "Use the estimate from
  my weight" when they have their own).

## Meals and water entries

Editing, deleting and restoring a logged meal keeps the **stored item snapshots** (a later catalogue change never
re-prices a past meal): `PUT /nutrition/meals/:id` takes `mealItemId` per line; `DELETE /nutrition/meals/:id` is a soft
delete and `POST /nutrition/meals/:id/restore` brings back the same meal id. `DELETE /nutrition/water/:id` removes one
water entry; its undo is logging the same entry id again. The daily view returns `waterEntries[]`.

AI-estimated items carry the brand label the Python parsers stamp (`AI Estimate`, `AI Voice Estimate`; see
`AI_ESTIMATE_BRANDS` in `domain/meal.ts`). That label is the only record of "this was an AI estimate" until real
provenance columns exist.

## AI estimates are validated at every layer

Meal photo and voice meal answers come from the Python AI service (`ai-backend`). Nothing the model says is trusted:

1. **Request hints (Node).** Meal type and language are short labels (`aiHintSchema`: letters, digits, spaces and a
   little punctuation, at most 50 characters); notes at most 250, spoken or typed text at most 2,000.
2. **Prompt input (Python).** Request contracts flatten member-written text to one line and turn double quotes into
   single quotes (`core/text.py`), so a note cannot close its quotes or start a new "instruction" line.
3. **Parsing (Python).** `meals/parsing.py` and `meals/photo_parsing.py` still reproduce the former Node parser exactly;
   their golden fixtures are unchanged.
4. **Sanitising (Python).** `meals/sanitize.py` bounds the parsed result: at most 20 items; per item at most 2,500 kcal,
   250 g of protein, carbs or fat, 100 g of fibre, a 5,000 g serving and a serving size of 1,000; non-positive weights
   and sizes fall back to defaults; text is one clean line within the lengths the diary accepts. Totals are recomputed
   from the bounded items. When anything had to be changed the item becomes `low` confidence and the reply carries a
   notice, so the app asks the member to review.
5. **Reply schema (Node).** The adapter validates Python's reply against the same numbers (`AI_ESTIMATE_LIMITS`) and
   answers a controlled 503 for anything outside them.

The limits live in two files that must agree: `backend/src/modules/nutrition/domain/nutrition-limits.ts` and
`ai-backend/src/onusfit_ai/meals/limits.py` (a Node test reads the Python file and fails on any difference). They sit
inside the meal-logging limits, including the meal totals (20 items x 2,500 kcal = the 50,000 kcal cap), so every
detected item can be saved.

## Capture limits in the app

- **Meal photo.** Pickers compress at quality 0.5 (was 0.7); the photo is checked **before** upload: the type is
  normalised (`image/jpg` to `image/jpeg`, `image/heif` to `image/heic`; GIF and others refused) and a photo over the
  server's 10 million base64 characters is refused with advice, instead of failing after a long upload
  (`utils/meal-photo-upload.ts`). Shrinking the pixel dimensions needs `expo-image-manipulator`, which is not installed
  (a new dependency needs approval).
- **Voice.** A recording stops at 60 seconds (the native recorder is given the limit and the screen also stops it by
  clock), shows `0:07 / 1:00`, and a recording shorter than one second is never sent. Typed text over 2,000 characters
  is refused on the device. The server's own ceiling is the 15 MB audio size shared with the coach endpoints; it cannot
  measure duration.

## Offline queue and permanent errors

Meals and water logged offline wait in a per-user queue and sync when the connection returns
(`services/nutrition-offline-sync.ts`). What happens to an entry whose upload fails is decided by
`classifySyncFailure`:

| Result                                                        | Entry                                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| No response, 5xx, 401, 403, 408, 425, 429                     | Stays queued; tried again next sync (the entry is fine, the attempt was not)   |
| 409                                                           | Confirmed duplicate counts as saved; an id owned by someone else gets a new id |
| Any other 4xx (the server refused this entry for good)        | Moved to the **rejected list**, never silently dropped                        |

The rejected list (`@fitonus:rejected_nutrition:<user id>`, newest 50) is shown on the nutrition screen ("N entries
couldn't be saved") with the reason, where each entry can be tried again or removed. It is cleared on sign-out.
Refused entries are written before the queue is rewritten, so a crash can leave a duplicate but never lose an entry.

## Diary navigation

Nutrition screen -> "Meal diary" (summary card or list row) -> a day -> the nutrition screen opens on that day
(`setSelectedDate`, then the screen loads the selected date; a "Viewing <date>" banner returns to today). The diary week
ends on the device's own today (`endDate` is sent), and a day with nothing logged reads "Nothing logged". Every route
the nutrition screens navigate to is registered; no live nutrition screen reads the mock data files.

## Tests

| Area                              | Where                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Target resolver, water estimate   | `backend/tests/unit/profile/daily-targets.test.ts`                                                  |
| Water target use case and route   | `backend/tests/unit/nutrition/water-target.test.ts`, `tests/integration/database/nutrition-targets.test.ts` |
| AI limits, hints, reply bounds    | `backend/tests/unit/nutrition/ai-estimate-limits.test.ts`, `ai-backend/tests/test_meal_sanitize.py` |
| Offline queue, voice, photo, diary | `mobile/tests/nutrition-offline-queue.test.ts`, `nutrition-capture-and-diary.test.ts`, `nutrition-water-goal.test.ts` |
| Meal lifecycle against real rules | `mobile/tests/nutrition-meal-roundtrip.test.ts` (mobile store + the real backend use cases, in memory) |

The mobile tests run the real backend use cases and schemas through `mobile/tests/helpers/nutrition-backend-adapter.ts`
instead of canned responses.

## Not built

- Provenance columns (which model, whether the member edited the estimate). Migration `0028` was used by the water
  settings table, so provenance becomes `0029` or later. Until then "AI estimate" is derived from the brand label.
- A verified Indian and South Indian food catalogue (verified data only, no invented values) and barcode lookups.
- Editing or deleting a meal that is still waiting offline (it can be changed once synced).
- Shrinking meal photos by dimensions (`expo-image-manipulator`, needs approval).
- Device testing: none of the mobile behaviour above has been run on a phone or emulator.
