// Offline SQL generation only. Silver applies the result immediately after the
// metadata check under Stage A approval, then deletes the private grant.json.
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
export async function revokeModelCheck(file){
 const grant=JSON.parse(await readFile(file,'utf8'));
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(grant.grantId??''))throw new Error('Invalid model-check grant reference');
 const sql=`-- Revoke this metadata grant only; contains no bearer or provider credential.
BEGIN;
SELECT id FROM atlas_ai.runtime_config WHERE id=true FOR UPDATE;
DO $$
DECLARE g atlas_ai.grants%ROWTYPE;
BEGIN
 SELECT * INTO g FROM atlas_ai.grants WHERE id='${grant.grantId}' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Model-check grant missing; confirm expiry separately'; END IF;
 IF g.scope<>'look' OR g.jobs<>ARRAY['model-check']::text[]
   OR g.agent_ids<>ARRAY['operator-model-check']::text[] OR g.place_ids<>ARRAY['ai-proxy']::text[]
   OR g.schema_ids<>ARRAY['atlas-model-check-v1']::text[] OR g.max_calls<>4 OR g.max_microusd<>0
   OR NOT EXISTS(SELECT 1 FROM atlas_ai.grant_receipts WHERE grant_id=g.id AND action='issued' AND authority='operator-model-check') THEN
  RAISE EXCEPTION 'Refusing to revoke a non-model-check grant';
 END IF;
 IF EXISTS(SELECT 1 FROM atlas_ai.grants WHERE holder_id=g.holder_id AND id<>g.id)
   OR EXISTS(SELECT 1 FROM atlas_ai.session_leases WHERE holder_id=g.holder_id AND grant_id<>g.id) THEN
  RAISE EXCEPTION 'Model-check holder is shared; refusing unrelated revocation';
 END IF;
 IF g.revoked_at IS NULL THEN
  INSERT INTO atlas_ai.grant_receipts(id,time,grant_id,action,scope,jobs,place_ids,expires_at,authority)
  VALUES(gen_random_uuid(),now(),g.id,'revoked',g.scope,g.jobs,g.place_ids,g.expires_at,'operator-model-check');
  UPDATE atlas_ai.grants SET revoked_at=now() WHERE id=g.id;
 END IF;
 UPDATE atlas_ai.session_leases SET revoked_at=now() WHERE grant_id=g.id AND revoked_at IS NULL;
 UPDATE atlas_ai.holder_leases SET revoked_at=now() WHERE id=g.holder_id AND revoked_at IS NULL;
END $$;
COMMIT;
`;
 await writeFile(resolve(dirname(file),'revoke-model-check.sql'),sql,{mode:0o600,flag:'wx'});
}
if(process.argv[1]&&import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3)throw new Error('Expected the private grant file');
  await revokeModelCheck(process.argv[2]);
  console.log('Prepared revoke-model-check.sql beside grant.json. Silver applies only the SQL, then deletes grant.json.');
 }catch{
  console.error('Could not prepare revocation SQL. Check the private grant file and output path; no SQL was applied.');
  process.exitCode=1;
 }
}
