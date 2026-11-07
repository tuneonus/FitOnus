export interface WaterIntakeProps {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  amountMl: number;
  loggedAt?: Date;
  createdAt?: Date;
}

export class WaterIntake {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  readonly amountMl: number;
  readonly loggedAt: Date;
  readonly createdAt: Date;

  constructor(props: WaterIntakeProps) {
    if (!props.id) throw new Error('WaterIntake id is required');
    if (!props.userId) throw new Error('WaterIntake userId is required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(props.date)) {
      throw new Error(`Invalid water date format "${props.date}". Expected YYYY-MM-DD.`);
    }
    if (props.amountMl <= 0) {
      throw new Error(`Water amount in ml must be greater than 0, received ${props.amountMl}`);
    }

    this.id = props.id;
    this.userId = props.userId;
    this.date = props.date;
    this.amountMl = Math.round(props.amountMl);
    this.loggedAt = props.loggedAt ?? new Date();
    this.createdAt = props.createdAt ?? new Date();
  }

  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }
}
