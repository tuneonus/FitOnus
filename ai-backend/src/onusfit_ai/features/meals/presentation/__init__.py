"""Meals presentation routes."""

from fastapi import APIRouter

from onusfit_ai.features.meals.presentation import meal_photo, multimodal, voice_meal

router = APIRouter()
router.include_router(voice_meal.router)
router.include_router(meal_photo.router)
router.include_router(multimodal.router)

__all__ = ["meal_photo", "multimodal", "router", "voice_meal"]
