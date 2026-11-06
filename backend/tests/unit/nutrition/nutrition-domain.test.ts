import { describe, expect, it } from 'vitest';
import { Food } from '../../../src/modules/nutrition/domain/food.js';
import { Meal, MealItem } from '../../../src/modules/nutrition/domain/meal.js';
import { WaterIntake } from '../../../src/modules/nutrition/domain/water.js';
import { FoodFavorite } from '../../../src/modules/nutrition/domain/favorite.js';

describe('Nutrition Domain Entities', () => {
  const validFoodProps = {
    id: 'f0000000-0000-4000-8000-000000000001',
    name: 'Chicken Breast, boneless, skinless, raw',
    brand: null,
    barcode: '123456789012',
    servingSize: 100,
    servingUnit: 'g',
    servingWeightG: 100.0,
    servingBasis: '100g' as const,
    calories: 120.0,
    proteinG: 22.5,
    carbohydratesG: 0.0,
    fatG: 2.62,
    fiberG: 0.0,
    dataSource: 'usda_fdc' as const,
    sourceId: '171077',
    isCustom: false,
    isVerified: true,
    verificationStatus: 'verified' as const,
    createdBy: null,
  };

  describe('Food Entity', () => {
    it('instantiates valid verified food correctly', () => {
      const food = new Food(validFoodProps);
      expect(food.id).toBe(validFoodProps.id);
      expect(food.name).toBe(validFoodProps.name);
      expect(food.isVerified).toBe(true);
      expect(food.isCustom).toBe(false);
      expect(food.createdBy).toBeNull();
    });

    it('instantiates valid custom food correctly', () => {
      const customFood = new Food({
        ...validFoodProps,
        id: 'c1111111-1111-4111-8111-111111111111',
        name: 'Home Protein Shake',
        isCustom: true,
        isVerified: false,
        verificationStatus: 'unverified',
        createdBy: 'u1111111-1111-4111-8111-111111111111',
        dataSource: 'user_custom',
        sourceId: null,
      });

      expect(customFood.isCustom).toBe(true);
      expect(customFood.isVerified).toBe(false);
      expect(customFood.createdBy).toBe('u1111111-1111-4111-8111-111111111111');
      expect(customFood.isOwnedBy('u1111111-1111-4111-8111-111111111111')).toBe(true);
      expect(customFood.isOwnedBy('u2222222-2222-4222-8222-222222222222')).toBe(false);
    });

    it('rejects verified food with a user creator or marked custom', () => {
      expect(
        () =>
          new Food({
            ...validFoodProps,
            isVerified: true,
            isCustom: true,
            createdBy: 'u1111111-1111-4111-8111-111111111111',
          }),
      ).toThrow(/Verified food must be system-curated/);
    });

    it('rejects custom food without a creator or marked verified', () => {
      expect(
        () =>
          new Food({
            ...validFoodProps,
            isCustom: true,
            isVerified: false,
            createdBy: null,
          }),
      ).toThrow(/Custom food must belong to a specific user/);
    });

    it('rejects invalid numerical constraints', () => {
      expect(() => new Food({ ...validFoodProps, servingSize: 0 })).toThrow(/greater than 0/);
      expect(() => new Food({ ...validFoodProps, servingWeightG: -10 })).toThrow(/greater than 0/);
      expect(() => new Food({ ...validFoodProps, calories: -5 })).toThrow(/cannot be negative/);
    });

    it('enforces privacy visibility rules', () => {
      const verified = new Food(validFoodProps);
      const custom = new Food({
        ...validFoodProps,
        id: 'c1111111-1111-4111-8111-111111111111',
        isCustom: true,
        isVerified: false,
        verificationStatus: 'unverified',
        createdBy: 'user-a',
      });
      const deletedCustom = new Food({
        ...validFoodProps,
        id: 'c2222222-2222-4222-8222-222222222222',
        isCustom: true,
        isVerified: false,
        verificationStatus: 'unverified',
        createdBy: 'user-a',
        deletedAt: new Date(),
      });

      // Verified is visible to all
      expect(verified.isVisibleTo(null)).toBe(true);
      expect(verified.isVisibleTo('user-a')).toBe(true);
      expect(verified.isVisibleTo('user-b')).toBe(true);

      // Custom is visible ONLY to its creator
      expect(custom.isVisibleTo('user-a')).toBe(true);
      expect(custom.isVisibleTo('user-b')).toBe(false);
      expect(custom.isVisibleTo(null)).toBe(false);

      // Deleted food is visible to no one
      expect(deletedCustom.isVisibleTo('user-a')).toBe(false);
    });
  });

  describe('Meal & MealItem Entities', () => {
    it('creates MealItem and enforces snapshot integrity', () => {
      const item = new MealItem({
        id: 'i1111111-1111-4111-8111-111111111111',
        mealId: 'm1111111-1111-4111-8111-111111111111',
        foodId: validFoodProps.id,
        foodName: validFoodProps.name,
        foodBrand: null,
        servingSize: 100,
        servingUnit: 'g',
        servingWeightG: 100,
        servingMultiplier: 1.5,
        loggedWeightG: 150,
        calories: 180.0,
        proteinG: 33.75,
        carbsG: 0.0,
        fatG: 3.93,
        fiberG: 0.0,
      });

      expect(item.calories).toBe(180.0);
      expect(item.servingMultiplier).toBe(1.5);
      expect(item.loggedWeightG).toBe(150);
    });

    it('creates Meal and automatically calculates totals from items', () => {
      const item1 = new MealItem({
        id: 'i1111111-1111-4111-8111-111111111111',
        mealId: 'm1111111-1111-4111-8111-111111111111',
        foodId: validFoodProps.id,
        foodName: 'Chicken Breast',
        servingSize: 100,
        servingUnit: 'g',
        servingWeightG: 100,
        servingMultiplier: 1.0,
        loggedWeightG: 100,
        calories: 120.0,
        proteinG: 22.5,
        carbsG: 0.0,
        fatG: 2.62,
        fiberG: 0.0,
      });

      const item2 = new MealItem({
        id: 'i2222222-2222-4222-8222-222222222222',
        mealId: 'm1111111-1111-4111-8111-111111111111',
        foodId: null,
        foodName: 'Cooked White Rice',
        servingSize: 100,
        servingUnit: 'g',
        servingWeightG: 100,
        servingMultiplier: 1.5,
        loggedWeightG: 150,
        calories: 195.0,
        proteinG: 3.5,
        carbsG: 42.0,
        fatG: 0.4,
        fiberG: 0.6,
      });

      const meal = new Meal({
        id: 'm1111111-1111-4111-8111-111111111111',
        userId: 'u1111111-1111-4111-8111-111111111111',
        mealType: 'lunch',
        date: '2026-11-05',
        items: [item1, item2],
      });

      // 120 + 195 = 315.0
      expect(meal.totalCalories).toBe(315.0);
      // 22.5 + 3.5 = 26.0
      expect(meal.totalProteinG).toBe(26.0);
      expect(meal.totalCarbsG).toBe(42.0);
      expect(meal.totalFatG).toBe(3.02);
      expect(meal.totalFiberG).toBe(0.6);
      expect(meal.isOwnedBy('u1111111-1111-4111-8111-111111111111')).toBe(true);
    });

    it('rejects invalid mealType or malformed date', () => {
      expect(
        () =>
          new Meal({
            id: 'm1111111-1111-4111-8111-111111111111',
            userId: 'u1111111-1111-4111-8111-111111111111',
            mealType: 'second_breakfast' as any,
            date: '2026-11-05',
          }),
      ).toThrow(/Invalid mealType/);

      expect(
        () =>
          new Meal({
            id: 'm1111111-1111-4111-8111-111111111111',
            userId: 'u1111111-1111-4111-8111-111111111111',
            mealType: 'dinner',
            date: '05/11/2026',
          }),
      ).toThrow(/Invalid meal date format/);
    });
  });

  describe('WaterIntake Entity', () => {
    it('creates WaterIntake correctly and enforces positive volume', () => {
      const water = new WaterIntake({
        id: 'w1111111-1111-4111-8111-111111111111',
        userId: 'u1111111-1111-4111-8111-111111111111',
        date: '2026-11-05',
        amountMl: 250,
      });

      expect(water.amountMl).toBe(250);
      expect(water.date).toBe('2026-11-05');
      expect(water.isOwnedBy('u1111111-1111-4111-8111-111111111111')).toBe(true);

      expect(
        () =>
          new WaterIntake({
            id: 'w1111111-1111-4111-8111-111111111111',
            userId: 'u1111111-1111-4111-8111-111111111111',
            date: '2026-11-05',
            amountMl: 0,
          }),
      ).toThrow(/must be greater than 0/);
    });
  });

  describe('FoodFavorite Entity', () => {
    it('creates FoodFavorite correctly', () => {
      const fav = new FoodFavorite({
        id: 'fav11111-1111-4111-8111-111111111111',
        userId: 'u1111111-1111-4111-8111-111111111111',
        foodId: validFoodProps.id,
      });

      expect(fav.userId).toBe('u1111111-1111-4111-8111-111111111111');
      expect(fav.foodId).toBe(validFoodProps.id);
      expect(fav.isOwnedBy('u1111111-1111-4111-8111-111111111111')).toBe(true);
    });
  });
});

