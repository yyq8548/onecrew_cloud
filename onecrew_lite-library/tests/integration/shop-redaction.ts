import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { openDatabase } from '../../src/database.js';
import { createTableData } from '../../src/modules/tables/data.js';
import { createTableService } from '../../src/modules/tables/service.js';
import { createTenantService } from '../../src/modules/tenancy/service.js';

const scratch = fileURLToPath(new URL('../../../.scratch/', import.meta.url));
await mkdir(scratch, { recursive: true });
const root = await mkdtemp(join(scratch, 'library-redaction-'));
const database = await openDatabase(root),
  data = await createTableData(database);
try {
  const tenants = createTenantService(database.db),
    service = createTableService(data, 'https://cloud.example.com');
  const first = await tenants.resolveShop('first.myshopify.com'),
    second = await tenants.resolveShop('second.myshopify.com');
  const removed = await service.createTable(first, {
    name: '手工验收记录',
    columns: [{ name: '备注', data_type: 'string' }],
  });
  const retained = await service.createTable(second, {
    name: '另一个店铺的记录',
    columns: [{ name: '备注', data_type: 'string' }],
  });
  const table = await database.db
    .selectFrom('table_meta')
    .select('db_table_name')
    .where('id', '=', removed.id)
    .executeTakeFirstOrThrow();
  await data.removeShop('first.myshopify.com');
  await data.removeShop('first.myshopify.com');
  assert.equal(
    (
      await sql<{
        relation: string | null;
      }>`SELECT to_regclass(${table.db_table_name}) AS relation`.execute(database.db)
    ).rows[0]?.relation,
    null,
  );
  assert.deepEqual(
    (
      await sql`SELECT * FROM onecrew_tenants WHERE owner_user_id=${first.user.id}`.execute(
        database.db,
      )
    ).rows,
    [],
  );
  assert.deepEqual(
    await database.db.selectFrom('base').select('id').where('id', '=', first.baseId).execute(),
    [],
  );
  assert.deepEqual(
    await database.db
      .selectFrom('table_meta')
      .select('id')
      .where('base_id', '=', first.baseId)
      .execute(),
    [],
  );
  assert.deepEqual(
    (await sql`SELECT * FROM onecrew_field_types WHERE table_id=${removed.id}`.execute(database.db))
      .rows,
    [],
  );
  assert.deepEqual(
    (await sql`SELECT * FROM schema_operation WHERE base_id=${first.baseId}`.execute(database.db))
      .rows,
    [],
  );
  assert.equal((await service.getTable(second, retained.id)).name, '另一个店铺的记录');
  await data.removeShop('unknown.myshopify.com');
  assert.deepEqual(
    (
      await sql`SELECT * FROM onecrew_tenants WHERE owner_user_id='shopify:unknown.myshopify.com'`.execute(
        database.db,
      )
    ).rows,
    [],
  );
  await assert.rejects(data.removeShop('first.myshopify.com.attacker.example'));
  await data.close();
  const reopened = await openDatabase(root);
  try {
    assert.deepEqual(
      (
        await sql`SELECT * FROM onecrew_tenants WHERE owner_user_id=${first.user.id}`.execute(
          reopened.db,
        )
      ).rows,
      [],
    );
    assert.equal(
      (
        await sql<{
          relation: string | null;
        }>`SELECT to_regclass(${table.db_table_name}) AS relation`.execute(reopened.db)
      ).rows[0]?.relation,
      null,
    );
    assert.equal(
      (
        await reopened.db
          .selectFrom('table_meta')
          .select('id')
          .where('id', '=', retained.id)
          .execute()
      ).length,
      1,
    );
  } finally {
    await reopened.close();
  }
  console.info(
    JSON.stringify({
      event: 'cloud.library_shop_redacted',
      physicalTableRemoved: true,
      tenantRemoved: true,
      metadataRemoved: true,
      otherShopRetained: true,
      repeatSafe: true,
      persistedAfterReopen: true,
    }),
  );
} finally {
  await data.close();
  await rm(root, { recursive: true });
}
