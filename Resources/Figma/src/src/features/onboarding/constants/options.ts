import {
  BikeIcon,
  BuildingIcon,
  DumbbellIcon,
  FootprintsIcon,
  HouseIcon,
  MedalIcon,
  MountainIcon,
  ScaleIcon,
  ShuffleIcon,
  SproutIcon,
  TimerIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TreesIcon } from
'lucide-react';

export const fitnessGoals = [
{ value: 'lose', label: 'Lose weight', description: 'Steady fat loss while keeping muscle', icon: TrendingDownIcon },
{ value: 'gain', label: 'Gain muscle', description: 'Lean bulk with progressive overload', icon: TrendingUpIcon },
{ value: 'maintain', label: 'Maintain weight', description: 'Stay where you are, feel better', icon: ScaleIcon },
{ value: 'strength', label: 'Improve strength', description: 'Bigger lifts on the main movements', icon: DumbbellIcon },
{ value: '5k', label: 'Run 5K', description: 'Build to a continuous 5K', icon: FootprintsIcon },
{ value: '10k', label: 'Run 10K', description: 'Faster and further', icon: TimerIcon },
{ value: 'marathon', label: 'Marathon preparation', description: '16–20 week structured build', icon: MedalIcon }] as
const;

export type FitnessGoal = (typeof fitnessGoals)[number]['value'];

export const experienceLevels = [
{ value: 'beginner', label: 'Beginner', description: 'New to training or back after a long break' },
{ value: 'intermediate', label: 'Intermediate', description: 'Training consistently for 1–3 years' },
{ value: 'advanced', label: 'Advanced', description: '3+ years, comfortable with heavy compound lifts' }] as
const;

export const workoutPlaces = [
{ value: 'gym', label: 'Gym', description: 'Full equipment access', icon: BuildingIcon },
{ value: 'home', label: 'Home', description: 'Limited equipment', icon: HouseIcon },
{ value: 'outdoor', label: 'Outdoors', description: 'Running, cycling, calisthenics', icon: TreesIcon },
{ value: 'mixed', label: 'A mix', description: 'Depends on the day', icon: ShuffleIcon }] as
const;

export const equipmentOptions = ['Barbell', 'Dumbbells', 'Kettlebells', 'Cable machine', 'Pull-up bar', 'Resistance bands', 'Bench', 'Treadmill', 'Bike', 'None'];

export const durationOptions = [30, 45, 60, 75];

export const dietOptions = [
{ value: 'none', label: 'No preference', icon: MountainIcon },
{ value: 'vegetarian', label: 'Vegetarian', icon: SproutIcon },
{ value: 'eggetarian', label: 'Eggetarian', icon: SproutIcon },
{ value: 'vegan', label: 'Vegan', icon: SproutIcon },
{ value: 'pescatarian', label: 'Pescatarian', icon: BikeIcon }];


export const allergyOptions = ['Peanuts', 'Tree nuts', 'Dairy', 'Gluten', 'Soy', 'Shellfish', 'Eggs'];

export const cuisineOptions = ['North Indian', 'South Indian', 'Mediterranean', 'East Asian', 'Continental'];