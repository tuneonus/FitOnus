/**
 * Lightweight deterministic intent classification for AI Coach Context Engineering.
 * FitOnus Phase 08: Context Engineering — Stage 03.
 *
 * Supports English, Tamil script, and Tanglish (Tamil in Latin script).
 * Categorizes queries to selectively route context retrieval (e.g. skip RAG for greetings).
 */

export type CoachQueryIntent =
  'greeting' | 'metric_lookup' | 'exercise_coaching' | 'nutrition_coaching' | 'general';

export interface IntentRoutingDecision {
  intent: CoachQueryIntent;
  shouldRetrieveRag: boolean;
  shouldRetrieveMemories: boolean;
  categoryBoost?: 'workout' | 'injuries' | 'food' | 'supplements' | null;
}

// Regex patterns for pure greetings and acknowledgments
const RE_PURE_GREETING_EN =
  /^(?:(?:hi|hello|hey|good\s+(?:morning|afternoon|evening|day)|thanks?(?:\s+(?:so\s+much|a\s+lot|you))?|thank\s+you(?:\s+so\s+much|\s+very\s+much)?|thx|ty|bye|goodbye|cya|ok|okay|cool|awesome|great|cheers|sup|yo)(?:[\s,]+(?:coach|bye|thanks|thank\s+you|ok|okay))?)(?:[!?.\s]*)$/i;
const RE_GREETING_PREFIX_EN = /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening))\b/i;

// Tamil script pure greetings (avoid ASCII \b which fails on Unicode Tamil)
const RE_PURE_GREETING_TA =
  /^(?:வணக்கம்|நன்றி|சரி|காலை\s*வணக்கம்|மாலை\s*வணக்கம்|சூப்பர்|வணக்கம்க்கா|வணக்கம்பா|ரொம்ப\s*நன்றி)(?:[\s!?.]*)$/u;

// Tanglish pure greetings
const RE_PURE_GREETING_TL =
  /^(?:vanakkam|nanri|nandri|kaalai\s*vanakkam|romba\s*nanri|seri|super|mikka\s*nanri)(?:[\s,]+coach)?(?:[!?.\s]*)$/i;

// Metric lookup patterns (personal stats, logs, today's metrics)
const RE_METRICS_EN =
  /\b(?:how\s+much\s+water|water\s+intake|calories?\s+burned|calories?\s+consumed|calories?\s+intake|calorie\s+target|protein\s+target|my\s+weight|current\s+weight|target\s+weight|how\s+many\s+calories\s+left|today'?s\s+workout|planned\s+workout|how\s+much\s+protein\s+today|water\s+logged|logged\s+meals?|logged\s+workouts?|active\s+goals?)\b/i;
const RE_METRICS_TA =
  /(?:தண்ணீர்\s*அளவு|எடை\s*என்ன|இன்றைய\s*கலோரி|புரத\s*அளவு|இலக்கு\s*எடை|உடற்பயிற்சி\s*திட்டம்)/u;
const RE_METRICS_TL =
  /\b(?:evlo\s+thanni|evvalo\s+thanni|innaiku\s+thanni|enna\s+weight|calorie\s+evlo|calorie\s+evvalo|protein\s+intake\s+evlo|target\s+weight\s+enna|innaiku\s+calorie|weight\s+evlo)\b/i;

// Exercise and injury coaching patterns
const RE_EXERCISE_EN =
  /\b(?:workout|exercise|squat|squats|bench|bench\s+press|deadlift|deadlifts|press|curl|curls|lunge|lunges|pull-?up|pull-?ups|push-?up|push-?ups|cardio|running|lift|lifting|hypertrophy|sets?|reps?|form|technique|posture|pain|injury|injuries|shoulder|knee|back|neck|wrist|elbow|ankle|chest|biceps?|triceps?|quads?|hamstrings?|glutes?|calves|soreness)\b/i;
const RE_EXERCISE_TA =
  /(?:உடற்பயிற்சி|வலி|காயம்|தோள்பட்டை|முட்டி|முழங்கால்|இடுப்பு|முதுகு|சுளுக்கு|மார்பு|தசை|பிடிப்பு)/u;
const RE_EXERCISE_TL =
  /\b(?:workout|exercise|vali|valikuthu|kaayam|tholpattai|mutti|iduppu|mudhugu|udambu|soreness|thasai|pidippu)\b/i;

// Specific injury/pain patterns for safety priority elevation
const RE_INJURY_SPECIFIC =
  /\b(?:pain|hurt|hurts|injury|injured|sore|sprain|strain|tear|impingement|tendonitis|vali|valikuthu|kaayam|சுளுக்கு|வலி|காயம்)\b/i;

// Nutrition and dietary coaching patterns
const RE_NUTRITION_EN =
  /\b(?:diet|food|eat|eating|calories?|carbs?|fat|protein|whey|creatine|supplements?|meals?|breakfast|lunch|dinner|snacks?|fasting|allergy|allergies|chicken|eggs?|rice|fish|paneer|tofu|milk|oats|nutrition|macros?)\b/i;
const RE_NUTRITION_TA = /(?:உணவு|சாப்பாடு|புரதம்|முட்டை|பால்|பசி|டயட்|கலோரி|ஊட்டச்சத்து)/u;
const RE_NUTRITION_TL =
  /\b(?:saapadu|unavu|muttai|diet|saapdalama|pasikuthu|protein|calorie|paruppu|kaikari)\b/i;

/**
 * Classifies user inquiry into one of five deterministic categories.
 */
export function classifyCoachQueryIntent(message: string): CoachQueryIntent {
  const trimmed = message.trim();
  if (!trimmed) return 'general';

  // 1. Pure greeting check (e.g. "hi", "good morning", "vanakkam")
  if (
    RE_PURE_GREETING_EN.test(trimmed) ||
    RE_PURE_GREETING_TA.test(trimmed) ||
    RE_PURE_GREETING_TL.test(trimmed)
  ) {
    return 'greeting';
  }

  // Short prefix check: "Hi coach!" vs "Hi coach, can I do squats?"
  if (
    trimmed.length < 35 &&
    (RE_GREETING_PREFIX_EN.test(trimmed) ||
      trimmed.startsWith('வணக்கம்') ||
      trimmed.toLowerCase().startsWith('vanakkam')) &&
    !RE_EXERCISE_EN.test(trimmed) &&
    !RE_NUTRITION_EN.test(trimmed) &&
    !RE_METRICS_EN.test(trimmed)
  ) {
    return 'greeting';
  }

  // 2. Personal metric lookups (water, weight, calories today)
  if (RE_METRICS_EN.test(trimmed) || RE_METRICS_TA.test(trimmed) || RE_METRICS_TL.test(trimmed)) {
    return 'metric_lookup';
  }

  // 3. Exercise and injury coaching
  if (RE_EXERCISE_EN.test(trimmed) || RE_EXERCISE_TA.test(trimmed) || RE_EXERCISE_TL.test(trimmed)) {
    return 'exercise_coaching';
  }

  // 4. Nutrition coaching
  if (RE_NUTRITION_EN.test(trimmed) || RE_NUTRITION_TA.test(trimmed) || RE_NUTRITION_TL.test(trimmed)) {
    return 'nutrition_coaching';
  }

  return 'general';
}

/**
 * Resolves context retrieval permissions and category boost based on query intent.
 */
export function routeCoachQueryIntent(message: string): IntentRoutingDecision {
  const intent = classifyCoachQueryIntent(message);

  switch (intent) {
    case 'greeting':
      return {
        intent: 'greeting',
        shouldRetrieveRag: false,
        shouldRetrieveMemories: false,
        categoryBoost: null,
      };
    case 'metric_lookup':
      return {
        intent: 'metric_lookup',
        shouldRetrieveRag: false,
        shouldRetrieveMemories: true,
        categoryBoost: null,
      };
    case 'exercise_coaching': {
      const isInjury = RE_INJURY_SPECIFIC.test(message);
      return {
        intent: 'exercise_coaching',
        shouldRetrieveRag: true,
        shouldRetrieveMemories: true,
        categoryBoost: isInjury ? 'injuries' : 'workout',
      };
    }
    case 'nutrition_coaching':
      return {
        intent: 'nutrition_coaching',
        shouldRetrieveRag: true,
        shouldRetrieveMemories: true,
        categoryBoost: 'food',
      };
    case 'general':
    default:
      return {
        intent: 'general',
        shouldRetrieveRag: true,
        shouldRetrieveMemories: true,
        categoryBoost: null,
      };
  }
}
