export type OnboardingStepId =
  | 'intro'
  | 'personal'
  | 'dob'
  | 'height'
  | 'weight'
  | 'experience'
  | 'goal'
  | 'workoutPreference'
  | 'equipment'
  | 'duration'
  | 'food'
  | 'health'
  | 'device'
  | 'confirm'
  | 'done';

export const onboardingSteps: {
  id: OnboardingStepId;
  title: string;
  subtitle?: string;
  skippable?: boolean;
  hint: string;
}[] = [
  {
    id: 'intro',
    title: 'A plan that feels like you.',
    subtitle: 'A few details about your life. A coach that fits right into it.',
    hint: 'Your goals. Your pace. Your starting point.',
  },
  {
    id: 'personal',
    title: 'First, let’s meet.',
    subtitle: 'What would you like your coach to call you?',
    hint: 'You can update your profile anytime.',
  },
  {
    id: 'dob',
    title: 'When were you born?',
    subtitle: 'Age adjusts heart-rate zones and calorie needs.',
    hint: 'Your birthday stays on your profile.',
  },
  {
    id: 'height',
    title: 'How tall are you?',
    subtitle: 'A small detail that helps personalize your daily targets.',
    hint: 'Tap the number to type your height.',
  },
  {
    id: 'weight',
    title: 'What do you weigh today?',
    subtitle: 'An estimate is fine — you can log precisely later.',
    hint: 'This is a starting point, not a judgment.',
  },
  {
    id: 'experience',
    title: 'Where are you starting?',
    subtitle: 'We’ll meet you at your level and build from there.',
    hint: 'Pick what feels closest to your experience.',
  },
  {
    id: 'goal',
    title: 'What’s your main goal?',
    subtitle: 'You can add more goals later.',
    hint: 'Choose the one that matters most right now.',
  },
  {
    id: 'workoutPreference',
    title: 'Make room for movement.',
    subtitle: 'Choose your favorite place and a schedule that fits your week.',
    hint: 'A realistic routine is a great place to start.',
  },
  {
    id: 'equipment',
    title: 'What equipment can you use?',
    subtitle: 'Select all that apply.',
    hint: 'No equipment? Bodyweight works too.',
  },
  {
    id: 'duration',
    title: 'How much time is yours?',
    subtitle: 'We’ll shape your sessions around your day.',
    hint: 'Choose the time you can make consistently.',
  },
  {
    id: 'food',
    title: 'How do you like to eat?',
    subtitle: 'Your coach remembers this for meal suggestions.',
    hint: 'Choose a style, then add any food restrictions.',
  },
  {
    id: 'health',
    title: 'Connect your health data',
    subtitle: 'Choose what FitOnus can read.',
    skippable: true,
    hint: 'Optional. You can set this up later in Settings.',
  },
  {
    id: 'device',
    title: 'Connect a device',
    subtitle: 'For heart rate, HRV and sleep.',
    skippable: true,
    hint: 'No wearable? You can still use FitOnus.',
  },
  {
    id: 'confirm',
    title: 'Here’s your plan',
    subtitle: 'Review and adjust anything.',
    hint: 'Your plan can change as you do.',
  },
  {
    id: 'done',
    title: 'Your next chapter starts here.',
    subtitle: 'One day at a time. Your coach is in your corner.',
    hint: 'Ready when you are.',
  },
];

export const onboardingSections = [
  { label: 'Welcome', steps: ['intro'] },
  { label: 'About you', steps: ['personal', 'dob', 'height', 'weight'] },
  {
    label: 'Training',
    steps: ['experience', 'goal', 'workoutPreference', 'equipment', 'duration'],
  },
  { label: 'Lifestyle', steps: ['food', 'health', 'device'] },
  { label: 'Your plan', steps: ['confirm', 'done'] },
] as const;
