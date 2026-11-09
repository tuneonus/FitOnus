-- Migration: 0015_create_gemini_management.sql
-- Description: Centralized Gemini API key management, dynamic model configuration, pricing and token usage telemetry

CREATE TABLE IF NOT EXISTS gemini_config (
    provider VARCHAR(32) PRIMARY KEY DEFAULT 'google_gemini',
    encrypted_api_key TEXT,
    key_mask VARCHAR(32),
    previous_encrypted_api_key TEXT,
    previous_key_mask VARCHAR(32),
    default_model VARCHAR(64) NOT NULL DEFAULT 'gemini-2.5-flash',
    coach_model VARCHAR(64),
    meal_photo_model VARCHAR(64),
    voice_meal_model VARCHAR(64),
    workout_generator_model VARCHAR(64),
    version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial Gemini Configuration with default Gemini 2.5 Flash models
INSERT INTO gemini_config (
    provider,
    default_model,
    coach_model,
    meal_photo_model,
    voice_meal_model,
    workout_generator_model,
    version
) VALUES (
    'google_gemini',
    'gemini-2.5-flash',
    'gemini-2.5-flash',
    'gemini-2.5-flash',
    'gemini-2.5-flash',
    'gemini-2.5-flash',
    1
) ON CONFLICT (provider) DO NOTHING;

-- Official Gemini pricing configuration for token cost estimation
CREATE TABLE IF NOT EXISTS gemini_pricing (
    model VARCHAR(64) PRIMARY KEY,
    input_price_per_million NUMERIC(10, 4) NOT NULL,
    output_price_per_million NUMERIC(10, 4) NOT NULL,
    cached_input_price_per_million NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    pricing_source VARCHAR(64) NOT NULL DEFAULT 'Google Cloud Gemini Official',
    effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed current Google Cloud Gemini pricing tiers (USD per 1,000,000 tokens)
INSERT INTO gemini_pricing (model, input_price_per_million, output_price_per_million, cached_input_price_per_million) VALUES
    ('gemini-2.5-flash', 0.0750, 0.3000, 0.01875),
    ('gemini-2.5-flash-lite', 0.0375, 0.1500, 0.009375),
    ('gemini-2.5-pro', 1.2500, 5.0000, 0.3125),
    ('gemini-2.0-flash', 0.0750, 0.3000, 0.01875),
    ('gemini-1.5-flash', 0.0750, 0.3000, 0.01875),
    ('gemini-1.5-pro', 1.2500, 5.0000, 0.3125)
ON CONFLICT (model) DO UPDATE SET
    input_price_per_million = EXCLUDED.input_price_per_million,
    output_price_per_million = EXCLUDED.output_price_per_million,
    cached_input_price_per_million = EXCLUDED.cached_input_price_per_million,
    effective_date = NOW();

-- Granular Gemini API request & token usage tracking events
CREATE TABLE IF NOT EXISTS gemini_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(64) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    feature VARCHAR(32) NOT NULL,
    model VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    input_tokens INT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    cached_tokens INT NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
    total_tokens INT NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
    estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000 CHECK (estimated_cost_usd >= 0),
    duration_ms INT NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    error_category VARCHAR(64),
    provider_request_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gemini_usage_created_at ON gemini_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gemini_usage_feature_date ON gemini_usage_events(feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gemini_usage_model_date ON gemini_usage_events(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gemini_usage_status ON gemini_usage_events(status);
