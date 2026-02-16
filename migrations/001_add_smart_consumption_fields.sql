-- Migration: Add Smart Balance Consumption Fields
-- Date: 2026-02-16
-- Description: Adds fields for historic leave import and multi-type balance consumption

-- =====================================================
-- STEP 1: Add new columns to leave_requests table
-- =====================================================

ALTER TABLE leave_requests
ADD COLUMN is_historic BOOLEAN DEFAULT FALSE COMMENT 'True if this is a backdated/historic leave import',
ADD COLUMN is_multi_type BOOLEAN DEFAULT FALSE COMMENT 'True if leave consumes from multiple leave types',
ADD COLUMN balance_breakdown JSON NULL COMMENT 'JSON array of consumption breakdown per leave type',
ADD COLUMN unpaid_days DECIMAL(5,2) DEFAULT 0 COMMENT 'Number of days that are unpaid';

-- =====================================================
-- STEP 2: Create Unpaid Leave type (if not exists)
-- =====================================================

INSERT INTO leave_types (name, description, default_days, is_active, created_at, updated_at)
SELECT 'Unpaid Leave', 'Leave without pay when all entitlements exhausted', 0, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM leave_types WHERE name = 'Unpaid Leave');

-- =====================================================
-- VERIFICATION: Run these queries after migration
-- =====================================================

-- Check new columns:
-- DESCRIBE leave_requests;

-- Check Unpaid Leave type:
-- SELECT * FROM leave_types WHERE name = 'Unpaid Leave';
