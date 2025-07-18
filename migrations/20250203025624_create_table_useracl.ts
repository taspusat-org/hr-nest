import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('useracl', (table) => {
    table.increments('id').primary();
    table.integer('aco_id').unsigned().references('id').inTable('acos');
    table.integer('user_id').unsigned().references('id').inTable('users');
    table.string('modifiedby', 50).nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('useracl'); // Menghapus tabel users jika rollback
}
