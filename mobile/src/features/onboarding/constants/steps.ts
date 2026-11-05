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
}[] = [
  {
    id: 'intro',
    title: 'Let’s build your coach',
    subtitle: 'Two minutes now saves you weeks of generic advice.',
  },
  { id: 'personal', title: 'What should we call you?' },
  {
    id: 'dob',
    title: 'When were you born?',
    subtitle: 'Age adjusts heart-rate zones and calorie needs.',
  },
  { id: 'height', title: 'How tall are you?' },
  {
    id: 'weight',
    title: 'What do you weigh today?',
    subtitle: 'An estimate is fine — you can log precisely later.',
  },
  { id: 'experience', title: 'How experienced are you?' },
  {
    id: 'goal',
    title: 'What’s your main goal?',
    subtitle: 'You can add more goals later.',
  },
  { id: 'workoutPreference', title: 'Where do you like to train?' },
  {
    id: 'equipment',
    title: 'What equipment can you use?',
    subtitle: 'Select all that apply.',
  },
  { id: 'duration', title: 'How long per workout?' },
  {
    id: 'food',
    title: 'How do you like to eat?',
    subtitle: 'Your coach remembers this for meal suggestions.',
  },
  {
    id: 'health',
    title: 'Connect your health data',
    subtitle: 'Choose what FitOnus can read.',
    skippable: true,
  },
  {
    id: 'device',
    title: 'Connect a device',
    subtitle: 'For heart rate, HRV and sleep.',
    skippable: true,
  },
  {
    id: 'confirm',
    title: 'Here’s your plan',
    subtitle: 'Review and adjust anything.',
  },
  { id: 'done', title: 'You’re all set' },
];

