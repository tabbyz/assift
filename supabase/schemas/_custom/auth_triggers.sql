-- auth スキーマは pg-delta の管理対象外になりうるため _custom に置く。
-- 再適用されても壊れないよう create or replace trigger（PG 14+）で冪等にする。
-- 本番に push したあとは必ず存在確認する:
--   select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname like 'on_auth_user_%';
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.sync_profile_email();
