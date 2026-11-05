export const EXERCISE_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type ExerciseDifficulty = (typeof EXERCISE_DIFFICULTIES)[number];

export interface ExerciseProps {
  id: string;
  name: string;
  description: string | null;
  instructions: string[];
  tips: string[];
  commonMistakes: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  category: string;
  difficulty: ExerciseDifficulty;
  isCompound: boolean;
  imageUrl: string | null;
  videoUrl: string | null;
  createdBy: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class Exercise {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly instructions: readonly string[];
  readonly tips: readonly string[];
  readonly commonMistakes: readonly string[];
  readonly primaryMuscles: readonly string[];
  readonly secondaryMuscles: readonly string[];
  readonly equipment: string;
  readonly category: string;
  readonly difficulty: ExerciseDifficulty;
  readonly isCompound: boolean;
  readonly imageUrl: string | null;
  readonly videoUrl: string | null;
  readonly createdBy: string | null;
  readonly isSystem: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  constructor(props: ExerciseProps) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.instructions = Object.freeze([...props.instructions]);
    this.tips = Object.freeze([...props.tips]);
    this.commonMistakes = Object.freeze([...props.commonMistakes]);
    this.primaryMuscles = Object.freeze([...props.primaryMuscles]);
    this.secondaryMuscles = Object.freeze([...props.secondaryMuscles]);
    this.equipment = props.equipment;
    this.category = props.category;
    this.difficulty = props.difficulty;
    this.isCompound = props.isCompound;
    this.imageUrl = props.imageUrl;
    this.videoUrl = props.videoUrl;
    this.createdBy = props.createdBy;
    this.isSystem = props.isSystem;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt;
  }
}
