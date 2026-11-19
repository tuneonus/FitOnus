-- Migration: 0020_add_gemini_fallback_model.sql
-- Description: Add configurable fallback model to gemini_config and register gemini-3.1-flash-lite pricing

ALTER TABLE gemini_config
ADD COLUMN IF NOT EXISTS fallback_model VARCHAR(64) DEFAULT 'gemini-3.1-flash-lite';

-- Update existing config row to ensure preferred default and fallback models
UPDATE gemini_config
SET fallback_model = 'gemini-3.1-flash-lite'
WHERE fallback_model IS NULL;

-- Register pricing for verified models in gemini_pricing
INSERT INTO gemini_pricing (model, input_price_per_million, output_price_per_million, cached_input_price_per_million, pricing_source)
VALUES
    ('gemini-3.5-flash-lite', 0.0500, 0.2000, 0.0125, 'Google AI Studio Official'),
    ('gemini-3.1-flash-lite', 0.0500, 0.2000, 0.0125, 'Google AI Studio Official'),
    ('gemini-3.5-flash', 0.1000, 0.4000, 0.0250, 'Google AI Studio Official')
ON CONFLICT (model) DO UPDATE SET
    input_price_per_million = EXCLUDED.input_price_per_million,
    output_price_per_million = EXCLUDED.output_price_per_million,
    cached_input_price_per_million = EXCLUDED.cached_input_price_per_million;
