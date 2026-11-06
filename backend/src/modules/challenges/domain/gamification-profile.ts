import { calculateLevel, type LevelInfo } from './level-calculator.js';

export interface GamificationProfileProps {
  userId: string;
  totalPoints: number;
  currentLevel: number;
  badgesCount: number;
  challengesWon: number;
  updatedAt: Date;
}

export class GamificationProfile {
  readonly userId: string;
  private _totalPoints: number;
  private _currentLevel: number;
  private _badgesCount: number;
  private _challengesWon: number;
  private _updatedAt: Date;

  constructor(props: GamificationProfileProps) {
    if (!props.userId) throw new Error('GamificationProfile userId is required');

    this.userId = props.userId;
    this._totalPoints = Math.max(0, Math.floor(props.totalPoints));
    this._currentLevel = Math.max(1, props.currentLevel || 1);
    this._badgesCount = Math.max(0, props.badgesCount || 0);
    this._challengesWon = Math.max(0, props.challengesWon || 0);
    this._updatedAt = props.updatedAt;
  }

  get totalPoints(): number {
    return this._totalPoints;
  }

  get currentLevel(): number {
    return this._currentLevel;
  }

  get badgesCount(): number {
    return this._badgesCount;
  }

  get challengesWon(): number {
    return this._challengesWon;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  getLevelInfo(): LevelInfo {
    return calculateLevel(this._totalPoints);
  }

  awardPoints(points: number, timestamp: Date = new Date()): void {
    if (points <= 0) return;
    this._totalPoints += Math.floor(points);
    this._currentLevel = calculateLevel(this._totalPoints).level;
    this._updatedAt = timestamp;
  }

  incrementBadges(count = 1, timestamp: Date = new Date()): void {
    if (count <= 0) return;
    this._badgesCount += count;
    this._updatedAt = timestamp;
  }

  incrementChallengesWon(count = 1, timestamp: Date = new Date()): void {
    if (count <= 0) return;
    this._challengesWon += count;
    this._updatedAt = timestamp;
  }
}

