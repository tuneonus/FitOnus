import {
  Bike,
  Building,
  Dumbbell,
  Footprints,
  House,
  Award,
  Mountain,
  Scale,
  Shuffle,
  Sprout,
  Timer,
  TrendingDown,
  TrendingUp,
  Trees,
} from 'lucide-react-native';

export const fitnessGoals = [
  {
    value: 'lose',
    label: 'Lose weight',
    description: 'Steady fat loss while keeping muscle',
    icon: TrendingDown,
  },
  {
    value: 'gain',
    label: 'Gain muscle',
    description: 'Lean bulk with progressive overload',
    icon: TrendingUp,
  },
  {
    value: 'maintain',
    label: 'Maintain weight',
    description: 'Stay where you are, feel better',
    icon: Scale,
  },
  {
    value: 'strength',
    label: 'Improve strength',
    description: 'Bigger lifts on the main movements',
    icon: Dumbbell,
  },
  {
    value: '5k',
    label: 'Run 5K',
    description: 'Build to a continuous 5K',
    icon: Footprints,
  },
  {
    value: '10k',
    label: 'Run 10K',
    description: 'Faster and further',
    icon: Timer,
  },
  {
    value: 'marathon',
    label: 'Marathon preparation',
    description: '16–20 week structured build',
    icon: Award,
  },
] as const;

export type FitnessGoal = (typeof fitnessGoals)[number]['value'];

export const experienceLevels = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'New to training or back after a long break',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Training consistently for 1–3 years',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: '3+ years, comfortable with heavy compound lifts',
  },
] as const;

export const workoutPlaces = [
  {
    value: 'gym',
    label: 'Gym',
    description: 'Full equipment access',
    icon: Building,
  },
  {
    value: 'home',
    label: 'Home',
    description: 'Limited equipment',
    icon: House,
  },
  {
    value: 'outdoor',
    label: 'Outdoors',
    description: 'Running, cycling, calisthenics',
    icon: Trees,
  },
  {
    value: 'mixed',
    label: 'A mix',
    description: 'Depends on the day',
    icon: Shuffle,
  },
] as const;

export const equipmentOptions = [
  'Barbell',
  'Dumbbells',
  'Kettlebells',
  'Cable machine',
  'Pull-up bar',
  'Resistance bands',
  'Bench',
  'Treadmill',
  'Bike',
  'None',
];

export const durationOptions = [30, 45, 60, 75];

export const dietOptions = [
  { value: 'none', label: 'No preference', icon: Mountain },
  { value: 'vegetarian', label: 'Vegetarian', icon: Sprout },
  { value: 'eggetarian', label: 'Eggetarian', icon: Sprout },
  { value: 'vegan', label: 'Vegan', icon: Sprout },
  { value: 'pescatarian', label: 'Pescatarian', icon: Bike },
];

export const allergyOptions = [
  'Peanuts',
  'Tree nuts',
  'Dairy',
  'Gluten',
  'Soy',
  'Shellfish',
  'Eggs',
];

export const cuisineOptions = [
  'North Indian',
  'South Indian',
  'Mediterranean',
  'East Asian',
  'Continental',
];
