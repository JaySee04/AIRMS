-- Least-privilege MySQL user for AIRMS.
--
--   sudo mysql < deploy/airms-db-user.sql          # edit the password first
--
-- WHY. `docs/SECURITY.md` §6.2 records the app connecting as `root` as OPEN BY
-- DECISION: defensible on a demo with fabricated data, not on a server holding
-- an institution's clinical records. The GRANT was written out there in prose;
-- this is the same thing you can actually run.
--
-- WHAT IT DELIBERATELY WITHHOLDS, and why each matters:
--   DROP    — the app never drops a table. `npm run seed` does, and it must not
--             be able to reach production even if somebody runs it by mistake.
--   GRANT   — a compromised app session cannot widen its own privileges.
--   FILE    — no SELECT ... INTO OUTFILE, so a SQL-injection foothold cannot
--             write a webshell or read /etc/passwd.
--   anything outside `airms` — the grant is schema-scoped, so the app cannot
--             reach another database on the same server.
--
-- WHAT IT KEEPS AND WHY:
--   SELECT/INSERT/UPDATE/DELETE  ordinary operation.
--   CREATE/ALTER/INDEX           the migration scripts (migrate:norm-stamp,
--                                migrate:escalation-response, the unique index
--                                on screenings) run as this user. Dropping these
--                                means running migrations as an admin instead —
--                                a defensible choice, and then remove the line.
--   REFERENCES                   foreign keys are declared in models/index.js.

CREATE USER IF NOT EXISTS 'airms'@'localhost'
  IDENTIFIED BY 'CHANGE-ME-BEFORE-RUNNING';

GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, INDEX, REFERENCES
  ON `airms`.* TO 'airms'@'localhost';

FLUSH PRIVILEGES;

-- Verify — expect exactly the grants above and nothing on *.*
SHOW GRANTS FOR 'airms'@'localhost';

-- Then set MYSQL_USER=airms and MYSQL_PASSWORD=... in /etc/airms/api.env,
-- restart (`sudo systemctl restart airms-api`), and confirm with
-- `cd backend; npm run verify:install` — the "Database user" blocker clears.
