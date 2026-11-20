"""Meals presentation routes."""

from fastapi import APIRouter

from onusfit_ai.features.meals.presentation import meal_photo, voice_meal

router = APIRouter()
router.include_router(voice_meal.router)
router.include_router(meal_photo.router)

__all__ = ["meal_photo", "router", "voice_meal"]
