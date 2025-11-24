-- ICCR v1.0 Database Schema
-- SQLite database for storing model profiles and routing decisions

-- ============================================================================
-- Model Profiles (Learned Capabilities)
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  
  -- Capabilities (JSON arrays)
  strengths TEXT DEFAULT '[]',  -- ["code_generation", "debugging"]
  weaknesses TEXT DEFAULT '[]', -- ["creative_writing"]
  
  -- Performance metrics
  quality_score REAL DEFAULT 0.7,
  cost_per_1m_tokens REAL DEFAULT 0.0,
  avg_latency_ms INTEGER DEFAULT 0,
  supports_reasoning BOOLEAN DEFAULT 0,
  
  -- Success rates per (intent, complexity)
  -- JSON: {"code_generation_simple": {"rate": 0.9, "count": 50}}
  success_rates TEXT DEFAULT '{}',
  
  -- Metadata
  source TEXT DEFAULT 'learned_from_usage', -- "public_benchmark" | "learned_from_usage" | "user_configured"
  sample_count INTEGER DEFAULT 0,
  last_updated INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  
  UNIQUE(provider, model)
);

CREATE INDEX IF NOT EXISTS idx_profiles_provider_model 
  ON model_profiles(provider, model);
CREATE INDEX IF NOT EXISTS idx_profiles_source 
  ON model_profiles(source);
CREATE INDEX IF NOT EXISTS idx_profiles_updated 
  ON model_profiles(last_updated DESC);

-- ============================================================================
-- Routing Decisions (For Analysis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS routing_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  session_id TEXT,
  timestamp INTEGER NOT NULL,
  
  -- Classification
  intent TEXT,
  complexity TEXT,
  domain TEXT, -- JSON array: ["web_backend", "api"]
  confidence REAL,
  reasoning TEXT,
  
  -- Decision
  selected_provider TEXT NOT NULL,
  selected_model TEXT NOT NULL,
  decision_reasoning TEXT,
  estimated_cost REAL,
  estimated_quality REAL,
  estimated_latency INTEGER,
  
  -- Alternatives (JSON array)
  alternatives TEXT DEFAULT '[]',
  
  UNIQUE(request_id)
);

CREATE INDEX IF NOT EXISTS idx_decisions_timestamp 
  ON routing_decisions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_session 
  ON routing_decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_decisions_model 
  ON routing_decisions(selected_provider, selected_model);
CREATE INDEX IF NOT EXISTS idx_decisions_intent 
  ON routing_decisions(intent, complexity);

-- ============================================================================
-- Routing Outcomes (For Learning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS routing_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  
  -- Actual metrics
  success BOOLEAN NOT NULL,
  quality REAL, -- 0.0-1.0 scale
  actual_cost REAL,
  actual_latency INTEGER,
  
  -- Error tracking
  error_occurred BOOLEAN DEFAULT 0,
  error_message TEXT,
  error_type TEXT,
  
  FOREIGN KEY (decision_id) REFERENCES routing_decisions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_outcomes_decision 
  ON routing_outcomes(decision_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_timestamp 
  ON routing_outcomes(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_outcomes_success 
  ON routing_outcomes(success);

-- ============================================================================
-- Classification Cache (Optional - For Performance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS classification_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_hash TEXT NOT NULL UNIQUE,
  request_text TEXT NOT NULL,
  
  -- Cached classification
  intent TEXT NOT NULL,
  complexity TEXT NOT NULL,
  domain TEXT NOT NULL, -- JSON array
  confidence REAL NOT NULL,
  reasoning TEXT,
  
  -- Cache metadata
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  hit_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cache_hash 
  ON classification_cache(request_hash);
CREATE INDEX IF NOT EXISTS idx_cache_expires 
  ON classification_cache(expires_at);

-- ============================================================================
-- Metadata Table (For Version Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Insert initial metadata
INSERT OR IGNORE INTO metadata (key, value, updated_at) VALUES
  ('schema_version', '1', strftime('%s', 'now')),
  ('iccr_version', '1.0.0', strftime('%s', 'now')),
  ('created_at', strftime('%s', 'now'), strftime('%s', 'now'));
