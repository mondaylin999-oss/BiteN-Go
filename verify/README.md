# verify/

Small scripts that prove the important parts of BiteN Go actually work. Run
them from the project root.

| Script | What it proves | Needs |
|---|---|---|
| `verify_engine.sh` | The C++ engine compiles, its unit tests pass, and the CLI answers each command correctly. | a C++20 compiler |
| `verify_schema.sh` | `database/schema.sql` applies to a real PostgreSQL database, twice in a row, and creates all 14 tables. | `psql`, a running PostgreSQL |
| `verify_api.sh` | A full round trip through the running API: log in as four roles, publish a dish, place an order, move it across the kitchen board, request a ferry seat, confirm it. | the backend running on :8000 |

```bash
bash verify/verify_engine.sh
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/biten_go_db bash verify/verify_schema.sh
bash verify/verify_api.sh                 # after: cd backend && npm run dev
```
