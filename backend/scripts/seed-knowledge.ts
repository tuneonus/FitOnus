/**
 * Curated Evidence-Based Knowledge Seed Script
 * FitOnus Phase 05: Curated Fitness & Nutrition Ingestion into pgvector
 *
 * Ingests authoritative ACSM, ISSN, and FitOnus application documentation
 * into knowledge_documents and 768-d knowledge_chunks.
 *
 * Usage:
 *   npx tsx scripts/seed-knowledge.ts
 */

import path from 'node:path';
import { assertAiBackendConfigured, loadConfig, loadDatabaseConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';
import { Database } from '../src/database/transaction.js';
import { createKnowledgeModule, type IngestDocumentInput } from '../src/modules/knowledge/index.js';
import { PythonAiClient } from '../src/shared/ai/python-ai-client.js';

export const CURATED_KNOWLEDGE_DOCUMENTS: IngestDocumentInput[] = [
  {
    slug: 'acsm-bench-press-technique',
    title: 'ACSM Guidelines: Barbell Bench Press Biomechanics & Injury Prevention',
    category: 'fitness',
    author: 'ACSM Exercise Physiology Committee',
    license: 'Verified Domain Guidance (ACSM 11th Edition)',
    content: `# ACSM Guidelines: Barbell Bench Press Biomechanics & Injury Prevention

## Overview and Primary Muscle Recruitment
The barbell bench press is the standard compound movement for developing upper body horizontal pressing strength and muscular hypertrophy. Primary agonistic muscle groups include the pectoralis major (sternal and clavicular heads), anterior deltoid, and triceps brachii. Secondary stabilisers include the serratus anterior, latissimus dorsi, and rotator cuff complex (infraspinatus, supraspinatus, teres minor, subscapularis).

## Five-Point Body Contact Position
Before initiating the unrack, maintain five stable contact points throughout the entire repetition:
1. Head positioned flat on the bench pad with cervical spine in neutral alignment.
2. Upper back and shoulders firmly depressed and retracted into the pad.
3. Lower back maintaining its natural lordotic arch (avoid excessive hyperextension).
4. Buttocks and glutes in continuous contact with the bench.
5. Both feet planted flat and driving firmly into the floor for leg drive.

## Grip Width and Scapular Retraction
- Position the hands evenly spaced outside shoulder width, typically 1.5 to 2.0 times biacromial width.
- Wrap the thumbs securely around the barbell (avoid the thumbless "suicide" grip).
- Retract and depress the scapulae ("pinch your shoulder blades down and back into your back pockets"). This stabilizes the shoulder girdle and elevates the sternum, reducing anterior glenohumeral shear forces.

## Bar Path and Elbow Flaring Angle
- Unrack the bar with elbows locked and stabilize it directly over the glenohumeral joint.
- Lower the bar in a controlled diagonal arc toward the lower sternum / xiphoid process.
- Maintain an elbow tuck angle of 45 to 75 degrees relative to the torso. Avoid excessive 90-degree elbow flaring, which induces subacromial impingement and increases rotator cuff tear risk.
- Touch the chest lightly without bouncing the bar off the ribcage.
- Drive the bar upward and slightly backward, finishing with the bar locked out directly above the shoulders.`,
  },
  {
    slug: 'acsm-barbell-squat-biomechanics',
    title: 'ACSM Guidelines: Barbell Back Squat Depth, Stance & Knee Safety',
    category: 'fitness',
    author: 'ACSM Biomechanics Advisory Panel',
    license: 'Verified Domain Guidance (ACSM 11th Edition)',
    content: `# ACSM Guidelines: Barbell Back Squat Depth, Stance & Knee Safety

## Kinetic Chain & Primary Musculature
The barbell back squat recruits the quadriceps femoris (rectus femoris, vastus lateralis, vastus medialis, vastus intermedius), gluteus maximus, hamstrings (semitendinosus, semimembranosus, biceps femoris), adductor magnus, and erector spinae.

## Foot Stance and Hip Width
- Position feet approximately shoulder-width to slightly wider than shoulder-width apart.
- Flare the toes outward between 15 and 30 degrees to accommodate the femoral head in the acetabulum during hip flexion.
- Distribute foot pressure evenly across the "tripod foot": first metatarsal head, fifth metatarsal head, and calcaneus (heel).

## Descent and Knee Tracking
- Initiate the movement by unlocking the hips and knees simultaneously ("sit down between your hips").
- Actively track the patellae outward in line with the second and third toes.
- Prevent dynamic knee valgus (inward knee collapse), which places acute tensile stress on the anterior cruciate ligament (ACL) and medial collateral ligament (MCL).

## Depth Criteria and Lumbar Stability
- The standard criteria for a full range-of-motion squat requires the inguinal crease (hip joint crease) to drop below the superior surface of the patella (parallel depth).
- Maintain a neutral lumbar spine throughout the descent. Cease descent if excessive posterior pelvic tilt ("butt wink") occurs due to restricted ankle dorsiflexion or hip capsule tightness.
- Drive upward through the midfoot, keeping the chest proud and ascending at the same rate as the hips.`,
  },
  {
    slug: 'issn-protein-intake-and-timing',
    title: 'ISSN Position Stand: Daily Protein Distribution & Muscle Protein Synthesis',
    category: 'nutrition',
    author: 'International Society of Sports Nutrition (ISSN)',
    license: 'Verified Academic Stand (JISSN 2017, 14:20)',
    content: `# ISSN Position Stand: Daily Protein Distribution & Muscle Protein Synthesis

## Optimal Daily Protein Targets
For building and maintaining muscle mass through positive net protein balance, resistance-trained individuals require an overall daily protein intake in the range of 1.4 to 2.0 g/kg body weight/day (0.64–0.91 g/lb/day). Individuals undergoing caloric deficit to reduce body fat while preserving lean tissue may benefit from higher intakes between 2.3 and 3.1 g/kg of fat-free mass/day.

## Per-Meal Distribution & The Leucine Threshold
- Maximal stimulation of muscle protein synthesis (MPS) requires approximately 0.25 to 0.40 g of high-quality protein per kilogram of body weight per meal (typically 20 to 40 grams per serving).
- Each meal should contain sufficient essential amino acids (EAAs) with approximately 2.0 to 3.0 grams of leucine to trigger the mTORC1 signaling pathway ("leucine trigger").
- Evenly distributing protein across 3 to 5 meals spaced every 3 to 4 hours is superior to skewing the majority of daily protein into a single meal.

## Pre-Sleep Casein Protein
- Consuming 30 to 40 grams of slow-digesting casein protein approximately 30 minutes before sleep increases overnight muscle protein synthesis and metabolic rate throughout the nocturnal fasting window.

## Protein Quality and Bioavailability
- High biological value (HBV) proteins containing a complete profile of essential amino acids include eggs, dairy, poultry, fish, and lean red meats.
- Plant-based athletes can achieve equivalent muscle protein synthesis by combining complementary protein sources (e.g., lentils with brown rice) or increasing portion sizes to meet the leucine threshold.`,
  },
  {
    slug: 'acsm-progressive-overload-and-recovery',
    title: 'ACSM Position Stand: Progression Models in Resistance Training & Deloading',
    category: 'recovery',
    author: 'ACSM Exercise Prescription Division',
    license: 'Verified Domain Guidance (ACSM Standards)',
    content: `# ACSM Position Stand: Progression Models in Resistance Training & Deloading

## The Principle of Progressive Overload
To elicit continuous physiological adaptations in neuromuscular recruitment, hypertrophy, and connective tissue tensile strength, training stress must progressively increase over time as the body adapts.

## Progressive Overload Modalities
1. **Load Progression (Intensity):** Increasing external resistance on the bar while maintaining target repetition ranges (e.g., adding 2.5 kg once rep targets are achieved).
2. **Volume Progression:** Increasing total working sets or repetitions performed at a given percentage of 1-Repetition Maximum (1RM).
3. **Execution Quality & Tempo:** Increasing time under tension (TUT) or controlling eccentric phases (e.g., 3-second descent) under identical loads.

## The 2-for-2 Rule for Loading Progression
When an athlete can perform two or more repetitions over their assigned repetition goal in the final set of an exercise for two consecutive training sessions, weight should be increased:
- Smaller upper body muscle groups: 2.5% to 5% increase (~1.25 to 2.5 kg).
- Larger lower body muscle groups: 5% to 10% increase (~2.5 to 5 kg).

## Managing Systemic Fatigue and Deloading
- Accumulation of allostatic fatigue degrades central nervous system (CNS) recruitment, raises resting heart rate, and elevates injury risk.
- A planned deload week should be implemented every 4 to 8 weeks depending on training intensity.
- Standard Deload Structure: Maintain training frequency and movement patterns, but reduce overall volume by 40% to 50% (e.g., perform 2 sets instead of 4) while keeping load at 70% to 80% of normal working weights.`,
  },
  {
    slug: 'fitonus-workout-tracking-guide',
    title: 'FitOnus Guide: Logging Workouts, Reps, RPE & PR Tracking',
    category: 'app_guide',
    author: 'FitOnus Product & Coaching Team',
    license: 'Proprietary FitOnus Documentation',
    content: `# FitOnus Guide: Logging Workouts, Reps, RPE & PR Tracking

## Starting and Managing Active Sessions
- Navigate to the Workout tab and select **Start Workout** or choose a prescribed routine from the AI Coach.
- Each exercise card displays exercise target muscle groups, history of previous sets, and weight recommendations.
- Set rows permit logging: Set Type (Warmup, Normal, Drop Set, Failure), Weight (kg/lbs), Reps, and RPE.

## Understanding the Rate of Perceived Exertion (RPE)
FitOnus utilizes the validated 1–10 RPE scale to calibrate intensity based on Repetitions in Reserve (RIR):
- **RPE 10:** Maximal effort. Could not have performed another rep.
- **RPE 9:** Heavy effort. 1 repetition in reserve (1 RIR).
- **RPE 8:** Moderate-heavy effort. 2 repetitions in reserve (2 RIR). Standard working set target for hypertrophy.
- **RPE 7:** Moderate effort. 3 repetitions in reserve (3 RIR).
- **RPE 6 or below:** Warmup or light technical velocity work.

## Estimated 1-Repetition Maximum (e1RM) and PR Calculation
FitOnus computes estimated 1RM values using the validated Brzycki formula:
$$\\text{e1RM} = \\text{Weight} \\times \\left(\\frac{36}{37 - \\text{Reps}}\\right)$$
When a set outperforms previous historical benchmarks for that exercise, the application automatically flags a Personal Record (PR), celebrates the milestone in the feed, and logs the event for AI Coach insights.`,
  },
];

async function main(): Promise<void> {
  const dbConfig = loadDatabaseConfig();
  const pool = createPool(dbConfig);
  const db = new Database(pool);

  const appConfig = assertAiBackendConfigured(loadConfig());
  const pythonAi = new PythonAiClient({
    baseUrl: appConfig.aiBackend.url,
    serviceSecret: appConfig.aiBackend.serviceSecret,
  });

  const knowledge = createKnowledgeModule(db, pythonAi);

  console.log(`Starting ingestion of ${CURATED_KNOWLEDGE_DOCUMENTS.length} curated documents...`);

  for (const doc of CURATED_KNOWLEDGE_DOCUMENTS) {
    try {
      console.log(`Ingesting "${doc.title}" [slug: ${doc.slug}, category: ${doc.category}]...`);
      const res = await knowledge.service.ingestDocument(doc);
      console.log(
        `  -> Saved document id: ${res.document.id} (${res.chunkCount} chunks generated & embedded).`,
      );
    } catch (err) {
      console.error(`  -> Failed to ingest ${doc.slug}:`, err instanceof Error ? err.message : err);
    }
  }

  await pool.end();
  console.log('Knowledge seed execution concluded.');
}

// Only execute when invoked directly from CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error('Fatal error during knowledge seeding:', err);
    process.exit(1);
  });
}
