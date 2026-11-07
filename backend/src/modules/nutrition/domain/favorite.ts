export interface FoodFavoriteProps {
  id: string;
  userId: string;
  foodId: string;
  createdAt?: Date;
}

export class FoodFavorite {
  readonly id: string;
  readonly userId: string;
  readonly foodId: string;
  readonly createdAt: Date;

  constructor(props: FoodFavoriteProps) {
    if (!props.id) throw new Error('FoodFavorite id is required');
    if (!props.userId) throw new Error('FoodFavorite userId is required');
    if (!props.foodId) throw new Error('FoodFavorite foodId is required');

    this.id = props.id;
    this.userId = props.userId;
    this.foodId = props.foodId;
    this.createdAt = props.createdAt ?? new Date();
  }

  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }
}
