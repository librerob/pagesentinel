# Company storage migration

Version 3 adds an empty `companies` object store. Upgrading version 2 does not read or rewrite monitor metadata, baseline/reference text, history, snapshot metadata or the accounting ledger. Version 1 profiles still pass through the existing text separation migration within the same upgrade transaction. A failed upgrade retains the old database.

Company records are included in the 50 MiB logical budget, including JSON-array punctuation when the collection is nonempty. Existing empty profiles retain the previous four-byte starting ledger. Company creation plus initial documents, company pause/frequency propagation, and company removal plus document detachment each use one transaction. Removing a company preserves its documents and histories as independent monitors. Individual pause choices and explicit interval overrides survive company controls.

Vitest covers v2 record/ledger preservation, company controls and exact accounting, and atomic rollback on failed document insertion. Existing v1 migration and quota tests remain in place. This migration is kept in a separate commit from the Privacy Watch interface.
