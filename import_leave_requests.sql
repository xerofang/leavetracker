-- =====================================================
-- CLEANUP: Fix leave types and import 2026 Leave Requests
-- Generated: 2026-02-16
-- =====================================================

-- =====================================================
-- STEP 1: CLEANUP - Delete incorrectly created leave types
-- (Only run this if "Casual Leave" and "Sick Leave" were created by mistake)
-- =====================================================

-- First, delete any leave requests that reference the wrong leave types
DELETE FROM leave_requests WHERE leave_type_id IN (
    SELECT id FROM leave_types WHERE name IN ('Casual Leave', 'Sick Leave')
);

-- Then delete the incorrect leave types
DELETE FROM leave_types WHERE name = 'Casual Leave';
DELETE FROM leave_types WHERE name = 'Sick Leave';

-- =====================================================
-- STEP 2: Insert 2026 Leave Requests (All as Approved)
-- Using correct leave type names: Casual, Sick, Flex
-- =====================================================

-- SYED SOURAB - Casual (Jan 9, 2026)
INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, admin_remarks, created_at, updated_at)
SELECT e.id, lt.id, '2026-01-09', '2026-01-09', 1, 'My dad''s appointment for doctor.', 'approved', 'Imported from historical records - Approved by Atif Darji', '2026-01-03', '2026-01-05'
FROM employees e, leave_types lt
WHERE (LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER('%Syed%Sourab%') OR e.email LIKE '%syed%' OR e.email LIKE '%sourab%')
AND lt.name = 'Casual' LIMIT 1;

-- Deep Bhalani - Casual (Jan 13, 2026)
INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, admin_remarks, created_at, updated_at)
SELECT e.id, lt.id, '2026-01-13', '2026-01-13', 1, 'I have to attend my convocation', 'approved', 'Imported from historical records - Approved by Atif Darji', '2026-01-11', '2026-01-11'
FROM employees e, leave_types lt
WHERE (LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER('%Deep%Bhalani%') OR e.email LIKE '%deep%')
AND lt.name = 'Casual' LIMIT 1;

-- Kashayp Raval - Casual (Jan 16, 2026)
INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, admin_remarks, created_at, updated_at)
SELECT e.id, lt.id, '2026-01-16', '2026-01-16', 1, 'Personal reason', 'approved', 'Imported from historical records - Approved by Atif Darji', '2026-01-15', '2026-01-15'
FROM employees e, leave_types lt
WHERE (LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER('%Kashayp%') OR LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER('%Raval%') OR e.email LIKE '%kashayp%' OR e.email LIKE '%raval%')
AND lt.name = 'Casual' LIMIT 1;

-- Ruchir Jain - Sick (Jan 22, 2026)
INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, admin_remarks, created_at, updated_at)
SELECT e.id, lt.id, '2026-01-22', '2026-01-22', 1, 'Cervical Pain', 'approved', 'Imported from historical records - Approved by Atif Darji', '2026-01-22', '2026-01-22'
FROM employees e, leave_types lt
WHERE (LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER('%Ruchir%') OR e.email LIKE '%ruchir%')
AND lt.name = 'Sick' LIMIT 1;

-- LOKESH CHOUDHURY - Casual (Jan 27, 2026)
INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, admin_remarks, created_at, updated_at)
SELECT e.id, lt.id, '2026-01-27', '2026-01-27', 1, 'Preplanned Vacation with family.', 'approved', 'Imported from historical records - Approved by Atif Darji', '2026-01-05', '2026-01-05'
FROM employees e, leave_types lt
WHERE (LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER('%Lokesh%') OR e.email LIKE '%lokesh%')
AND lt.name = 'Casual' LIMIT 1;

-- Ruchir Jain - Casual (Feb 6-16, 2026) - Wedding
INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, admin_remarks, created_at, updated_at)
SELECT e.id, lt.id, '2026-02-06', '2026-02-16', 11, 'My Wedding', 'approved', 'Imported from historical records - Approved by Atif Darji', '2026-01-13', '2026-01-12'
FROM employees e, leave_types lt
WHERE (LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER('%Ruchir%') OR e.email LIKE '%ruchir%')
AND lt.name = 'Casual' LIMIT 1;

-- Juhi Saxena - Flex (Feb 16, 2026) - Comp Off
INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, admin_remarks, created_at, updated_at)
SELECT e.id, lt.id, '2026-02-16', '2026-02-16', 1, 'Comp Off', 'approved', 'Imported from historical records - Approved by Atif Darji', '2026-02-14', '2026-02-16'
FROM employees e, leave_types lt
WHERE (LOWER(CONCAT(e.first_name, ' ', e.last_name)) LIKE LOWER('%Juhi%') OR e.email LIKE '%juhi%')
AND lt.name = 'Flex' LIMIT 1;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Check leave types (should only show Casual, Sick, Flex):
-- SELECT * FROM leave_types;

-- Check imported records:
-- SELECT lr.id, CONCAT(e.first_name, ' ', e.last_name) as employee, lt.name as leave_type,
--        lr.start_date, lr.end_date, lr.total_days, lr.status, lr.reason
-- FROM leave_requests lr
-- JOIN employees e ON lr.employee_id = e.id
-- JOIN leave_types lt ON lr.leave_type_id = lt.id
-- WHERE lr.admin_remarks LIKE '%historical%'
-- ORDER BY lr.start_date;
