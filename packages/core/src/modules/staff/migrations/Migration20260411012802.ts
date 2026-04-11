import { Migration } from '@mikro-orm/migrations';

export class Migration20260411012802 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "staff_time_projects" add column "color" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "staff_time_projects" drop column "color";`);
  }

}
