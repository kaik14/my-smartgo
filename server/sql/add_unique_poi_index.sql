-- Use one of the following based on your actual column name.
-- If your schema matches the new design:
-- ALTER TABLE pois ADD UNIQUE KEY unique_poi (name, location);

-- If your existing schema still uses `address`:
-- ALTER TABLE pois ADD UNIQUE KEY unique_poi (name, address);
