-- Data cleanup: merge duplicate organizations in workspace e7a4042c-9839-4faa-a1c2-b534f4ee89a8
-- (Golden Age Government Contracting / John's workspace)
-- Run: 2026-04-03
-- All 4 duplicate groups identified; survivor = org with master_organization_id or oldest created_at

-- 1. Desert Springs Hospital
--    Survivor: 9ed567ec (has master_org_id 63f904f1, 14 activities)
--    Duplicates: 91a35526, 30cb8aaf (0 contacts, 1+3 activities)
UPDATE activities
SET organization_id = '9ed567ec-ba3e-41f2-b0b7-645862ba72ce'
WHERE organization_id IN (
  '91a35526-b1fd-461b-b180-1fd6b364e3a6',
  '30cb8aaf-7884-401e-862a-070bcb850139'
);
DELETE FROM organizations
WHERE id IN (
  '91a35526-b1fd-461b-b180-1fd6b364e3a6',
  '30cb8aaf-7884-401e-862a-070bcb850139'
);

-- 2. 1st Choice Urgent & Primary Care
--    Survivor: 27144e87 (oldest, created 2026-03-26 07:54:00)
--    Duplicate: 5fe1f74c (1 contact, 1 activity → re-pointed to survivor)
UPDATE contacts
SET organization_id = '27144e87-745f-4e4c-ab54-796688f24216'
WHERE organization_id = '5fe1f74c-4848-477e-8843-689993f8d3f3';
UPDATE activities
SET organization_id = '27144e87-745f-4e4c-ab54-796688f24216'
WHERE organization_id = '5fe1f74c-4848-477e-8843-689993f8d3f3';
DELETE FROM organizations WHERE id = '5fe1f74c-4848-477e-8843-689993f8d3f3';

-- 3. Cobalt
--    Survivor: d7d70237 (oldest, 1 contact, 1 activity)
--    Duplicate: 9c167c2e (0 contacts, 1 activity → re-pointed)
UPDATE activities
SET organization_id = 'd7d70237-7058-42e3-a8ff-1d2c9882058a'
WHERE organization_id = '9c167c2e-5ee0-47c8-9288-9d8bfb0cfd89';
DELETE FROM organizations WHERE id = '9c167c2e-5ee0-47c8-9288-9d8bfb0cfd89';

-- 4. Lakeview Terrace of Boulder City
--    Survivor: 192db812 (oldest, 1 contact, 1 activity)
--    Duplicate: 170a6949 (0 contacts, 1 activity → re-pointed)
UPDATE activities
SET organization_id = '192db812-5ca5-49fd-8634-b330eb6cf7d7'
WHERE organization_id = '170a6949-07f9-4b42-8933-e9a3668e6d8e';
DELETE FROM organizations WHERE id = '170a6949-07f9-4b42-8933-e9a3668e6d8e';

-- Verification query (expect 0 rows):
-- SELECT name, count(*) FROM organizations
-- WHERE workspace_id = 'e7a4042c-9839-4faa-a1c2-b534f4ee89a8'
-- GROUP BY name HAVING count(*) > 1;
