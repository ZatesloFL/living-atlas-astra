// Offline preparation only. Silver runs this in a private workspace after Nic's
// Stage A approval. Provider keys are neither needed nor read. Never upload grant.json.
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function prepareModelCheck(directory){
 const folder=resolve(directory);await mkdir(folder,{recursive:true,mode:0o700});
 const bearer=randomBytes(32).toString('hex'),holder=randomBytes(32).toString('hex');
 const hash=v=>createHash('sha256').update(v).digest('hex');
 const hid=randomUUID(),gid=randomUUID(),sid=randomUUID();
 const sql=`-- Reviewed Stage A metadata grant only; contains hashes, never bearer values.
BEGIN;
SELECT id FROM atlas_ai.runtime_config WHERE id=true FOR UPDATE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM atlas_ai.runtime_config WHERE id=true AND NOT enabled AND expires_at>now() AND public_origin='https://zateslofl.github.io') THEN
  RAISE EXCEPTION 'Stage A requires valid disabled configuration';
 END IF;
END $$;
INSERT INTO atlas_ai.holder_leases(id,token_sha256,created_at,expires_at)
VALUES('${hid}',decode('${hash(holder)}','hex'),now(),now()+interval '24 hours');
INSERT INTO atlas_ai.grants(id,holder_id,scope,jobs,agent_ids,place_ids,schema_ids,max_calls,max_microusd,created_at,expires_at)
VALUES('${gid}','${hid}','look',ARRAY['model-check'],ARRAY['operator-model-check'],ARRAY['ai-proxy'],ARRAY['atlas-model-check-v1'],4,0,now(),now()+interval '24 hours');
INSERT INTO atlas_ai.session_leases(id,holder_id,grant_id,token_sha256,created_at,expires_at)
VALUES('${sid}','${hid}','${gid}',decode('${hash(bearer)}','hex'),now(),now()+interval '30 minutes');
INSERT INTO atlas_ai.grant_receipts(id,time,grant_id,action,scope,jobs,place_ids,expires_at,authority)
VALUES('${randomUUID()}',now(),'${gid}','issued','look',ARRAY['model-check'],ARRAY['ai-proxy'],now()+interval '24 hours','operator-model-check');
COMMIT;
`;
 await writeFile(folder+'/grant.json',JSON.stringify({session:bearer,grantId:gid}),{mode:0o600,flag:'wx'});
 await writeFile(folder+'/issue-model-check.sql',sql,{mode:0o600,flag:'wx'});
}
if(process.argv[1]&&import.meta.url===new URL('file://'+resolve(process.argv[1])).href){
 if(process.argv.length!==3)throw new Error('Usage: node prepare-model-check.mjs <private-output-directory>');
 await prepareModelCheck(process.argv[2]);
 console.log('Prepared issue-model-check.sql and private grant.json. Silver applies only the SQL under Stage A approval.');
}
